// API相关类型定义
export interface ApiConfig {
  baseURL: string;
  apiKey: string;
  timeout: number;
}

// 华为云IAM认证配置
export interface HuaweiCloudConfig {
  iamEndpoint: string;
  endpoint: string;
  username: string;
  password: string;
  domainName: string;
  enableLogging?: boolean;
}

// IAM Token请求参数
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

// IAM Token响应
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

// 缓存的Token信息
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

// 数据处理相关类型
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

// HTTP请求选项
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
}

// CodeArts项目相关类型
export interface ProjectType {
  SCRUM: 'scrum';
  NORMAL: 'normal';
  XBOARD: 'xboard';
}

export interface ProjectQueryParams {
  offset?: number; // 分页索引，偏移量，从0开始，最大值10000
  limit?: number; // 每页显示数量，最小值1，最大值1000，默认10
  search?: string; // 模糊查询项目名称或描述
  project_type?: 'scrum' | 'normal' | 'xboard'; // 项目类型
  sort?: string; // 排序条件
  archive?: 'true' | 'false'; // 是否归档
  query_type?: 'domain_projects' | 'absent'; // 查询类型
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

// 项目成员相关类型
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
  forbidden: 0 | 1; // 0非禁用账号，1禁用账号
}

export interface ProjectMemberListResponse {
  members: ProjectMember[];
  total: number;
}

export interface ProjectMemberQueryParams {
  offset?: number; // 分页索引，偏移量，从0开始，最大值10000，默认0
  limit?: number; // 每页显示数量，最小值1，最大值1000，默认10
}

// 工时相关类型
export interface ShowProjectWorkHoursRequest {
  begin_time?: string; // 工时开始日期，年-月-日，格式：YYYY-MM-DD
  end_time?: string; // 工时结束日期，年-月-日，格式：YYYY-MM-DD
  limit?: number; // 每页显示数量，最小值1，最大值1000，默认10
  offset?: number; // 偏移量，从0开始，最大值10000，默认0
  user_ids?: string[]; // 查询的用户id列表
  work_hours_dates?: string; // 工时日期，以逗号分隔，年-月-日
  work_hours_types?: string; // 工时类型，以逗号分隔，21-34
}

export interface WorkHour {
  closed_time: string; // 工作项结束时间
  created_time: string; // 工作项创建时间
  issue_id: number; // 工作项id
  issue_type: string; // 工作项类型：2（任务/Task）3（缺陷/Bug）5（Epic）6（Feature）7（Story）
  nick_name: string; // 用户昵称
  project_name: string; // 项目名称
  subject: string; // 工作项标题
  summary: string; // 工时内容
  user_id: string; // 用户id
  user_name: string; // 用户名
  work_date: string; // 工时日期
  work_hours_created_time: string; // 工时创建时间
  work_hours_num: string; // 工时花费
  work_hours_type_name: string; // 工时类型
  work_hours_updated_time: string; // 工时更新时间
}

export interface ShowProjectWorkHoursResponse {
  total: number; // 总数
  work_hours: WorkHour[]; // 工时列表
}

// 工作项查询相关类型 (ListIssuesV4)
export interface CustomField {
  custom_field?: string; // 自定义字段
  value?: string; // 自定义属性对应的值，多个值以英文逗号区分开
}

export interface ListIssuesV4Request {
  subject?: string; // 工作项标题
  issue_ids?: number[]; // 工作项数字id
  assigned_ids?: string[]; // 处理人id
  closed_time_interval?: string; // 结束时间查询区间
  created_time_interval?: string; // 创建时间查询区间
  creator_ids?: string[]; // 创建人id
  custom_fields?: CustomField[]; // 用户自定义字段
  developer_ids?: string[]; // 开发人员id
  domain_ids?: number[]; // 领域id
  done_ratios?: number[]; // 工作项完成度
  include_deleted?: boolean; // 查询条件是否包含已删除工作项
  iteration_ids?: number[]; // 迭代id
  limit?: number; // 每页显示查询高级工作项的数量，默认100
  module_ids?: number[]; // 模块id
  offset?: number; // 分页索引，偏移量，默认0
  priority_ids?: number[]; // 优先级
  query_type?: 'epic' | 'feature' | 'backlog'; // 查询类型，默认backlog
  severity_ids?: number[]; // 重要程度
  status_ids?: number[]; // 状态id
  story_point_ids?: number[]; // 故事点id
  tracker_ids?: number[]; // 工作项类型
  updated_time_interval?: string; // 更新时间查询区间
}

