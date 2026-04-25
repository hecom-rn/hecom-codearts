# 质量分析命令设计文档

**日期**：2026-04-25  
**状态**：已批准  
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

- 不传 `-i` 时，调用 `getIterations()` 拉取迭代列表，通过 `checkbox` 交互式多选（与 `rebug chart` 一致）
- 传入 `-i` 时，按名称模糊匹配，跳过交互（复用现有 `matchIterations` 逻辑）
- 输出目录若不存在则自动创建

---

## 二、数据查询层

### 查询流程

所有分析部分共享同一次数据拉取，避免重复 API 调用：

1. 获取选定迭代的完整 Bug 列表
   - 调用 `business.service.getBugsByIterationsAndTerminals(projectId, iterationIds, [])`
   - 第三个参数传空数组，不限制终端类型，拉取全量
   - 状态过滤：排除"已拒绝"（现有方法已内置此逻辑）
2. 批量获取 IssueDetail（含 custom_fields、parent_issue）
   - 调用 `business.service.getIssueDetails(projectId, issueIds)`
3. 在内存中按 terminal_type 分组，不重复请求

### 各部分数据切片逻辑

| 部分 | 筛选条件 | 数据来源 |
|------|----------|---------|
| 总览（第一部分） | 无额外过滤 | 全量 bugs |
| 网页端（第二部分） | `CustomFieldId.TERMINAL_TYPE === '网页端'` | 全量过滤 |
| 移动端（第三部分） | `CustomFieldId.TERMINAL_TYPE === '移动端'` | 全量过滤 |
| 平台服务端（第四部分） | `CustomFieldId.TERMINAL_TYPE === '平台服务端'` | 全量过滤 |
| 业务服务端（第五部分） | `CustomFieldId.TERMINAL_TYPE === '业务服务端'` | 全量过滤 |
| 需求缺陷率（第六部分） | 无额外过滤，按父工作项聚合 | 全量 bugs |
| 设计缺陷率（第七部分） | `CustomFieldId.DEFECT_TECHNICAL_ANALYSIS in ['需求变更问题', '产品设计问题']` | 全量过滤 |

### 修复周期计算

- **定义**：bug 创建时间到关闭/解决时间的自然天数
- **状态判断**：只对已关闭/已解决状态的 bug 计算（未解决的不纳入统计）
- **分布区间**：`≤1天 | 2-3天 | 4-7天 | 8-14天 | >14天`

```typescript
function calcFixDuration(bug: IssueDetail): number | null {
  if (!bug.closed_time) return null;
  const created = new Date(bug.created_time).getTime();
  const closed = new Date(bug.closed_time).getTime();
  return Math.ceil((closed - created) / 86400000);
}
```

### 研发人员字段

使用 `IssueDetail` 中的 `developer` 字段（即负责研发的人员字段，非 `assigned_user`）。

### 父工作项字段

使用 `IssueDetail.parent_issue.subject`（直接父级 Story 标题）。父工作项为空时归类为"无父工作项"。

---

## 三、图表模块架构

### 新增图表模块位置

`src/charts/modules/quality/`（独立子目录，与现有 rebug 图表模块隔离）

### 图表模块清单

| 模块文件名 | 图表标题 | ECharts 类型 |
|-----------|---------|-------------|
| `defect-analysis-pie.ts` | 缺陷技术分析分布 | 饼图（环形，donut） |
| `requirement-bug-bar.ts` | 需求 Bug 分布 | 纵向柱状图 |
| `fix-duration-bar.ts` | 修复周期分布 | 柱状图 |
| `developer-bug-bar.ts` | 研发人员 Bug 数量 | 横向柱状图 |

这 4 个模块被各分析部分（总览、网页端、移动端等）**复用**，每次传入不同的数据切片。

### ChartModule 接口约束

复用现有 `ChartModule` 接口：

```typescript
export interface ChartModule {
  title: string;
  buildOption(bugs: IssueDetail[]): object;
}
```

### PNG 渲染器

新增 `src/charts/png-renderer.ts`，使用 Puppeteer 将 ECharts option 渲染为 PNG：

- 复用单个 Puppeteer 浏览器实例，批量渲染完所有图表后关闭
- 支持透明背景（`backgroundColor: 'transparent'`）
- 图表尺寸：宽 800px，高 500px（饼图 600x500）
- 输出路径：`<outputDir>/images/<section>-<chartName>.png`

### 第六部分特殊图表

- `requirement-rate-bug-bar.ts`：需求 Bug 分布（复用 `requirement-bug-bar`）
- `requirement-rate-top-defect-pie.ts`：缺陷最多的需求的缺陷技术分析（复用 `defect-analysis-pie`，传入过滤后数据）
- `requirement-rate-top-developer-bar.ts`：缺陷最多的需求的研发人员分布（复用 `developer-bug-bar`，传入过滤后数据）

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

共 **24 张图片**。

### Markdown 模板结构

每个分析维度格式：**汇总统计 + 数据表格 + 图片**，示例：

```markdown
# 质量分析报告
> 迭代：{iterationNames} | 生成时间：{date}

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
| ...             | ...     |

![需求 Bug 分布](./images/overview-requirement-bug.png)

### 1.3 修复周期分布

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
```

第二至第五部分（网页端、移动端、平台服务端、业务服务端）结构与第一部分相同，各含 4 个子章节。

### 第六部分：需求缺陷率

```markdown
## 六、需求缺陷率

**缺陷总数**：{N} 个 | **涉及需求数**：{M} 个

### 6.1 需求 Bug 分布

| 需求（父工作项） | Bug 数量 | 占比 |
|----------------|---------|------|
| ...             | ...     | ...  |

![需求 Bug 分布](./images/req-rate-bug-bar.png)

### 6.2 缺陷最多的需求 - 缺陷技术分析

**需求名称**：{topRequirementName}（共 {N} 个 Bug）

| 缺陷技术分析 | 数量 | 占比 |
|-------------|------|------|
| ...          | ...  | ...  |

![缺陷技术分析](./images/req-rate-top-defect-pie.png)

### 6.3 缺陷最多的需求 - 研发人员分析

| 研发人员 | Bug 数量 |
|---------|---------|
| ...     | ...     |

![研发人员分析](./images/req-rate-top-developer-bar.png)
```

### 第七部分：设计缺陷率

```markdown
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
├── commands/quality.command.ts
├── charts/
│   ├── png-renderer.ts
│   └── modules/quality/
│       ├── defect-analysis-pie.ts
│       ├── requirement-bug-bar.ts
│       ├── fix-duration-bar.ts
│       └── developer-bug-bar.ts
```

### 修改文件

```
src/bin/cli.ts                  # 注册 quality 命令
src/commands/index.ts           # 导出 qualityCommand
```

---

## 六、依赖说明

- `puppeteer` / `puppeteer-core`：Puppeteer 方案渲染 PNG，需确认 package.json 中已有或新增依赖
- 复用现有：`inquirer`、`axios`（通过 services）、`echarts`（若已安装）

---

## 七、错误处理

- 迭代不存在：提示用户并退出
- 某部分数据为空（如无网页端 bug）：在 Markdown 中输出"暂无数据"，跳过图表生成
- PNG 渲染失败：记录 `logger.warn`，Markdown 中以文字说明替代图片引用
- 输出目录无写权限：抛出明确错误信息并退出
