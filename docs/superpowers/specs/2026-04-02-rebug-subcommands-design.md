# rebug 子命令设计文档

**日期：** 2026-04-02  
**状态：** 已审批

---

## 背景

当前 `codearts rebug` 只有一个功能：查询 bug 列表并生成 ECharts 可视化分析报告。  
需要将其扩展为子命令组，新增"展示未打标签的 bug 列表"功能。

---

## 目标

1. 将 `rebug` 改为子命令组
2. 保留原有图表功能为 `rebug chart`
3. 新增 `rebug no-tag`：查询指定迭代中未添加标签（`tag_list` 为 null 或空数组）的 bug，并输出链接列表
4. `no-tag` 支持可选的 `--developer <name>` 参数，按处理人昵称包含匹配过滤

---

## CLI 接口

```
codearts rebug chart
  --output-dir <path>    输出 HTML 报告目录（可选）

codearts rebug no-tag
  --developer <name>     按处理人昵称过滤（包含匹配，可选）
```

直接运行 `codearts rebug` 时显示帮助信息。

---

## `rebug no-tag` 执行流程

1. **加载迭代列表**（前 12 个），显示加载 spinner
2. **用户多选迭代**（checkbox，与 chart 一致）
3. **加载终端类型选项**（`CustomFieldId.TERMINAL_TYPE`）
4. **用户多选终端类型**（checkbox，不选则查全部）
5. **查询 bug 列表**（调用 `businessService.getBugsByIterationsAndTerminals`，与 chart 一致）
6. **并发查询所有 bug 详情**（每批并发 10 个，调用 `businessService.getIssueDetails`）
7. **过滤未打标签的 bug**：`tag_list === null || tag_list.length === 0`
8. **按开发人员过滤**（若传入 `--developer`）：`assigned_user.nick_name.includes(developer)`
9. **输出结果**：每个 bug 显示标题和链接

### 输出格式

```
找到 5 个未打标签的 Bug（共 80 个）：

  [1] 登录页面白屏问题
      https://devcloud.cn-north-4.huaweicloud.com/projectman/scrum/.../detail/12345

  [2] 搜索功能异常
      https://devcloud.cn-north-4.huaweicloud.com/projectman/scrum/.../detail/12346
```

若全部 bug 均已打标签，输出：`所有 Bug 均已添加标签。`

---

## 代码结构

### 文件变更清单

| 文件                               | 变更类型     | 说明                                                                                           |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `src/types/index.ts`               | 新增类型     | 新增 `IssueDetail` 接口（扩展自 `IssueItem`，加入 `tag_list: string[] \| null`）               |
| `src/services/api.service.ts`      | 修正返回类型 | `getIssueById` 返回类型从 `unknown` 改为 `ApiResponse<IssueDetail>`                            |
| `src/services/business.service.ts` | 新增方法     | `getIssueDetails(projectId, issueIds, concurrency?)`                                           |
| `src/commands/rebug.command.ts`    | 重构 + 新增  | 提取共享逻辑 `selectBugsInteractive`，原逻辑改为 `rebugChartCommand`，新增 `rebugNoTagCommand` |
| `src/bin/cli.ts`                   | 重构         | `rebug` 改为命令组，注册 `chart` 和 `no-tag` 子命令                                            |

### 新增类型

```typescript
// src/types/index.ts
export interface IssueDetail extends IssueItem {
  tag_list: string[] | null;
}
```

### `BusinessService.getIssueDetails`

```typescript
/**
 * 并发批量获取工作项详情（含 tag_list）
 * @param projectId 项目ID
 * @param issueIds 工作项ID列表
 * @param concurrency 并发数，默认 10
 */
async getIssueDetails(
  projectId: string,
  issueIds: number[],
  concurrency: number = 10
): Promise<IssueDetail[]>
```

实现：将 `issueIds` 按 `concurrency` 分批，每批 `Promise.all` 并发调用 `getIssueById`。

### `rebug.command.ts` 结构

```
selectBugsInteractive(businessService, projectId, cliOptions)
  → 返回 { selectedIterations, selectedTerminalTypes, allBugs }
  （Step 1-5 的共享交互逻辑）

rebugChartCommand(cliOptions)
  → 调用 selectBugsInteractive，生成图表报告

rebugNoTagCommand(cliOptions)
  → 调用 selectBugsInteractive，再执行 Step 6-9
```

---

## 边界处理

- 若 `getIssueById` 某个请求失败，记录 warn 日志，跳过该条，不中断整体流程
- 若过滤后无未打标签的 bug，输出友好提示
- `--developer` 为空字符串时不过滤（等同于不传）
- 用户取消交互（`ExitPromptError`）时正常退出

---

## 不在本次范围内

- 将未打标签 bug 的结果导出为 CSV/JSON（未来可扩展）
- `rebug chart` 功能本身的任何变更
