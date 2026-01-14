import {
  AllWorkHourStats,
  HuaweiCloudConfig,
  IssueItem,
  IterationInfo,
  ProjectMember,
  TypeWorkHourStats,
  UserAllWorkHourStats,
  UserWorkHourStats,
  UserWorkStats,
  WorkHour,
  WorkHourStats,
  WorkProgressStats,
} from '../types';
import { ApiService } from './api.service';

/**
 * 业务服务类
 * 提供面向业务场景的高级操作，封装ApiService的底层调用
 */
export class BusinessService {
  private apiService: ApiService;

  constructor(config: HuaweiCloudConfig) {
    this.apiService = new ApiService(config);
  }

  /**
   * 获取底层ApiService实例
   * 用于需要直接访问API服务的场景
   */
  public getApiService(): ApiService {
    return this.apiService;
  }

  // 业务操作方法将在后续添加

  /**
   * 通过角色ID获取项目成员
   * @param projectId 项目ID
   * @param roleId 角色ID
   * @returns 指定角色的成员列表
   */
  async getMembersByRoleId(projectId: string, roleId: number): Promise<ProjectMember[]> {
    const membersResponse = await this.apiService.getMembers(projectId);

    if (!membersResponse.success) {
      throw new Error(`获取成员列表失败: ${membersResponse.error || '未知错误'}`);
    }

    const allMembers = membersResponse.data?.members || [];
    return allMembers.filter((member) => member.role_id === roleId);
  }

  /**
   * 获取指定日期之后的迭代列表
   * @param projectId 项目ID
   * @param targetDate 目标日期，格式：YYYY-MM-DD
   * @returns 正在进行中的和未来的迭代列表
   */
  async getActiveIterationsOnDate(projectId: string, targetDate: string): Promise<IterationInfo[]> {
    const iterationsResponse = await this.apiService.getIterations(projectId, {
      include_deleted: false,
    });

    if (!iterationsResponse.success) {
      throw new Error(`获取迭代列表失败: ${iterationsResponse.error || '未知错误'}`);
    }

    const iterations = iterationsResponse.data?.iterations || [];
    const targetDateTime = new Date(targetDate).getTime();

    // 过滤出在目标日期正在进行中的迭代
    return iterations.filter((iteration) => {
      // 检查迭代状态是否为进行中 (1)
      if (iteration.status !== '1') {
        return false;
      }

      // 检查目标日期是否在迭代时间范围内
      // const beginTime = new Date(iteration.begin_time).getTime();
      const endTime = new Date(iteration.end_time).getTime();

      return targetDateTime <= endTime;
    });
  }

  /**
   * 根据多个迭代ID和用户ID列表查询工作量列表（仅Task和Story）
   * @param projectId 项目ID
   * @param iterationIds 迭代ID列表
   * @param userIds 用户ID列表
   * @returns Task和Story类型的工作项列表
   */
  async getWorkloadByIterationsAndUsers(
    projectId: string,
    iterationIds: number[],
    userIds: string[]
  ): Promise<IssueItem[]> {
    if (iterationIds.length === 0) {
      return [];
    }

    const issuesResponse = await this.apiService.getIssues(projectId, {
      iteration_ids: iterationIds,
      tracker_ids: [2, 7], // 2=Task(任务), 7=Story
      assigned_ids: userIds,
      limit: 100,
      offset: 0,
    });

    if (!issuesResponse.success) {
      throw new Error(`获取工作项失败: ${issuesResponse.error || '未知错误'}`);
    }

    return issuesResponse.data?.issues || [];
  }

  /**
   * 根据迭代ID和用户ID列表查询工作量列表（仅Task和Story）
   * @param projectId 项目ID
   * @param iterationId 迭代ID
   * @param userIds 用户ID列表
   * @returns Task和Story类型的工作项列表
   */
  async getWorkloadByIterationAndUsers(
    projectId: string,
    iterationId: number,
    userIds: string[]
  ): Promise<IssueItem[]> {
    const issuesResponse = await this.apiService.getIssues(projectId, {
      iteration_ids: [iterationId],
      tracker_ids: [2, 7], // 2=Task(任务), 7=Story
      assigned_ids: userIds,
      include_deleted: false,
      limit: 100,
      offset: 0,
    });

    if (!issuesResponse.success) {
      throw new Error(`获取工作项列表失败: ${issuesResponse.error || '未知错误'}`);
    }

    return issuesResponse.data?.issues || [];
  }

