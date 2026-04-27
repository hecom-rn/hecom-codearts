import { checkbox } from '@inquirer/prompts';
import fs from 'fs';
import ora from 'ora';
import path from 'path';
import { buildDefectAnalysisPieOption } from '../charts/modules/quality/defect-analysis-pie';
import { buildDeveloperBugBarOption } from '../charts/modules/quality/developer-bug-bar';
import { buildFixDurationBarOption } from '../charts/modules/quality/fix-duration-bar';
import { buildRequirementBugBarOption } from '../charts/modules/quality/requirement-bug-bar';
import { ChartRenderTask, renderChartsToPng } from '../charts/png-renderer';
import { BusinessService } from '../services/business.service';
import {
  CustomFieldId,
  IssueDetail,
  IssueItem,
  IssueStatusId,
  ProjectMember,
  TerminalType,
} from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { issueLink } from '../utils/console';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';
import { matchIterations } from './rebug.command';

// ---- 终端类型 → 角色ID 映射 ----
// 角色ID与终端类型不直接对应，在此手动维护映射关系。
// 值为该终端对应的研发角色ID列表，留空数组表示不统计人数。
const TERMINAL_ROLE_MAP: Record<string, number[]> = {
  [TerminalType.WEB]: [511],
  [TerminalType.MOBILE]: [512],
  [TerminalType.PLATFORM_SERVICE]: [510],
  [TerminalType.BUSINESS_SERVICE]: [1002],
};

// ---- 辅助函数 ----

function getCustomField(bug: IssueItem, fieldId: CustomFieldId): string | undefined {
  return (bug.new_custom_fields || []).find((f) => f.custom_field === fieldId)?.value;
}

function filterByTerminal(bugs: IssueDetail[], terminalType: string): IssueDetail[] {
  return bugs.filter((b) => getCustomField(b, CustomFieldId.TERMINAL_TYPE) === terminalType);
}

function filterByDesignDefect(bugs: IssueDetail[]): IssueDetail[] {
  const designValues = ['需求变更问题', '产品设计问题'];
  return bugs.filter((b) =>
    designValues.includes(getCustomField(b, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS) ?? '')
  );
}

