# Design Spec: rebug chart — IssueDetail 升级 & 新增 Tag 分析图表

**日期**: 2026-04-07  
**状态**: 已批准

---

## 背景

`rebug chart` 子命令当前通过 `selectBugsInteractive` 返回的 `IssueItem[]` 构建图表。`IssueItem` 不含 `tag_list` 字段，导致无法进行标签维度分析。需要：

1. 将 `selectBugsInteractive` 升级为在内部获取完整详情（`IssueDetail[]`）后返回
2. 将 `ChartModule` 接口及所有现有图表模块从 `IssueItem[]` 升级为 `IssueDetail[]`
3. 新增 5 个基于 `tag_list` 的图表模块

---

## 变更范围

### 1. `src/commands/rebug.command.ts`

**`SelectedBugsResult` 接口**：将 `allBugs` 字段从 `IssueItem[]` 改为 `IssueDetail[]`，其他字段不变。

**`selectBugsInteractive` 函数完整变更**：

1. 查询 bug 列表部分（现有的 `getBugsByIterationsAndTerminals` 调用）保持不变，spinner 文案不变。
2. 查询成功后，**将现有的 `let allBugs: IssueItem[]` 声明（约第 158 行）重命名为 `let items: IssueItem[]`**（仅用于持有初始列表），然后新增详情获取步骤：
   - ora spinner，文案：`正在获取 ${items.length} 个 Bug 的详情...`
   - 调用 `businessService.getIssueDetails(projectId, items.map((b) => b.id))`，返回值赋给**新声明的** `let allBugs: IssueDetail[]`
   - spinner succeed，文案：`详情获取完成`
   - catch 块：spinner fail，文案：`获取 Bug 详情失败`，然后 `throw error`
3. return 语句中 `allBugs` 类型现在为 `IssueDetail[]`，与接口一致。

**`rebugNoTagCommand` 函数完整变更**：

- **必须删除**现有的独立详情请求代码块（当前约 `rebug.command.ts:228-237` 行），该代码块包含 `detailSpinner`、`getIssueDetails` 调用和相关错误处理。
- 删除后，**将原先引用 `details` 变量的代码（如 `details.filter(...)`）全部改为 `allBugs`**（已是 `IssueDetail[]`）。
- 该函数剩余的过滤逻辑（`filter tag_list === null` 等）无需修改，直接操作 `allBugs` 即可。
- **完整 AFTER 状态**：
  ```
  const { selectedIterations, selectedTerminalTypes, allBugs, projectId } =
    await selectBugsInteractive(cliOptions);
  // ... 打印 logger.info
  // 直接过滤 allBugs（已是 IssueDetail[]）
  let untagged = allBugs.filter(
    (detail) => detail.tag_list === null || detail.tag_list.length === 0
  );
  // ... 后续代码不变
  ```

### 2. `src/charts/chart.interface.ts`

将 `buildOption` 参数类型从 `IssueItem[]` 改为 `IssueDetail[]`，同步更新 import。

理由：`IssueDetail extends IssueItem`，现有模块方法体仅访问 `IssueItem` 字段，升级参数类型后方法体无需修改。

### 3. 现有 6 个图表模块同步升级（**必须修改，否则 TypeScript 编译失败**）

以下文件各自：① 将 `import { IssueItem }` 改为 `import { IssueDetail }`；② 将 `buildOption(bugs: IssueItem[])` 改为 `buildOption(bugs: IssueDetail[])`；③ 方法体内容不变。

- `src/charts/modules/bug-by-assignee.ts`
- `src/charts/modules/bug-by-defect-analysis.ts`
- `src/charts/modules/bug-by-developer-hours.ts`
- `src/charts/modules/bug-by-fix-duration.ts`
- `src/charts/modules/bug-by-module.ts`
- `src/charts/modules/bug-open-priority-heatmap.ts`

### 4. `src/charts/renderer.ts`

- `renderReport` 签名：`bugs: IssueItem[]` → `bugs: IssueDetail[]`
- `buildHtml` 签名（module-private 函数）：`bugs: IssueItem[]` → `bugs: IssueDetail[]`
- 更新两处对应的 import
- 在 HTML 模板中，**紧跟** echarts CDN `<script>` 标签**之后**（顺序不可颠倒，wordcloud 插件依赖 echarts 主体先加载），追加：
  ```html
  <script src="https://cdn.jsdelivr.net/npm/echarts-wordcloud/dist/echarts-wordcloud.min.js"></script>
  ```

