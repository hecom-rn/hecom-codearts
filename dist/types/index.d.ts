export interface ApiConfig {
    baseURL: string;
    apiKey: string;
    timeout: number;
}
export interface HuaweiCloudConfig {
    iamEndpoint: string;
    region: string;
    endpoint: string;
    username: string;
    password: string;
    domainName: string;
    enableLogging?: boolean;
}
export interface IamTokenRequest {
    auth: {
        identity: {
            methods: string[];
            password: {
                user: {
                    name: string;
                    password: string;
                    domain: {
                        name: string;
                    };
                };
            };
        };
        scope: {
            project?: {
                name?: string;
                id?: string;
            };
            domain?: {
                name?: string;
                id?: string;
            };
        };
    };
}
export interface IamTokenResponse {
    token: {
        expires_at: string;
        issued_at: string;
        methods: string[];
        project?: {
            domain: {
                id: string;
                name: string;
            };
            id: string;
            name: string;
        };
        domain?: {
            id: string;
            name: string;
        };
        roles: Array<{
            id: string;
            name: string;
        }>;
        user: {
            domain: {
                id: string;
                name: string;
            };
            id: string;
            name: string;
            password_expires_at: string;
        };
        catalog?: Array<{
            endpoints: Array<{
                id: string;
                interface: string;
                region: string;
                region_id: string;
                url: string;
            }>;
            id: string;
            name: string;
            type: string;
        }>;
    };
}
export interface CachedToken {
    token: string;
    expiresAt: Date;
    issuedAt: Date;
    projectId?: string;
    projectName?: string;
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    data: T | null;
    message?: string;
    error?: string;
}
export interface RawData {
    id: string;
    timestamp: string;
    content: unknown;
    metadata?: Record<string, unknown>;
}
export interface ProcessedData {
    id: string;
    processedAt: string;
    result: unknown;
    summary?: string;
}
export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    data?: unknown;
}
export interface ProjectType {
    SCRUM: 'scrum';
    NORMAL: 'normal';
    XBOARD: 'xboard';
}
export interface ProjectQueryParams {
    offset?: number;
    limit?: number;
    search?: string;
    project_type?: 'scrum' | 'normal' | 'xboard';
    sort?: string;
    archive?: 'true' | 'false';
    query_type?: 'domain_projects' | 'absent';
}
export interface ProjectCreator {
    user_num_id: number;
    user_id: string;
    user_name: string;
    domain_id: string;
    domain_name: string;
    nick_name: string;
}
export interface Project {
    project_num_id: number;
    project_id: string;
    project_name: string;
    description: string;
    created_time: number;
    updated_time: number;
    project_type: 'scrum' | 'normal' | 'xboard';
    creator: ProjectCreator;
}
export interface ProjectListResponse {
    projects: Project[];
    total: number;
}
export interface ProjectMember {
    domain_id: string;
    domain_name: string;
    user_id: string;
    user_name: string;
    user_num_id: number;
    role_id: number;
    nick_name: string;
    role_name: string;
    user_type: 'User' | 'Federation';
    forbidden: 0 | 1;
}
export interface ProjectMemberListResponse {
    members: ProjectMember[];
    total: number;
}
export interface ProjectMemberQueryParams {
    offset?: number;
    limit?: number;
}
export interface ShowProjectWorkHoursRequest {
    begin_time?: string;
    end_time?: string;
    limit?: number;
    offset?: number;
    user_ids?: string[];
    work_hours_dates?: string;
    work_hours_types?: string;
}
export interface WorkHour {
    closed_time: string;
    created_time: string;
    issue_id: number;
    issue_type: string;
    nick_name: string;
    project_name: string;
    subject: string;
    summary: string;
    user_id: string;
    user_name: string;
    work_date: string;
    work_hours_created_time: string;
    work_hours_num: string;
    work_hours_type_name: string;
    work_hours_updated_time: string;
}
export interface ShowProjectWorkHoursResponse {
    total: number;
    work_hours: WorkHour[];
}
export interface CustomField {
    custom_field?: string;
    value?: string;
}
export interface ListIssuesV4Request {
    subject?: string;
    issue_ids?: number[];
    assigned_ids?: string[];
    closed_time_interval?: string;
    created_time_interval?: string;
    creator_ids?: string[];
    custom_fields?: CustomField[];
    developer_ids?: string[];
    domain_ids?: number[];
    done_ratios?: number[];
    include_deleted?: boolean;
    iteration_ids?: number[];
    limit?: number;
    module_ids?: number[];
    offset?: number;
    priority_ids?: number[];
    query_type?: 'epic' | 'feature' | 'backlog';
    severity_ids?: number[];
    status_ids?: number[];
    story_point_ids?: number[];
    tracker_ids?: number[];
    updated_time_interval?: string;
}
export interface IssueUser {
    id: number;
    name: string;
    nick_name: string;
    user_id: string;
    user_num_id: number;
    first_name: string;
}
export interface IssueCustomField {
    name: string;
    new_name: string;
    value: string;
}
export interface IssueDomain {
    id: number;
    name: string;
}
export interface IssueIteration {
    id: number;
    name: string;
}
export interface IssueModule {
    id: number;
    name: string;
}
export interface IssueNewCustomField {
    custom_field: string;
    field_name: string;
    value: string;
}
export interface IssueParent {
    id: number;
    name: string;
}
export interface IssuePriority {
    id: number;
    name: string;
}
export interface IssueProjectInfo {
    project_id: string;
    project_name: string;
    project_num_id: number;
}
export interface IssueSeverity {
    id: number;
    name: string;
}
export interface IssueStatus {
    id: number;
    name: string;
}
export interface IssueTracker {
    id: number;
    name: string;
}
export interface IssueItem {
    actual_work_hours: number;
    assigned_cc_user: IssueUser[];
    assigned_user: IssueUser;
    begin_time: string;
    closed_time: string;
    created_time: string;
    creator: IssueUser;
    custom_fields: IssueCustomField[];
    developer: IssueUser;
    domain: IssueDomain;
    done_ratio: number;
    end_time: string;
    expected_work_hours: number;
    id: number;
    iteration: IssueIteration;
    module: IssueModule;
    name: string;
    new_custom_fields: IssueNewCustomField[];
    parent_issue: IssueParent;
    priority: IssuePriority;
    project: IssueProjectInfo;
    severity: IssueSeverity;
    status: IssueStatus;
    tracker: IssueTracker;
    updated_time: string;
    deleted: boolean;
}
export interface ListIssuesV4Response {
    issues: IssueItem[];
    total: number;
}
export interface ListProjectIterationsV4Request {
    updated_time_interval?: string;
    include_deleted?: boolean;
}
export interface IterationInfo {
    begin_time: string;
    deleted: boolean;
    description: string;
    end_time: string;
    id: number;
    name: string;
    status: string;
    updated_time: number;
}
export interface ListProjectIterationsV4Response {
    iterations: IterationInfo[];
    total: number;
}
export interface AddIssueNotesRequest {
    id: string;
    notes: string;
    projectUUId: string;
    type?: string;
}
export interface UserVO {
    assigned_nick_name?: string;
    first_name?: string;
    id?: number;
    identifier?: string;
    last_name?: string;
    name?: string;
}
export interface CustomFieldV2 {
    name?: string;
    value?: string;
    new_name?: string;
}
export interface IssueDetailCustomFieldV2 {
    custom_field?: string;
    field_name?: string;
    value?: string;
    field_type?: string;
    description?: string;
}
export interface DomainVO {
    id?: number;
    name?: string;
}
export interface ProjectVO {
    identifier?: string;
    name?: string;
    id?: number;
    project_type?: string;
}
export interface IterationVO {
    id?: number;
    name?: string;
}
export interface StoryPointVO {
    id?: number;
    name?: string;
}
export interface ModuleVO {
    id?: number;
    name?: string;
}
export interface ParentIssueVO {
    id?: number;
    name?: string;
}
export interface PriorityVO {
    id?: number;
    name?: string;
}
export interface SeverityVO {
    id?: number;
    name?: string;
}
export interface StatusVO {
    id?: number;
    name?: string;
}
export interface EnvVO {
    id?: number;
    name?: string;
}
export interface TrackerVO {
    id?: number;
    name?: string;
}
export interface IssueAccessoryV2 {
    attachment_id?: number;
    issue_id?: number;
    creator_num_id?: number;
    created_date?: string;
    file_name?: string;
    container_type?: string;
    disk_file_name?: string;
    digest?: string;
    disk_directory?: string;
    creator_id?: string;
}
export interface IssueDetailResponseV2 {
    actual_work_hours?: number;
    assigned_cc_user?: UserVO[];
    assigned_to?: UserVO;
    start_date?: string;
    created_on?: string;
    author?: UserVO;
    custom_fields?: CustomFieldV2[];
    custom_value_new?: IssueDetailCustomFieldV2;
    developer?: UserVO;
    domain?: DomainVO;
    done_ratio?: number;
    end_time?: string;
    expected_work_hours?: number;
    id?: number;
    project?: ProjectVO;
    iteration?: IterationVO;
    story_point?: StoryPointVO;
    module?: ModuleVO;
    subject?: string;
    parent_issue?: ParentIssueVO;
    priority?: PriorityVO;
    severity?: SeverityVO;
    status?: StatusVO;
    release_dev?: string;
    find_release_dev?: string;
    env?: EnvVO;
    tracker?: TrackerVO;
    updated_on?: string;
    closed_time?: string;
    description?: string;
    accessories_list?: IssueAccessoryV2[];
    inner_text?: string;
}
export interface AddIssueNotesResult {
    issue: IssueDetailResponseV2;
}
export interface AddIssueNotesResponse {
    result: AddIssueNotesResult;
    status: string;
}
/**
 * 用户工作项统计信息
 */
export interface UserWorkStats {
    userName: string;
    count: number;
    expectedHours: number;
    actualHours: number;
    completionRate: number;
} /**
 * 工作项进度统计结果
 */
export interface WorkProgressStats {
    totalCount: number;
    totalExpectedHours: number;
    totalActualHours: number;
    overallCompletionRate: number;
    userStats: UserWorkStats[];
} /**
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
 * 领域工时统计信息
 */
export interface TypeWorkHourStats {
    type: string;
    totalHours: number;
    workHours: WorkHour[];
}
/**
 * 用户全量工时统计信息（按领域分组）
 */
export interface UserAllWorkHourStats {
    userName: string;
    userId: string;
    totalHours: number;
    domainStats: TypeWorkHourStats[];
}
/**
 * 全量工时统计结果
 */
export interface AllWorkHourStats {
    beginDate: string;
    endDate: string;
    totalHours: number;
    totalEntries: number;
    userStats: UserAllWorkHourStats[];
}
