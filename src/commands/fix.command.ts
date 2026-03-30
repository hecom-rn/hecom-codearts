import { confirm, input, select } from '@inquirer/prompts';
import ora from 'ora';
import { BusinessService } from '../services/business.service';
import { BugFixData, ConfigKey, CustomFieldId, IssueItem } from '../types';
import { CliOptions, getConfig, loadConfig } from '../utils/config-loader';
import { issueLink } from '../utils/console';
import { logger } from '../utils/logger';

/**
 * Fix 命令：交互式修复 bug，填写缺陷分析信息
 * @param cliOptions 命令行选项
 */
export async function fixCommand(cliOptions?: CliOptions): Promise<void> {
  try {
    // Step 1: 加载配置
    const { projectId, config } = loadConfig(cliOptions);
    const businessService = new BusinessService(config);

    if (!projectId) {
      logger.error('项目 ID 未配置，请先执行 codearts config');
      return;
    }

    // Step 2: 加载 bug 列表和自定义字段选项
    const spinner = ora('正在加载数据...').start();

    let bugList: IssueItem[];
    let customFieldOptions: Record<string, string[]>;

    try {
      bugList = await businessService.getCurrentUserBugs(projectId);
      customFieldOptions = await businessService.getCustomFieldOptions(projectId, [
        CustomFieldId.DEFECT_TECHNICAL_ANALYSIS,
        CustomFieldId.INTRODUCTION_PHASE,
      ]);
      spinner.succeed('数据加载完成');
    } catch (error) {
      spinner.fail('数据加载失败');
      logger.error(`${String(error)}`);
      return;
    }

    // Step 3: 检查 bug 列表是否为空
    if (bugList.length === 0) {
      logger.warn('当前用户没有分配的 bug');
      return;
    }

    // Step 4: 让用户选择 bug
    const selectedBug = await selectBug(bugList);
    if (!selectedBug) {
      logger.info('操作取消');
      return;
    }

    // Step 5: 检查是否为客户反馈 bug
    const isCustomerFeedback = checkIsCustomerFeedback(selectedBug);

    // Step 6: 读取配置的开发端和终端类型
    const globalConfig = getConfig();
    const developmentEnd = globalConfig[ConfigKey.DEVELOPMENT_END];
    const terminalType = globalConfig[ConfigKey.TERMINAL_TYPE];

    // Step 7: 填写缺陷分析信息
    const bugFixData: BugFixData = {
      developmentEnd,
      terminalType,
    };

    // 6.1: 选择缺陷技术分析（必填）
    const defectAnalysisOptions = customFieldOptions[CustomFieldId.DEFECT_TECHNICAL_ANALYSIS] || [];
    if (defectAnalysisOptions.length === 0) {
      logger.error('无法获取缺陷技术分析选项');
      return;
    }

    bugFixData.defectAnalysis = await select({
      message: '请选择缺陷技术分析（必填）',
      choices: defectAnalysisOptions.map((option) => ({
        name: option,
        value: option,
      })),
    });

    // 6.2: 填写问题原因及解决办法
    const problemReason = await input({
      message: isCustomerFeedback
        ? '请输入问题原因及解决办法（必填）'
        : '请输入问题原因及解决办法（可选，留空跳过）',
      validate: (value) => {
        if (isCustomerFeedback && !value.trim()) {
          return '问题原因及解决办法不能为空';
        }
        return true;
      },
    });

    if (problemReason.trim()) {
      bugFixData.problemReason = problemReason;
    }

    // 6.3: 填写影响范围（可选）
    const impactScope = await input({
      message: '请输入影响范围（可选，留空跳过）',
    });

    if (impactScope.trim()) {
      bugFixData.impactScope = impactScope;
    }

    if (isCustomerFeedback) {
      // 6.4: 选择引入阶段（必填）
      const introductionPhaseOptions = customFieldOptions[CustomFieldId.INTRODUCTION_PHASE] || [];

      if (introductionPhaseOptions.length === 0) {
        logger.error('无法获取引入阶段选项');
        return;
      }

      bugFixData.introductionStage = await select({
        message: '请选择引入阶段（必填）',
        choices: introductionPhaseOptions
          .sort()
          .reverse()
          .map((option) => ({
            name: option,
            value: option,
          })),
      });

      // 6.5: 输入发布时间（必填）
      let releaseDate: string;
      let validDate = false;

      while (!validDate) {
        releaseDate = await input({
          message: '请输入发布时间（必填，格式：YYYY/M/D）',
          validate: (value) => {
            if (!value) {
              return '发布时间不能为空';
            }
            const dateRegex = /^\d{4}\/\d{1,2}\/\d{1,2}$/;
            if (!dateRegex.test(value)) {
              return '日期格式不正确，请使用 YYYY/M/D 格式';
            }
            const date = new Date(value);
            if (isNaN(date.getTime())) {
              return '请输入有效的日期';
            }
            return true;
          },
        });

        validDate = true;
        bugFixData.releaseDate = releaseDate;
      }
    }

    // Step 7: 确认并提交
    const confirmed = await showSummaryAndConfirm(selectedBug, bugFixData);

    if (!confirmed) {
      logger.info('操作已取消');
      return;
    }

    // Step 8: 调用 API 更新 bug
    const updateSpinner = ora('正在保存缺陷信息...').start();

    try {
      await businessService.fixBug(projectId, selectedBug, bugFixData);
      updateSpinner.succeed('缺陷信息保存成功！');
      logger.info(`\nBug 链接：${issueLink(projectId, String(selectedBug.id))}`);

      // Step 9: 询问是否继续修复
      const continueIterate = await confirm({
        message: '是否继续修复？',
        default: false,
      });

      if (continueIterate) {
        await fixCommand(cliOptions);
      }
    } catch (error) {
      updateSpinner.fail('保存失败');
      logger.error(`${String(error)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      logger.info('操作取消');
    } else {
      logger.error(`执行 fix 命令失败: ${String(error)}`);
    }
  }
}

/**
 * 让用户选择一个 bug
 * @param bugList bug 列表
 * @returns 选中的 bug，或 null 如果用户取消
 */
async function selectBug(bugList: IssueItem[]): Promise<IssueItem | null> {
  const bugChoices = bugList.map((bug) => {
    const statusName = bug.status?.name || '未知状态';
    const name = bug.name.length > 40 ? `${bug.name.slice(0, 47)}...` : bug.name;
    const label = `[${statusName}] ${name}`;

    return {
      name: label,
      value: bug,
    };
  });

  const selectedBug = await select({
    message: '请选择要修复的 bug',
    choices: bugChoices,
    pageSize: 10,
  });

  return selectedBug || null;
}

/**
 * 检查 bug 是否为客户反馈类型
 * @param bug bug 工作项
 * @returns 是否为客户反馈
 */
function checkIsCustomerFeedback(bug: IssueItem): boolean {
  const customFields = bug.new_custom_fields || [];
  const defectTypeField = customFields.find(
    (field) => field?.custom_field === CustomFieldId.DEFECT_TYPE || field?.field_name === '缺陷类型'
  );

  const defectType = defectTypeField?.value || '';
  return defectType === '客户反馈';
}

/**
 * 显示总结信息并确认提交
 * @param bug 选中的 bug
 * @param bugFixData 填写的缺陷信息
 * @returns 用户是否确认提交
 */
async function showSummaryAndConfirm(bug: IssueItem, bugFixData: BugFixData): Promise<boolean> {
  logger.info('\n========== 填写信息总结 ==========\n');
  logger.info(`Bug 标题: ${bug.name}`);
  if (bugFixData.defectAnalysis) {
    logger.info(`缺陷技术分析: ${bugFixData.defectAnalysis}`);
  }
  if (bugFixData.problemReason) {
    logger.info(`问题原因及解决办法: ${bugFixData.problemReason}`);
  }
  if (bugFixData.impactScope) {
    logger.info(`影响范围: ${bugFixData.impactScope}`);
  }
  if (bugFixData.introductionStage) {
    logger.info(`引入阶段: ${bugFixData.introductionStage}`);
  }
  if (bugFixData.releaseDate) {
    logger.info(`发布时间: ${bugFixData.releaseDate}`);
  }

  if (!bugFixData.terminalType) {
    logger.warn('\n💡 提示：未配置终端类型，建议运行 codearts config terminal-type 进行配置');
  }

  logger.info('\n==================================\n');

  const confirmed = await confirm({
    message: '确认提交以上信息？',
    default: true,
  });

  return confirmed;
}
