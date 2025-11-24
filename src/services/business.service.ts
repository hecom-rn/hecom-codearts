import { HuaweiCloudConfig, IssueItem, IterationInfo, ProjectMember, WorkHour } from '../types';
import { ApiService } from './api.service';

/**
 * 用户工作项统计信息
 */
export interface UserWorkStats {
  userName: string;
  count: number;
  expectedHours: number;
  actualHours: number;
  completionRate: number;
}

/**
 * 工作项进度统计结果
 */
export interface WorkProgressStats {
  totalCount: number;
  totalExpectedHours: number;
  totalActualHours: number;
  overallCompletionRate: number;
  userStats: UserWorkStats[];
}

/**
 * 用户工时统计信息
 */
export interface UserWorkHourStats {
  userName: string;
  userId: string;
  totalHours: number;
  workHours: WorkHour[];
}

/**
 * 工时统计结果
 */
export interface WorkHourStats {
  date: string;
  totalHours: number;
  totalEntries: number;
  userStats: UserWorkHourStats[];
}

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
  // TODO: 根据具体业务需求添加相应的方法

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
}