export interface IssueUser {
  id: number; // 用户id
  name: string; // 带租户名的用户名（租户名_用户名）
  nick_name: string; // 昵称
  user_id: string; // 用户uuid
  user_num_id: number; // 用户数字id
  first_name: string; // 用户名
}

export interface IssueCustomField {
  name: string; // 自定义属性名
  new_name: string; // 自定义属性名
  value: string; // 自定义属性对应的值
}

export interface IssueDomain {
  id: number; // 领域id
  name: string; // 领域名称
}

export interface IssueIteration {
  id: number; // 迭代id
  name: string; // 迭代名
}

export interface IssueModule {
  id: number; // 模块id
  name: string; // 模块
}

export interface IssueNewCustomField {
  custom_field: string; // 自定义字段
  field_name: string; // 自定义属性对应的值
  value: string; // 自定义属性对应的值
}

export interface IssueParent {
  id: number; // 父工作项id
  name: string; // 父工作项
}

export interface IssuePriority {
  id: number; // 优先级id
  name: string; // 优先级
}

export interface IssueProjectInfo {
  project_id: string; // 项目id
  project_name: string; // 项目名称
  project_num_id: number; // 项目数字id
}

export interface IssueSeverity {
  id: number; // 重要程度id
  name: string; // 重要程度
}

export interface IssueStatus {
  id: number; // 状态id
  name: string; // 状态名称
}

export interface IssueTracker {
  id: number; // 类型id
  name: string; // 类型名称
}

export interface IssueItem {
  actual_work_hours: number; // 实际工时
  assigned_cc_user: IssueUser[]; // 抄送人
  assigned_user: IssueUser; // 处理人
  begin_time: string; // 预计开始时间
  closed_time: string; // 关闭时间
  created_time: string; // 创建时间
  creator: IssueUser; // 创建人
  custom_fields: IssueCustomField[]; // 自定义属性值
  developer: IssueUser; // 开发人员
  domain: IssueDomain; // 领域
  done_ratio: number; // 工作项完成度
  end_time: string; // 预计结束时间
  expected_work_hours: number; // 预计工时
  id: number; // 工作项id
  iteration: IssueIteration; // 迭代
  module: IssueModule; // 模块
  name: string; // 标题
  new_custom_fields: IssueNewCustomField[]; // 自定义属性值
  parent_issue: IssueParent; // 父工作项
  priority: IssuePriority; // 工作项优先级
  project: IssueProjectInfo; // 项目信息
  severity: IssueSeverity; // 工作项重要程度
  status: IssueStatus; // 工作项状态
  tracker: IssueTracker; // 工作项类型
  updated_time: string; // 更新时间
  deleted: boolean; // 是否已经删除
}

export interface ListIssuesV4Response {
  issues: IssueItem[]; // 工作项列表
  total: number; // 总数
}

// 项目迭代相关类型 (ListProjectIterationsV4)
export interface ListProjectIterationsV4Request {
  updated_time_interval?: string; // 更新迭代的时间（查询的起始时间,查询的结束时间）
  include_deleted?: boolean; // 是否包含被删除的迭代，false（不包含）true（包含）
}

export interface IterationInfo {
  begin_time: string; // 迭代开始时间
  deleted: boolean; // 迭代是否已经删除，false（未删除）true（已经删除）
  description: string; // 迭代描述
  end_time: string; // 迭代结束时间
  id: number; // 迭代id
  name: string; // 迭代标题
  status: string; // 迭代状态，open（老数据默认状态）0（未启动）1（进行中）2（已结束）
  updated_time: number; // 迭代更新时间，长整型时间戳
}

export interface ListProjectIterationsV4Response {
  iterations: IterationInfo[]; // 迭代信息
  total: number; // 迭代总数
}

// 工作项添加评论相关类型 (AddIssueNotes)
export interface AddIssueNotesRequest {
  id: string; // 工作项id
  notes: string; // 工作项的评论内容
  projectUUId: string; // 项目的32位uuid
  type?: string; // 工作项所属项目类型，scrum
}

export interface UserVO {
  assigned_nick_name?: string; // 用户昵称
  first_name?: string; // 用户名
  id?: number; // 用户数字id
  identifier?: string; // 用户32位uuid
  last_name?: string; // 用户姓名
  name?: string; // 有租户信息的用户名
}

export interface CustomFieldV2 {
  name?: string; // 自定义字段
  value?: string; // 自定义字段对应的值
  new_name?: string; // 自定义字段修改后的名称
}

