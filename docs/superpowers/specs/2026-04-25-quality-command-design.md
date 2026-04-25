# 质量分析命令设计文档

**日期**：2026-04-25  
**状态**：已批准（v2，修订版）  
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

- 不传 `-i` 时，调用 `businessService.getIterations(projectId, { limit: 12 })` 拉取迭代列表，通过 `inquirer checkbox` 交互式多选
- 传入 `-i` 时，通过 `matchIterations(iterations, value)` 按名称子字符串匹配（`String.includes`，不区分大小写），跳过交互；零命中时报错退出
- 输出目录若不存在则自动创建；已存在时直接覆盖

### 迭代模糊匹配规则（复用现有 rebug.command.ts 逻辑）

- 逗号分割多个关键字
- 对每个迭代逐一检查是否包含任意一个关键字（`iteration.name.toLowerCase().includes(keyword.toLowerCase())`）
- 用 `Set<number>` 去重，保持原列表顺序
- 零命中：`logger.error('未找到匹配的迭代')` 后 `process.exit(1)`

---

## 二、数据查询层

### 查询流程

所有分析部分共享同一次数据拉取，避免重复 API 调用：

1. 调用 `businessService.getBugsByIterationsAndTerminals(projectId, iterationIds, [])` 获取全量 Bug
   - 第三个参数传空数组，不限制终端类型
   - 该方法内置过滤逻辑：`bug.status?.id !== IssueStatusId.REJECTED`（即排除 status.id === 6 的已拒绝 Bug）
2. 批量获取详情：`businessService.getIssueDetails(projectId, issueIds)`，获取含 `custom_fields` 和 `parent_issue` 的完整数据
3. 在内存中按各部分筛选条件过滤，不重复请求

### 自定义字段读取方式

`IssueDetail` 的自定义字段存放在 `custom_fields: IssueNewCustomField[]` 数组中，结构为：

```typescript
interface IssueNewCustomField {
  custom_field: string; // 字段标识，如 'custom_field24'
  field_name: string;   // 字段显示名
  value: string;        // 字段值
}
```

读取特定字段的通用工具函数：

```typescript
function getCustomField(bug: IssueDetail, fieldId: CustomFieldId): string | undefined {
  return bug.custom_fields?.find((f) => f.custom_field === fieldId)?.value;
}
```

### 各部分数据切片逻辑

| 部分 | 筛选条件 | 字段引用 |
|------|----------|---------|
| 总览（第一部分） | 无额外过滤 | 全量 bugs |
| 网页端（第二部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '网页端'` | `custom_field24` |
| 移动端（第三部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '移动端'` | `custom_field24` |
| 平台服务端（第四部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '平台服务端'` | `custom_field24` |
| 业务服务端（第五部分） | `getCustomField(bug, CustomFieldId.TERMINAL_TYPE) === '业务服务端'` | `custom_field24` |
| 需求缺陷率（第六部分） | 无额外过滤，按 `parent_issue.name` 聚合 | `parent_issue.name` |
| 设计缺陷率（第七部分） | `getCustomField(bug, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS)` in `['需求变更问题', '产品设计问题']` | `custom_field32` |

> 注意：某个部分数据切片为空时，在 Markdown 中输出"暂无数据"，跳过图表生成。

### 修复周期计算

- **计算对象**：仅对 `bug.closed_time` 不为空的 Bug 计算（未关闭 Bug 不纳入修复周期统计）
- **计算公式**：`Math.ceil((new Date(closed_time).getTime() - new Date(created_time).getTime()) / 86400000)`
- **分布区间**（X 轴标签）：`≤1天` | `2-3天` | `4-7天` | `8-14天` | `>14天`

```typescript
function calcFixDuration(bug: IssueDetail): number | null {
  if (!bug.closed_time) return null;
  return Math.ceil(
    (new Date(bug.closed_time).getTime() - new Date(bug.created_time).getTime()) / 86400000
  );
}