  async addIssueNote(projectId: string, issueId: number, content: string): Promise<void> {
    try {
      const result = await this.apiService.addIssueNotes({
        projectUUId: projectId,
        id: String(issueId),
        notes: content,
      });
      console.log('添加工作项备注成功:', result);
    } catch (error) {
      console.error('添加工作项备注失败:', error);
      throw error;
    }
  }
  /**
   * 统计工作项进度信息
   * @param issues 工作项列表
   * @returns 工作项进度统计结果，包括总体统计和按用户分组统计
   */
  calculateWorkProgress(issues: IssueItem[]): WorkProgressStats {
    // 总体统计
    let totalExpectedHours = 0;
    let totalActualHours = 0;

    // 按用户统计
    const userStatsMap = issues.reduce(
      (stats, issue) => {
        const userId =
          issue.assigned_user?.user_id || issue.assigned_user?.nick_name || 'unassigned';
        const userName = issue.assigned_user?.nick_name || '未分配';

        if (!stats[userId]) {
          stats[userId] = {
            userName,
            count: 0,
            expectedHours: 0,
            actualHours: 0,
            completionRate: 0,
          };
        }

        stats[userId].count++;
        stats[userId].expectedHours += issue.expected_work_hours || 0;
        stats[userId].actualHours += issue.actual_work_hours || 0;

        // 累计总工时
        totalExpectedHours += issue.expected_work_hours || 0;
        totalActualHours += issue.actual_work_hours || 0;

        return stats;
      },
      {} as Record<string, UserWorkStats>
    );

    // 计算各用户的完成率
    const userStats = Object.values(userStatsMap).map((stat) => ({
      ...stat,
      completionRate:
        stat.expectedHours > 0
          ? Number(((stat.actualHours / stat.expectedHours) * 100).toFixed(2))
          : 0,
    }));

    // 计算总体完成率
    const overallCompletionRate =
      totalExpectedHours > 0
        ? Number(((totalActualHours / totalExpectedHours) * 100).toFixed(2))
        : 0;

    return {
      totalCount: issues.length,
      totalExpectedHours,
      totalActualHours,
      overallCompletionRate,
      userStats,
    };
  }

  /**
   * 查询指定用户在指定日期的工时统计
   * @param projectId 项目ID
   * @param userIds 用户ID列表
   * @param date 查询日期，格式：YYYY-MM-DD
   * @returns 工时统计结果，包括总工时和按用户分组的工时详情
   */
  async getDailyWorkHourStats(
    projectId: string,
    userIds: string[],
    date: string
  ): Promise<WorkHourStats> {
    const workHoursResponse = await this.apiService.showProjectWorkHours(projectId, {
      user_ids: userIds,
      begin_time: date,
      end_time: date,
      limit: 100, // 设置较大的限制以获取当天所有工时记录
      offset: 0,
    });

    if (!workHoursResponse.success) {
      throw new Error(`获取工时数据失败: ${workHoursResponse.error || '未知错误'}`);
    }

    const workHours = workHoursResponse.data?.work_hours || [];

    // 按用户分组统计工时
    const userStatsMap = workHours.reduce(
      (stats, workHour) => {
        const userId = workHour.user_id;
        const userName = workHour.nick_name || workHour.user_name;

        if (!stats[userId]) {
          stats[userId] = {
            userName,
            userId,
            totalHours: 0,
            workHours: [],
          };
        }

        stats[userId].workHours.push(workHour);
        stats[userId].totalHours += parseFloat(workHour.work_hours_num) || 0;

        return stats;
      },
      {} as Record<string, UserWorkHourStats>
    );

    const userStats = Object.values(userStatsMap);

    // 计算总工时
    const totalHours = userStats.reduce((total, user) => total + user.totalHours, 0);

    return {
      date,
      totalHours: Math.round(totalHours * 100) / 100, // 保留两位小数
      totalEntries: workHours.length,
      userStats,
    };
  }

