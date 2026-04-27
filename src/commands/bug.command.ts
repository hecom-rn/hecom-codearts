import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { BusinessService } from '../services/business.service';
import { ConsoleTotal, DefectAnalysisType, IssueItemV2, IterationInfo } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { consoleTotal, issueLink } from '../utils/console';
import { buildCsvRow, createHyperlinkFormula, writeCsvFile } from '../utils/csv-writer';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';

interface UserStats {
  userName: string;
  userId: number;
  totalBugCount: number;
  productBugCount: number;
  productDefectRate: number;
  stories: Array<{
    storyName: string;
    storyId: number;
    iterationName: string;
    totalBugCount: number;
    productBugCount: number;
  }>;
}

/**
 * 判断 Bug 是否属于需求变更或产品设计问题
 */
function isRequirementOrDesignBug(bug: IssueItemV2): boolean {
  const defectAnalysisValue = bug.customValueNew?.custom_field32;

  if (defectAnalysisValue) {
    return (
      defectAnalysisValue === DefectAnalysisType.REQUIREMENT_CHANGE ||
      defectAnalysisValue === DefectAnalysisType.PRODUCT_DESIGN
    );
  }

  return false;
}

/**
 * 查询 Bug 统计数据
 */
async function queryBugReportData(
  businessService: BusinessService,
  projectId: string,
  roleIds: number[],
  iterations: IterationInfo[]
): Promise<ConsoleTotal<UserStats>> {
  const roleNames = new Set<string>();
  const targetMemberIds = new Set<number>();

  const members = await businessService.getMembers(projectId, roleIds);

  members.forEach((member) => {
    targetMemberIds.add(member.user_num_id);
    roleNames.add(member.role_name);
  });

  const stories = await businessService.getStoriesByIterations(
    projectId,
    iterations,
    members.map((m) => m.user_id)
  );

  const bugStatsMap = new Map<number, UserStats>();

  for (const story of stories) {
    const childIssues = await businessService.getChildIssues(projectId, String(story.id));

    const allBugs = childIssues.filter((issue) => issue.tracker.id === 3);

    if (allBugs.length === 0) {
      continue;
    }

    const productBugs = allBugs.filter((bug) => isRequirementOrDesignBug(bug));

    const assignedUserId = story.assigned_user?.id;
    const assignedUserName = story.assigned_user?.nick_name;

    if (!assignedUserId) {
      continue;
    }

    if (!bugStatsMap.has(assignedUserId)) {
      bugStatsMap.set(assignedUserId, {
        userName: assignedUserName,
        userId: assignedUserId,
        totalBugCount: 0,
        productBugCount: 0,
        productDefectRate: 0,
        stories: [],
      });
    }

    const userStats = bugStatsMap.get(assignedUserId)!;
    userStats.totalBugCount += allBugs.length;
    userStats.productBugCount += productBugs.length;
    userStats.stories.push({
      storyName: story.name,
      storyId: story.id,
      iterationName: story.iteration?.name,
      totalBugCount: allBugs.length,
      productBugCount: productBugs.length,
    });
  }

  bugStatsMap.forEach((stats) => {
    stats.productDefectRate =
      stats.totalBugCount > 0
        ? Math.round((stats.productBugCount / stats.totalBugCount) * 100 * 100) / 100
        : 0;
  });

  const sortedStats = Array.from(bugStatsMap.values()).sort(
    (a, b) => b.totalBugCount - a.totalBugCount
  );

  let totalBugs = 0;
  let totalProductBugs = 0;

  sortedStats.forEach((stats) => {
    totalBugs += stats.totalBugCount;
    totalProductBugs += stats.productBugCount;
  });

  const overallProductDefectRate =
    totalBugs > 0 ? Math.round((totalProductBugs / totalBugs) * 100 * 100) / 100 : 0;

  return {
    title: '产品缺陷率统计',
    roleNames: Array.from(roleNames),
    list: sortedStats,
    totalMap: [
      ['产品缺陷率', `${overallProductDefectRate.toFixed(2)}%`],
      ['总 Bug 数', `${totalBugs}个`],
      ['产品问题数', `${totalProductBugs}个`],
      ['统计人数', `${sortedStats.length}人`],
      ['统计迭代', `${iterations.map((i) => i.name).join(', ')}`],
    ],
  };
}

/**
 * 控制台输出产品缺陷率统计
 */
function outputConsole(data: ConsoleTotal<UserStats>): void {
  consoleTotal(data);

  data.list.forEach((stats) => {
    logger.info(
      `\x1b[31m${stats.userName}: ${stats.productDefectRate.toFixed(2)}% (${stats.productBugCount}/${stats.totalBugCount})\x1b[0m`
    );

    stats.stories.forEach((story) => {
      logger.info(
        `  [${story.iterationName}] ${story.storyName} (${story.productBugCount}/${story.totalBugCount})`
      );
    });

    logger.info('');
  });
}

/**
 * CSV 文件输出
 */
function outputCsv(list: UserStats[], projectId: string): void {
  const csvLines: string[] = [];
  csvLines.push(buildCsvRow(['迭代', '处理人', 'Story', '总Bug数', '产品问题Bug数', '产品缺陷率']));

  list.forEach((userStat) => {
    userStat.stories.forEach((story) => {
      const defectRate =
        story.totalBugCount > 0
          ? ((story.productBugCount / story.totalBugCount) * 100).toFixed(2)
          : '0.00';
      const storyUrl = issueLink(projectId, story.storyId);
      const storyLink = createHyperlinkFormula(storyUrl, story.storyName ?? '');
      csvLines.push(
        buildCsvRow([
          story.iterationName,
          userStat.userName ?? '',
          storyLink,
          story.totalBugCount ?? '',
          story.productBugCount ?? '',
          `${defectRate}%`,
        ])
      );
    });
  });

  const filename = `bug-rate.csv`;
  writeCsvFile(filename, csvLines, logger);
}

/**
 * JSON 输出（直接打印到控制台，供编程调用）
 */
function outputJson(data: UserStats[]): void {
  logger.json(data);
}

/**
 * bug 命令入口
 */
export async function bugCommand(cliOptions: CliOptions = {}): Promise<void> {
  const { projectId, roleIds, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const iterations = await businessService.getIterations(projectId);

  if (iterations.length === 0) {
    throw new Error('未获取到任何迭代信息');
  }

  const iterationChoices = iterations.map((iteration) => ({
    name: `${iteration.name} (${iteration.begin_time} ~ ${iteration.end_time})`,
    value: iteration,
    checked: false,
  }));

  const selectedIterations = await checkbox({
    message: '请选择要统计的迭代：',
    choices: iterationChoices,
    validate: (answer) => {
      if (answer.length === 0) {
        return '至少需要选择一个迭代';
      }
      return true;
    },
    theme: globalTheme,
  });
  const spinner = ora('正在查询数据...').start();
  const reportData = await queryBugReportData(
    businessService,
    projectId,
    roleIds,
    selectedIterations
  );

  spinner.stop();
  logger.info();
  if (outputFormat === 'console') {
    outputConsole(reportData);
  } else if (outputFormat === 'csv') {
    outputCsv(reportData.list, projectId);
  } else if (outputFormat === 'json') {
    outputJson(reportData.list);
  }
}