function bucketsFixDuration(days: number): string {
  if (days <= 1) return '≤1天';
  if (days <= 3) return '2-3天';
  if (days <= 7) return '4-7天';
  if (days <= 14) return '8-14天';
  return '>14天';
}
```

### 研发人员字段

使用 `bug.developer.nick_name`（`IssueItem.developer` 字段，类型为 `IssueUser`）。`developer` 为空时该 Bug 归类为"未分配"。

### 父工作项字段

使用 `bug.parent_issue?.name`（`IssueItem.parent_issue` 的 `name` 字段）。`parent_issue` 为空时归类为"无父工作项"。

---

## 三、图表模块架构

### 新增图表模块位置

`src/charts/modules/quality/`（独立子目录，与现有 rebug 图表模块隔离）

### 图表模块清单（4 个复用模块）

| 模块文件名 | 图表标题 | ECharts 类型 | 接受数据 |
|-----------|---------|-------------|---------|
| `defect-analysis-pie.ts` | 缺陷技术分析分布 | 饼图（环形 donut） | `IssueDetail[]` |
| `requirement-bug-bar.ts` | 需求 Bug 分布 | 纵向柱状图 | `IssueDetail[]` |
| `fix-duration-bar.ts` | 修复周期分布 | 柱状图 | `IssueDetail[]` |
| `developer-bug-bar.ts` | 研发人员 Bug 数量 | 横向柱状图 | `IssueDetail[]` |

所有模块复用现有 `ChartModule` 接口：

```typescript
export interface ChartModule {
  title: string;
  buildOption(bugs: IssueDetail[]): object;
}
```

聚合逻辑（如按父工作项聚合、按研发人员聚合）放在各模块的 `buildOption` 内部，命令层只负责传入数据切片。

### 图表调用矩阵（24 张图）

| 章节 | 图表1（饼图） | 图表2（柱状图） | 图表3（柱状图） | 图表4（横向柱状图） |
|------|------------|--------------|--------------|-----------------|
| 总览 | defect-analysis-pie | requirement-bug-bar | fix-duration-bar | developer-bug-bar |
| 网页端 | defect-analysis-pie | requirement-bug-bar | fix-duration-bar | developer-bug-bar |
| 移动端 | defect-analysis-pie | requirement-bug-bar | fix-duration-bar | developer-bug-bar |
| 平台服务端 | defect-analysis-pie | requirement-bug-bar | fix-duration-bar | developer-bug-bar |
| 业务服务端 | defect-analysis-pie | requirement-bug-bar | fix-duration-bar | developer-bug-bar |
| 需求缺陷率 | defect-analysis-pie（缺陷最多需求） | requirement-bug-bar | - | developer-bug-bar（缺陷最多需求） |
| 设计缺陷率 | - | requirement-bug-bar（设计缺陷过滤后） | - | - |

合计：5×4 + 3 + 1 = **24 张**

### PNG 渲染器

新增 `src/charts/png-renderer.ts`，使用 Puppeteer 将 ECharts option 渲染为 PNG：

**依赖引入**：需在 `package.json` 中新增 `puppeteer` 依赖（`npm install puppeteer`）。

**接口设计**：

```typescript
export interface PngRenderOptions {
  width?: number;   // 默认 800
  height?: number;  // 默认 500
}

