// API相关类型定义
export interface ApiConfig {
  baseURL: string;
  apiKey: string;
  timeout: number;
}

// 华为云IAM认证配置
export interface HuaweiCloudConfig {
  iamEndpoint: string;
  region: string;
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

// HTTP请求选项
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
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
  offset?: number; // 分页索引，偏移量，从0开始,最大值10000,默认0
  limit?: number; // 每页显示数量,最小值1,最大值1000,默认10
}

// 项目角色相关类型
export interface ProjectRole {
  role_id: number;
  role_name: string;
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
  user_id: string; // 用户uuid，可能为空，优先使用 id
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

// 工作项状态ID枚举
export enum IssueStatusId {
  NEW_REQUIREMENT = 1, // 新需求
  IN_PROGRESS = 2, // 进行中
  RESOLVED = 3, // 已解决
  TESTING = 4, // 测试中
  CLOSED = 5, // 已关闭
  REJECTED = 6, // 已拒绝
  PRODUCT_DESIGN = 7, // 产品设计
  REVIEW_READY = 8, // 可评审
  DEV_POOL = 9, // 开发池
  DEVELOPING = 10, // 开发中
  TEST_READY = 11, // 可提测
  HANDOFF_EXPERIENCE = 12, // 转体验
  ACCEPTED = 13, // 接受处理
  VERIFIED = 14, // 已验证
  REOPENED = 15, // 重新打开
  POSTPONED = 16, // 延期
  NEW_ISSUE = 17, // 新问题
  CONVERTED_TO_REQUIREMENT = 18, // 转需求
  PENDING_TEST = 19, // 待测试
}

export interface IssueTracker {
  id: number; // 类型id
  name: string; // 类型名称
}

// 工作项类型ID枚举
export enum IssueTrackerId {
  TASK = 2, // 任务
  BUG = 3, // 缺陷
  EPIC = 5, // Epic
  FEATURE = 6, // Feature
  STORY = 7, // Story
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

export interface IssueTag {
  id: string;
  name: string;
}

export interface IssueDetail extends IssueItem {
  tag_list: IssueTag[] | null;
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

export enum IterationStatus {
  OPEN = 'open', // 老数据默认状态
  NOT_STARTED = '0', // 未启动
  IN_PROGRESS = '1', // 进行中
  COMPLETED = '2', // 已结束
}

export interface IterationInfo {
  begin_time: string; // 迭代开始时间
  deleted: boolean; // 迭代是否已经删除，false（未删除）true（已经删除）
  description: string; // 迭代描述
  end_time: string; // 迭代结束时间
  id: number; // 迭代id
  name: string; // 迭代标题
  status: IterationStatus; // 迭代状态
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

// 工作项更新请求相关类型 (UpdateIssue)
export interface UpdateIssueRequest {
  actual_work_hours?: number; // 实际工时
  assigned_id?: number; // 处理人id
  begin_time?: string; // 预计开始时间，格式：YYYY-MM-DD
  description?: string; // 工作项描述
  developer_id?: number; // 开发人员id
  domain_id?: number; // 领域id
  done_ratio?: number; // 工作项完成度（0-100）
  end_time?: string; // 预计结束时间，格式：YYYY-MM-DD
  expected_work_hours?: number; // 预计工时
  iteration_id?: number; // 迭代id
  module_id?: number; // 模块id
  name?: string; // 工作项标题
  parent_issue_id?: number; // 父工作项id
  priority_id?: number; // 优先级id
  severity_id?: number; // 重要程度id
  status_id?: number; // 状态id
  tracker_id?: number; // 工作项类型id
  new_custom_fields?: IssueNewCustomField[]; // 自定义属性值
}

export interface ListChildIssuesV4Response {
  issues: IssueItem[]; // 子工作项列表
  total: number; // 子工作项总数
}

export interface IssueUserV2 {
  firstName: string;
  lastName: string;
  identifier: string;
  imageId?: string;
  name: string;
  id: number;
  assignedNickName?: string;
  authorNickName?: string;
  closederNickName?: string;
}

export interface IssueParentV2 {
  subject: string;
  id: number;
}

export interface IssueProjectV2 {
  identifier: string;
  name: string;
  id: number;
  type: string;
}

export interface IssueTrackerV2 {
  name: string;
  id: number;
}

export interface IssueSeverityV2 {
  name: string;
  id: number;
}

export interface IssuePriorityV2 {
  name: string;
  id: number;
}

export interface IssueStatusV2 {
  name: string;
  id: number;
}

export interface IssueStatusAttributeV2 {
  name: string;
  id: number;
}

export interface IssueDomainV2 {
  name: string;
  id: number;
}

export interface IssueModuleV2 {
  id?: number;
  name?: string;
}

export interface IssueDeveloperV2 {
  id?: number;
  name?: string;
}

export interface IssueFixedVersionV2 {
  name: string;
  id: number;
}

export interface IssueOrderV2 {
  name: number;
  id: number;
}

export interface IssueCustomValueNewV2 {
  [key: string]: string;
}

export interface IssueItemV2 {
  id: number;
  subject: string;
  description: string;
  updated_on: string;
  created_on: string;
  closed_on: string;
  parent_issue?: IssueParentV2;
  parent_issue_id?: number;
  project: IssueProjectV2;
  done_ratio: number;
  findReleaseDev: string;
  tracker: IssueTrackerV2;
  releaseDev: string;
  customValueNew?: IssueCustomValueNewV2;
  order?: IssueOrderV2;
  assigned_to: IssueUserV2;
  status_attribute: IssueStatusAttributeV2;
  severity: IssueSeverityV2;
  isParent: boolean;
  author: IssueUserV2;
  module: IssueModuleV2;
  expected_work_hours: number;
  priority: IssuePriorityV2;
  actual_work_hours: number;
  is_watcher: boolean;
  deleted: boolean;
  fixed_version?: IssueFixedVersionV2;
  is_archived: boolean;
  domain: IssueDomainV2;
  developer: IssueDeveloperV2;
  closeder?: IssueUserV2;
  position: string;
  closed_flag: number;
  assigned_cc_user: IssueUserV2[];
  status: IssueStatusV2;
}

export interface ListChildIssuesV2Response {
  result: {
    total_count: number;
    issues: IssueItemV2[];
  };
  status: 'success';
}

// 自定义字段定义相关类型
/**
 * 自定义字段类型枚举
 */
export type CustomFieldType =
  | 'textbox' // 单行文本框
  | 'textarea' // 多行文本框
  | 'checkbox' // 多选框
  | 'radio' // 单选框
  | 'select' // 下拉选择
  | 'date' // 日期选择器
  | 'number' // 数字输入框
  | 'text' // 文本
  | 'textArea' // 文本域
  | 'user' // 用户选择
  | 'time_date'; // 时间日期选择

/**
 * 缺陷相关自定义字段ID枚举
 */
export enum CustomFieldId {
  // Bug专用字段
  FEEDBACK_PERSON = 'custom_field20', // 反馈人
  DEFECT_TECHNICAL_ANALYSIS = 'custom_field32', // 缺陷技术分析
  IMPACT_SCOPE = 'custom_field40', // 影响范围
  ENVIRONMENT = 'custom_field30', // 环境
  TERMINAL_TYPE = 'custom_field24', // 终端类型
  DEFECT_TYPE = 'custom_field36', // 缺陷类型
  PRODUCT_MODULE = 'custom_field33', // 产品模块
  CUSTOMER_FEEDBACK_NO = 'custom_field22', // 客户反馈编号
  TEST_CASE_COVERAGE = 'custom_field34', // 测试用例覆盖
  TEST_STAGE = 'custom_field23', // 测试阶段
  COMPANY_NAME = 'custom_field17', // 企业名称
  DEFECT_ROOT_CAUSE = 'custom_field28', // 缺陷根源
  PROBLEM_CAUSE_AND_SOLUTION = 'custom_field39', // 问题原因及解决办法
  RELEASE_TIME = 'custom_field18', // 发布时间
  INTRODUCTION_PHASE = 'custom_field29', // 引入阶段
  VERSION = 'custom_field37', // 版本
  TESTER = 'custom_field26', // 测试人员
  DEVELOPMENT_END = 'custom_field16', // 开发端
  AI_RELATED = 'custom_field25', // AI相关
  BRIEFING_TIME = 'custom_field38', // 交底时间
}

/**
 * 终端类型枚举
 * custom_field24（终端类型）字段的选项值枚举定义
 */
export enum TerminalType {
  // "1. 网页端,2. 平台服务端,3. 业务服务端,4. 手机端,6. 平台产品,7. 行业产品,8. UED,9. 质量,10. 运维,11.AI产品"
  WEB = '1. 网页端',
  PLATFORM_SERVICE = '2. 平台服务端',
  BUSINESS_SERVICE = '3. 业务服务端',
  MOBILE = '4. 手机端',
  PLATFORM_PRODUCT = '6. 平台产品',
  INDUSTRY_PRODUCT = '7. 行业产品',
  UED = '8. UED',
  QUALITY = '9. 质量',
  OPERATIONS = '10. 运维',
  AI_PRODUCT = '11.AI产品',
}

/**
 * 缺陷技术分析选项枚举
 * custom_field32（缺陷技术分析）字段的选项值枚举定义
 */
export enum DefectAnalysisType {
  FUNCTION_IMPLEMENTATION = '功能实现问题',
  REQUIREMENT_CHANGE = '需求变更问题',
  LEGACY_ISSUE = '历史遗留问题',
  CODE_LOGIC = '代码逻辑问题',
  USER_INTERFACE = '用户界面问题',
  INTERFACE = '接口问题',
  DATA = '数据问题',
  PERFORMANCE = '性能问题',
  ENVIRONMENT = '环境问题',
  COMPATIBILITY = '兼容性问题',
  PRODUCT_DESIGN = '产品设计问题',
  OPTIMIZATION_SUGGESTION = '优化建议问题',
  TECH_REQUIREMENT_CHANGE = '技术引起的需求变更问题',
  USAGE_AND_CONFIG = '使用及配置问题',
  OTHER = '其他问题',
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

/**
 * 配置键枚举
 * 用于类型安全的配置项访问
 */
export enum ConfigKey {
  // 不可变配置（只能通过 config 命令设置）
  HUAWEI_CLOUD_IAM_ENDPOINT = 'HUAWEI_CLOUD_IAM_ENDPOINT',
  HUAWEI_CLOUD_REGION = 'HUAWEI_CLOUD_REGION',
  HUAWEI_CLOUD_USERNAME = 'HUAWEI_CLOUD_USERNAME',
  HUAWEI_CLOUD_PASSWORD = 'HUAWEI_CLOUD_PASSWORD',
  HUAWEI_CLOUD_DOMAIN = 'HUAWEI_CLOUD_DOMAIN',
  CODEARTS_BASE_URL = 'CODEARTS_BASE_URL',
  PROJECT_ID = 'PROJECT_ID',

