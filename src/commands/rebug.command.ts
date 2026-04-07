import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { allCharts } from '../charts';
import { ReportMeta, openInBrowser, renderReport } from '../charts/renderer';
import { BusinessService } from '../services/business.service';
import { CustomFieldId, IssueDetail, IssueItem, IterationInfo } from '../types';
import { issueLink } from '../utils/console';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';

/**
 * 从迭代列表中按关键字模糊匹配
 * @param iterations 迭代列表
 * @param keywords 逗号分隔的关键字，不区分大小写
 * @returns 命中的迭代列表（保持原列表顺序）
 */
export function matchIterations(iterations: IterationInfo[], keywords: string): IterationInfo[] {
  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (keywordList.length === 0) return [];
  const matched = new Set<number>();
  const result: IterationInfo[] = [];
  for (const iteration of iterations) {
    for (const keyword of keywordList) {
      if (iteration.name.toLowerCase().includes(keyword.toLowerCase())) {
        if (!matched.has(iteration.id)) {
          matched.add(iteration.id);
          result.push(iteration);
        }
        break;
      }
    }
  }
  return result;
}

/**
 * 从终端类型选项列表中按关键字模糊匹配
 * @param availableTerminalTypes 可选的终端类型列表
 * @param keywords 逗号分隔的关键字，不区分大小写
 * @returns 命中的终端类型列表（保持原列表顺序）
 */
export function matchTerminalTypes(availableTerminalTypes: string[], keywords: string): string[] {
  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (keywordList.length === 0) return [];
  const matched = new Set<string>();
  const result: string[] = [];
  for (const type of availableTerminalTypes) {
    for (const keyword of keywordList) {
      if (type.toLowerCase().includes(keyword.toLowerCase())) {
        if (!matched.has(type)) {
          matched.add(type);
          result.push(type);
        }
        break;
      }
    }
  }
  return result;
}

interface SelectedBugsResult {
  selectedIterations: IterationInfo[];
  selectedTerminalTypes: string[];
  allBugs: IssueDetail[];
  projectId: string;
  businessService: BusinessService;
}

/**
 * 共享交互逻辑：选择迭代、终端类型并查询 bug 列表（Step 1-5）
 */
async function selectBugsInteractive(cliOptions: CliOptions): Promise<SelectedBugsResult> {
  const { projectId, config } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const loadSpinner = ora('正在加载迭代列表...').start();
  let iterations: IterationInfo[];
  try {
    iterations = await businessService.getIterations(projectId, { limit: 12 });
    loadSpinner.succeed('迭代列表加载完成');
  } catch (error) {
    loadSpinner.fail('加载迭代列表失败');
    throw error;
  }

  if (iterations.length === 0) {
    throw new Error('未获取到任何迭代信息');
  }

  const promptIterations = () =>
    checkbox({
      message: '请选择要查询的迭代：',
      choices: iterations.map((it) => ({
        name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
        value: it,
        checked: false,
      })),
      validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
      theme: globalTheme,
    });

  let selectedIterations: IterationInfo[];
  const hasIterationParam = !!cliOptions.iteration?.trim();
  if (hasIterationParam) {
    const matched = matchIterations(iterations, cliOptions.iteration!);
    if (matched.length > 0) {
      selectedIterations = matched;
    } else {
      logger.warn(`迭代关键字 "${cliOptions.iteration}" 未匹配到任何结果，请手动选择`);
      selectedIterations = await promptIterations();
    }
  } else {
    selectedIterations = await promptIterations();
  }

  let terminalTypeOptions: string[] = [];
  try {
    const customFieldOptions = await businessService.getCustomFieldOptions(projectId, [
      CustomFieldId.TERMINAL_TYPE,
    ]);
    terminalTypeOptions = customFieldOptions[CustomFieldId.TERMINAL_TYPE] || [];
  } catch {
    logger.warn('获取终端类型选项失败，将跳过终端类型筛选');
  }

  const promptTerminalTypes = () =>
    checkbox({
      message: '请选择终端类型（不选则查询全部）：',
      choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
      theme: globalTheme,
    });

  let selectedTerminalTypes: string[] = [];
  if (terminalTypeOptions.length > 0) {
    const hasTerminalParam = !!cliOptions.terminal?.trim();
    if (hasTerminalParam) {
      const matched = matchTerminalTypes(terminalTypeOptions, cliOptions.terminal!);
      if (matched.length > 0) {
        selectedTerminalTypes = matched;
      } else {
        logger.warn(`终端类型关键字 "${cliOptions.terminal}" 未匹配到任何结果，请手动选择`);
        selectedTerminalTypes = await promptTerminalTypes();
      }
    } else {
      selectedTerminalTypes = await promptTerminalTypes();
    }
  }

  const querySpinner = ora('正在查询 Bug 列表...').start();
  const iterationIds = selectedIterations.map((it) => it.id);
  let items: IssueItem[];
  try {
    items = await businessService.getBugsByIterationsAndTerminals(
      projectId,
      iterationIds,
      selectedTerminalTypes
    );
    querySpinner.succeed(`查询完成：共找到 ${items.length} 个 Bug`);
  } catch (error) {
    querySpinner.fail('Bug 查询失败');
    throw error;
  }

  const detailSpinner = ora(`正在获取 ${items.length} 个 Bug 的详情...`).start();
  let allBugs: IssueDetail[];
  try {
    allBugs = await businessService.getIssueDetails(
      projectId,
      items.map((b) => b.id)
    );
    detailSpinner.succeed('详情获取完成');
  } catch (error) {
    detailSpinner.fail('获取 Bug 详情失败');
    throw error;
  }

  return { selectedIterations, selectedTerminalTypes, allBugs, projectId, businessService };
}