export async function renderChartsToPng(
  charts: Array<{ option: object; outputPath: string; options?: PngRenderOptions }>
): Promise<void>
```

**生命周期**：

- `renderChartsToPng` 在函数入口启动单个 Puppeteer 浏览器实例
- 顺序渲染所有传入的图表（避免并发内存压力）
- 全部渲染完成后关闭浏览器
- `try/finally` 确保即使渲染失败也会关闭浏览器

**渲染方式**：在 Puppeteer Page 中注入 ECharts CDN + option，调用 `chart.getDataURL('png', 1, 'transparent')` 获取 Base64，再写入文件。

**图表尺寸**：
- 饼图：600×500
- 柱状图：800×500
- 横向柱状图：800×400

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

### Markdown 完整格式规范

输出单个文件 `quality-report.md`，格式如下：

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
| ...          | ...  | ...   |

![缺陷技术分析](./images/overview-defect-analysis.png)

### 1.2 需求 Bug 分布

| 需求（父工作项） | Bug 数量 |
|----------------|---------|
| 用户管理模块     | 8       |
| ...             | ...     |

![需求 Bug 分布](./images/overview-requirement-bug.png)

### 1.3 修复周期分布

**可统计 Bug 数**（已关闭/解决）：{M} 个

| 修复周期 | 数量 | 占比 |
|---------|------|------|
| ≤1 天   | 12   | 28.6% |
| 2-3 天  | 15   | 35.7% |
| 4-7 天  | 9    | 21.4% |
| 8-14 天 | 4    | 9.5%  |
| >14 天  | 2    | 4.8%  |

![修复周期分布](./images/overview-fix-duration.png)

### 1.4 研发人员 Bug 数量

| 研发人员 | Bug 数量 |
|---------|---------|
| 张三    | 15      |
| ...     | ...     |

![研发人员 Bug 数量](./images/overview-developer-bug.png)

---

## 二、网页端

**缺陷总数**：{N} 个

### 2.1 缺陷技术分析
...（同第一部分子章节结构）

### 2.2 需求 Bug 分布
...

### 2.3 修复周期分布
...

### 2.4 研发人员 Bug 数量
...

---

## 三、移动端
...（同结构，图片前缀 mobile-）

## 四、平台服务端
...（同结构，图片前缀 platform-）

## 五、业务服务端
...（同结构，图片前缀 business-）

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

---

## 五、新增/修改文件清单

### 新增文件

```
src/
├── commands/quality.command.ts           # 命令入口（含数据查询、数据切片、Markdown 生成调度）
├── charts/
│   ├── png-renderer.ts                   # Puppeteer PNG 渲染器
│   └── modules/quality/
│       ├── defect-analysis-pie.ts        # 缺陷技术分析饼图
│       ├── requirement-bug-bar.ts        # 需求 Bug 分布柱状图
│       ├── fix-duration-bar.ts           # 修复周期分布柱状图
│       └── developer-bug-bar.ts          # 研发人员 Bug 数量横向柱状图
```

### 修改文件

```
src/bin/cli.ts                            # 注册 quality 命令
src/commands/index.ts                     # 导出 qualityCommand
package.json                              # 新增 puppeteer 依赖
```

---

## 六、依赖说明

- **新增**：`puppeteer`（PNG 渲染，需 `npm install puppeteer`）
- **复用**：`inquirer`（交互式选择）、`ora`（加载动画）、`axios`（通过 services）、`commander`（CLI 参数解析）

---

## 七、错误处理规范

| 场景 | 处理方式 |
|------|---------|
| 迭代不存在 / 零命中 | `logger.error` + `process.exit(1)` |
| 某部分数据为空 | Markdown 中输出"暂无数据"，跳过该部分图表生成 |
| PNG 渲染失败 | `logger.warn`，Markdown 中保留表格数据，图片引用替换为"（图表生成失败）" |
| 输出目录无写权限 | `logger.error` + `process.exit(1)` |
| Puppeteer 启动失败 | `logger.error` 含详细错误信息 + `process.exit(1)` |
| `finally` 保证浏览器关闭 | 无论成功或失败，`browser.close()` 在 `finally` 块执行 |

---

## 八、命令执行流程总览

```
codearts quality [-i <iterations>] [--output-dir <dir>]
  │
  ├─ 1. 加载配置（config-loader）
  ├─ 2. 获取迭代列表（getIterations，limit: 12）
  ├─ 3. 选择迭代（CLI 参数匹配 or inquirer checkbox）
  ├─ 4. 查询全量 Bug（getBugsByIterationsAndTerminals，空终端类型，排除已拒绝）
  ├─ 5. 获取 Bug 详情（getIssueDetails，含 custom_fields + parent_issue）
  ├─ 6. 创建输出目录（outputDir + outputDir/images/）
  ├─ 7. 启动 Puppeteer 浏览器实例
  ├─ 8. 按章节循环（共 7 部分）：
  │     ├─ 过滤数据切片
  │     ├─ 聚合统计数据（供 Markdown 表格使用）
  │     ├─ 调用 chartModule.buildOption(slice)
  │     └─ renderChartsToPng（写入 images/ 目录）
  ├─ 9. 关闭 Puppeteer 浏览器实例（finally）
  └─ 10. 生成 quality-report.md（拼接所有章节内容）
```