  // 可变配置（可以通过命令行参数覆盖）
  ROLE_ID = 'ROLE_ID',
  DEVELOPMENT_END = 'DEVELOPMENT_END',
  TERMINAL_TYPE = 'TERMINAL_TYPE',
}

/**
 * 类型安全的配置映射
 */
export type ConfigMap = {
  [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]: string;
  [ConfigKey.HUAWEI_CLOUD_REGION]: string;
  [ConfigKey.HUAWEI_CLOUD_USERNAME]: string;
  [ConfigKey.HUAWEI_CLOUD_PASSWORD]: string;
  [ConfigKey.HUAWEI_CLOUD_DOMAIN]: string;
  [ConfigKey.CODEARTS_BASE_URL]: string;
  [ConfigKey.PROJECT_ID]: string;
  [ConfigKey.ROLE_ID]: string;
  [ConfigKey.DEVELOPMENT_END]: string;
  [ConfigKey.TERMINAL_TYPE]: string;
};

/**
 * 输出格式类型
 */
export type OutputFormat = 'console' | 'csv' | 'json';

export interface ConsoleTotal<T> {
  title: string;
  roleNames: string[];
  totalMap: [string, string | (() => string)][];
  list: T[];
}

export interface AddIssueNotesResponse {
  result: AddIssueNotesResult; // 返回信息
  status: string; // 返回状态
}

export interface AddIssueNotesResult {
  issue: unknown;
}

// 当前用户信息相关类型 (ShowCurUserInfo)
export interface CurrentUserInfo {
  id: number; // 用户ID
  name: string; // 用户名
  nick_name: string; // 昵称
  user_id: string; // 用户UUID
  user_num_id: number; // 用户数字ID
  domain_id: string; // 租户ID
  domain_name: string; // 租户名称
  email?: string; // 邮箱
  phone?: string; // 电话
  status?: number; // 用户状态
}

// 自定义字段相关类型 (GetCustomFields)
export interface CustomFieldOption {
  custom_field: string; // 自定义字段标识
  type: CustomFieldType; // 字段类型
  name: string; // 字段名称
  options: string; // 字段选项，多个选项以逗号分隔
  tracker_ids: number[]; // 适用的工作项类型ID列表
  create_time: string; // 创建时间，ISO8601格式
}

export interface GetCustomFieldsRequest {
  custom_fields: string[]; // 要查询的自定义字段标识列表
}

export interface GetCustomFieldsResponse {
  datas: CustomFieldOption[]; // 自定义字段列表
}

// Bug修复相关类型
export interface BugFixData {
  defectAnalysis?: string; // 缺陷技术分析
  problemReason?: string; // 问题原因
  impactScope?: string; // 影响范围
  introductionStage?: string; // 引入阶段（客户反馈类缺陷）
  releaseDate?: string; // 发布日期（客户反馈类缺陷）
  developmentEnd?: string; // 开发端
  terminalType?: string; // 终端类型
}
