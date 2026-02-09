import { BusinessService } from '../services/business.service';
import { WorkHour } from '../types';
import { loadConfig, CliOptions } from '../utils/config-loader';

function isBug(workHour: WorkHour): boolean {
  return (
    workHour.issue_type === '缺陷' || workHour.issue_type === '3' || workHour.issue_type === 'Bug'
  );
}

/**
 * 生成单个角色的日报
 */
export async function generateDailyReport(
  businessService: BusinessService,
  projectId: string,
  roleId: number,
  targetDate: string
): Promise<void> {
  const roleMembers = await businessService.getMembersByRoleId(projectId, roleId);

  if (roleMembers.length === 0) {
    console.log(`角色ID ${roleId} 未找到用户，跳过工时查询`);
    return;
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

  const bugWorkHours = Array.from(bugWorkHoursMap.values()).map((bug) => ({
    title: bug.title,
    nick_name: Array.from(bug.users).join('、'),
    work_hours: bug.totalHours.toString(),
  }));

  console.log(`\n${dailyStats.date} 日报 [${roleName}]:`);
  console.log('='.repeat(50));

  dailyStats.userStats.forEach((userStat) => {
    console.log(`\n\x1b[31m${userStat.userName} 工时: ${userStat.totalHours}小时\x1b[0m`);
    userStat.workHours.forEach((workHour) => {
      const summaryPart =
        workHour.summary && workHour.summary.trim() !== ''
          ? ` \x1b[36m${workHour.summary}\x1b[0m`
          : '';
      const workHoursTypePart = workHour.work_hours_type_name
        ? ` (${workHour.work_hours_type_name})`
        : '';
      console.log(
        ` - ${workHour.subject}${summaryPart} (${workHour.issue_type})${workHoursTypePart} ${workHour.work_hours_num}小时`
      );
    });
  });

  console.log('\n\n');
  console.log(`总结报告 [${roleName}]:`);
  console.log('='.repeat(50));

  let index = 1;
  if (bugWorkHours.length > 0) {
    console.log(`\n${index}.Bug跟进: ${bugWorkHours.length}项`);
    if (bugWorkHours.length < 6) {
      bugWorkHours.forEach((bug) => {
        console.log(` - ${bug.title} ${bug.nick_name}`);
      });
    }
    index++;
  }

  const activeIterations = await businessService.getActiveIterationsOnDate(projectId, targetDate);

  if (activeIterations.length === 0) {
    console.log('没有找到正在进行中的迭代');
    return;
  }

  const activeIterationIds = activeIterations.map((iteration) => iteration.id);

  const issues = await businessService.getWorkloadByIterationsAndUsers(
    projectId,
    activeIterationIds,
    roleUserIds
  );

  const activeIssues = issues.filter((issue) => activeIssueIds.has(issue.id));

  if (activeIssues.length !== 0) {
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
      if (iterationIssues.length > 0) {
        const iterationStats = businessService.calculateWorkProgress(iterationIssues);
        console.log(`${index}.${iteration.name} ${iterationStats.overallCompletionRate}%`);
        index++;
      }

      iterationActiveIssues.forEach((issue) => {
        const doneRate = issue.expected_work_hours
          ? issue.actual_work_hours / issue.expected_work_hours
          : 0;
        const displayDoneRate = issue.done_ratio
          ? issue.done_ratio
          : Math.round(Math.min(doneRate * 100, 100));
        console.log(` - ${issue.name} ${displayDoneRate}% ${issue.assigned_user.nick_name}`);
      });
    });
  }

  const displayedIssueIds = new Set<number>();
  activeIssues.forEach((issue) => {
    displayedIssueIds.add(issue.id);
  });

  const subjectMap: Record<string, string> = {
    '【移动端】会议、调研、环境处理等零散工作': '',
    '【移动端】【鸿蒙】调研、问题修复、打包等零散工作': '【鸿蒙】',
    // 可在此添加更多映射
  };
  const otherWorkHours: { subject: string; summary: string; nick_name: string }[] = [];
  dailyStats.userStats.forEach((userStat) => {
    userStat.workHours.forEach((workHour) => {
      if (
        workHour.summary &&
        workHour.summary.trim() !== '' &&
        !isBug(workHour) &&
        !displayedIssueIds.has(workHour.issue_id)
      ) {
        const subject = subjectMap[workHour.subject] ?? workHour.subject;
        otherWorkHours.push({
          subject,
          summary: workHour.summary,
          nick_name: workHour.nick_name,
        });
      }
    });
  });

  if (otherWorkHours.length > 0) {
    console.log(`${index}.其他: ${otherWorkHours.length}项`);
    otherWorkHours.forEach((work) => {
      const subjectPart = work.subject ? `${work.subject} ` : '';
      console.log(` - ${subjectPart}${work.summary} ${work.nick_name}`);
    });
    index++;
  }

  console.log(`${index}.工时: ${dailyStats.totalHours}`);
}

/**
 * daily 命令入口
 */
export async function dailyCommand(date?: string, cliOptions: CliOptions = {}): Promise<void> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`开始统计 ${targetDate} 的日报...`);

    const { projectId, roleIds, config } = loadConfig(cliOptions);
    const businessService = new BusinessService(config);

    for (let i = 0; i < roleIds.length; i++) {
      const roleId = roleIds[i];

      if (i > 0) {
        console.log('\n\n' + '='.repeat(80) + '\n');
      }

      await generateDailyReport(businessService, projectId, roleId, targetDate);
    }
  } catch (error) {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  }
}
