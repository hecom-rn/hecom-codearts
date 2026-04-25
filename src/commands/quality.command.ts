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
import { CustomFieldId, IssueDetail, TerminalType } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';
import { matchIterations } from './rebug.command';

// ---- 辅助函数 ----

function getCustomField(bug: IssueDetail, fieldId: CustomFieldId): string | undefined {
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
    const name = bug.parent_issue?.name ?? '无父工作项';
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

  // 4. 准备输出目录
  const outputDir = path.resolve(cliOptions.outputDir ?? './quality-report');
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  // 5. 生成报告（图表 + Markdown）
  await generateReport({ allBugs, outputDir, imagesDir, iterationNames });

  logger.info(`质量分析报告已生成：${path.join(outputDir, 'quality-report.md')}`);
}

// ---- 数据聚合辅助 ----

function calcDefectAnalysisTable(
  bugs: IssueDetail[]
): Array<{ name: string; count: number; ratio: string }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const v = getCustomField(bug, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS) ?? '未填写';
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
    const name = bug.parent_issue?.name ?? '无父工作项';
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
    const name = bug.developer?.nick_name ?? '未分配';
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
}

async function renderSection(
  bugs: IssueDetail[],
  config: SectionConfig,
  imagesDir: string
): Promise<string> {
  const { prefix, sectionTitle, headingPrefix } = config;

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

  const devCount = devRows.filter((r) => r.name !== '未分配').length;
  const avgBugs = devCount > 0 ? (bugs.length / devCount).toFixed(1) : '-';

  return [
    `## ${sectionTitle}`,
    '',
    `**缺陷总数**：${bugs.length} 个 | **研发人数**：${devCount} 人 | **人均 Bug 数**：${avgBugs} 个`,
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
}

async function generateReport({
  allBugs,
  outputDir,
  imagesDir,
  iterationNames,
}: GenerateReportParams): Promise<void> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });

  const spinner = ora('正在生成图表和报告...').start();

  const sections: string[] = [];

  // 报告头
  sections.push(`# 质量分析报告\n\n> 迭代：${iterationNames} | 生成时间：${now}\n\n---\n`);

  // 第一至第五部分
  const terminalSections: Array<{ title: string; heading: string; filter: IssueDetail[] }> = [
    { title: '一、缺陷总览', heading: '1', filter: allBugs },
    { title: '二、网页端', heading: '2', filter: filterByTerminal(allBugs, TerminalType.WEB) },
    { title: '三、移动端', heading: '3', filter: filterByTerminal(allBugs, TerminalType.MOBILE) },
    {
      title: '四、平台服务端',
      heading: '4',
      filter: filterByTerminal(allBugs, TerminalType.PLATFORM_SERVICE),
    },
    {
      title: '五、业务服务端',
      heading: '5',
      filter: filterByTerminal(allBugs, TerminalType.BUSINESS_SERVICE),
    },
  ];
  const prefixes = ['overview', 'web', 'mobile', 'platform', 'business'];

  for (let i = 0; i < terminalSections.length; i++) {
    const { title, heading, filter } = terminalSections[i];
    sections.push(
      await renderSection(
        filter,
        { prefix: prefixes[i], sectionTitle: title, headingPrefix: heading },
        imagesDir
      )
    );
  }

  // 第六部分：需求缺陷率
  sections.push(await renderSection6(allBugs, imagesDir));

  // 第七部分：设计缺陷率
  sections.push(await renderSection7(allBugs, imagesDir));

  const markdown = sections.join('');
  fs.writeFileSync(path.join(outputDir, 'quality-report.md'), markdown, 'utf-8');

  spinner.succeed('质量分析报告生成完成');
}