### 5. 新增图表模块（`src/charts/modules/`）

**通用说明**：

- 所有新模块 `buildOption(bugs: IssueDetail[])` 接收 `IssueDetail[]`
- 若一个 Bug 的 `tag_list` 为 `null` 或空数组，各模块的处理策略见下表

| 文件                             | 图表类型            | 依赖字段                          | null/空 tag_list 处理 | module 为空时处理  |
| -------------------------------- | ------------------- | --------------------------------- | --------------------- | ------------------ |
| `bug-by-tag-pie.ts`              | 标签分布环形饼图    | `tag_list`                        | 归入"未打标签"分类    | —                  |
| `bug-by-tag-trend.ts`            | 标签趋势折线图      | `tag_list`, `created_time`        | 跳过该 Bug            | —                  |
| `bug-by-tag-module-heatmap.ts`   | 标签-模块热力图     | `tag_list`, `module.name`         | 跳过该 Bug            | 归入"未设置模块"行 |
| `bug-by-tag-wordcloud.ts`        | 标签词云图          | `tag_list`                        | 跳过（不贡献词频）    | —                  |
| `bug-by-tag-developer-sankey.ts` | 开发人员-标签桑基图 | `tag_list`, `developer.nick_name` | 跳过该 Bug            | —                  |

**各图表补充规格**：

**`bug-by-tag-pie.ts`**：

- 遍历所有 bug，将 `tag_list` 展开，统计每个标签出现次数；`tag_list` 为 null/空的 bug 计入"未打标签"
- 数据格式：`[{ name: string, value: number }]`
- 图表类型：环形饼图（`radius: ['42%', '68%']`）

**`bug-by-tag-trend.ts`**：

- 跳过 `tag_list` 为 null/空的 bug
- 按 `created_time`（ISO 8601 字符串，直接 `new Date(created_time)` 解析）分组到 ISO 8601 周
- 周 key 格式：`YYYY-Www`（例如 `2026-W14`），按 ISO 8601 标准（周一为每周起始日）
- 计算周 key 算法：取 `Date` 对象，应用 ISO week number 计算（可内联实现：`getISOWeekKey(date: Date): string`）
- x 轴为所有出现周的有序列表；每条折线代表一个标签；y 轴为该周该标签的出现次数
- 取 Top 10 频率最高的标签作为折线系列（防止折线过多）

**`bug-by-tag-module-heatmap.ts`**：

- 跳过 `tag_list` 为 null/空的 bug
- `module.name` 为 null/空字符串时归入"未设置模块"
- 每个 bug 可能有多个标签，每个标签与模块组合都累加计数
- x 轴为标签列表，y 轴为模块列表，value 为出现次数
- ECharts series type: `'heatmap'`，需配置 `visualMap`

**`bug-by-tag-wordcloud.ts`**：

- 跳过 `tag_list` 为 null/空的 bug
- 展开所有 `tag_list`，统计每个标签词频
- 数据格式：`[{ name: string, value: number }]`
- ECharts series type: `'wordCloud'`（由 echarts-wordcloud 插件提供）
- 最小配置：`{ type: 'wordCloud', data: [...], sizeRange: [14, 60], rotationRange: [0, 0] }`

**`bug-by-tag-developer-sankey.ts`**：

- 跳过 `tag_list` 为 null/空的 bug
- 一个 bug 有多个标签时，每个标签与 `developer.nick_name` 各产生一条边
- `developer.nick_name` 为空时归入"未指派"节点
- 统计所有 `(developer, tag)` 边的出现次数
- 按边数量降序排列，取 **Top 20 条边**（而非 Top 20 开发人员或标签）
- 从 Top 20 条边中提取所有涉及的节点
- ECharts series type: `'sankey'`

### 6. `src/charts/index.ts`

在 `allCharts` 数组末尾，按以下顺序追加 5 个新图表：
`bugByTagPieChart`, `bugByTagTrendChart`, `bugByTagModuleHeatmapChart`, `bugByTagWordcloudChart`, `bugByTagDeveloperSankeyChart`

---

## 非目标（不在本次范围内）

- 不修改 `rebug list` 子命令
- 不修改其他 command 文件（`fix.command.ts`、`daily.command.ts` 等）
- 不引入任何 npm 依赖（词云通过 CDN 引入，无需 `npm install`）
