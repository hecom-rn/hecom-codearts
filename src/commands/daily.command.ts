import { BusinessService } from '../services/business.service';
import { WorkHour } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { escapeCsv, writeCsvFile } from '../utils/csv-writer';
import { logger } from '../utils/logger';

function isBug(workHour: WorkHour): boolean {
  return (
    workHour.issue_type === '缺陷' || workHour.issue_type === '3' || workHour.issue_type === 'Bug'
  );
}

interface DailyReportData {
  date: string;
  roleName: string;
  roleId: number;
  userStats: Array<{
    userName: string;
    totalHours: number;
    workHours: Array<{
      subject: string;
      summary: string;
      issueType: string;
      workHoursTypeName: string;
      workHoursNum: string;
    }>;
  }>;
  bugSummary: {
    count: number;
    items: Array<{
      title: string;
      users: string;
      hours: number;
    }>;
  };
  iterationProgress: Array<{
    iterationName: string;
    completionRate: number;
    activeIssues: Array<{
      name: string;
      doneRatio: number;
      assignedUser: string;
    }>;
  }>;
  otherWork: Array<{
    subject: string;
    summary: string;
    nickName: string;
  }>;
  totalHours: number;
}

/**
 * 查询单个角色的日报数据
 */
async function queryDailyReportData(
  businessService: BusinessService,
  projectId: string,
  roleId: number,
  targetDate: string
): Promise<DailyReportData | null> {
  const roleMembers = await businessService.getMembersByRoleId(projectId, roleId);

  if (roleMembers.length === 0) {
    return null;
  }

  const roleName = roleMembers[0].role_name;
  const roleUserIds = roleMembers.map((member) => member.user_id);

  const dailyStats = await businessService.getDailyWorkHourStats(
    projectId,
    roleUserIds,
    targetDate
  );

  const activeIssueIds = new Set<number>();
  dailyStats.userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      activeIssueIds.add(workHour.issue_id);
    });
  });

  // Bug汇总
  const bugWorkHoursMap = new Map<
    string,
    {
      title: string;
      users: Set<string>;
      totalHours: number;
    }
  >();

  dailyStats.userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      if (isBug(workHour)) {
        const key = workHour.subject;
        const hours = parseFloat(workHour.work_hours_num) || 0;

        if (bugWorkHoursMap.has(key)) {
          const existing = bugWorkHoursMap.get(key)!;
          existing.users.add(workHour.nick_name);
          existing.totalHours += hours;
        } else {
          bugWorkHoursMap.set(key, {
            title: workHour.subject,
            users: new Set([workHour.nick_name]),
            totalHours: hours,
          });
        }
      }
    });
  });

  const bugSummary = {
    count: bugWorkHoursMap.size,
    items: Array.from(bugWorkHoursMap.values()).map((bug) => ({
      title: bug.title,
      users: Array.from(bug.users).join('、'),
      hours: bug.totalHours,
    })),
  };

  // 迭代进度
  const activeIterations = await businessService.getActiveIterationsOnDate(projectId, targetDate);

  const iterationProgress: DailyReportData['iterationProgress'] = [];
  let activeIssues: Awaited<ReturnType<typeof businessService.getWorkloadByIterationsAndUsers>> =
    [];

  if (activeIterations.length > 0) {
    const activeIterationIds = activeIterations.map((iteration) => iteration.id);

    const issues = await businessService.getWorkloadByIterationsAndUsers(
      projectId,
      activeIterationIds,
      roleUserIds
    );

    activeIssues = issues.filter((issue) => activeIssueIds.has(issue.id));

    if (activeIssues.length > 0) {
      const activeIssuesByIteration = new Map<number, typeof activeIssues>();
      activeIssues.forEach((issue) => {
        const iterationId = issue.iteration.id;
        if (!activeIssuesByIteration.has(iterationId)) {
          activeIssuesByIteration.set(iterationId, []);
        }
        activeIssuesByIteration.get(iterationId)!.push(issue);
      });

      const issuesByIteration = new Map<number, typeof issues>();
      issues.forEach((issue) => {
        const iterationId = issue.iteration.id;
        if (!issuesByIteration.has(iterationId)) {
          issuesByIteration.set(iterationId, []);
        }
        issuesByIteration.get(iterationId)!.push(issue);
      });

      activeIterations.forEach((iteration) => {
        const iterationActiveIssues = activeIssuesByIteration.get(iteration.id) || [];

        if (iterationActiveIssues.length === 0) {
          return;
        }

        const iterationIssues = issuesByIteration.get(iteration.id) || [];
        let completionRate = 0;

        if (iterationIssues.length > 0) {
          const iterationStats = businessService.calculateWorkProgress(iterationIssues);
          completionRate = iterationStats.overallCompletionRate;
        }

        const activeIssuesData = iterationActiveIssues.map((issue) => {
          const doneRate = issue.expected_work_hours
            ? issue.actual_work_hours / issue.expected_work_hours
            : 0;
          const displayDoneRate = issue.done_ratio
            ? issue.done_ratio
            : Math.round(Math.min(doneRate * 100, 100));

          return {
            name: issue.name,
            doneRatio: displayDoneRate,
            assignedUser: issue.assigned_user.nick_name,
          };
        });

        iterationProgress.push({
          iterationName: iteration.name,
          completionRate,
          activeIssues: activeIssuesData,
        });
      });
    }
  }

  // 其他工作
  const displayedIssueIds = new Set<number>();
  iterationProgress.forEach((iteration) => {
    iteration.activeIssues.forEach((issue) => {
      const foundIssue = activeIssues?.find((i) => i.name === issue.name);
      if (foundIssue) {
        displayedIssueIds.add(foundIssue.id);
      }
    });
  });

  const subjectMap: Record<string, string> = {
    '【移动端】会议、调研、环境处理等零散工作': '',
    '【移动端】【鸿蒙】调研、问题修复、打包等零散工作': '【鸿蒙】',
  };

  const otherWork: DailyReportData['otherWork'] = [];
  dailyStats.userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      if (
        workHour.summary &&
        workHour.summary.trim() !== '' &&
        !isBug(workHour) &&
        !displayedIssueIds.has(workHour.issue_id)
      ) {
        const subject = subjectMap[workHour.subject] ?? workHour.subject;
        otherWork.push({
          subject,
          summary: workHour.summary,
          nickName: workHour.nick_name,
        });
      }
    });
  });

  // 用户工时统计
  const userStats = dailyStats.userStats.map((userStat) => ({
    userName: userStat.userName,
    totalHours: userStat.totalHours,
    workHours: userStat.workHours.map((workHour) => ({
      subject: workHour.subject,
      summary: workHour.summary,
      issueType: workHour.issue_type,
      workHoursTypeName: workHour.work_hours_type_name,
      workHoursNum: workHour.work_hours_num,
    })),
  }));

  return {
    date: targetDate,
    roleName,
    roleId,
    userStats,
    bugSummary,
    iterationProgress,
    otherWork,
    totalHours: dailyStats.totalHours,
  };
}

