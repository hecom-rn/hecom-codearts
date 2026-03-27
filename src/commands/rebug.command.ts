import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { allCharts } from '../charts';
import { ReportMeta, openInBrowser, renderReport } from '../charts/renderer';
import { BusinessService } from '../services/business.service';
import { CustomFieldId, IssueItem, IterationInfo } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';

/**
 * rebug 命令：交互式查询 Bug 列表并生成 ECharts 可视化报告
 */
export async function rebugCommand(cliOptions: CliOptions = {}): Promise<void> {
  try {
    const { projectId, config } = loadConfig(cliOptions);
    const businessService = new BusinessService(config);

    // Step 1: 加载迭代列表（前12个）
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

    // Step 2: 用户选择迭代
    const selectedIterations = await checkbox({
      message: '请选择要查询的迭代：',
      choices: iterations.map((it) => ({
        name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
        value: it,
        checked: false,
      })),
      validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
      theme: globalTheme,
    });

    // Step 3: 加载终端类型选项
    let terminalTypeOptions: string[] = [];
    try {
      const customFieldOptions = await businessService.getCustomFieldOptions(projectId, [
        CustomFieldId.TERMINAL_TYPE,
      ]);
      terminalTypeOptions = customFieldOptions[CustomFieldId.TERMINAL_TYPE] || [];
    } catch {
      logger.warn('获取终端类型选项失败，将跳过终端类型筛选');
    }

    // Step 4: 用户选择终端类型（如果有选项）
    let selectedTerminalTypes: string[] = [];
    if (terminalTypeOptions.length > 0) {
      selectedTerminalTypes = await checkbox({
        message: '请选择终端类型（不选则查询全部）：',
        choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
        theme: globalTheme,
      });
    }

    // Step 5: 查询 Bug 列表
    const querySpinner = ora('正在查询 Bug 列表...').start();
    const iterationIds = selectedIterations.map((it) => it.id);
    let allBugs: IssueItem[];

    try {
      allBugs = await businessService.getBugsByIterationsAndTerminals(
        projectId,
        iterationIds,
        selectedTerminalTypes
      );
      querySpinner.succeed(`查询完成：共找到 ${allBugs.length} 个 Bug`);
    } catch (error) {
      querySpinner.fail('Bug 查询失败');
      throw error;
    }

    // Step 6: 控制台摘要
    logger.info(`迭代：${selectedIterations.map((it) => it.name).join(', ')}`);
    if (selectedTerminalTypes.length > 0) {
      logger.info(`终端类型：${selectedTerminalTypes.join(', ')}`);
    }
    logger.info('正在生成分析报告...');

    // Step 7: 生成报告
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
      logger.error(`执行 rebug 命令失败: ${String(error)}`);
    }
  }
}