/**
 * rebug chart 子命令：交互式查询 Bug 列表并生成 ECharts 可视化报告
 */
export async function rebugChartCommand(cliOptions: CliOptions = {}): Promise<void> {
  try {
    const { selectedIterations, selectedTerminalTypes, allBugs } =
      await selectBugsInteractive(cliOptions);

    logger.info(`迭代：${selectedIterations.map((it) => it.name).join(', ')}`);
    if (selectedTerminalTypes.length > 0) {
      logger.info(`终端类型：${selectedTerminalTypes.join(', ')}`);
    }
    logger.info('正在生成分析报告...');

    const meta: ReportMeta = {
      iterationNames: selectedIterations.map((it) => it.name),
      terminalTypes: selectedTerminalTypes,
      totalCount: allBugs.length,
      generatedAt: new Date().toISOString(),
    };

    let reportPath: string;
    try {
      const outputDir = cliOptions.outputDir || undefined;
      reportPath = renderReport(allBugs, allCharts, meta, outputDir);
    } catch (error) {
      logger.error(`生成报告文件失败: ${String(error)}`);
      return;
    }

    logger.info(`报告已生成：${reportPath}`);
    openInBrowser(reportPath);
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      logger.info('操作取消');
    } else {
      logger.error(`执行 rebug chart 命令失败: ${String(error)}`);
    }
  }
}

/**
 * rebug no-tag 子命令：展示指定迭代中未添加标签的 Bug 列表
 */
export async function rebugNoTagCommand(cliOptions: CliOptions = {}): Promise<void> {
  try {
    const { selectedIterations, selectedTerminalTypes, allBugs, projectId, businessService } =
      await selectBugsInteractive(cliOptions);

    logger.info(`迭代：${selectedIterations.map((it) => it.name).join(', ')}`);
    if (selectedTerminalTypes.length > 0) {
      logger.info(`终端类型：${selectedTerminalTypes.join(', ')}`);
    }

    let untagged = allBugs.filter(
      (detail) => detail.tag_list === null || detail.tag_list.length === 0
    );

    const developer = cliOptions.developer;
    if (developer && developer.trim() !== '') {
      untagged = untagged.filter((detail) => detail.developer?.nick_name?.includes(developer));
    }

    if (untagged.length === 0) {
      logger.info('所有 Bug 均已添加标签。');
      return;
    }

    logger.info(`找到 ${untagged.length} 个未打标签的 Bug（共 ${allBugs.length} 个）：`);
    logger.info('');
    untagged.forEach((detail, index) => {
      logger.info(`  [${index + 1}] ${detail.name}`);
      logger.info(`      ${issueLink(projectId, detail.id)}`);
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      logger.info('操作取消');
    } else {
      logger.error(`执行 rebug no-tag 命令失败: ${String(error)}`);
    }
  }
}
