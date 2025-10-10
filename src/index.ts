import dotenv from 'dotenv';
import { BusinessService } from './services/business.service';
import { HuaweiCloudConfig } from './types';

// 加载环境变量
dotenv.config();

async function main() {
  try {
    const targetDate = process.env.TARGET_DATE || new Date().toISOString().split('T')[0];
    console.log(`开始统计 ${targetDate} 的日报...`);
    // 从环境变量获取项目ID和角色ID
    const projectId = process.env.PROJECT_ID;
    const roleId = process.env.ROLE_ID;

    if (!projectId) {
      console.error('错误: 未设置环境变量 PROJECT_ID');
      process.exit(1);
    }

    if (!roleId) {
      console.error('错误: 未设置环境变量 ROLE_ID');
      process.exit(1);
    }

    // 初始化华为云CodeArts API服务
    const config: HuaweiCloudConfig = {
      iamEndpoint:
        process.env.HUAWEI_CLOUD_IAM_ENDPOINT || 'https://iam.cn-north-1.myhuaweicloud.com',
      endpoint:
        process.env.CODEARTS_BASE_URL || 'https://projectman-ext.cn-north-1.myhuaweicloud.cn',
      username: process.env.HUAWEI_CLOUD_USERNAME || '',
      password: process.env.HUAWEI_CLOUD_PASSWORD || '',
      domainName: process.env.HUAWEI_CLOUD_DOMAIN || '',
    };

    const businessService = new BusinessService(config);

    // 获取指定角色的成员列表
    const roleMembers = await businessService.getMembersByRoleId(projectId, parseInt(roleId));

    // 获取指定角色用户的工时数据

    if (roleMembers.length === 0) {
      console.log('未找到指定角色的用户，跳过工时查询');
    } else {
      // 提取指定角色用户的ID列表
      const roleUserIds = roleMembers.map((member) => member.user_id);

      try {
        const dailyStats = await businessService.getDailyWorkHourStats(
          projectId,
          roleUserIds,
          targetDate
        );
        // 提取当天有工时记录的工作项ID
        const activeIssueIds = new Set<number>();
        dailyStats.userStats.forEach((userStat) => {
          userStat.workHours.forEach((workHour) => {
            activeIssueIds.add(workHour.issue_id);
          });
        });

        // 收集Bug工作项的工时记录，使用Map去重
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
            // issue_type为"3"表示缺陷/Bug
            if (
              workHour.issue_type === '缺陷' ||
              workHour.issue_type === '3' ||
              workHour.issue_type === 'Bug'
            ) {
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

        // 转换为数组格式
        const bugWorkHours = Array.from(bugWorkHoursMap.values()).map((bug) => ({
          title: bug.title,
          nick_name: Array.from(bug.users).join('、'),
          work_hours: bug.totalHours.toString(),
        }));

        console.log(`\n${dailyStats.date} 日报:`);
        console.log('='.repeat(50));

        // 按人展示一下工时
        dailyStats.userStats.forEach((userStat) => {
          console.log(`\n${userStat.userName} 工时: ${userStat.totalHours}小时`);
          userStat.workHours.forEach((workHour) => {
            console.log(
              ` - ${workHour.subject} (${workHour.issue_type}) ${workHour.work_hours_num}小时`
            );
          });
        });
        let index = 1;
        // 显示Bug工作项列表
        if (bugWorkHours.length > 0) {
          console.log(`\n${index}.Bug跟进: ${bugWorkHours.length}项`);
          bugWorkHours.forEach((bug) => {
            console.log(` - ${bug.title} ${bug.nick_name}`);
          });
          index++;
        }

        const activeIterations = await businessService.getActiveIterationsOnDate(
          projectId,
          targetDate
        );

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

        // 过滤出当天有进展的工作项
        const activeIssues = issues.filter((issue) => activeIssueIds.has(issue.id));

        if (activeIssues.length !== 0) {
          // 按迭代分组显示当天有进展的工作项
          const activeIssuesByIteration = new Map<number, typeof activeIssues>();
          activeIssues.forEach((issue) => {
            const iterationId = issue.iteration.id;
            if (!activeIssuesByIteration.has(iterationId)) {
              activeIssuesByIteration.set(iterationId, []);
            }
            activeIssuesByIteration.get(iterationId)!.push(issue);
          });

          // 按迭代分组所有工作项（用于整体统计）
          const issuesByIteration = new Map<number, typeof issues>();
          issues.forEach((issue) => {
            const iterationId = issue.iteration.id;
            if (!issuesByIteration.has(iterationId)) {
              issuesByIteration.set(iterationId, []);
            }
            issuesByIteration.get(iterationId)!.push(issue);
          });

          // 只显示当天有进展的迭代
          activeIterations.forEach((iteration) => {
            const iterationActiveIssues = activeIssuesByIteration.get(iteration.id) || [];

            // 如果该迭代当天没有进展的工作项，跳过不显示
            if (iterationActiveIssues.length === 0) {
              return;
            }

            // 显示整体统计
            const iterationIssues = issuesByIteration.get(iteration.id) || [];
            if (iterationIssues.length > 0) {
              const iterationStats = businessService.calculateWorkProgress(iterationIssues);
              console.log(`${index}.${iteration.name} ${iterationStats.overallCompletionRate}%`);
              index++;
            }

            // 显示当天有进展的工作项详情
            iterationActiveIssues.forEach((issue) => {
              const doneRate = issue.done_ratio
                ? issue.done_ratio
                : issue.expected_work_hours
                  ? issue.actual_work_hours / issue.expected_work_hours
                  : 0;
              const displayDoneRate = Math.round(Math.min(doneRate * 100, 100));
              console.log(` - ${issue.name} ${displayDoneRate}% ${issue.assigned_user.nick_name}`);
            });
          });
        }
        console.log(`${index}.工时: ${dailyStats.totalHours}`);
      } catch (error) {
        console.error('工时统计查询失败:', error);
      }
    }
  } catch (error) {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
  main();
}

// 导出API服务和类型定义
export { ApiService } from './services/api.service';
export { BusinessService } from './services/business.service';
export type {
  UserWorkHourStats,
  UserWorkStats,
  WorkHourStats,
  WorkProgressStats,
} from './services/business.service';
export * from './types';
