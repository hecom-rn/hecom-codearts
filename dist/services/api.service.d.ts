import { AddIssueNotesRequest, AddIssueNotesResponse, ApiResponse, CachedToken, HuaweiCloudConfig, ListIssuesV4Request, ListIssuesV4Response, ListProjectIterationsV4Request, ListProjectIterationsV4Response, ProjectListResponse, ProjectMemberListResponse, ProjectMemberQueryParams, ProjectQueryParams, ShowProjectWorkHoursRequest, ShowProjectWorkHoursResponse } from '../types';
/**
 * 华为云CodeArts API服务类
 * 支持IAM Token认证和CodeArts API调用
 */
export declare class ApiService {
    private client;
    private iamClient;
    private config;
    private cachedToken;
    private enableLogging;
    constructor(config: HuaweiCloudConfig);
    /**
     * 打印curl风格的请求日志
     */
    private logCurlRequest;
    /**
     * 设置请求和响应拦截器
     */
    private setupInterceptors;
    /**
     * 获取IAM Token
     */
    private getIamToken;
    /**
     * 检查Token是否有效（距离过期时间超过5分钟）
     */
    private isTokenValid;
    /**
     * 获取有效的Token（自动处理缓存和刷新）
     */
    private getValidToken;
    /**
     * 通用请求方法
     */
    private request;
    /**
     * 设置CodeArts API的基础URL
     */
    setCodeArtsBaseUrl(baseUrl: string): void;
    /**
     * 获取项目列表
     */
    getProjects(params?: ProjectQueryParams): Promise<ApiResponse<ProjectListResponse>>;
    /**
     * 获取指定项目的详细信息
     */
    getProjectById(projectId: string): Promise<ApiResponse<unknown>>;
    /**
     * 高级查询工作项 (ListIssuesV4)
     * 根据筛选条件查询工作项
     */
    getIssues(projectId: string, params?: ListIssuesV4Request): Promise<ApiResponse<ListIssuesV4Response>>;
    /**
     * 获取指定工作项的详细信息
     */
    getIssueById(projectId: string, issueId: string): Promise<ApiResponse<unknown>>;
    /**
     * 创建工作项
     */
    createIssue(projectId: string, issueData: unknown): Promise<ApiResponse<unknown>>;
    /**
     * 更新工作项
     */
    updateIssue(projectId: string, issueId: string, issueData: unknown): Promise<ApiResponse<unknown>>;
    /**
     * 删除工作项
     */
    deleteIssue(projectId: string, issueId: string): Promise<ApiResponse<unknown>>;
    /**
     * 获取项目的迭代列表
     */
    getIterations(projectId: string, params?: ListProjectIterationsV4Request): Promise<ApiResponse<ListProjectIterationsV4Response>>;
    /**
     * 获取指定迭代的详细信息
     */
    getIterationById(projectId: string, iterationId: string): Promise<ApiResponse<unknown>>;
    /**
     * 获取项目成员列表
     */
    getMembers(projectId: string, params?: ProjectMemberQueryParams): Promise<ApiResponse<ProjectMemberListResponse>>;
    /**
     * 按用户查询工时（单项目）
     */
    showProjectWorkHours(projectId: string, params?: ShowProjectWorkHoursRequest): Promise<ApiResponse<ShowProjectWorkHoursResponse>>;
    /**
     * 工作项添加评论
     */
    addIssueNotes(params: AddIssueNotesRequest): Promise<ApiResponse<AddIssueNotesResponse>>;
    /**
     * 获取当前Token信息（用于调试）
     */
    getTokenInfo(): CachedToken | null;
    /**
     * 手动刷新Token
     */
    refreshToken(): Promise<string>;
}