function getTopRequirement(bugs: IssueDetail[]): string | null {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '未填写';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

// ---- 主命令函数 ----

export interface QualityCommandOptions extends CliOptions {
  iteration?: string;
  outputDir?: string;
}

export async function qualityCommand(cliOptions: QualityCommandOptions): Promise<void> {
  const { projectId, config } = loadConfig(cliOptions);

  const businessService = new BusinessService(config);

  // 1. 加载迭代列表
  const loadSpinner = ora('正在加载迭代列表...').start();
  const iterations = await businessService.getIterations(projectId, { limit: 12 });
  loadSpinner.succeed('迭代列表加载完成');

  // 2. 选择迭代
  const promptIterations = () =>
    checkbox({
      message: '请选择要分析的迭代：',
      choices: iterations.map((it) => ({
        name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
        value: it,
        checked: false,
      })),
      validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
      theme: globalTheme,
    });

  let selectedIterations;
  if (cliOptions.iteration?.trim()) {
    const matched = matchIterations(iterations, cliOptions.iteration);
    if (matched.length > 0) {
      selectedIterations = matched;
    } else {
      logger.warn(`迭代关键字 "${cliOptions.iteration}" 未匹配到任何结果，请手动选择`);
      selectedIterations = await promptIterations();
    }
  } else {
    selectedIterations = await promptIterations();
  }

  const iterationIds = selectedIterations.map((it) => it.id);
  const iterationNames = selectedIterations.map((it) => it.name).join(', ');

  // 3. 查询 Bug
  const bugSpinner = ora('正在查询 Bug 数据...').start();
  const rawBugs = await businessService.getBugsByIterationsAndTerminals(
    projectId,
    iterationIds,
    []
  );
  const issueIds = rawBugs.map((b) => b.id);
  const allBugs = await businessService.getIssueDetails(projectId, issueIds, 10);
  bugSpinner.succeed(`已加载 ${allBugs.length} 个 Bug`);

  // 4. 查询各终端研发人数（先拉全量成员，再按角色过滤统计人数）
  const memberSpinner = ora('正在查询研发人员数据...').start();
  const allMembers = await businessService.getMembers(projectId);
  const terminalMemberCount = new Map<string, number>();
  for (const [terminalType, roleIds] of Object.entries(TERMINAL_ROLE_MAP)) {
    if (roleIds.length === 0) {
      terminalMemberCount.set(terminalType, 0);
      continue;
    }
    const roleIdsSet = new Set(roleIds);
    const count = allMembers.filter((m) => roleIdsSet.has(m.role_id)).length;
    terminalMemberCount.set(terminalType, count);
  }
  memberSpinner.succeed('研发人员数据加载完成');

  // 5. 查询测试计划（聚合多迭代用例数，取第一个匹配的计划）
  const planSpinner = ora('正在查询测试计划数据...').start();
  let testPlanStats: { caseNum: number; passRate: string; fixRate: string } | undefined;
  {
    let totalCaseNum = 0;
    for (const it of selectedIterations) {
      const plan = await businessService.getTestPlanByIterationName(projectId, it.name);
      if (plan) {
        totalCaseNum += plan.design?.case_num ?? 0;
      }
    }
    if (totalCaseNum > 0) {
      const passRateVal = ((1 - allBugs.length / totalCaseNum) * 100).toFixed(2);
      const fixedCount = allBugs.filter(
        (b) => b.status.id === IssueStatusId.RESOLVED || b.status.id === IssueStatusId.CLOSED
      ).length;
      const fixRateVal =
        allBugs.length > 0 ? ((fixedCount / allBugs.length) * 100).toFixed(2) : '100.00';
      testPlanStats = {
        caseNum: totalCaseNum,
        passRate: `${passRateVal}%`,
        fixRate: `${fixRateVal}%`,
      };
    }
  }
  planSpinner.succeed('测试计划数据加载完成');

  // 7. 查询客户反馈缺陷
  const feedbackSpinner = ora('正在查询客户反馈缺陷...').start();
  const selectedIterationNames = selectedIterations.map((it) => it.name);
  const customerFeedbackBugs = await businessService.getCustomerFeedbackBugs(
    projectId,
    selectedIterationNames
  );
  feedbackSpinner.succeed(`已加载 ${customerFeedbackBugs.length} 个客户反馈缺陷`);

  // 8. 准备输出目录
  const outputDir = path.resolve(cliOptions.outputDir ?? './quality-report');
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  // 9. 生成报告（图表 + Markdown）
  await generateReport({
    allBugs,
    outputDir,
    imagesDir,
    iterationNames,
    terminalMemberCount,
    testPlanStats,
    customerFeedbackBugs,
    allMembers,
    projectId,
  });

  logger.info(`质量分析报告已生成：${path.join(outputDir, 'quality-report.md')}`);
}

// ---- 数据聚合辅助 ----

function calcDefectAnalysisTable(
  bugs: IssueDetail[]
): Array<{ name: string; count: number; ratio: string }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const v = getCustomField(bug, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS) || '未填写';
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = bugs.length;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, ratio: `${((count / total) * 100).toFixed(1)}%` }));
}

