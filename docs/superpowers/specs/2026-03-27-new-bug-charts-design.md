# Bug 复盘分析新增图表设计文档

**日期**: 2026-03-27  
**状态**: 已批准，待实施

---

## 背景

`rebug` 命令生成的 HTML 报告目前包含 3 个图表：

- 缺陷技术分析分布（饼图）
- 修复人 Bug 数量（横向柱状图）
- 模块 Bug 分布（柱状图）

本文档定义新增的 3 个图表，覆盖**技术视角**和**管理视角**，为研发团队和管理层提供更全面的 Bug 复盘分析。

---

## 新增图表

### 图表 1：修复周期分布

**文件**: `src/charts/modules/bug-by-fix-duration.ts`  
**图表类型**: 竖向柱状图  
**标题**: `修复周期分布`

**数据来源**:

- `IssueItem.created_time`：Bug 创建时间
- `IssueItem.closed_time`：Bug 关闭时间

**分桶规则**（按关闭时间 - 创建时间的天数）:

| 区间               | 标签   |
| ------------------ | ------ |
| `closed_time` 为空 | 未关闭 |
| ≤ 1 天             | ≤1天   |
| 2-3 天             | 2-3天  |
| 4-7 天             | 4-7天  |
| 8-14 天            | 8-14天 |
| > 14 天            | >14天  |

**分桶顺序**: `未关闭` 排首位，其余按修复时长升序排列

**用途**: 识别 Bug 修复时效，暴露积压和高周期问题

---

### 图表 2：开发人员工时消耗

**文件**: `src/charts/modules/bug-by-developer-hours.ts`  
**图表类型**: 横向柱状图  
**标题**: `开发人员工时消耗`

**数据来源**:

- `IssueItem.developer.nick_name`：开发人员昵称
- `IssueItem.actual_work_hours`：实际工时（小时）

**处理逻辑**:

1. 按 `developer.nick_name` 分组
2. 对每组的 `actual_work_hours` 求和
3. 过滤掉 `nick_name` 为空或 `'未设置'` 的条目
4. 按工时总量降序排列

**视觉风格**: 与 `bug-by-assignee.ts` 保持一致（`#ee6666` 色系）

**用途**: 识别实际工时投入最多的开发成员，辅助团队负载分析

---

### 图表 3：未关闭 Bug 优先级热力表

**文件**: `src/charts/modules/bug-open-priority-heatmap.ts`  
**图表类型**: `heatmap`（ECharts 热力图）  
**标题**: `未关闭 Bug 优先级分布`

**筛选条件**: `IssueItem.status.name !== '已关闭'` 且 `IssueItem.deleted === false`

**坐标轴**:

- X 轴：重要程度（`IssueItem.severity.name`），按严重程度升序：`一般` → `重要` → `严重`
- Y 轴：处理人（`IssueItem.assigned_user.nick_name`），按该人未关闭 Bug 总数降序

**热力值**: 该 `(处理人, 重要程度)` 组合下的 Bug 数量

**视觉配置**:

- 色阶：白色（0）→ `#ee6666`（最大值）
- 显示 label（数量 > 0 时才显示）
- 右侧 `visualMap`，范围 0 到最大值

**用途**: 管理层一眼看清哪个人手上积压了多少重要/严重 Bug

---

## 架构变更

### 新增文件

```
src/charts/modules/
├── bug-by-fix-duration.ts        # 新增：修复周期分布
├── bug-by-developer-hours.ts     # 新增：开发人员工时消耗
└── bug-open-priority-heatmap.ts  # 新增：未关闭 Bug 优先级热力表
```

### 修改文件

**`src/charts/index.ts`**: 在 `allCharts` 数组中注册 3 个新图表模块

### 不变部分

- `ChartModule` 接口不变
- `renderer.ts` 不变（新图表自动被渲染流程处理）
- 已有图表不变

---

## 实现约束

- 每个图表文件遵循现有 `ChartModule` 接口：`{ title: string; buildOption(bugs: IssueItem[]): object }`
- 不使用 `console.log`，无需日志输出
- 所有类型从 `../../types` 导入
- 遵循 Prettier 格式化规则（单引号、2 空格缩进、100 字符行宽）