export interface IssueDetailCustomFieldV2 {
  custom_field?: string; // 自定义字段
  field_name?: string; // 自定义字段名称
  value?: string; // 自定义属性对应的值，多个值以英文逗号区分开
  field_type?: string; // 自定义字段类型
  description?: string; // 自定义字段描述
}

export interface DomainVO {
  id?: number; // 领域id
  name?: string; // 领域名称
}

export interface ProjectVO {
  identifier?: string; // 项目uuid
  name?: string; // 项目名称
  id?: number; // 项目数字id
  project_type?: string; // 项目类型
}

export interface IterationVO {
  id?: number; // 工作项的迭代id
  name?: string; // 工作项的迭代名称
}

export interface StoryPointVO {
  id?: number; // 工作项的故事点id
  name?: string; // 工作项的故事点名称
}

export interface ModuleVO {
  id?: number; // 工作项的模块id
  name?: string; // 工作项的模块名称
}

export interface ParentIssueVO {
  id?: number; // 工作项的父工作项id
  name?: string; // 工作项的父工作项名称
}

export interface PriorityVO {
  id?: number; // 工作项的优先级id
  name?: string; // 工作项的优先级名称
}

export interface SeverityVO {
  id?: number; // 工作项的重要程度id
  name?: string; // 工作项的重要程度名称
}

export interface StatusVO {
  id?: number; // 工作项的当前状态id
  name?: string; // 工作项的当前状态名称
}

export interface EnvVO {
  id?: number; // 缺陷发现环境id
  name?: string; // 缺陷发现环境名称
}

export interface TrackerVO {
  id?: number; // 工作项的类型id
  name?: string; // 工作项的类型名称
}

export interface IssueAccessoryV2 {
  attachment_id?: number; // 附件id
  issue_id?: number; // 工作项数字id
  creator_num_id?: number; // 附件的上传者数字ID
  created_date?: string; // 附件创建时间
  file_name?: string; // 附件名称
  container_type?: string; // 附件所属类型
  disk_file_name?: string; // 附件在服务器上实际名称
  digest?: string; // 附件来源
  disk_directory?: string; // 附件在服务器上的路径
  creator_id?: string; // 附件的上传者uuid
}

export interface IssueDetailResponseV2 {
  actual_work_hours?: number; // 工作项的实际工时
  assigned_cc_user?: UserVO[]; // 当前工作项的抄送人
  assigned_to?: UserVO; // 工作项的当前责任人
  start_date?: string; // 工作项的预计开始时间，时间戳格式
  created_on?: string; // 工作项创建时间，时间戳格式
  author?: UserVO; // 工作项的创建人
  custom_fields?: CustomFieldV2[]; // 工作项的自定义字段
  custom_value_new?: IssueDetailCustomFieldV2; // 工作项的自定义字段
  developer?: UserVO; // 工作项的开发人员
  domain?: DomainVO; // 工作项的领域信息
  done_ratio?: number; // 工作项完成度
  end_time?: string; // 工作项的预计结束时间，时间戳格式
  expected_work_hours?: number; // 工作项的预计完成工时
  id?: number; // 工作项id
  project?: ProjectVO; // 工作项所属项目信息
  iteration?: IterationVO; // 工作项所属迭代信息
  story_point?: StoryPointVO; // 工作项的故事点信息
  module?: ModuleVO; // 工作项的模块信息
  subject?: string; // 工作项的标题
  parent_issue?: ParentIssueVO; // 工作项的父工作项信息
  priority?: PriorityVO; // 工作项的优先级
  severity?: SeverityVO; // 工作项的重要程度
  status?: StatusVO; // 工作项的当前状态
  release_dev?: string; // 工作项发布版本号
  find_release_dev?: string; // 缺陷发现版本号
  env?: EnvVO; // 缺陷发现环境
  tracker?: TrackerVO; // 工作项类型
  updated_on?: string; // 工作项的最后更新时间，时间戳格式
  closed_time?: string; // 工作项的关闭时间，时间戳格式
  description?: string; // 工作项描述
  accessories_list?: IssueAccessoryV2[]; // 工作项的附件列表
  inner_text?: string; // 工作项更新的评论内容
}

export interface AddIssueNotesResult {
  issue?: IssueDetailResponseV2;
}

export interface AddIssueNotesResponse {
  result?: AddIssueNotesResult; // 返回信息
  status?: string; // 返回状态
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
