# 质量分析命令设计文档

**日期**：2026-04-25  
**状态**：已批准（v4）  
**范围**：新增 `codearts quality` 顶级命令

---

## 一、命令接口

### 命令名称

`codearts quality`

### CLI 参数

```
codearts quality [options]

Options:
  -i, --iteration <names>   迭代名称，逗号分隔（不传时交互式多选）
  --output-dir <path>       输出目录（默认 ./quality-report）
  -h, --help                帮助信息
```

### 行为说明

**迭代选择**（与 rebug.command.ts 完全一致的逻辑）：

1. 调用 `businessService.getIterations(projectId, { limit: 12 })` 获取迭代列表
2. 有 `-i` 参数时：调用 `matchIterations(iterations, value)` 做子字符串匹配（不区分大小写），命中则跳过交互；**未命中时 fallback 到交互式 checkbox（不退出）**，并输出 `logger.warn` 提示
3. 无 `-i` 参数时：通过 `import { checkbox } from '@inquirer/prompts'` 的 `checkbox` 交互式多选，至少选一个（validate 强制）。`@inquirer/prompts` 由 `inquirer@^13.x` 内部提供，无需单独安装。

**输出目录**：

- 默认 `./quality-report`
- 不存在时自动创建（包括 `<outputDir>/images/` 子目录）
- 已存在时：保留目录，逐个覆盖输出文件；不删除目录（避免误删用户文件）；旧的图片文件可能残留（已知行为，文档说明）

---

## 二、数据查询层

### 查询流程（单次 API，内存分组）

```
1. businessService.getBugsByIterationsAndTerminals(projectId, iterationIds, [])
   └── 空数组 = 不限终端类型，拉取全量
   └── 方法内置：过滤 bug.status?.id === IssueStatusId.REJECTED (值为 6)

2. 提取 issueIds: number[] 后调用：
   businessService.getIssueDetails(projectId, issueIds, concurrency=10)
   └── 签名：getIssueDetails(projectId: string, issueIds: number[], concurrency?: number): Promise<IssueDetail[]>
   └── 内部并发批量调用 apiService.getIssueById，失败条目打 warn 并跳过
   └── 返回含 new_custom_fields 和 parent_issue 的完整 IssueDetail[]

3. 全量 IssueDetail[] 在内存中按各部分筛选条件过滤，不重复请求
```

### 自定义字段读取

`IssueItem` 上有两个自定义字段数组：`custom_fields: IssueCustomField[]` 和 `new_custom_fields: IssueNewCustomField[]`。**应使用 `new_custom_fields`**（与 `fix.command.ts` 一致），结构为：

```typescript
interface IssueNewCustomField {
  custom_field: string; // 字段标识，如 'custom_field24'
  field_name: string;
  value: string;
}
```

通用辅助函数（写在 quality.command.ts 内部）：

```typescript
function getCustomField(bug: IssueDetail, fieldId: CustomFieldId): string | undefined {
  return (bug.new_custom_fields || []).find((f) => f.custom_field === fieldId)?.value;
}
```

### 各部分数据切片

| 部分 | 筛选条件 |
|------|---------|
| 总览（第一部分） | 全量 bugs |
| 网页端（第二部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '网页端'` |
| 移动端（第三部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '手机端'` |
| 平台服务端（第四部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '平台服务端'` |
| 业务服务端（第五部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '业务服务端'` |
| 需求缺陷率（第六部分） | 全量，按 `parent_issue?.name` 聚合 |
| 设计缺陷率（第七部分） | `['需求变更问题', '产品设计问题'].includes(getCustomField(bug, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS) ?? '')` |

> 终端类型字段（`custom_field24`）的完整枚举值：`网页端` | `平台服务端` | `业务服务端` | `手机端` | `平台产品` | `行业产品` | `UED` | `质量` | `运维` | `AI产品`。本命令只分析前5类（网页端、手机端、平台服务端、业务服务端），其余终端类型的 Bug 仅计入总览。

> 某部分数据切片为空时：Markdown 输出"暂无数据"，跳过该部分图表生成。

### 字段安全访问

- **研发人员**：`bug.developer?.nick_name ?? '未分配'`（运行时 `developer` 可能为 null，必须用可选链）
- **父工作项**：`bug.parent_issue?.name ?? '无父工作项'`

