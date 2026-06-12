# Story Detail 子命令设计文档

**日期**：2026-06-12
**状态**：待审阅
**范围**：新增 `codearts story detail` 子命令，查询工作项详情，支持可选的评论查询

---

## 一、命令接口

### 命令名称

`codearts story detail`

### CLI 参数

```
codearts story detail [options] <ids...>

Arguments:
  ids                    工作项 ID 列表（数字，空格分隔，至少 1 个）

Options:
  -c, --with-comments    同时查询每个工作项的评论
  -h, --help             帮助信息
```

### 全局选项（继承自 program）

```
  --output <format>      输出格式：console | json（默认 console，仅这两个值）
```

### 行为说明

- 命令接收 1 个或多个工作项 ID（数字，空格分隔）
- `-c`/`--with-comments` 开启后，在返回的 issue 详情上附带 `comments: IssueCommentV4[]`（按时间正序）
- 单个 ID 查询失败时，记录到结果中（`success: false, error: string`），不影响其他 ID 的查询
- 输出格式 `console`：按 issue 分块卡片打印，评论以缩进列表展示
- 输出格式 `json`：输出结构化 JSON 数组到 stdout，便于编程调用

### 用例

```bash
# 单个 issue
codearts story detail 12345

# 多个 issue
codearts story detail 12345 67890 11111

# 同时查询评论
codearts story detail -c 12345 67890

# JSON 输出
codearts story detail --output json 12345 67890
```

---

## 二、架构

严格沿用项目现有三层架构：

```
cli.ts (Commander.js 注册 story detail 子命令)
    ↓
commands/story.command.ts (storyDetailCommand: 解析参数、调度、格式化输出)
    ↓
services/business.service.ts (getIssueDetails + 新增 getIssueCommentsBatch)
    ↓
services/api.service.ts (getIssueById + 新增 getIssueComments)
    ↓
华为云 CodeArts API
```

---

## 三、API 层（src/services/api.service.ts）

### 新增类型（src/types/index.ts）

```typescript
export interface CommentUserV4 {
  nick_name: string;
  user_name: string;
  user_num_id: number;
}

export interface IssueCommentV4 {
  id: number;
  comment: string;
  created_time: string; // YYYY-MM-DD
  timestamp: string;    // 毫秒时间戳
  user: CommentUserV4;
}

export interface ListIssueCommentsV4Response {
  total: number;
  comments: IssueCommentV4[];
}
```

### 新增 API 方法

```typescript
async getIssueComments(
  projectId: string,
  issueId: number,
  offset: number = 0,
  limit: number = 100
): Promise<ApiResponse<ListIssueCommentsV4Response>> {
  return this.request(
    `/v4/projects/${projectId}/issues/${issueId}/comments`,
    { method: 'GET', params: { offset, limit } }
  );
}
```

端点：`GET /v4/projects/{project_id}/issues/{issue_id}/comments`
参数：`offset`（默认 0）、`limit`（默认 100，最大 1000）
响应：`{ total: number, comments: IssueCommentV4[] }`

---

## 四、业务层（src/services/business.service.ts）

### 新增方法

```typescript
async getIssueCommentsBatch(
  projectId: string,
  issueIds: number[],
  concurrency: number = 10
): Promise<Map<number, { success: boolean; comments?: IssueCommentV4[]; error?: string }>> {
  const results = new Map<number, { success: boolean; comments?: IssueCommentV4[]; error?: string }>();
  for (let i = 0; i < issueIds.length; i += concurrency) {
    const batch = issueIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          const response = await this.apiService.getIssueComments(projectId, id);
          if (response.success && response.data) {
            const sorted = [...response.data.comments].sort(
              (a, b) => Number(a.timestamp) - Number(b.timestamp)
            );
            return { id, success: true, comments: sorted };
          }
          return { id, success: false, error: response.error || '未知错误' };
        } catch (error) {
          logger.warn(`获取工作项 ${id} 评论失败: ${String(error)}`);
          return { id, success: false, error: String(error) };
        }
      })
    );
    batchResults.forEach((r) => {
      results.set(r.id, {
        success: r.success,
        comments: r.comments,
        error: r.error,
      });
    });
  }
  return results;
}
```

复用 `getIssueDetails` 已有的并发能力（默认 10 并发），评论查询采用相同模式。

---

## 五、命令层（src/commands/story.command.ts）

### 新增导出函数