/**
 * 控制台输出日报
 */
function outputConsole(data: DailyReportData): void {
  logger.info(`\n${data.date} 日报 [${data.roleName}]:`);
  logger.info('='.repeat(50));

  data.userStats.forEach((userStat) => {
    logger.info(`\n\x1b[31m${userStat.userName} 工时: ${userStat.totalHours}小时\x1b[0m`);
    userStat.workHours.forEach((workHour) => {
      const summaryPart =
        workHour.summary && workHour.summary.trim() !== ''
          ? ` \x1b[36m${workHour.summary}\x1b[0m`
          : '';
      const workHoursTypePart = workHour.workHoursTypeName
        ? ` (${workHour.workHoursTypeName})`
        : '';
      logger.info(
        ` - ${workHour.subject}${summaryPart} (${workHour.issueType})${workHoursTypePart} ${workHour.workHoursNum}小时`
      );
    });
  });

  logger.info('\n\n');
  logger.info(`总结报告 [${data.roleName}]:`);
  logger.info('='.repeat(50));

  let index = 1;
  if (data.bugSummary.count > 0) {
    logger.info(`\n${index}.Bug跟进: ${data.bugSummary.count}项`);
    if (data.bugSummary.count < 6) {
      data.bugSummary.items.forEach((bug) => {
        logger.info(` - ${bug.title} ${bug.users}`);
      });
    }
    index++;
  }

  data.iterationProgress.forEach((iteration) => {
    logger.info(`${index}.${iteration.iterationName} ${iteration.completionRate}%`);
    index++;

    iteration.activeIssues.forEach((issue) => {
      logger.info(` - ${issue.name} ${issue.doneRatio}% ${issue.assignedUser}`);
    });
  });

  if (data.otherWork.length > 0) {
    logger.info(`${index}.其他: ${data.otherWork.length}项`);
    data.otherWork.forEach((work) => {
      const subjectPart = work.subject ? `${work.subject} ` : '';
      logger.info(` - ${subjectPart}${work.summary} ${work.nickName}`);
    });
    index++;
  }

  logger.info(`${index}.工时: ${data.totalHours}`);
}

/**
 * CSV 文件输出
 */
function outputCsv(data: DailyReportData, targetDate: string): void {
  const csvLines: string[] = [];
  csvLines.push('日期,角色,用户,工作项,摘要,类型,工时类型,工时');

  data.userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      csvLines.push(
        `${data.date},${data.roleName},${userStat.userName},"${escapeCsv(workHour.subject)}","${escapeCsv(workHour.summary)}",${workHour.issueType},${workHour.workHoursTypeName},${workHour.workHoursNum}`
      );
    });
  });

  const filename = `daily-${targetDate}.csv`;
  writeCsvFile(filename, csvLines, logger);
}

/**
 * JSON 输出（直接打印到控制台，供编程调用）
 */
function outputJson(data: DailyReportData | DailyReportData[]): void {
  logger.json(data);
}

/**
 * daily 命令入口
 */
export async function dailyCommand(date?: string, cliOptions: CliOptions = {}): Promise<void> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const { projectId, roleIds, config, outputFormat } = loadConfig(cliOptions);

    const businessService = new BusinessService(config);
    const allReports: DailyReportData[] = [];

    for (let i = 0; i < roleIds.length; i++) {
      const roleId = roleIds[i];

      if (i > 0 && outputFormat === 'console') {
        logger.info('\n\n' + '='.repeat(80) + '\n');
      }

      const reportData = await queryDailyReportData(businessService, projectId, roleId, targetDate);

      if (reportData) {
        allReports.push(reportData);

        if (outputFormat === 'console') {
          outputConsole(reportData);
        }
      }
    }

    // 处理 CSV 和 JSON 输出
    if (outputFormat === 'csv') {
      allReports.forEach((report) => {
        outputCsv(report, targetDate);
      });
    } else if (outputFormat === 'json') {
      outputJson(allReports.length === 1 ? allReports[0] : allReports);
    }
  } catch (error) {
    logger.error(`执行过程中发生错误:`, error);
    process.exit(1);
  }
}
