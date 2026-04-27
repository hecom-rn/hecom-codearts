import {
  AllWorkHourStats,
  BugFixData,
  CustomField,
  CustomFieldId,
  HuaweiCloudConfig,
  IssueDetail,
  IssueItem,
  IssueItemV2,
  IssueNewCustomField,
  IssueStatusId,
  IssueTrackerId,
  IterationInfo,
  IterationStatus,
  ProjectMember,
  ProjectRole,
  TestPlanItem,
  TypeWorkHourStats,
  UserAllWorkHourStats,
  UserWorkHourStats,
  UserWorkStats,
  WorkHour,
  WorkHourStats,
  WorkProgressStats,
} from '../types';
import { logger } from '../utils/logger';
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

  // 业务操作方法将在后续添加

  /**
   * 获取项目成员列表，可选按角色ID过滤
   * @param projectId 项目ID
   * @param roleIds 可选的角色ID列表，若提供则只返回匹配角色的成员
   * @returns 项目成员列表（分页获取全量）
   */
  async getMembers(projectId: string, roleIds?: number[]): Promise<ProjectMember[]> {
    const allMembers: ProjectMember[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const membersResponse = await this.apiService.getMembers(projectId, {
        limit: pageSize,
        offset,
      });

      if (!membersResponse.success) {
        throw new Error(`获取成员列表失败: ${membersResponse.error || '未知错误'}`);
      }

      const members = membersResponse.data?.members || [];
      allMembers.push(...members);

      const total = membersResponse.data?.total || 0;
      offset += pageSize;
      hasMore = offset < total;
    }

    if (roleIds && roleIds.length > 0) {
      const roleIdsSet = new Set(roleIds);
      return allMembers.filter((member) => roleIdsSet.has(member.role_id));
    }

    return allMembers;
  }

  /**
   * 获取项目中的所有角色列表（去重）
   * @param projectId 项目ID
   * @returns 项目中的所有角色列表
   */
  async getProjectRoles(projectId: string): Promise<ProjectRole[]> {
    // 分页获取所有成员
    const allMembers: ProjectMember[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const membersResponse = await this.apiService.getMembers(projectId, {
        limit: pageSize,
        offset: offset,
      });

      if (!membersResponse.success) {
        throw new Error(`获取成员列表失败: ${membersResponse.error || '未知错误'}`);
      }

      const members =
        membersResponse.data?.members.filter(
          (member) => member.role_id !== -1 && member.nick_name != null
        ) || [];
      allMembers.push(...members);

      // 判断是否还有更多数据
      const total = membersResponse.data?.total || 0;
      offset += pageSize;
      hasMore = offset < total;
    }

    // 使用 Map 去重，key 为 role_id
    const rolesMap = new Map<number, ProjectRole>();
    allMembers.forEach((member) => {
      if (!rolesMap.has(member.role_id)) {
        rolesMap.set(member.role_id, {
          role_id: member.role_id,
          role_name: member.role_name,
        });
      }
    });

    // 转换为数组并按 role_id 排序
    return Array.from(rolesMap.values()).sort((a, b) => a.role_id - b.role_id);
  }

  /**
   * 获取项目的迭代列表
   * @param projectId 项目ID
   * @param options 可选参数
   * @returns 迭代列表
   */
  async getIterations(
    projectId: string,
    options: { limit: number } = { limit: 12 }
  ): Promise<IterationInfo[]> {
    const iterationsResponse = await this.apiService.getIterations(projectId, {
      include_deleted: false,
    });

    if (!iterationsResponse.success) {
      throw new Error(`获取迭代列表失败: ${iterationsResponse.error || '未知错误'}`);
    }
    const list =
      (iterationsResponse.data?.iterations?.length || 0) > options.limit
        ? iterationsResponse.data?.iterations?.slice(0, options.limit) || []
        : iterationsResponse.data?.iterations || [];

    return list;
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
      if (iteration.status !== IterationStatus.IN_PROGRESS) {
        return false;
      }

      // 检查目标日期是否在迭代时间范围内
      // const beginTime = new Date(iteration.begin_time).getTime();
      const endTime = new Date(iteration.end_time).getTime();

      return targetDateTime <= endTime;
    });
  }

  /**
   * 根据多个迭代ID和用户ID列表查询工作量列表（仅Task）
   * @param projectId 项目ID
   * @param iterationIds 迭代ID列表
   * @param userIds 用户ID列表
   * @returns Task类型的工作项列表
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
      tracker_ids: [IssueTrackerId.TASK], // Task
      assigned_ids: userIds,
      limit: 100,
      offset: 0,
    });

    if (!issuesResponse.success) {
      throw new Error(`获取工作项失败: ${issuesResponse.error || '未知错误'}`);
    }

    return issuesResponse.data?.issues || [];
  }

  async addIssueNote(projectId: string, issueId: number, content: string): Promise<unknown> {
    const result = await this.apiService.addIssueNotes({
      projectUUId: projectId,
      id: String(issueId),
      notes: content,
    });
    if (result.data?.status === 'success') {
      return result.data.result.issue;
    }
    throw new Error(`添加工作项备注失败: ${result.data?.status || '未知错误'}`);
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

        // 如果状态是已关闭，expectedHours 取实际工时，否则取预估工时
        const expectedHours =
          issue.status?.id === IssueStatusId.CLOSED
            ? issue.actual_work_hours || 0
            : issue.expected_work_hours || 0;

        stats[userId].expectedHours += expectedHours;
        stats[userId].actualHours += issue.actual_work_hours || 0;

        // 累计总工时
        totalExpectedHours += expectedHours;
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
   * 根据迭代标题获取迭代信息
   * @param projectId 项目ID
   * @param iterationTitles 迭代标题列表
   * @returns 匹配的迭代信息列表
   */
  async getIterationsByTitles(
    projectId: string,
    iterationTitles: string[]
  ): Promise<IterationInfo[]> {
    const iterationsResponse = await this.apiService.getIterations(projectId, {
      include_deleted: false,
    });

    if (!iterationsResponse.success) {
      throw new Error(`获取迭代列表失败: ${iterationsResponse.error || '未知错误'}`);
    }

    const iterations = iterationsResponse.data?.iterations || [];

    // 过滤出标题匹配的迭代
    return iterations.filter((iteration) => iterationTitles.includes(iteration.name));
  }

  /**
   * 根据迭代信息获取所有 Story
   * @param projectId 项目ID
   * @param iterations 迭代信息列表
   * @returns Story 类型的工作项列表
   */
  async getStoriesByIterations(
    projectId: string,
    iterations: IterationInfo[],
    userIds?: string[]
  ): Promise<IssueItem[]> {
    if (iterations.length === 0) {
      return [];
    }

    // Step 2: 提取迭代ID
    const iterationIds = iterations.map((iteration) => iteration.id);

    // Step 3: 分页查询所有 Story（tracker_id = 7）
    const allStories: IssueItem[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const issuesResponse = await this.apiService.getIssues(projectId, {
        iteration_ids: iterationIds,
        assigned_ids: userIds,
        tracker_ids: [IssueTrackerId.STORY], // Story
        include_deleted: false,
        limit: pageSize,
        offset: offset,
      });

      if (!issuesResponse.success) {
        throw new Error(`获取Story列表失败: ${issuesResponse.error || '未知错误'}`);
      }

      const stories = issuesResponse.data?.issues || [];
      allStories.push(...stories);

      // 判断是否还有更多数据
      const total = issuesResponse.data?.total || 0;
      offset += pageSize;
      hasMore = offset < total;
    }

    return allStories;
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
      const isBug = issue?.tracker?.id === IssueTrackerId.BUG;
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

  /**
   * 获取指定工作项的所有子工作项（处理分页）
   * @param projectId 项目ID
   * @param issueId 父工作项ID
   * @returns 所有子工作项列表
   */
  async getChildIssues(projectId: string, issueId: string): Promise<IssueItemV2[]> {
    const allChildIssues: IssueItemV2[] = [];
    const pageSize = 100;
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.apiService.getChildIssuesV2(projectId, issueId, pageSize, pageNo);

      if (!response.success || !response.data) {
        throw new Error(`获取子工作项失败: ${response.error || '未知错误'}`);
      }

      const childIssues = response.data.result.issues || [];
      allChildIssues.push(...childIssues);

      const total = response.data.result.total_count || 0;
      hasMore = pageNo * pageSize < total;
      pageNo++;
    }

    return allChildIssues;
  }

  /**
   * 验证 IAM 凭证是否有效
   * @returns 验证结果，包含成功状态和可能的错误信息
   */
  async validateCredentials(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiService.refreshToken();
      return { success: true };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 获取项目列表
   * @param limit 返回的项目数量限制，默认100
   * @returns 项目列表
   */
  async getProjects(limit: number = 100): Promise<import('../types').Project[]> {
    const response = await this.apiService.getProjects({ limit });

    if (!response.success || !response.data) {
      throw new Error(response.error || '获取项目列表失败');
    }

    return response.data.projects;
  }

  /**
   * 查询当前用户的所有 Bug
   * @param projectId 项目ID
   * @param options 查询选项
   * @param options.hasIteration 是否有迭代（true: 有迭代, false: 无迭代, undefined: 不过滤）
   * @returns Bug 类型的工作项列表，按创建时间倒序排列
   */
  async getCurrentUserBugs(
    projectId: string,
    options: { hasIteration?: boolean } = {}
  ): Promise<IssueItem[]> {
    // Step 1: 获取当前用户信息
    const userInfoResponse = await this.apiService.showCurUserInfo();
    if (!userInfoResponse.success || !userInfoResponse.data) {
      throw new Error(`获取当前用户信息失败: ${userInfoResponse.error || '未知错误'}`);
    }

    const currentUserId = userInfoResponse.data.user_id;

    // Step 2: 分页查询所有 Bug（tracker_id = 3 为 Bug）
    const allBugs: IssueItem[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const issuesResponse = await this.apiService.getIssues(projectId, {
        assigned_ids: [currentUserId],
        tracker_ids: [IssueTrackerId.BUG], // Bug
        status_ids: [
          IssueStatusId.NEW_ISSUE,
          IssueStatusId.REOPENED,
          IssueStatusId.NEW_REQUIREMENT,
        ], // 可处理状态
        include_deleted: false,
        limit: pageSize,
        offset: offset,
      });

      if (!issuesResponse.success) {
        throw new Error(`获取Bug列表失败: ${issuesResponse.error || '未知错误'}`);
      }

      const bugs = issuesResponse.data?.issues || [];
      allBugs.push(...bugs);

      // 判断是否还有更多数据
      const total = issuesResponse.data?.total || 0;
      offset += pageSize;
      hasMore = offset < total;
    }

    // Step 3: 按照迭代状态过滤
    let filteredBugs = allBugs;
    if (options.hasIteration !== undefined) {
      filteredBugs = allBugs.filter((bug) => {
        const hasIteration = bug.iteration && bug.iteration.id > 0;
        return options.hasIteration ? hasIteration : !hasIteration;
      });
    }

    // Step 4: 按创建时间倒序排列
    filteredBugs.sort((a, b) => {
      const timeA = new Date(a.created_time).getTime();
      const timeB = new Date(b.created_time).getTime();
      return timeB - timeA; // 倒序
    });

    return filteredBugs;
  }

  /**
   * 根据迭代 ID 和终端类型查询有效 Bug（分页获取全量）
   * @param projectId 项目ID
   * @param iterationIds 迭代 ID 列表
   * @param terminalTypes 终端类型列表（对应 custom_field24），为空则不过滤
   * @returns Bug 类型工作项列表
   */
  async getBugsByIterationsAndTerminals(
    projectId: string,
    iterationIds: number[],
    terminalTypes: string[]
  ): Promise<IssueItem[]> {
    if (iterationIds.length === 0) {
      return [];
    }

    const customFieldsFilter: CustomField[] =
      terminalTypes.length > 0
        ? [{ custom_field: CustomFieldId.TERMINAL_TYPE, value: terminalTypes.join(',') }]
        : [];

    const allBugs: IssueItem[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const issuesResponse = await this.apiService.getIssues(projectId, {
        tracker_ids: [IssueTrackerId.BUG],
        iteration_ids: iterationIds,
        custom_fields: customFieldsFilter.length > 0 ? customFieldsFilter : undefined,
        include_deleted: false,
        limit: pageSize,
        offset,
      });

      if (!issuesResponse.success) {
        throw new Error(`查询 Bug 失败: ${issuesResponse.error || '未知错误'}`);
      }

      const bugs = issuesResponse.data?.issues || [];
      allBugs.push(...bugs);

      const total = issuesResponse.data?.total || 0;
      offset += pageSize;
      hasMore = offset < total;
    }

    return allBugs.filter((bug) => bug.status?.id !== IssueStatusId.REJECTED);
  }

  /**
   * 批量获取自定义字段的选项
   * @param projectId 项目ID
   * @param customFieldIds 自定义字段ID列表
   * @returns 自定义字段选项映射，key为字段ID，value为选项数组
   */
  async getCustomFieldOptions(
    projectId: string,
    customFieldIds: string[]
  ): Promise<Record<string, string[]>> {
    if (customFieldIds.length === 0) {
      return {};
    }

    const response = await this.apiService.getCustomFields(projectId, customFieldIds);

    if (!response.success || !response.data) {
      throw new Error(`获取自定义字段信息失败: ${response.error || '未知错误'}`);
    }

    // 将自定义字段列表转换为 fieldId -> options 的映射
    const optionsMap: Record<string, string[]> = {};
    response.data.datas.forEach((field) => {
      // 如果 options 为 null，返回空数组；否则将逗号分隔的字符串解析为数组
      optionsMap[field.custom_field] = field.options
        ? field.options.split(',').map((option) => option.trim())
        : [];
    });

    return optionsMap;
  }

  /**
   * 修复缺陷工作项
   * 根据填写的缺陷分析信息更新缺陷工作项，仅当问题为缺陷且状态为可处理状态时才更新
   * @param projectId 项目ID
   * @param issue 选中的缺陷工作项
   * @param bugFixData 缺陷分析数据
   */
  async fixBug(projectId: string, issue: IssueItem, bugFixData: BugFixData): Promise<void> {
    const {
      defectAnalysis,
      problemReason,
      impactScope,
      introductionStage,
      releaseDate,
      developmentEnd,
      terminalType,
    } = bugFixData;

    // 验证工作项是否为缺陷
    if (issue.tracker?.id !== IssueTrackerId.BUG) {
      throw new Error('选择的工作项不是缺陷类型');
    }

    // 验证工作项状态是否为可处理状态
    // 可处理状态：17（新问题）、15（重新打开）、1（新需求）
    if (
      ![IssueStatusId.NEW_ISSUE, IssueStatusId.REOPENED, IssueStatusId.NEW_REQUIREMENT].includes(
        issue.status?.id
      )
    ) {
      throw new Error('缺陷工作项状态不可处理');
    }

    // 构建更新请求体
    const newCustomFields: IssueNewCustomField[] = [];

    if (defectAnalysis) {
      newCustomFields.push({
        custom_field: 'custom_field32',
        field_name: '缺陷技术分析',
        value: defectAnalysis,
      });
    }

    if (problemReason) {
      newCustomFields.push({
        custom_field: 'custom_field39',
        field_name: '问题原因',
        value: problemReason,
      });
    }

    if (impactScope) {
      newCustomFields.push({
        custom_field: 'custom_field40',
        field_name: '影响范围',
        value: impactScope,
      });
    }

    // 检查缺陷类型是否为客户反馈
    const issueCustomFields = issue.new_custom_fields || [];
    const issueDefectTypeField = issueCustomFields.find(
      (field) => field?.custom_field === 'custom_field36' || field?.field_name === '缺陷类型'
    );

    const issueDefectType = issueDefectTypeField?.value || '';
    const isCustomerFeedback = issueDefectType === '客户反馈';

    if (isCustomerFeedback) {
      if (introductionStage) {
        newCustomFields.push({
          custom_field: 'custom_field29',
          field_name: '引入阶段',
          value: introductionStage,
        });
      }

      if (releaseDate) {
        // 将日期字符串转换为时间戳
        const releaseTimestamp = this.parseDateToTimestamp(releaseDate);
        if (releaseTimestamp !== null) {
          newCustomFields.push({
            custom_field: 'custom_field18',
            field_name: '发布日期',
            value: String(releaseTimestamp),
          });
        }
      }
    }

    // 添加开发端字段
    if (developmentEnd) {
      newCustomFields.push({
        custom_field: CustomFieldId.DEVELOPMENT_END,
        field_name: '开发端',
        value: developmentEnd,
      });
    }

    // 添加终端类型字段
    if (terminalType) {
      newCustomFields.push({
        custom_field: CustomFieldId.TERMINAL_TYPE,
        field_name: '终端类型',
        value: terminalType,
      });
    }

    // 只有在有自定义字段时才发送更新请求
    if (newCustomFields.length > 0) {
      const updateData = {
        status_id: IssueStatusId.RESOLVED, // 设置状态为已解决
        new_custom_fields: newCustomFields,
      };

      // 如果处理人不是创建人，则更新开发人员和处理人
      if (issue.assigned_user?.id !== issue.creator?.id) {
        Object.assign(updateData, {
          developer_id: issue.assigned_user?.id, // 开发人员设置为当前处理人
          assigned_id: issue.creator?.id, // 处理人设置为创建人
        });
      }

      await this.apiService.updateIssue(projectId, String(issue.id), updateData);
    }
  }

  /**
   * 并发批量获取工作项详情（含 tag_list）
   * @param projectId 项目ID
   * @param issueIds 工作项ID列表（调用 getIssueById 时转为 string）
   * @param concurrency 并发数，默认 10
   */
  async getIssueDetails(
    projectId: string,
    issueIds: number[],
    concurrency: number = 10
  ): Promise<IssueDetail[]> {
    const results: IssueDetail[] = [];

    for (let i = 0; i < issueIds.length; i += concurrency) {
      const batch = issueIds.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const response = await this.apiService.getIssueById(projectId, String(id));
            return response.success && response.data ? response.data : null;
          } catch (error) {
            logger.warn(`获取工作项 ${id} 详情失败: ${String(error)}`);
            return null;
          }
        })
      );
      results.push(...(batchResults.filter((r) => r !== null) as IssueDetail[]));
    }

    return results;
  }

  /**
   * 将日期字符串解析为时间戳
   * @param dateStr 日期字符串，格式：YYYY-MM-DD
   * @returns 毫秒时间戳，如果解析失败返回 null
   */
  private parseDateToTimestamp(dateStr: string): number | null {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date.getTime();
    } catch {
      return null;
    }
  }

  /**
   * 按迭代名称查找测试计划，返回第一个精确匹配项
   * @param projectId 项目 UUID
   * @param iterationName 迭代名称（精确匹配）
   */
  async getTestPlanByIterationName(
    projectId: string,
    iterationName: string
  ): Promise<TestPlanItem | null> {
    const response = await this.apiService.queryTestPlans(projectId, iterationName);
    if (!response.success || !response.data) {
      return null;
    }
    const plans = response.data.result?.value ?? [];
    return plans.find((p) => p.name === iterationName) ?? null;
  }

  /**
   * 查询整个项目中指定迭代名称内的客户反馈 Bug 列表
   * @param projectId 项目 UUID
   * @param iterationNames 迭代名称列表
   */
  async getCustomerFeedbackBugs(projectId: string, iterationNames: string[]): Promise<IssueItem[]> {
    const seenIds = new Set<number>();
    const results: IssueItem[] = [];
    for (const iterationName of iterationNames) {
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      while (hasMore) {
        const response = await this.apiService.getIssues(projectId, {
          tracker_ids: [IssueTrackerId.BUG],
          custom_fields: [
            { custom_field: CustomFieldId.DEFECT_TYPE, value: '客户反馈' },
            { custom_field: CustomFieldId.INTRODUCTION_PHASE, value: iterationName },
          ],
          offset,
          limit,
        });
        if (!response.success || !response.data?.issues) break;
        const issues = response.data.issues;
        for (const issue of issues) {
          if (!seenIds.has(issue.id)) {
            seenIds.add(issue.id);
            results.push(issue);
          }
        }
        hasMore = issues.length >= limit;
        offset += limit;
      }
    }
    return results;
  }
}