```typescript
export interface StoryDetailResult {
  id: number;
  success: boolean;
  detail?: IssueDetail;
  comments?: IssueCommentV4[];
  error?: string;
}

export async function storyDetailCommand(
  ids: string[],
  cliOptions: CliOptions & { withComments?: boolean } = {}
): Promise<void> {
  const issueIds = ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n) && n > 0);
  if (issueIds.length === 0) {
    logger.error('未提供有效的工作项 ID');
    return;
  }
  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);
  const withComments = cliOptions.withComments ?? false;

  const spinner = ora('正在查询工作项详情...').start();
  const details = await businessService.getIssueDetails(projectId, issueIds, 10);
  const detailMap = new Map(details.map((d) => [d.id, d]));
  const failedIds = issueIds.filter((id) => !detailMap.has(id));

  const results: StoryDetailResult[] = issueIds.map((id) => {
    const detail = detailMap.get(id);
    if (!detail) {
      return { id, success: false, error: '未找到该工作项或无访问权限' };
    }
    return { id, success: true, detail };
  });

  if (withComments) {
    spinner.text = '正在查询评论...';
    const commentResults = await businessService.getIssueCommentsBatch(
      projectId,
      results.filter((r) => r.success).map((r) => r.id)
    );
    results.forEach((r) => {
      if (r.success) {
        const c = commentResults.get(r.id);
        r.comments = c?.success ? c.comments : [];
        if (c && !c.success) {
          r.error = `评论获取失败: ${c.error}`;
        }
      }
    });
  }
  spinner.stop();

  if (outputFormat === 'json') {
    logger.json(results);
  } else {
    outputConsole(results, projectId, withComments);
  }
  if (failedIds.length > 0 && outputFormat !== 'json') {
    logger.warn(`未找到 ${failedIds.length} 个工作项: ${failedIds.join(', ')}`);
  }
}
```

### Console 输出

每个 issue 一段卡片，字段顺序：

```
[1] #12345  Bug标题
    状态: 进行中   类型: 缺陷   优先级: 高
    处理人: 张三(张三)   创建人: 李四(李四)
    迭代: 迭代Sprint12   模块: 账号模块   领域: 用户中心
    预计工时: 8h   实际工时: 4h   完成度: 50%
    创建: 2026-05-01   更新: 2026-06-10   关闭: -
    链接: https://...

    评论 (3):
      [2026-05-02 10:23] 王五: <p>这是评论内容</p>
      ...
```

- 使用 `picocolors`（项目已有依赖）着色：标题用 `pc.bold`、状态根据 `IssueStatusId` 着色（与 `daily.command.ts` 风格一致）
- `issueLink(projectId, issue.id)` 复用现有工具
- 失败项在卡片底部以红色提示

---

## 六、CLI 注册（src/bin/cli.ts）

在现有 `storyCmd` 块中追加：

```typescript
storyCmd
  .command('detail <ids...>')
  .description('查询工作项详情，支持多个 ID 和评论查询')
  .option('-c, --with-comments', '同时查询每个工作项的评论')
  .action(async (ids, options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      withComments: options.withComments,
    };
    logger.setOutputFormat(cliOptions.output);
    await storyDetailCommand(ids, cliOptions);
  });
```

---

## 七、错误处理

| 场景 | 行为 |
|------|------|
| 未提供 ID | 退出码非 0，提示"未提供有效的工作项 ID" |
| 配置缺失 | 抛出异常，由 `loadConfig` 提示用户先 `codearts config` |
| 单个 issue 详情查询失败 | 记录到 `StoryDetailResult.error`，继续处理其他 issue |
| 单个 issue 评论查询失败 | 该 issue 详情仍然输出，`comments` 为空数组，记录 warn 日志 |
| 全部 issue 查询失败 | console 模式输出空内容 + 错误提示；json 模式输出含错误的数组 |
| 输出格式非法 | 由 `loadConfig` 抛出错误 |

---

## 八、测试

按项目惯例本任务不写自动化测试（AGENTS.md 第 3 节说明），但人工验证：

1. `codearts story detail <有效ID>` 输出该 issue 的卡片
2. `codearts story detail <ID1> <ID2> <无效ID>` 两个有效 + 一个失败，输出两个卡片 + 错误提示
3. `codearts story detail -c <ID>` 输出卡片 + 评论列表
4. `codearts story detail --output json <IDs>` 输出标准 JSON 数组
5. `codearts story detail`（无 ID）报错退出

---

## 九、变更文件清单

- `src/types/index.ts`：新增 `CommentUserV4`、`IssueCommentV4`、`ListIssueCommentsV4Response`
- `src/services/api.service.ts`：新增 `getIssueComments` 方法
- `src/services/business.service.ts`：新增 `getIssueCommentsBatch` 方法
- `src/commands/story.command.ts`：新增 `storyDetailCommand` 及 `StoryDetailResult`
- `src/bin/cli.ts`：注册 `story detail` 子命令