function calcRequirementBugTable(bugs: IssueDetail[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '未填写';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function calcFixDurationTable(
  bugs: IssueDetail[]
): Array<{ bucket: string; count: number; ratio: string }> {
  const BUCKETS = ['≤1天', '2-3天', '4-7天', '8-14天', '>14天'];
  const toBucket = (days: number) => {
    if (days <= 1) return '≤1天';
    if (days <= 3) return '2-3天';
    if (days <= 7) return '4-7天';
    if (days <= 14) return '8-14天';
    return '>14天';
  };
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  let total = 0;
  for (const bug of bugs) {
    if (!bug.closed_time) continue;
    const days = Math.ceil(
      (new Date(bug.closed_time).getTime() - new Date(bug.created_time).getTime()) / 86400000
    );
    if (days < 0) continue;
    counts[toBucket(days)]++;
    total++;
  }
  return BUCKETS.map((b) => ({
    bucket: b,
    count: counts[b],
    ratio: total > 0 ? `${((counts[b] / total) * 100).toFixed(1)}%` : '0%',
  }));
}

function calcDeveloperBugTable(bugs: IssueDetail[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.developer?.nick_name ?? '未填写';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

// ---- Markdown 表格生成 ----

function mdDefectAnalysisTable(rows: ReturnType<typeof calcDefectAnalysisTable>): string {
  const header = '| 缺陷技术分析 | 数量 | 占比 |\n|-------------|------|------|\n';
  return header + rows.map((r) => `| ${r.name} | ${r.count} | ${r.ratio} |`).join('\n');
}

function mdRequirementBugTable(rows: ReturnType<typeof calcRequirementBugTable>): string {
  const header = '| 需求（父工作项） | Bug 数量 |\n|----------------|----------|\n';
  return header + rows.map((r) => `| ${r.name} | ${r.count} |`).join('\n');
}

function mdFixDurationTable(
  rows: ReturnType<typeof calcFixDurationTable>,
  closedCount: number
): string {
  const header = `**可统计 Bug 数**（已关闭/解决）：${closedCount} 个\n\n| 修复周期 | 数量 | 占比 |\n|---------|------|------|\n`;
  return header + rows.map((r) => `| ${r.bucket} | ${r.count} | ${r.ratio} |`).join('\n');
}

function mdDeveloperBugTable(rows: ReturnType<typeof calcDeveloperBugTable>): string {
  const header = '| 研发人员 | Bug 数量 |\n|---------|----------|\n';
  return header + rows.map((r) => `| ${r.name} | ${r.count} |`).join('\n');
}

// ---- 单部分图表渲染 + Markdown 片段生成 ----

interface SectionConfig {
  prefix: string; // 图片文件名前缀，如 'overview'
  sectionTitle: string; // 如 '一、缺陷总览'
  headingPrefix: string; // 子章节编号前缀，如 '1'
  memberCount?: number; // 该终端对应的研发人数（0 表示未配置）
  testPlanStats?: { caseNum: number; passRate: string; fixRate: string }; // 测试计划统计（仅第一部分）
}

async function renderSection(
  bugs: IssueDetail[],
  config: SectionConfig,
  imagesDir: string
): Promise<string> {
  const { prefix, sectionTitle, headingPrefix, memberCount, testPlanStats } = config;

  if (bugs.length === 0) {
    return `## ${sectionTitle}\n\n> 暂无数据\n\n---\n`;
  }

  const renderTasks: ChartRenderTask[] = [];
  const imgBase = (name: string) => path.join(imagesDir, `${prefix}-${name}.png`);

  renderTasks.push({
    option: buildDefectAnalysisPieOption(bugs),
    outputPath: imgBase('defect-analysis'),
    width: 600,
    height: 500,
  });
  renderTasks.push({
    option: buildRequirementBugBarOption(bugs),
    outputPath: imgBase('requirement-bug'),
    width: 800,
    height: 500,
  });
  renderTasks.push({
    option: buildFixDurationBarOption(bugs),
    outputPath: imgBase('fix-duration'),
    width: 800,
    height: 500,
  });
  renderTasks.push({
    option: buildDeveloperBugBarOption(bugs),
    outputPath: imgBase('developer-bug'),
    width: 800,
    height: 400,
  });

  await renderChartsToPng(renderTasks);

  const defectRows = calcDefectAnalysisTable(bugs);
  const reqRows = calcRequirementBugTable(bugs);
  const durationRows = calcFixDurationTable(bugs);
  const devRows = calcDeveloperBugTable(bugs);
  const closedCount = bugs.filter((b) => b.closed_time).length;
  const imgRef = (name: string) => `./images/${prefix}-${name}.png`;

  const devCount = memberCount ?? 0;
  const summaryParts = [`**缺陷总数**：${bugs.length} 个`];
  if (devCount > 0) {
    summaryParts.push(`**研发人数**：${devCount} 人`);
    summaryParts.push(`**人均 Bug 数**：${(bugs.length / devCount).toFixed(1)} 个`);
  }
  if (testPlanStats) {
    summaryParts.push(`**总用例数**：${testPlanStats.caseNum} 个`);
    summaryParts.push(`**测试通过率**：${testPlanStats.passRate}`);
    summaryParts.push(`**缺陷修复率**：${testPlanStats.fixRate}`);
  }

  return [
    `## ${sectionTitle}`,
    '',
    summaryParts.join(' | '),
    '',
    `### ${headingPrefix}.1 缺陷技术分析`,
    '',
    mdDefectAnalysisTable(defectRows),
    '',
    `![缺陷技术分析](${imgRef('defect-analysis')})`,
    '',
    `### ${headingPrefix}.2 需求 Bug 分布`,
    '',
    mdRequirementBugTable(reqRows),
    '',
    `![需求 Bug 分布](${imgRef('requirement-bug')})`,
    '',
    `### ${headingPrefix}.3 修复周期分布`,
    '',
    mdFixDurationTable(durationRows, closedCount),
    '',
    `![修复周期分布](${imgRef('fix-duration')})`,
    '',
    `### ${headingPrefix}.4 研发人员 Bug 数量`,
    '',
    mdDeveloperBugTable(devRows),
    '',
    `![研发人员 Bug 数量](${imgRef('developer-bug')})`,
    '',
    '---',
    '',
  ].join('\n');
}

async function renderSection6(bugs: IssueDetail[], imagesDir: string): Promise<string> {
  if (bugs.length === 0) {
    return `## 六、需求缺陷率\n\n> 暂无数据\n\n---\n`;
  }

  const reqRows = calcRequirementBugTable(bugs);
  const requirementCount = new Set(bugs.map((b) => b.parent_issue?.name ?? '无父工作项')).size;
  const topReqName = getTopRequirement(bugs);
  const topReqBugs = topReqName
    ? bugs.filter((b) => (b.parent_issue?.name ?? '无父工作项') === topReqName)
    : [];

  const renderTasks: ChartRenderTask[] = [
    {
      option: buildRequirementBugBarOption(bugs),
      outputPath: path.join(imagesDir, 'req-rate-bug-bar.png'),
      width: 800,
      height: 500,
    },
  ];
  if (topReqBugs.length > 0) {
    renderTasks.push({
      option: buildDefectAnalysisPieOption(topReqBugs),
      outputPath: path.join(imagesDir, 'req-rate-top-defect-pie.png'),
      width: 600,
      height: 500,
    });
    renderTasks.push({
      option: buildDeveloperBugBarOption(topReqBugs),
      outputPath: path.join(imagesDir, 'req-rate-top-developer-bar.png'),
      width: 800,
      height: 400,
    });
  }

  await renderChartsToPng(renderTasks);

  const lines = [
    '## 六、需求缺陷率',
    '',
    `**缺陷总数**：${bugs.length} 个 | **涉及需求数**：${requirementCount} 个`,
    '',
    '### 6.1 需求 Bug 分布',
    '',
    mdRequirementBugTable(reqRows),
    '',
    '![需求 Bug 分布](./images/req-rate-bug-bar.png)',
    '',
  ];

  if (topReqBugs.length > 0 && topReqName) {
    lines.push(
      `### 6.2 缺陷最多的需求 — 缺陷技术分析`,
      '',
      `**需求名称**：${topReqName}（共 ${topReqBugs.length} 个 Bug）`,
      '',
      mdDefectAnalysisTable(calcDefectAnalysisTable(topReqBugs)),
      '',
      '![缺陷技术分析](./images/req-rate-top-defect-pie.png)',
      '',
      `### 6.3 缺陷最多的需求 — 研发人员分析`,
      '',
      mdDeveloperBugTable(calcDeveloperBugTable(topReqBugs)),
      '',
      '![研发人员分析](./images/req-rate-top-developer-bar.png)',
      ''
    );
  }

  lines.push('---', '');
  return lines.join('\n');
}

async function renderSection7(allBugs: IssueDetail[], imagesDir: string): Promise<string> {
  const designBugs = filterByDesignDefect(allBugs);

  if (designBugs.length === 0) {
    return `## 七、设计缺陷率\n\n> 暂无数据\n\n---\n`;
  }

  const ratio = ((designBugs.length / allBugs.length) * 100).toFixed(1);
  const reqRows = calcRequirementBugTable(designBugs);

  await renderChartsToPng([
    {
      option: buildRequirementBugBarOption(designBugs),
      outputPath: path.join(imagesDir, 'design-defect-bar.png'),
      width: 800,
      height: 500,
    },
  ]);

  return [
    '## 七、设计缺陷率',
    '',
    `**设计缺陷总数**：${designBugs.length} 个 | **占全量 Bug 比率**：${ratio}%`,
    '',
    '（筛选条件：缺陷技术分析 = 需求变更问题 或 产品设计问题）',
    '',
    '### 7.1 设计缺陷按需求分布',
    '',
    mdRequirementBugTable(reqRows),
    '',
    '![设计缺陷按需求分布](./images/design-defect-bar.png)',
    '',
    '---',
    '',
  ].join('\n');
}

// ---- generateReport 总调度函数 ----

interface GenerateReportParams {
  allBugs: IssueDetail[];
  outputDir: string;
  imagesDir: string;
  iterationNames: string;
  terminalMemberCount: Map<string, number>;
  testPlanStats?: { caseNum: number; passRate: string; fixRate: string };
  customerFeedbackBugs: IssueItem[];
  allMembers: ProjectMember[];
  projectId: string;
}

async function generateReport({
  allBugs,
  outputDir,
  imagesDir,
  iterationNames,
  terminalMemberCount,
  testPlanStats,
  customerFeedbackBugs,
  allMembers,
  projectId,
}: GenerateReportParams): Promise<void> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });

  const spinner = ora('正在生成图表和报告...').start();

  const sections: string[] = [];

  // 报告头
  sections.push(`# 质量分析报告\n\n> 迭代：${iterationNames} | 生成时间：${now}\n\n---\n`);

  // 第一至第五部分
  const terminalSections: Array<{
    title: string;
    heading: string;
    filter: IssueDetail[];
    terminalType?: string;
  }> = [
    { title: '一、缺陷总览', heading: '1', filter: allBugs },
    {
      title: '二、网页端',
      heading: '2',
      filter: filterByTerminal(allBugs, TerminalType.WEB),
      terminalType: TerminalType.WEB,
    },
    {
      title: '三、移动端',
      heading: '3',
      filter: filterByTerminal(allBugs, TerminalType.MOBILE),
      terminalType: TerminalType.MOBILE,
    },
    {
      title: '四、平台服务端',
      heading: '4',
      filter: filterByTerminal(allBugs, TerminalType.PLATFORM_SERVICE),
      terminalType: TerminalType.PLATFORM_SERVICE,
    },
    {
      title: '五、业务服务端',
      heading: '5',
      filter: filterByTerminal(allBugs, TerminalType.BUSINESS_SERVICE),
      terminalType: TerminalType.BUSINESS_SERVICE,
    },
  ];
  const prefixes = ['overview', 'web', 'mobile', 'platform', 'business'];

  for (let i = 0; i < terminalSections.length; i++) {
    const { title, heading, filter, terminalType } = terminalSections[i];
    const memberCount = terminalType ? terminalMemberCount.get(terminalType) : undefined;
    sections.push(
      await renderSection(
        filter,
        {
          prefix: prefixes[i],
          sectionTitle: title,
          headingPrefix: heading,
          memberCount,
          testPlanStats: i === 0 ? testPlanStats : undefined,
        },
        imagesDir
      )
    );
  }

  // 第六部分：需求缺陷率
  sections.push(await renderSection6(allBugs, imagesDir));

  // 第七部分：设计缺陷率
  sections.push(await renderSection7(allBugs, imagesDir));

  // 第八部分：客户反馈缺陷
  sections.push(renderSection8CustomerFeedback(customerFeedbackBugs, projectId, allMembers));

  const markdown = sections.join('');
  fs.writeFileSync(path.join(outputDir, 'quality-report.md'), markdown, 'utf-8');

  spinner.succeed('质量分析报告生成完成');
}

function renderSection8CustomerFeedback(
  bugs: IssueItem[],
  projectId: string,
  allMembers: ProjectMember[]
): string {
  if (bugs.length === 0) {
    return `## 八、客户反馈缺陷\n\n> 暂无数据\n\n---\n`;
  }

  // 构建成员 user_num_id → nick_name 映射，用于 custom_field26 value 转换
  const memberIdToName = new Map<string, string>();
  for (const m of allMembers) {
    memberIdToName.set(String(m.user_num_id), m.nick_name);
  }

  const header = `| 编号 | 标题 | 研发人员 | 测试人员 | 状态 | 父需求 |`;
  const separator = `| --- | --- | --- | --- | --- | --- |`;
  const rows = bugs.map((b) => {
    const title = `[${b.name}](${issueLink(projectId, b.id)})`;
    const testerId = getCustomField(b, CustomFieldId.TESTER);
    const tester = testerId ? (memberIdToName.get(testerId) ?? testerId) : '-';
    const developer = b.developer?.nick_name ?? '-';
    const status = b.status?.name ?? '-';
    const parent = b.parent_issue?.id
      ? `[${b.parent_issue.name ?? b.parent_issue.id}](${issueLink(projectId, b.parent_issue.id)})`
      : '-';
    return `| ${b.id} | ${title} | ${developer} | ${tester} | ${status} | ${parent} |`;
  });

  return [
    '## 八、客户反馈缺陷',
    '',
    `**客户反馈缺陷总数**：${bugs.length} 个`,
    '',
    header,
    separator,
    ...rows,
    '',
    '---',
    '',
  ].join('\n');
}
