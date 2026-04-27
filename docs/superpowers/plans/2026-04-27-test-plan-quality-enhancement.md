# 测试计划查询 + quality 报告增强 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增华为云 CloudTest 测试计划查询 API，扩充 quality 报告第一部分指标，并新增第八部分客户反馈列表。

**Architecture:** 删除 `CODEARTS_BASE_URL` 配置项，改为在 `ApiService` 内部根据 `region` 自动拼接 projectman 和 cloudtest 两个域名；`quality` 命令中并行查询测试计划和客户反馈数据，渲染到 Markdown 报告。

**Tech Stack:** TypeScript 5.2+, Axios, Commander.js, ora

**Spec:** `docs/superpowers/specs/2026-04-27-test-plan-quality-enhancement-design.md`

---

## Chunk 1: 配置重构 + 类型变更

### Task 1: 从类型系统和配置加载器中移除 CODEARTS_BASE_URL

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/config-loader.ts`

- [ ] **Step 1: 修改 `src/types/index.ts`**

  1.1 从 `HuaweiCloudConfig` 接口移除 `endpoint: string` 字段

  1.2 从 `ConfigKey` 枚举中移除 `CODEARTS_BASE_URL = 'CODEARTS_BASE_URL'`

  1.3 从 `ConfigMap` 类型中移除 `[ConfigKey.CODEARTS_BASE_URL]: string` 行

  1.4 在 `ConfigKey` 枚举下方同文件中（`IssueStatusId` 之前）新增测试计划相关类型定义（包含 `TestPlanQueryRequest`）：

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

- [ ] **Step 2: 修改 `src/utils/config-loader.ts`**

  2.1 从 `keys` 数组中移除 `ConfigKey.CODEARTS_BASE_URL`（约第 92 行）

  2.2 删除 `const endpoint = globalConfig[ConfigKey.CODEARTS_BASE_URL]` 这一行（约第 198 行）

  2.3 将 `if (!username || !password || !domain || !iamEndpoint || !region || !endpoint)` 中的 `|| !endpoint` 移除

  2.4 删除 `config` 对象中的 `endpoint,` 字段（约第 213 行）

- [ ] **Step 3: 编译检查**

  ```bash
  npm run build 2>&1
  ```

  预期：出现关于 `endpoint` 未定义的编译错误（来自 api.service.ts 和 config.command.ts），这是正常的，后续步骤会修复。

- [ ] **Step 4: 提交**

  ```bash
  git add src/types/index.ts src/utils/config-loader.ts
  git commit -m "refactor: remove CODEARTS_BASE_URL config, add test plan types"
  ```

---

### Task 2: 重构 ApiService — 自动拼接域名 + 新增 cloudTestClient

**Files:**
- Modify: `src/services/api.service.ts`

- [ ] **Step 1: 修改构造函数和类属性**

  在 `private client: AxiosInstance;` 下方新增：
  ```typescript
  private cloudTestClient: AxiosInstance;
  ```

  将构造函数中初始化 `this.client` 的代码改为：
  ```typescript
  const projectManBaseUrl = `https://projectman-ext.${this.config.region}.myhuaweicloud.cn`;
  const cloudTestBaseUrl = `https://cloudtest-ext.${this.config.region}.myhuaweicloud.com`;

  this.client = axios.create({
    baseURL: projectManBaseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  this.cloudTestClient = axios.create({
    baseURL: cloudTestBaseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  ```

- [ ] **Step 2: 删除 `setCodeArtsBaseUrl` 方法**

  删除第 338-340 行的 `setCodeArtsBaseUrl` 方法。

- [ ] **Step 3: 为 `cloudTestClient` 添加 Token 拦截器**

  在 `setupInterceptors` 方法中，在现有主客户端拦截器代码块末尾（第 216 行之前）追加：

  ```typescript
  // cloudTest 客户端拦截器（与主客户端共享 Token 逻辑）
  this.cloudTestClient.interceptors.request.use(
    async (config) => {
      const token = await this.getValidToken();
      if (token) {
        config.headers['X-Auth-Token'] = token;
      }
      if (this.cachedToken?.projectId) {
        config.headers['X-Project-Id'] = this.cachedToken.projectId;
      }
      this.logCurlRequest(config, 'CloudTest');
      return config;
    },
    (error) => {
      logger.error(`CloudTest请求错误: ${String(error)}`);
      return Promise.reject(error);
    }
  );

  this.cloudTestClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        try {
          this.cachedToken = null;
          const newToken = await this.getValidToken();
          if (newToken) {
            originalRequest.headers['X-Auth-Token'] = newToken;
            return this.cloudTestClient(originalRequest);
          }
        } catch (refreshError) {
          logger.error(`刷新Token失败: ${String(refreshError)}`);
        }
      }
      logger.error(`CloudTest响应错误: ${String(error.response?.data || error.message)}`);
      return Promise.reject(error);
    }
  );
  ```

- [ ] **Step 4: 新增私有请求辅助方法 `cloudTestRequest`**

  在 `request` 方法之后新增，结构与 `request` 方法相同但使用 `this.cloudTestClient`：

  ```typescript
  private async cloudTestRequest<T>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    try {
      const config: AxiosRequestConfig = {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        params: options.params,
        data: options.data,
      };
      const response = await this.cloudTestClient.request(config);
      return { success: true, data: response.data, message: 'Request successful' };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          data: null,
          error: error.response?.data?.error_msg || error.response?.data?.message || error.message,
        };
      }
      return { success: false, data: null, error: String(error) };
    }
  }
  ```

- [ ] **Step 5: 新增 `queryTestPlans` 公共方法**

  在文件末尾（最后一个方法之后）新增：

  ```typescript
  /**
   * 批量查询测试计划
   * @param projectUuid 项目 UUID
   * @param name 测试计划名称（模糊匹配，可选）
   */
  async queryTestPlans(
    projectUuid: string,
    name?: string
  ): Promise<ApiResponse<TestPlanQueryResponse>> {
    return this.cloudTestRequest<TestPlanQueryResponse>('/v4/iterators/info/batch-query', {
      method: 'POST',
      data: { project_uuid: projectUuid, ...(name ? { name } : {}) },
    });
  }
  ```

  同时在文件顶部 import 中补充 `TestPlanQueryResponse`。

- [ ] **Step 6: 修复 api.service.ts 中残留的 console.log/console.error**

  检查并将所有 `console.log`/`console.error` 替换为 `logger.error` 或 `logger.info`（使用 `logger` 工具，需在顶部 import `logger`）。

- [ ] **Step 7: 编译检查**

  ```bash
  npm run build 2>&1
  ```

  预期：仍有 `config.command.ts` 相关错误，api.service.ts 本身应无错误。

- [ ] **Step 8: 提交**

  ```bash
  git add src/services/api.service.ts
  git commit -m "feat: add cloudTestClient and queryTestPlans API method"
  ```

---

### Task 3: 修复 config.command.ts 中的 CODEARTS_BASE_URL 引用

**Files:**
- Modify: `src/commands/config.command.ts`

- [ ] **Step 1: 删除 IAM 配置阶段的 `codeartsUrl` 问题及相关引用**

  删除约第 260-266 行的 `codeartsUrl` 输入项：
  ```typescript
  codeartsUrl: await input({
    message: 'CodeArts API 地址:',
    default: existingConfig[ConfigKey.CODEARTS_BASE_URL] || '...',
    validate: ...,
  }),
  ```

  将 `iamAnswers` 类型中的 `codeartsUrl` 字段移除（如有接口定义）。

- [ ] **Step 2: 修复 BusinessService 初始化（第 297-306 行）**

  删除 `endpoint: iamAnswers.codeartsUrl,` 这一行（`HuaweiCloudConfig` 已无 `endpoint` 字段）。

- [ ] **Step 3: 删除 `finalConfig` 中的 CODEARTS_BASE_URL**

  删除约第 397 行：`[ConfigKey.CODEARTS_BASE_URL]: iamAnswers.codeartsUrl,`

- [ ] **Step 4: 修复 `updateProjectConfigCommand` 中的 BusinessService 初始化（约第 442-450 行）**

  删除 `endpoint: existingConfig[ConfigKey.CODEARTS_BASE_URL]!,` 这一行。

- [ ] **Step 5: 修复 `showConfigCommand` 中的展示逻辑（约第 505-516 行）**

  从 `codeartsKeys` 数组中移除 `ConfigKey.CODEARTS_BASE_URL`。

- [ ] **Step 6: 从 `formatKeyName` 的 nameMap 中移除 CODEARTS_BASE_URL 条目**

  删除约第 529 行：`[ConfigKey.CODEARTS_BASE_URL]: 'CodeArts API 地址',`

- [ ] **Step 7: 编译检查**

  ```bash
  npm run build 2>&1
  ```

  预期：编译成功，无错误。

- [ ] **Step 8: 提交**

  ```bash
  git add src/commands/config.command.ts
  git commit -m "refactor: remove CODEARTS_BASE_URL from config command"
  ```

---

## Chunk 2: 业务层 + quality 报告第一部分

### Task 4: 新增 getTestPlanByIterationName 业务方法

**Files:**
- Modify: `src/services/business.service.ts`

- [ ] **Step 1: 在文件顶部 import 中补充新类型**

  添加 `TestPlanItem, TestPlanQueryResponse` 到 import 语句（从 `'../types'`）。

- [ ] **Step 2: 新增 `getTestPlanByIterationName` 方法**

  在 `business.service.ts` 末尾添加：

  ```typescript
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
  ```

- [ ] **Step 3: 编译检查**

  ```bash
  npm run build 2>&1
  ```

  预期：编译成功。

- [ ] **Step 4: 提交**

  ```bash
  git add src/services/business.service.ts
  git commit -m "feat: add getTestPlanByIterationName business method"
  ```

---

### Task 5: quality 报告第一部分追加三项指标

**Files:**
- Modify: `src/commands/quality.command.ts`

- [ ] **Step 1: 更新 `SectionConfig` 接口**

  在 `SectionConfig` 接口中新增可选字段：

  ```typescript
  interface SectionConfig {
    prefix: string;
    sectionTitle: string;
    headingPrefix: string;
    memberCount?: number;
    testPlanStats?: { caseNum: number }; // 新增
  }
  ```

- [ ] **Step 2: 更新 `renderSection` 中的 summary 行逻辑**

  在 `renderSection` 函数中，在 `const summaryParts = [...]` 赋值之后，追加逻辑：

  ```typescript
  const { testPlanStats } = config;
  if (testPlanStats) {
    summaryParts.push(`**总用例数**：${testPlanStats.caseNum} 个`);
    if (testPlanStats.caseNum > 0) {
      const passRate = ((1 - bugs.length / testPlanStats.caseNum) * 100).toFixed(2);
      summaryParts.push(`**测试通过率**：${passRate}%`);
    } else {
      summaryParts.push(`**测试通过率**：N/A`);
    }
    const resolvedOrClosed = bugs.filter(
      (b) =>
        b.status?.id === IssueStatusId.RESOLVED || b.status?.id === IssueStatusId.CLOSED
    ).length;
    const fixRate =
      bugs.length > 0
        ? `${((resolvedOrClosed / bugs.length) * 100).toFixed(2)}%`
        : 'N/A';
    summaryParts.push(`**缺陷修复率**：${fixRate}`);
  }
  ```

  需要在文件顶部 import 中补充 `IssueStatusId`。

- [ ] **Step 3: 更新 `GenerateReportParams` 接口**

  ```typescript
  interface GenerateReportParams {
    allBugs: IssueDetail[];
    outputDir: string;
    imagesDir: string;
    iterationNames: string;
    terminalMemberCount: Map<string, number>;
    testPlanTotalCaseNum: number | null; // 新增，null 表示无法获取
  }
  ```

- [ ] **Step 4: 在 `generateReport` 中为第一部分传入 `testPlanStats`**

  在 `terminalSections` 数组中，第一个元素（`一、缺陷总览`）的渲染调用处，增加 `testPlanStats` 传递：

  ```typescript
  // 第一个 section（一、缺陷总览）单独处理，传入 testPlanStats
  const overviewTestPlanStats =
    testPlanTotalCaseNum !== null ? { caseNum: testPlanTotalCaseNum } : undefined;
  ```

  在 `renderSection` 调用中将 `testPlanStats: overviewTestPlanStats` 加入 `SectionConfig`（仅第一个 section）。

- [ ] **Step 5: 在 `qualityCommand` 中查询测试计划并计算总用例数**

  在 `bugSpinner.succeed(...)` 之后（查询 Bug 完成后），新增：

  ```typescript
  // 查询测试计划（统计总用例数）
  const testPlanSpinner = ora('正在查询测试计划数据...').start();
  let testPlanTotalCaseNum: number | null = 0;
  for (const iteration of selectedIterations) {
    const plan = await businessService.getTestPlanByIterationName(projectId, iteration.name);
    if (plan === null) {
      testPlanTotalCaseNum = null;
      break;
    }
    testPlanTotalCaseNum += plan.design.case_num;
  }
  testPlanSpinner.succeed(
    testPlanTotalCaseNum !== null
      ? `测试计划数据加载完成，总用例数：${testPlanTotalCaseNum}`
      : '未找到测试计划数据，相关指标将显示 N/A'
  );
  ```

  并将 `testPlanTotalCaseNum` 传入 `generateReport` 调用。

- [ ] **Step 6: 编译检查**

  ```bash
  npm run build 2>&1
  ```

  预期：编译成功。

- [ ] **Step 7: 提交**

  ```bash
  git add src/commands/quality.command.ts
  git commit -m "feat: add test plan stats (case count, pass rate, fix rate) to quality report section 1"
  ```

---

## Chunk 3: quality 报告第八部分

### Task 6: 新增第八部分 — 客户反馈列表

**Files:**
- Modify: `src/commands/quality.command.ts`

- [ ] **Step 1: 新增 `getCustomerFeedbackBugs` 业务方法（`business.service.ts`）**

  在 `business.service.ts` 末尾新增方法，查询整个项目中指定迭代名称内的客户反馈 Bug 列表：

  ```typescript
  /**
   * 查询整个项目中指定迭代名称内的客户反馈 Bug 列表
   * @param projectId 项目 UUID
   * @param iterationNames 迭代名称列表
   */
  async getCustomerFeedbackBugs(
    projectId: string,
    iterationNames: string[]
  ): Promise<IssueItem[]> {
    const seenIds = new Set<number>();
    const results: IssueItem[] = [];
    for (const iterationName of iterationNames) {
      let offset = 0;
      const limit = 100;
      while (true) {
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
        if (issues.length < limit) break;
        offset += limit;
      }
    }
    return results;
  }
  ```

  需要在 `business.service.ts` 顶部 import 中补充 `IssueItem`、`IssueTrackerId`、`CustomFieldId`（如尚未导入）。

- [ ] **Step 2: 新增 `renderSection8CustomerFeedback` 纯函数（`quality.command.ts`）**

  在 `renderSection7` 函数之后、`generateReport` 函数之前新增纯函数（不含 API 调用，数据在调用处预先查好）：

  ```typescript
  function renderSection8CustomerFeedback(bugs: IssueItem[], projectId: string): string {
    if (bugs.length === 0) {
      return `## 八、本迭代客户反馈\n\n> 暂无客户反馈数据\n\n---\n`;
    }
    const header = '| 名称 | 开发人员 | 测试人员 | 父需求 |\n|-----|---------|---------|------|\n';
    const rows = bugs.map((bug) => {
      const nameLink = `[${bug.subject}](${issueLink(projectId, bug.id)})`;
      const developer = bug.developer?.nick_name ?? '未分配';
      const tester =
        (bug.new_custom_fields ?? []).find((f) => f.custom_field === CustomFieldId.TESTER)
          ?.value ?? '未分配';
      const parentName = bug.parent_issue?.name;
      const parentId = bug.parent_issue?.id;
      const parentLink =
        parentName && parentId
          ? `[${parentName}](${issueLink(projectId, parentId)})`
          : (parentName ?? '无');
      return `| ${nameLink} | ${developer} | ${tester} | ${parentLink} |`;
    });
    return [
      '## 八、本迭代客户反馈',
      '',
      `**总数**：${bugs.length} 个`,
      '',
      '（筛选条件：缺陷类型 = 客户反馈，引入阶段 = 选中迭代名称）',
      '',
      header + rows.join('\n'),
      '',
      '---',
      '',
    ].join('\n');
  }
  ```

  需要在 `quality.command.ts` 顶部补充 import：`IssueItem`（从 types），`IssueTrackerId`（从 types），`issueLink`（从 `../utils/console`）。

- [ ] **Step 3: 更新 `GenerateReportParams` 和 `generateReport`（`quality.command.ts`）**

  在 `GenerateReportParams` 中新增（不要添加 `iterationNameList`，该字段无用）：
  ```typescript
  customerFeedbackBugs: IssueItem[];
  projectId: string;
  ```

  在 `generateReport` 函数末尾追加第八部分渲染调用：
  ```typescript
  // 第八部分：客户反馈列表
  sections.push(renderSection8CustomerFeedback(customerFeedbackBugs, projectId));
  ```

- [ ] **Step 4: 在 `qualityCommand` 中查询客户反馈数据**

- [ ] **Step 4: 在 `qualityCommand` 中查询客户反馈数据**

  在成员数据加载完成后、准备输出目录之前，新增查询：

  ```typescript
  // 查询客户反馈 Bug
  const feedbackSpinner = ora('正在查询客户反馈数据...').start();
  const customerFeedbackBugs = await businessService.getCustomerFeedbackBugs(
    projectId,
    selectedIterations.map((it) => it.name)
  );
  feedbackSpinner.succeed(`已加载 ${customerFeedbackBugs.length} 个客户反馈 Bug`);
  ```

  并将 `customerFeedbackBugs` 和 `projectId` 传入 `generateReport`。

- [ ] **Step 5: 更新 `generateReport` 函数签名和调用**

  在 `generateReport` 中：
  - 参数增加 `customerFeedbackBugs: IssueItem[]` 和 `projectId: string`
  - 末尾追加 `sections.push(renderSection8CustomerFeedback(customerFeedbackBugs, projectId));`

- [ ] **Step 6: 编译检查**

  ```bash
  npm run build 2>&1
  ```

  预期：编译成功，无错误。

- [ ] **Step 7: 提交**

  ```bash
  git add src/commands/quality.command.ts src/services/business.service.ts
  git commit -m "feat: add section 8 customer feedback list to quality report"
  ```

---

## Chunk 4: 最终验证

### Task 7: 全量编译 + ESLint 检查

**Files:** 无新增文件

- [ ] **Step 1: 全量编译**

  ```bash
  npm run build
  ```

  预期：编译成功，0 errors。

- [ ] **Step 2: ESLint 检查**

  ```bash
  npx eslint "src/**/*.ts" --max-warnings 0
  ```

  修复任何新增的 lint 错误。

- [ ] **Step 3: 运行测试**

  ```bash
  npm test
  ```

  预期：所有测试通过。

- [ ] **Step 4: 最终提交**

  ```bash
  git add -A
  git commit -m "chore: final lint fixes and build verification"
  ```