### 修复周期计算

- **计算对象**：仅 `bug.closed_time != null` 的 Bug
- **公式**：`Math.ceil((new Date(closed_time) - new Date(created_time)) / 86400000)`
- **分桶**：`≤1天` | `2-3天` | `4-7天` | `8-14天` | `>14天`
- **未关闭 Bug**：不纳入修复周期图表（分母只含有 `closed_time` 的 Bug）

---

## 三、图表模块架构

### 模块位置

`src/charts/modules/quality/`（独立于现有 rebug 图表模块）

### 4 个复用图表模块（函数式，不实现 ChartModule 接口）

图表模块**不实现**现有 `ChartModule` 接口，也**不包含 title 字段**。每个模块导出一个纯函数，接受 `IssueDetail[]` 返回 ECharts option 对象：

```typescript
// 示例：defect-analysis-pie.ts
export function buildDefectAnalysisPieOption(bugs: IssueDetail[]): object { ... }
```

| 文件名 | 导出函数名 | 图表类型 | 渲染尺寸 |
|--------|-----------|---------|---------|
| `defect-analysis-pie.ts` | `buildDefectAnalysisPieOption` | 饼图（环形 donut） | 600×500 |
| `requirement-bug-bar.ts` | `buildRequirementBugBarOption` | 纵向柱状图 | 800×500 |
| `fix-duration-bar.ts` | `buildFixDurationBarOption` | 柱状图 | 800×500 |
| `developer-bug-bar.ts` | `buildDeveloperBugBarOption` | 横向柱状图 | 800×400 |

`quality.command.ts` 中调用示例：

```typescript
import { buildDefectAnalysisPieOption } from '../charts/modules/quality/defect-analysis-pie';

const option = buildDefectAnalysisPieOption(filteredBugs);
await renderChartsToPng([{ option, outputPath, width: 600, height: 500 }]);
```

### 图表调用矩阵（完整 24 张映射）

| 部分 | 图1文件名 | 图2文件名 | 图3文件名 | 图4文件名 |
|------|----------|----------|----------|----------|
| 总览 | `overview-defect-analysis.png` | `overview-requirement-bug.png` | `overview-fix-duration.png` | `overview-developer-bug.png` |
| 网页端 | `web-defect-analysis.png` | `web-requirement-bug.png` | `web-fix-duration.png` | `web-developer-bug.png` |
| 移动端 | `mobile-defect-analysis.png` | `mobile-requirement-bug.png` | `mobile-fix-duration.png` | `mobile-developer-bug.png` |
| 平台服务端 | `platform-defect-analysis.png` | `platform-requirement-bug.png` | `platform-fix-duration.png` | `platform-developer-bug.png` |
| 业务服务端 | `business-defect-analysis.png` | `business-requirement-bug.png` | `business-fix-duration.png` | `business-developer-bug.png` |
| 需求缺陷率 | `req-rate-top-defect-pie.png`（top需求数据） | `req-rate-bug-bar.png`（全量） | - | `req-rate-top-developer-bar.png`（top需求数据） |
| 设计缺陷率 | - | `design-defect-bar.png`（设计缺陷过滤后） | - | - |

**合计**：5×4 + 3 + 1 = **24 张**

> 第六部分6.2和6.3使用"Bug数量最多的父工作项"（即 `parent_issue?.name` 出现次数最多的那个值）下的全量 Bug（无额外字段过滤），仅通过 `bug.parent_issue?.name === topRequirementName` 过滤，分别传入 `defect-analysis-pie` 和 `developer-bug-bar` 模块。

### PNG 渲染器

**文件**：`src/charts/png-renderer.ts`

**ECharts 注入方式**：从本地 node_modules 读取 ECharts 脚本内联注入（不依赖 CDN），使用 `require.resolve` 解析路径：

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url ?? __filename);
const echartsScript = fs.readFileSync(
  require.resolve('echarts/dist/echarts.min.js'),
  'utf-8'
);
```

> 注意：`echarts` 需新增为项目依赖（`npm install echarts`）。`require.resolve` 从项目根目录的 `node_modules` 解析，在编译后的 `dist/` 下同样有效（Node.js 向上查找 `node_modules`）。

**接口**：

```typescript
export interface ChartRenderTask {
  option: object;
  outputPath: string;   // 绝对路径，如 /output/images/overview-defect-analysis.png
  width?: number;       // 默认 800
  height?: number;      // 默认 500
}

