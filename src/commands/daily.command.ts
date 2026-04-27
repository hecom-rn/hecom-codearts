import ora from 'ora';
import pc from 'picocolors';
import { isWorkday } from '../config/holidays';
import { BusinessService } from '../services/business.service';
import { ConsoleTotal } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { consoleTotal } from '../utils/console';
import { buildCsvRow, writeCsvFile } from '../utils/csv-writer';
import { logger } from '../utils/logger';

function isBug(workHour: UserStats['workHours'][number]): boolean {
  return (
    workHour.issueType === '缺陷' || workHour.issueType === '3' || workHour.issueType === 'Bug'
  );
}

// 用户工时明细
interface UserStats {
  date: string;
  userId: string;
  userName: string;
  roleName?: string;
  totalHours: number;
  workHours: Array<{
    issueId: number;
    subject: string;
    summary: string;
    issueType: string;
    workHoursTypeName: string;
    workHoursNum: string;
  }>;
}

// 日报报告数据（按角色分组）
interface DailyReport {
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
 * 查询用户工时明细（不区分角色）
 * @param businessService 业务服务实例
 * @param projectId 项目ID
 * @param roleIds 角色ID列表
 * @param targetDate 目标日期
 * @return 用户工时明细列表
 */
async function queryDailyUserStats(
  businessService: BusinessService,
  projectId: string,
  roleIds: number[],
  targetDate: string
): Promise<ConsoleTotal<UserStats>> {
  const members = await businessService.getMembers(projectId, roleIds);
  const userIds = members.map((member) => member.user_id);
  const dailyStats = await businessService.getDailyWorkHourStats(projectId, userIds, targetDate);

  const userStats: UserStats[] = dailyStats.userStats.map((userStat) => ({
    date: targetDate,
    userId: userStat.userId,
    userName: userStat.userName,
    roleName: members.find((m) => m.user_id === userStat.userId)?.role_name,
    totalHours: userStat.totalHours,
    workHours: userStat.workHours.map((workHour) => ({
      issueId: workHour.issue_id,
      subject: workHour.subject,
      summary: workHour.summary,
      issueType: workHour.issue_type,
      nickName: workHour.nick_name,
      workHoursTypeName: workHour.work_hours_type_name,
      workHoursNum: workHour.work_hours_num,
    })),
  }));

  // 判断是否为工作日，非工作日应计工时为0

  const isWorkDay = isWorkday(new Date(targetDate), targetDate.split('-')[0]);
  const expectedHours = isWorkDay ? members.length * 8 : 0;
  const totalMap: [string, string][] = [
    ['统计人数', `${members.length} 人`],
    ['应计工时', `${expectedHours} 小时`],
    ['实际工时', `${dailyStats.totalHours} 小时`],
  ];

  return {
    list: userStats,
    roleNames: Array.from(new Set(userStats.map((s) => s.roleName).filter((r) => r !== undefined))),
    title: `${targetDate} 工时统计`,
    totalMap,
  };
}

/**
 * 查询日报报告数据（包括Bug汇总、迭代进度、其他工作等）
 * @param businessService 业务服务实例
 * @param projectId 项目ID
 * @param targetDate 目标日期
 * @param userIds 用户ID列表
 * @param userStats 用户工时统计数据
 */
async function queryDailyReport(
  businessService: BusinessService,
  projectId: string,
  targetDate: string,
  userStats: UserStats[]
): Promise<DailyReport> {
  // Bug汇总
  const activeIssueIds = new Set<number>();
  userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      activeIssueIds.add(workHour.issueId);
    });
  });

  const bugWorkHoursMap = new Map<
    string,
    {
      title: string;
      users: Set<string>;
      totalHours: number;
    }
  >();

  userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      if (isBug(workHour)) {
        const key = workHour.subject;
        const hours = parseFloat(workHour.workHoursNum) || 0;

        if (bugWorkHoursMap.has(key)) {
          const existing = bugWorkHoursMap.get(key)!;
          existing.users.add(userStat.userName);
          existing.totalHours += hours;
        } else {
          bugWorkHoursMap.set(key, {
            title: workHour.subject,
            users: new Set([userStat.userName]),
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

  let iterationProgress: DailyReport['iterationProgress'] = [];
  let activeIssues: Awaited<ReturnType<typeof businessService.getWorkloadByIterationsAndUsers>> =
    [];

  if (activeIterations.length > 0) {
    const activeIterationIds = activeIterations.map((iteration) => iteration.id);

    const issues = await businessService.getWorkloadByIterationsAndUsers(
      projectId,
      activeIterationIds,
      userStats.map((s) => s.userId)
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

  const otherWork: DailyReport['otherWork'] = [];
  userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      if (
        workHour.summary &&
        workHour.summary.trim() !== '' &&
        !isBug(workHour) &&
        !displayedIssueIds.has(workHour.issueId)
      ) {
        const subject = subjectMap[workHour.subject] ?? workHour.subject;
        otherWork.push({
          subject,
          summary: workHour.summary,
          nickName: userStat.userName,
        });
      }
    });
  });

  return {
    bugSummary,
    iterationProgress,
    otherWork,
    totalHours: userStats.reduce((sum, stat) => sum + stat.totalHours, 0),
  };
}

function issueTypeColor(type: string): string {
  const issueTypeColorMap: Record<string, (text: string) => string> = {
    任务: pc.bgCyan,
    缺陷: pc.bgRed,
  };
  return issueTypeColorMap[type] ? issueTypeColorMap[type](type) : pc.bgGreen(type);
}
/**
 * 控制台输出日报（多角色统一汇总）
 */
function outputConsole(data: ConsoleTotal<UserStats>): void {
  const list = data.list;

  consoleTotal(data);

  // 平铺所有用户的工时明细
  list.forEach((userStat) => {
    logger.info();
    logger.info(pc.red(`${userStat.userName} ${userStat.totalHours}小时`));
    userStat.workHours
      .sort((a, b) => a.issueType.localeCompare(b.issueType))
      .forEach((workHour) => {
        const summaryPart =
          workHour.summary && workHour.summary.trim() !== '' ? pc.cyan(` ${workHour.summary}`) : '';
        const workHoursTypePart = workHour.workHoursTypeName
          ? ` (${workHour.workHoursTypeName})`
          : '';
        logger.info(
          `  ${issueTypeColor(workHour.issueType)} ${workHour.subject}${summaryPart} ${workHoursTypePart} ${workHour.workHoursNum}小时`
        );
      });
  });
}

function consoleReport(report: DailyReport) {
  logger.info('\n\n');
  logger.info(`总结报告:`);
  logger.info('='.repeat(80));

  let index = 1;

  // 合并所有 Bug
  const allBugs = new Map<string, { title: string; users: Set<string>; hours: number }>();
  report.bugSummary.items.forEach((bug) => {
    if (allBugs.has(bug.title)) {
      const existing = allBugs.get(bug.title)!;
      bug.users.split('、').forEach((user) => existing.users.add(user));
      existing.hours += bug.hours;
    } else {
      allBugs.set(bug.title, {
        title: bug.title,
        users: new Set(bug.users.split('、')),
        hours: bug.hours,
      });
    }
  });

  if (allBugs.size > 0) {
    logger.info(`\n${index}.Bug跟进: ${allBugs.size}项`);
    if (allBugs.size < 6) {
      Array.from(allBugs.values()).forEach((bug) => {
        logger.info(` - ${bug.title} ${Array.from(bug.users).join('、')}`);
      });
    }
    index++;
  }

  // 合并所有迭代进度
  const allIterations = new Map<
    string,
    {
      iterationName: string;
      completionRate: number;
      activeIssues: Array<{ name: string; doneRatio: number; assignedUser: string }>;
    }
  >();

  report.iterationProgress.forEach((iteration) => {
    if (allIterations.has(iteration.iterationName)) {
      const existing = allIterations.get(iteration.iterationName)!;
      // 使用最高的完成率
      existing.completionRate = Math.max(existing.completionRate, iteration.completionRate);
      // 合并活跃问题（去重）
      iteration.activeIssues.forEach((issue) => {
        const exists = existing.activeIssues.some((i) => i.name === issue.name);
        if (!exists) {
          existing.activeIssues.push(issue);
        }
      });
    } else {
      allIterations.set(iteration.iterationName, {
        iterationName: iteration.iterationName,
        completionRate: iteration.completionRate,
        activeIssues: [...iteration.activeIssues],
      });
    }
  });

  Array.from(allIterations.values()).forEach((iteration) => {
    logger.info(`${index}.${iteration.iterationName} ${iteration.completionRate}%`);
    index++;

    iteration.activeIssues.forEach((issue) => {
      logger.info(` - ${issue.name} ${issue.doneRatio}% ${issue.assignedUser}`);
    });
  });

  // 合并所有其他工作
  if (report.otherWork.length > 0) {
    logger.info(`${index}.其他: ${report.otherWork.length}项`);
    report.otherWork.forEach((work) => {
      const subjectPart = work.subject ? `${work.subject} ` : '';
      logger.info(` - ${subjectPart}${work.summary} ${work.nickName}`);
    });
    index++;
  }

  logger.info(`${index}.工时: ${report.totalHours}`);
}

/**
 * CSV 文件输出
 */
function outputCsv(list: UserStats[], targetDate: string): void {
  const csvLines: string[] = [];
  csvLines.push(
    buildCsvRow(['日期', '角色', '用户', '类型', '工作项', '工作内容', '工时类型', '工时'])
  );

  list.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      csvLines.push(
        buildCsvRow([
          userStat.date,
          userStat.roleName,
          userStat.userName,
          workHour.issueType,
          workHour.subject,
          workHour.summary,
          workHour.workHoursTypeName,
          workHour.workHoursNum,
        ])
      );
    });
  });

  const filename = `daily-${targetDate}.csv`;
  writeCsvFile(filename, csvLines, logger);
}

/**
 * JSON 输出（直接打印到控制台，供编程调用）
 */
function outputJson(data: UserStats[]): void {
  logger.json(data);
}

/**
 * daily 命令入口
 */
export async function dailyCommand(date?: string, cliOptions: CliOptions = {}): Promise<void> {
  const spinner = ora('正在查询数据...').start();
  const targetDate = date || new Date().toISOString().split('T')[0];
  const showReport = cliOptions.report ?? false;

  const { projectId, roleIds, config, outputFormat } = loadConfig(cliOptions);

  const businessService = new BusinessService(config);

  // 查询用户工时统计
  const data = await queryDailyUserStats(businessService, projectId, roleIds, targetDate);

  // 查询报告数据
  let report = null;
  if (showReport && outputFormat === 'console') {
    report = await queryDailyReport(businessService, projectId, targetDate, data.list);
  }
  spinner.stop();
  // 控制台输出
  if (outputFormat === 'console') {
    outputConsole(data);
    if (report) {
      consoleReport(report);
    }
  } else if (outputFormat === 'csv') {
    outputCsv(data.list, targetDate);
  } else if (outputFormat === 'json') {
    outputJson(data.list);
  }
}