  /**
   * 查询指定用户在指定时间段内的所有工时统计（按人和领域分组）
   * @param projectId 项目ID
   * @param userIds 用户ID列表
   * @param beginDate 开始日期，格式：YYYY-MM-DD
   * @param endDate 结束日期，格式：YYYY-MM-DD
   * @returns 工时统计结果，按用户和领域两个维度分组
   */
  async getAllWorkHourStats(
    projectId: string,
    userIds: string[],
    beginDate: string,
    endDate: string
  ): Promise<AllWorkHourStats> {
    // Step 1: 分页获取所有工时记录
    const allWorkHours: WorkHour[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const workHoursResponse = await this.apiService.showProjectWorkHours(projectId, {
        user_ids: userIds,
        begin_time: beginDate,
        end_time: endDate,
        limit: pageSize,
        offset: offset,
      });

      if (!workHoursResponse.success) {
        throw new Error(`获取工时数据失败: ${workHoursResponse.error || '未知错误'}`);
      }

      const workHours = workHoursResponse.data?.work_hours || [];
      allWorkHours.push(...workHours);

      // 判断是否还有更多数据
      const total = workHoursResponse.data?.total || 0;
      offset += pageSize;
      hasMore = offset < total;
    }

    // Step 2: 提取不重复的 issue IDs
    const uniqueIssueIds = [...new Set(allWorkHours.map((wh) => wh.issue_id))];

    // Step 3: 获取所有 issue 详情（分批处理，每批最多 50 条）
    const issueDetailsMap = new Map<number, IssueItem>();
    if (uniqueIssueIds.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < uniqueIssueIds.length; i += batchSize) {
        const batchIds = uniqueIssueIds.slice(i, i + batchSize);
        const issuesResponse = await this.apiService.getIssues(projectId, {
          issue_ids: batchIds,
          limit: 100,
          offset: 0,
        });

        if (issuesResponse.success && issuesResponse.data?.issues) {
          issuesResponse.data.issues.forEach((issue) => {
            issueDetailsMap.set(issue.id, issue);
          });
        }
      }
    }

    // Step 4: 为每个工时记录关联领域信息
    const enrichedWorkHours: (WorkHour & { type: string })[] = allWorkHours.map((workHour) => {
      const issue = issueDetailsMap.get(workHour.issue_id);
      const isBug = issue?.tracker?.id === 3; // 3=Bug
      const type = isBug ? issue?.tracker?.name || '' : issue?.domain?.name || '未分配领域';

      return {
        ...workHour,
        type,
      };
    });

    // Step 5: 按用户分组
    const userStatsMap = enrichedWorkHours.reduce(
      (stats, workHour) => {
        const userId = workHour.user_id;
        const userName = workHour.nick_name || workHour.user_name;

        if (!stats[userId]) {
          stats[userId] = {
            userName,
            userId,
            totalHours: 0,
            domainStats: [],
            domainStatsMap: new Map<string, TypeWorkHourStats>(),
          };
        }

        const userStat = stats[userId];
        const hours = parseFloat(workHour.work_hours_num) || 0;
        userStat.totalHours += hours;

        // 按领域分组
        const type = workHour.type;

        if (!userStat.domainStatsMap.has(type)) {
          const domainStat: TypeWorkHourStats = {
            type,
            totalHours: 0,
            workHours: [],
          };
          userStat.domainStatsMap.set(type, domainStat);
          userStat.domainStats.push(domainStat);
        }

        const domainStat = userStat.domainStatsMap.get(type)!;
        domainStat.totalHours += hours;
        domainStat.workHours.push(workHour);

        return stats;
      },
      {} as Record<
        string,
        UserAllWorkHourStats & { domainStatsMap: Map<string, TypeWorkHourStats> }
      >
    );

    // Step 6: 转换为最终结果格式
    const userStats: UserAllWorkHourStats[] = Object.values(userStatsMap).map((stat) => {
      // 移除临时的 domainStatsMap
      const { domainStatsMap, ...userStat } = stat;
      // 对每个领域的总工时保留两位小数
      userStat.domainStats.forEach((domainStat) => {
        domainStat.totalHours = Math.round(domainStat.totalHours * 100) / 100;
      });
      // 对用户总工时保留两位小数
      userStat.totalHours = Math.round(userStat.totalHours * 100) / 100;
      return userStat;
    });

    // 计算总工时
    const totalHours = userStats.reduce((total, user) => total + user.totalHours, 0);

    return {
      beginDate,
      endDate,
      totalHours: Math.round(totalHours * 100) / 100,
      totalEntries: allWorkHours.length,
      userStats,
    };
  }
}