export async function renderChartsToPng(tasks: ChartRenderTask[]): Promise<void>
```

**调用方式**（quality.command.ts 中）：

```typescript
// 调用图表模块纯函数生成 option，命令层持有尺寸信息
const option = buildDefectAnalysisPieOption(filteredBugs);
await renderChartsToPng([{ option, outputPath, width: 600, height: 500 }]);
```

**渲染流程**：

1. 启动单个 Puppeteer 浏览器实例
2. 顺序渲染每个 task（避免并发内存压力）：
   - `page.setViewport({ width, height })`
   - 注入内联 ECharts 脚本 + `<div id="chart" style="width:{w}px;height:{h}px">`
   - `const chart = echarts.init(div); chart.setOption(option);`
   - `const dataURL = chart.getDataURL('png', 1, 'transparent');`
   - 将 Base64 写入文件
3. `finally { await browser.close(); }`

---

## 四、Markdown 输出

### 输出文件结构

```
<outputDir>/
├── quality-report.md
└── images/
    ├── overview-defect-analysis.png
    ├── overview-requirement-bug.png
    ├── overview-fix-duration.png
    ├── overview-developer-bug.png
    ├── web-defect-analysis.png
    ├── web-requirement-bug.png
    ├── web-fix-duration.png
    ├── web-developer-bug.png
    ├── mobile-defect-analysis.png
    ├── mobile-requirement-bug.png
    ├── mobile-fix-duration.png
    ├── mobile-developer-bug.png
    ├── platform-defect-analysis.png
    ├── platform-requirement-bug.png
    ├── platform-fix-duration.png
    ├── platform-developer-bug.png
    ├── business-defect-analysis.png
    ├── business-requirement-bug.png
    ├── business-fix-duration.png
    ├── business-developer-bug.png
    ├── req-rate-bug-bar.png
    ├── req-rate-top-defect-pie.png
    ├── req-rate-top-developer-bar.png
    └── design-defect-bar.png
```

### Markdown 完整格式

```markdown
# 质量分析报告

> 迭代：{iterationNames} | 生成时间：{YYYY-MM-DD HH:mm:ss}

---

## 一、缺陷总览

**缺陷总数**：{N} 个

### 1.1 缺陷技术分析

| 缺陷技术分析 | 数量 | 占比 |
|-------------|------|------|
| 功能实现问题  | 18   | 42.9% |
| ...          | ...  | ...  |

![缺陷技术分析](./images/overview-defect-analysis.png)

### 1.2 需求 Bug 分布

| 需求（父工作项） | Bug 数量 |
|----------------|---------|
| ...             | ...     |

![需求 Bug 分布](./images/overview-requirement-bug.png)

### 1.3 修复周期分布

**可统计 Bug 数**（已关闭/解决）：{M} 个

| 修复周期 | 数量 | 占比 |
|---------|------|------|
| ≤1 天   | ...  | ...  |
| 2-3 天  | ...  | ...  |
| 4-7 天  | ...  | ...  |
| 8-14 天 | ...  | ...  |
| >14 天  | ...  | ...  |

![修复周期分布](./images/overview-fix-duration.png)

### 1.4 研发人员 Bug 数量

| 研发人员 | Bug 数量 |
|---------|---------|
| ...     | ...     |

![研发人员 Bug 数量](./images/overview-developer-bug.png)

---

## 二、网页端

**缺陷总数**：{N} 个

### 2.1 缺陷技术分析
...（同第一部分子章节结构，图片前缀 web-）

### 2.2 需求 Bug 分布
...

### 2.3 修复周期分布
...

### 2.4 研发人员 Bug 数量
...

---

## 三、移动端
（同结构，图片前缀 mobile-）

---

## 四、平台服务端
（同结构，图片前缀 platform-）

---

## 五、业务服务端
（同结构，图片前缀 business-）

---

## 六、需求缺陷率

**缺陷总数**：{N} 个 | **涉及需求数**：{M} 个

### 6.1 需求 Bug 分布

| 需求（父工作项） | Bug 数量 | 占比 |
|----------------|---------|------|
| ...             | ...     | ...  |

