import { BusinessService } from '../services/business.service';
import { DefectAnalysisType, IssueItemV2 } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { escapeCsv, writeCsvFile } from '../utils/csv-writer';
import { logger } from '../utils/logger';

interface BugStats {
  assignedUser: string;
  userId: number;
  totalBugCount: number;
  productBugCount: number;
  productDefectRate: number;
  stories: Array<{
    storyName: string;
    storyId: number;
    totalBugCount: number;
    productBugCount: number;
  }>;
}

interface BugReportData {
  iterations: string[];
  roleIds: number[];
  roleNames: string[];
  userStats: BugStats[];
  summary: {
    totalBugs: number;
    totalProductBugs: number;
    overallProductDefectRate: number;
    userCount: number;
  };
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
  iterationTitles: string[]
): Promise<BugReportData> {
  const roleNames = new Set<string>();
  const targetMemberIds = new Set<number>();
  if (roleIds.length > 0) {
    for (const roleId of roleIds) {
      const members = await businessService.getMembersByRoleId(projectId, roleId);
      members.forEach((member) => {
        targetMemberIds.add(member.user_num_id);
        roleNames.add(member.role_name);
      });
    }
  }

  const stories = await businessService.getStoriesByIterationTitles(projectId, iterationTitles);

  if (stories.length === 0) {
    return {
      iterations: iterationTitles,
      roleIds,
      roleNames: Array.from(roleNames),
      userStats: [],
      summary: {
        totalBugs: 0,
        totalProductBugs: 0,
        overallProductDefectRate: 0,
        userCount: 0,
      },
    };
  }

  const filteredStories =
    roleIds.length > 0
      ? stories.filter((story) => {
          const assignedUserId = story.assigned_user?.id;
          return assignedUserId && targetMemberIds.has(assignedUserId);
        })
      : stories;

  if (filteredStories.length === 0) {
    return {
      iterations: iterationTitles,
      roleIds,
      roleNames: Array.from(roleNames),
      userStats: [],
      summary: {
        totalBugs: 0,
        totalProductBugs: 0,
        overallProductDefectRate: 0,
        userCount: 0,
      },
    };
  }

  const bugStatsMap = new Map<number, BugStats>();

  for (const story of filteredStories) {
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
        assignedUser: assignedUserName,
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
    iterations: iterationTitles,
    roleIds,
    roleNames: Array.from(roleNames),
    userStats: sortedStats,
    summary: {
      totalBugs,
      totalProductBugs,
      overallProductDefectRate,
      userCount: sortedStats.length,
    },
  };
}

/**
 * 控制台输出产品缺陷率统计
 */
function outputConsole(data: BugReportData): void {
  logger.info(`产品缺陷率统计 [${data.roleNames.join(', ')}]`);
  logger.info('='.repeat(80));
  logger.info(`产品缺陷率: ${data.summary.overallProductDefectRate.toFixed(2)}% `);
  logger.info(`总 Bug 数: ${data.summary.totalBugs}个`);
  logger.info(`产品问题: ${data.summary.totalProductBugs}个`);
  logger.info(`统计人数: ${data.summary.userCount}人`);
  logger.info(`统计迭代: ${data.iterations.join(', ')}`);
  logger.info('='.repeat(80));

  data.userStats.forEach((stats) => {
    logger.info(
      `\x1b[31m${stats.assignedUser}: ${stats.productDefectRate.toFixed(2)}% (${stats.productBugCount}/${stats.totalBugCount})\x1b[0m`
    );

    stats.stories.forEach((story) => {
      logger.info(`  ${story.storyName} (${story.productBugCount}/${story.totalBugCount})`);
    });

    logger.info('');
  });
}

/**
 * CSV 文件输出
 */
function outputCsv(data: BugReportData, iterationTitles: string[]): void {
  const csvLines: string[] = [];
  csvLines.push('迭代,处理人,Story名称,StoryID,总Bug数,产品问题Bug数,产品缺陷率');

  data.userStats.forEach((userStat) => {
    userStat.stories.forEach((story) => {
      const defectRate =
        story.totalBugCount > 0
          ? ((story.productBugCount / story.totalBugCount) * 100).toFixed(2)
          : '0.00';
      csvLines.push(
        `"${escapeCsv(data.iterations.join(', '))}",${userStat.assignedUser ?? ''},"${escapeCsv(story.storyName ?? '')}",${story.storyId ?? ''},${story.totalBugCount ?? ''},${story.productBugCount ?? ''},${defectRate}%`
      );
    });
  });

  const filename = `bug-rate-${iterationTitles.join('-')}.csv`;
  writeCsvFile(filename, csvLines, logger);
}

/**
 * JSON 输出（直接打印到控制台，供编程调用）
 */
function outputJson(data: BugReportData): void {
  logger.json(data);
}

/**
 * bug 命令入口
 */
export async function bugCommand(
  iterationTitlesStr: string,
  cliOptions: CliOptions = {}
): Promise<void> {
  try {
    if (!iterationTitlesStr || iterationTitlesStr.trim() === '') {
      throw new Error('请指定至少一个迭代标题');
    }

    const iterationTitles = iterationTitlesStr
      .split(/[,，;；|\s、]+/)
      .map((title) => title.trim())
      .filter((title) => title.length > 0);

    const { projectId, roleIds, config, outputFormat } = loadConfig(cliOptions);
    const businessService = new BusinessService(config);

    const reportData = await queryBugReportData(
      businessService,
      projectId,
      roleIds,
      iterationTitles
    );

    if (outputFormat === 'console') {
      outputConsole(reportData);
    } else if (outputFormat === 'csv') {
      outputCsv(reportData, iterationTitles);
    } else if (outputFormat === 'json') {
      outputJson(reportData);
    }
  } catch (error) {
    logger.error(`执行过程中发生错误: `, error);
    process.exit(1);
  }
}
