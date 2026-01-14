import { AllWorkHourStats, HuaweiCloudConfig, IssueDetailResponseV2, IssueItem, IterationInfo, ProjectMember, WorkHourStats, WorkProgressStats } from '../types';
import { ApiService } from './api.service';
/**
 * 业务服务类
 * 提供面向业务场景的高级操作，封装ApiService的底层调用
 */
export declare class BusinessService {
    private apiService;
    constructor(config: HuaweiCloudConfig);
    /**
     * 获取底层ApiService实例
     * 用于需要直接访问API服务的场景
     */
    getApiService(): ApiService;
    /**
     * 通过角色ID获取项目成员
     * @param projectId 项目ID
     * @param roleId 角色ID
     * @returns 指定角色的成员列表
     */
    getMembersByRoleId(projectId: string, roleId: number): Promise<ProjectMember[]>;
    /**
     * 获取指定日期之后的迭代列表
     * @param projectId 项目ID
     * @param targetDate 目标日期，格式：YYYY-MM-DD
     * @returns 正在进行中的和未来的迭代列表
     */
    getActiveIterationsOnDate(projectId: string, targetDate: string): Promise<IterationInfo[]>;
    /**
     * 根据多个迭代ID和用户ID列表查询工作量列表（仅Task和Story）
     * @param projectId 项目ID
     * @param iterationIds 迭代ID列表
     * @param userIds 用户ID列表
     * @returns Task和Story类型的工作项列表
     */
    getWorkloadByIterationsAndUsers(projectId: string, iterationIds: number[], userIds: string[]): Promise<IssueItem[]>;
    /**
     * 根据迭代ID和用户ID列表查询工作量列表（仅Task和Story）
     * @param projectId 项目ID
     * @param iterationId 迭代ID
     * @param userIds 用户ID列表
     * @returns Task和Story类型的工作项列表
     */
    getWorkloadByIterationAndUsers(projectId: string, iterationId: number, userIds: string[]): Promise<IssueItem[]>;
    addIssueNote(projectId: string, issueId: number, content: string): Promise<IssueDetailResponseV2>;
    /**
     * 统计工作项进度信息
     * @param issues 工作项列表
     * @returns 工作项进度统计结果，包括总体统计和按用户分组统计
     */
    calculateWorkProgress(issues: IssueItem[]): WorkProgressStats;
    /**
     * 查询指定用户在指定日期的工时统计
     * @param projectId 项目ID
     * @param userIds 用户ID列表
     * @param date 查询日期，格式：YYYY-MM-DD
     * @returns 工时统计结果，包括总工时和按用户分组的工时详情
     */
    getDailyWorkHourStats(projectId: string, userIds: string[], date: string): Promise<WorkHourStats>;
    /**
     * 查询指定用户在指定时间段内的所有工时统计（按人和领域分组）
     * @param projectId 项目ID
     * @param userIds 用户ID列表
     * @param beginDate 开始日期，格式：YYYY-MM-DD
     * @param endDate 结束日期，格式：YYYY-MM-DD
     * @returns 工时统计结果，按用户和领域两个维度分组
     */
    getAllWorkHourStats(projectId: string, userIds: string[], beginDate: string, endDate: string): Promise<AllWorkHourStats>;
}
