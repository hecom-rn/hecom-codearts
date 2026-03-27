# rebug 命令设计文档

**日期**: 2026-03-27  
**状态**: 待实现

---

## 1. 概述

新增 `codearts rebug` 命令，提供两个核心能力：

1. **交互式查询 Bug 列表**：选择迭代（多选）→ 选择终端类型（多选）→ 查询所有匹配的 Bug
2. **多维度 ECharts 可视化分析**：生成本地 HTML 文件，自动在浏览器中打开

---

## 2. 用户交互流程

```
codearts rebug
  ↓
[多选] 选择迭代（最近 12 个）
  ↓
[多选] 选择终端类型（从自定义字段 custom_field24 获取选项）
  ↓
ora spinner: 正在查询数据...
  ↓
控制台摘要输出：
  查询完成：共找到 N 个 Bug
  迭代：V8.0, V8.1
  终端类型：Android, iOS
  正在生成分析报告...
  ↓
生成 HTML 文件并自动打开浏览器
  报告已生成：./rebug-report-20260327-143022.html
```

---

## 3. 文件结构

```
src/
├── commands/
│   └── rebug.command.ts          # 命令入口
├── charts/                        # 新增目录
│   ├── chart.interface.ts         # ChartModule 接口定义
│   ├── renderer.ts                # HTML 页面生成器
│   ├── index.ts                   # 导出所有图表模块数组
│   └── modules/                   # 图表模块（每个分析维度一个文件）
│       ├── bug-by-defect-analysis.ts  # 按缺陷技术分析分布（饼图）
│       ├── bug-by-assignee.ts         # 按处理人分布（横向柱状图）
│       └── bug-by-module.ts           # 按模块分布（柱状图）
```

CLI 注册：在 `src/bin/cli.ts` 新增 `rebug` 命令。

---

## 4. 核心接口

### ChartModule 接口

```typescript
// src/charts/chart.interface.ts
export interface ChartModule {
  title: string;
  buildOption(bugs: IssueItem[]): object; // 返回标准 ECharts option 对象
}
```

### 图表注册

```typescript
// src/charts/index.ts
export const allCharts: ChartModule[] = [
  bugByDefectAnalysisChart,
  bugByAssigneeChart,
  bugByModuleChart,
];
```

新增图表维度时，只需：

1. 在 `modules/` 下创建新文件，实现 `ChartModule` 接口
2. 在 `charts/index.ts` 中导入并加入 `allCharts` 数组
3. **`renderer.ts` 无需修改**

---

## 5. 查询逻辑

### Bug 查询参数

```typescript
apiService.getIssues(projectId, {
  tracker_ids: [IssueTrackerId.BUG],
  iteration_ids: selectedIterationIds, // 用户选择的迭代 ID 列表
  custom_fields: [
    {
      custom_field: CustomFieldId.TERMINAL_TYPE, // 'custom_field24'
      value: selectedTerminalTypes.join(','), // 逗号分隔的终端类型
    },
  ],
  include_deleted: false,
  limit: 100,
  offset: 0, // 自动分页，获取全量数据
});
```

- 若用户选择「全部终端类型」则不传 `custom_fields` 参数
- 使用分页循环，直到获取所有 Bug

### 迭代加载

调用 `businessService.getIterations(projectId, { limit: 12 })` 获取迭代列表的前 12 条（顺序依赖 API 默认排序）。

### 终端类型选项获取

调用 `businessService.getCustomFieldOptions(projectId, [CustomFieldId.TERMINAL_TYPE])` 获取选项列表。

---

## 6. HTML 渲染器设计

### renderer.ts 职责

- 接收参数：`bugs: IssueItem[]`、`charts: ChartModule[]`、`meta: ReportMeta`
- 生成完整单页 HTML 字符串
- 将 HTML 写入当前工作目录：`rebug-report-YYYYMMDD-HHmmss.html`
- 调用系统命令自动打开浏览器（`open` on macOS，`xdg-open` on Linux，`start` on Windows）

### ReportMeta 结构

```typescript
interface ReportMeta {
  iterationNames: string[];
  terminalTypes: string[];
  totalCount: number;
  generatedAt: string; // ISO 时间字符串
}
```

### HTML 页面结构

- ECharts 从 CDN 加载：`https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js`
- 页面顶部：报告标题 + 查询参数摘要卡片（迭代、终端类型、总 Bug 数、生成时间）
- 图表区域：两列响应式网格，每个图表容器高度 400px
- Bug 数据以 JSON 内嵌到 HTML `<script>` 标签中，避免跨域问题
- 每个图表通过 `ChartModule.buildOption(bugs)` 计算各自的数据聚合逻辑

---

## 7. 初始内置图表模块

| 文件                        | 图表类型   | 分析维度           | 数据来源字段                        |
| --------------------------- | ---------- | ------------------ | ----------------------------------- |
| `bug-by-defect-analysis.ts` | 饼图       | 按缺陷技术分析分布 | `new_custom_fields[custom_field32]` |
| `bug-by-assignee.ts`        | 横向柱状图 | 按修复人 Bug 数量  | `developer.nick_name`           |
| `bug-by-module.ts`          | 柱状图     | 按模块 Bug 数量    | `module.name`                       |

---

## 8. CLI 注册

在 `src/bin/cli.ts` 新增：

```typescript
program
  .command('rebug')
  .description('Bug 列表查询与多维度可视化分析')
  .action(async (options, command) => {
    const cliOptions = command.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await rebugCommand(cliOptions);
  });
```

---

## 9. 错误处理

- 获取迭代列表失败 → 抛出错误，打印提示退出
- 获取自定义字段失败 → 命令层 `try-catch` 该调用，跳过终端类型筛选步骤，直接查询所有 Bug（不传 `custom_fields` 参数）
- Bug 查询失败 → 抛出错误，打印提示退出
- HTML 文件写入失败 → 打印错误信息，同时将 HTML 内容输出到控制台作为兜底

---

## 10. 依赖

- 现有：`@inquirer/prompts`（checkbox 组件）、`ora`（spinner）
- 新增：无（ECharts 从 CDN 加载，不作为 npm 依赖）
