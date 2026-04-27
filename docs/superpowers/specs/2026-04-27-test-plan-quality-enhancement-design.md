# 设计文档：测试计划查询 + quality 报告增强

**日期：** 2026-04-27  
**状态：** 已批准

---

## 背景

1. 新增华为云 CloudTest 测试计划查询 API 支持
2. quality 报告第一部分（缺陷总览）补充测试计划维度指标
3. quality 报告新增第八部分：本迭代客户反馈列表

---

## 变更一：测试计划查询 API

### 配置重构

**删除** `ConfigKey.CODEARTS_BASE_URL` 配置项，改为在 `ApiService` 内部根据 `region` 动态拼接两个域名常量：

| 常量 | 模板 | 用途 |
|------|------|------|
| `PROJECTMAN_BASE_URL` | `https://projectman-ext.{region}.myhuaweicloud.cn` | 项目管理 API |
| `CLOUDTEST_BASE_URL` | `https://cloudtest-ext.{region}.myhuaweicloud.com` | 测试计划 API |

两个 Axios 实例（`this.client`、`this.cloudTestClient`）共享同一套 IAM Token 认证逻辑。

**涉及改动：**
- `src/types/index.ts` — 从 `HuaweiCloudConfig` 移除 `endpoint` 字段；从 `ConfigKey` 枚举和 `ConfigMap` 中移除 `CODEARTS_BASE_URL`
- `src/utils/config-loader.ts` — 不再读取/校验 `CODEARTS_BASE_URL`；`loadConfig` 返回的 `config` 不含 `endpoint`
- `src/services/api.service.ts` — 构造函数改为根据 `region` 拼接两个 base URL；移除 `setCodeArtsBaseUrl` 方法
- `src/commands/config.command.ts` — 移除 `CODEARTS_BASE_URL` 配置项的录入和展示逻辑

### 新增类型（`src/types/index.ts`）

```typescript
export interface TestPlanQueryRequest {
  name?: string;
  project_uuid: string;
}

export interface TestPlanDesign {
  issue_num: number;
  issue_cover_num: number;
  case_num: number;
}

export interface TestPlanExecute {
  execute_case_num: number;
  defect_num: number;
  completed_defect_num: number;
  case_success_rate: string;
  case_execution_rate: string;
}

export interface TestPlanReport {
  case_success_rate: string;
  case_complete_rate: string;
  defect_num: number;
  completed_defect_num: number;
  report_num: number;
}

export interface TestPlanItem {
  uri: string;
  name: string;
  start_date: string;
  end_date: string;
  plan_start_date: string;
  plan_end_date: string;
  current_stage: string;
  is_expired: string;
  design: TestPlanDesign;
  execute: TestPlanExecute;
  report: TestPlanReport;
  project_uuid: string;
  service_name: string;
}

export interface TestPlanQueryResult {
  total: number;
  value: TestPlanItem[];
  page_size: number;
  page_no: number;
}

export interface TestPlanQueryResponse {
  result: TestPlanQueryResult;
  status: string;
}
```

### 新增 API 方法（`src/services/api.service.ts`）

```typescript
/**
 * 批量查询测试计划
 * @param projectUuid 项目 UUID
 * @param name 测试计划名称（模糊匹配）
 */
async queryTestPlans(projectUuid: string, name?: string): Promise<ApiResponse<TestPlanQueryResponse>>
```

- 使用 `this.cloudTestClient` 发送 `POST /v4/iterators/info/batch-query`
- 请求体：`{ project_uuid: projectUuid, name }`

### 新增业务方法（`src/services/business.service.ts`）

```typescript
/**
 * 按迭代名称查找测试计划，返回第一个匹配项
 * @param projectId 项目 UUID
 * @param iterationName 迭代名称（精确匹配）
 */
async getTestPlanByIterationName(projectId: string, iterationName: string): Promise<TestPlanItem | null>
```

---

## 变更二：quality 报告第一部分扩充指标

### 新增指标

在 `一、缺陷总览` 的 summary 行追加：