![需求 Bug 分布](./images/req-rate-bug-bar.png)

### 6.2 缺陷最多的需求 — 缺陷技术分析

**需求名称**：{topRequirementName}（共 {N} 个 Bug）

| 缺陷技术分析 | 数量 | 占比 |
|-------------|------|------|
| ...          | ...  | ...  |

![缺陷技术分析](./images/req-rate-top-defect-pie.png)

### 6.3 缺陷最多的需求 — 研发人员分析

| 研发人员 | Bug 数量 |
|---------|---------|
| ...     | ...     |

![研发人员分析](./images/req-rate-top-developer-bar.png)

---

## 七、设计缺陷率

**设计缺陷总数**：{N} 个 | **占全量 Bug 比率**：{R}%

（筛选条件：缺陷技术分析 = 需求变更问题 或 产品设计问题）

### 7.1 设计缺陷按需求分布

| 需求（父工作项） | 设计缺陷数量 | 占比 |
|----------------|------------|------|
| ...             | ...        | ...  |

![设计缺陷按需求分布](./images/design-defect-bar.png)
```

Markdown 文件中图片使用**相对路径** `./images/xxx.png`，报告文件与 `images/` 目录同级，在 `outputDir` 内打开 Markdown 即可正常渲染图片。

**空数据处理**：某部分切片为空时，该部分全部子章节输出以下内容替代表格和图片：

```markdown
> 暂无数据
```

**图表渲染失败处理**：保留数据表格，图片引用替换为：

```markdown
> （图表生成失败，请查看控制台日志）
```

---

## 五、新增/修改文件清单

### 新增文件

```
src/
├── commands/quality.command.ts           # 命令入口
├── charts/
│   ├── png-renderer.ts                   # Puppeteer PNG 渲染器
│   └── modules/quality/
│       ├── defect-analysis-pie.ts
│       ├── requirement-bug-bar.ts
│       ├── fix-duration-bar.ts
│       └── developer-bug-bar.ts
```

### 修改文件

```
src/bin/cli.ts                            # 注册 quality 命令
src/commands/index.ts                     # 导出 qualityCommand
package.json                              # 新增 puppeteer + echarts 依赖
```

---

## 六、新增依赖

| 包名 | 用途 |
|------|------|
| `puppeteer` | 无头 Chromium，渲染 ECharts 为 PNG |
| `echarts` | ECharts 图表库（本地 bundle，供 Puppeteer 内联注入） |

---

## 七、错误处理规范

| 场景 | 处理方式 |
|------|---------|
| 迭代零命中（`-i` 参数）| `logger.warn` + fallback 到交互式 checkbox |
| 某部分数据切片为空 | Markdown 输出"暂无数据"，跳过图表生成 |
| PNG 渲染失败（单张） | `logger.warn`，Markdown 保留表格，图片引用替换为说明文字 |
| 输出目录无写权限 | `logger.error` + `process.exit(1)` |
| Puppeteer 启动失败 | `logger.error`（含详细错误）+ `process.exit(1)` |
| `browser.close()` 保证 | `try/finally` 块，无论成功或失败均执行 |

---

## 八、命令执行流程

```
codearts quality [-i <iterations>] [--output-dir <dir>]
  │
  ├─ 1. 加载配置（config-loader）
  ├─ 2. getIterations(projectId, { limit: 12 })
  ├─ 3. 选择迭代（matchIterations 匹配 or inquirer checkbox）
  ├─ 4. getBugsByIterationsAndTerminals(projectId, iterationIds, [])
  ├─ 5. getIssueDetails(projectId, issueIds)  ← 含 new_custom_fields + parent_issue
  ├─ 6. 创建 <outputDir>/ 和 <outputDir>/images/
  ├─ 7. 启动 Puppeteer 浏览器（try/finally 包裹后续步骤）
  ├─ 8. 按章节循环（7 部分）：
  │     ├─ 按筛选条件切片
  │     ├─ 聚合统计数据（供 Markdown 表格）
  │     ├─ 调用图表模块纯函数(filteredBugs) → option
  │     └─ renderChartsToPng([{ option, outputPath, width, height }])
  ├─ 9. browser.close()（finally）
  └─ 10. 生成并写入 quality-report.md
```