| 指标 | 计算公式 | 数据来源 |
|------|---------|---------|
| 总用例数 | `SUM(plan.design.case_num)` （多迭代则累加） | 测试计划 API |
| 测试通过率 | `(1 - 总 bug 数 / 总用例数) × 100%` | bug 数来自现有数据，用例数来自测试计划 API |
| 缺陷修复率 | `(RESOLVED + CLOSED bug 数) / 总 bug 数 × 100%` | 现有 bug 数据 |

当测试计划 API 无结果时，三项均显示 `N/A`。

### 实现要点

- `generateReport` 参数增加 `testPlanStats?: { caseNum: number }` 可选字段
- `renderSection` 的 `SectionConfig` 增加 `testPlanStats?: { caseNum: number }` 可选字段
- 仅第一部分（`一、缺陷总览`）传入 `testPlanStats`，其他终端章节不传
- 状态判断：`IssueStatusId.RESOLVED`（3）和 `IssueStatusId.CLOSED`（5）视为已修复
- 在 `qualityCommand` 中：选中迭代后，对每个迭代名调用 `getTestPlanByIterationName` 并累加 `design.case_num`

---

## 变更三：quality 报告第八部分 — 客户反馈列表

### 筛选逻辑

通过 `api.service.getIssues` 查询整个项目（不指定迭代）的客户反馈 Bug，条件：

| 字段 | 条件 | 实现方式 |
|------|------|---------|
| `tracker_ids` | BUG（3） | `ListIssuesV4Request.tracker_ids = [3]` |
| `DEFECT_TYPE`（custom_field36） | `客户反馈` | `custom_fields: [{ custom_field: 'custom_field36', value: '客户反馈' }]` |
| `INTRODUCTION_PHASE`（custom_field29） | 包含任意选中迭代名称 | 对每个迭代名单独查询（`custom_field29 = iterationName`），结果去重合并 |

查询后调用 `getIssueDetails` 获取详情（含 `new_custom_fields`）。

### 输出格式

Markdown 表格：

```markdown
## 八、本迭代客户反馈

| 名称 | 开发人员 | 测试人员 | 父需求 |
|-----|---------|---------|------|
| [issue.subject](issueLink(projectId, issueId)) | developer.nick_name | TESTER 字段值 | [parent.name](issueLink(projectId, parentId)) |
```

- 名称和父需求使用 `issueLink(projectId, id)` 生成链接
- 开发人员：`issue.developer?.nick_name ?? '未分配'`
- 测试人员：`new_custom_fields` 中 `CustomFieldId.TESTER`（custom_field26）的值，默认 `'未分配'`
- 父需求：`issue.parent_issue?.name ?? '无'`，如有 `parent_issue.id` 则生成链接

### 查询时机

在 `qualityCommand` 中，确定选中迭代后，并行或串行发起客户反馈查询，不阻塞现有 Bug 数据加载。

---

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/types/index.ts` | 修改 | 新增测试计划类型；移除 `CODEARTS_BASE_URL` 相关 |
| `src/utils/config-loader.ts` | 修改 | 移除 `CODEARTS_BASE_URL` 读取和校验 |
| `src/services/api.service.ts` | 修改 | 新增 `cloudTestClient`；新增 `queryTestPlans`；移除 `setCodeArtsBaseUrl` |
| `src/services/business.service.ts` | 修改 | 新增 `getTestPlanByIterationName` |
| `src/commands/config.command.ts` | 修改 | 移除 `CODEARTS_BASE_URL` 录入和展示 |
| `src/commands/quality.command.ts` | 修改 | 第一部分追加三项指标；新增第八部分渲染函数 |

---

## 注意事项

1. **破坏性变更**：删除 `CODEARTS_BASE_URL` 后，现有配置文件中若有该字段会被忽略，不影响运行，但需告知用户此字段已废弃。
2. **测试通过率公式**：`1 - bug数/用例数`，当 bug 数超过用例数时结果为负，按业务定义照常显示，不做截断。
3. **多迭代选择**：客户反馈查询对每个迭代名单独发起请求，结果按 `id` 去重合并。
