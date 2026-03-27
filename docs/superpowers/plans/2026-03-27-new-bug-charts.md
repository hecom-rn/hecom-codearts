# 新增 Bug 复盘分析图表 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `rebug` 命令的 HTML 报告新增 3 个 Bug 复盘分析图表：修复周期分布、开发人员工时消耗、未关闭 Bug 优先级热力表。

**Architecture:** 每个图表是一个独立文件，实现 `ChartModule` 接口（`{ title, buildOption(bugs) }`），在 `src/charts/index.ts` 中注册后自动被 `renderer.ts` 渲染进 HTML 报告，无需修改任何命令层或服务层代码。

**Tech Stack:** TypeScript 5.2+、ECharts（前端渲染，图表配置以 plain object 输出）、Jest + ts-jest

**Spec:** `docs/superpowers/specs/2026-03-27-new-bug-charts-design.md`

---

## Chunk 1: 修复周期分布图表

### Task 1: 创建 `bug-by-fix-duration.ts`

**Files:**

- Create: `src/charts/modules/bug-by-fix-duration.ts`
- Create: `src/charts/modules/__tests__/bug-by-fix-duration.test.ts`

- [ ] **Step 1: 编写失败测试**

新建 `src/charts/modules/__tests__/bug-by-fix-duration.test.ts`：

```typescript
import { bugByFixDurationChart } from '../bug-by-fix-duration';
import { IssueItem } from '../../../types';

function makeIssue(overrides: Partial<IssueItem>): IssueItem {
  return {
    actual_work_hours: 0,
    assigned_cc_user: [],
    assigned_user: {
      id: 1,
      name: '',
      nick_name: '测试人',
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    begin_time: '',
    closed_time: '',
    created_time: '2026-03-01T08:00:00Z',
    creator: { id: 1, name: '', nick_name: '', user_id: '', user_num_id: 1, first_name: '' },
    custom_fields: [],
    developer: {
      id: 1,
      name: '',
      nick_name: '开发人',
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    domain: { id: 1, name: '' },
    done_ratio: 0,
    end_time: '',
    expected_work_hours: 0,
    id: 1,
    iteration: { id: 1, name: '' },
    module: { id: 1, name: '' },
    name: 'test bug',
    new_custom_fields: [],
    parent_issue: { id: 0, name: '' },
    priority: { id: 1, name: '中' },
    project: { project_id: '', project_name: '', project_num_id: 1 },
    severity: { id: 1, name: '重要' },
    status: { id: 5, name: '已关闭' },
    tracker: { id: 3, name: 'Bug' },
    updated_time: '',
    deleted: false,
    ...overrides,
  } as IssueItem;
}

describe('bugByFixDurationChart', () => {
  it('标题应为"修复周期分布"', () => {
    expect(bugByFixDurationChart.title).toBe('修复周期分布');
  });

  it('closed_time 为空时归入"未关闭"桶', () => {
    const bugs = [makeIssue({ closed_time: '' })];
    const option = bugByFixDurationChart.buildOption(bugs) as any;
    const data: number[] = option.series[0].data;
    const categories: string[] = option.xAxis.data;
    const idx = categories.indexOf('未关闭');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(data[idx]).toBe(1);
  });

  it('1天内关闭归入"≤1天"桶（ceil，间隔0.5天）', () => {
    const created = '2026-03-01T08:00:00Z';
    const closed = '2026-03-01T20:00:00Z'; // 12h → Math.ceil(0.5) = 1
    const bugs = [makeIssue({ created_time: created, closed_time: closed })];
    const option = bugByFixDurationChart.buildOption(bugs) as any;
    const data: number[] = option.series[0].data;
    const categories: string[] = option.xAxis.data;
    const idx = categories.indexOf('≤1天');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(data[idx]).toBe(1);
  });

  it('3天关闭归入"2-3天"桶', () => {
    const created = '2026-03-01T00:00:00Z';
    const closed = '2026-03-04T00:00:00Z'; // 3天整
    const bugs = [makeIssue({ created_time: created, closed_time: closed })];
    const option = bugByFixDurationChart.buildOption(bugs) as any;
    const data: number[] = option.series[0].data;
    const categories: string[] = option.xAxis.data;
    const idx = categories.indexOf('2-3天');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(data[idx]).toBe(1);
  });

  it('空数组时所有桶数量均为0', () => {
    const option = bugByFixDurationChart.buildOption([]) as any;
    const data: number[] = option.series[0].data;
    expect(data.every((v) => v === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/charts/modules/__tests__/bug-by-fix-duration.test.ts --no-coverage
```

预期：FAIL，报 `Cannot find module '../bug-by-fix-duration'`

- [ ] **Step 3: 实现 `bug-by-fix-duration.ts`**

新建 `src/charts/modules/bug-by-fix-duration.ts`：

```typescript
import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

const BUCKETS = ['未关闭', '≤1天', '2-3天', '4-7天', '8-14天', '>14天'] as const;

function getDurationBucket(created: string, closed: string): string {
  if (!closed) return '未关闭';
  const days = Math.ceil(
    (new Date(closed).getTime() - new Date(created).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 1) return '≤1天';
  if (days <= 3) return '2-3天';
  if (days <= 7) return '4-7天';
  if (days <= 14) return '8-14天';
  return '>14天';
}

export const bugByFixDurationChart: ChartModule = {
  title: '修复周期分布',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>(BUCKETS.map((b) => [b, 0]));

    bugs.forEach((bug) => {
      const bucket = getDurationBucket(bug.created_time, bug.closed_time);
      countMap.set(bucket, (countMap.get(bucket) ?? 0) + 1);
    });

    const values = BUCKETS.map((b) => countMap.get(b) ?? 0);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: [...BUCKETS],
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'top' },
          itemStyle: { color: '#fac858' },
        },
      ],
    };
  },
};
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/charts/modules/__tests__/bug-by-fix-duration.test.ts --no-coverage
```

预期：PASS，5 个测试全部通过

- [ ] **Step 5: 提交**

```bash
git add src/charts/modules/bug-by-fix-duration.ts src/charts/modules/__tests__/bug-by-fix-duration.test.ts
git commit -m "feat(charts): add bug fix duration distribution chart"
```

---

## Chunk 2: 开发人员工时消耗图表

### Task 2: 创建 `bug-by-developer-hours.ts`

**Files:**

- Create: `src/charts/modules/bug-by-developer-hours.ts`
- Create: `src/charts/modules/__tests__/bug-by-developer-hours.test.ts`

- [ ] **Step 1: 编写失败测试**

新建 `src/charts/modules/__tests__/bug-by-developer-hours.test.ts`：

```typescript
import { bugByDeveloperHoursChart } from '../bug-by-developer-hours';
import { IssueItem } from '../../../types';

function makeIssue(nickName: string, hours: number): Partial<IssueItem> {
  return {
    developer: {
      id: 1,
      name: '',
      nick_name: nickName,
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    actual_work_hours: hours,
    new_custom_fields: [],
    deleted: false,
  } as Partial<IssueItem>;
}

describe('bugByDeveloperHoursChart', () => {
  it('标题应为"开发人员工时消耗"', () => {
    expect(bugByDeveloperHoursChart.title).toBe('开发人员工时消耗');
  });

  it('按开发人员汇总工时并降序排列', () => {
    const bugs = [makeIssue('张三', 3), makeIssue('李四', 5), makeIssue('张三', 1)] as IssueItem[];
    const option = bugByDeveloperHoursChart.buildOption(bugs) as any;
    const names: string[] = option.yAxis.data;
    const values: number[] = option.series[0].data;
    expect(names[0]).toBe('李四');
    expect(values[0]).toBe(5);
    expect(names[1]).toBe('张三');
    expect(values[1]).toBe(4);
  });

  it('过滤掉 nick_name 为空的条目', () => {
    const bugs = [makeIssue('', 4), makeIssue('王五', 2)] as IssueItem[];
    const option = bugByDeveloperHoursChart.buildOption(bugs) as any;
    const names: string[] = option.yAxis.data;
    expect(names).not.toContain('');
    expect(names).toContain('王五');
  });

  it('过滤掉 developer 未设置的条目', () => {
    const bugs = [
      { ...makeIssue('赵六', 3), developer: null } as unknown as IssueItem,
      makeIssue('赵六', 1),
    ] as IssueItem[];
    const option = bugByDeveloperHoursChart.buildOption(bugs) as any;
    const values: number[] = option.series[0].data;
    expect(values[0]).toBe(1);
  });

  it('空数组时返回空图表', () => {
    const option = bugByDeveloperHoursChart.buildOption([]) as any;
    expect(option.yAxis.data).toHaveLength(0);
    expect(option.series[0].data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/charts/modules/__tests__/bug-by-developer-hours.test.ts --no-coverage
```

预期：FAIL，报 `Cannot find module '../bug-by-developer-hours'`

- [ ] **Step 3: 实现 `bug-by-developer-hours.ts`**

新建 `src/charts/modules/bug-by-developer-hours.ts`：

```typescript
import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByDeveloperHoursChart: ChartModule = {
  title: '开发人员工时消耗',
  buildOption(bugs: IssueItem[]): object {
    const hoursMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.developer?.nick_name;
      if (!name || name === '未设置') return;
      hoursMap.set(name, (hoursMap.get(name) ?? 0) + (bug.actual_work_hours ?? 0));
    });

    const sorted = Array.from(hoursMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, hours]) => hours);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', name: '小时' },
      yAxis: { type: 'category', data: names, inverse: true },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'right', formatter: '{c}h' },
          itemStyle: { color: '#ee6666' },
        },
      ],
    };
  },
};
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/charts/modules/__tests__/bug-by-developer-hours.test.ts --no-coverage
```

预期：PASS，5 个测试全部通过

- [ ] **Step 5: 提交**

```bash
git add src/charts/modules/bug-by-developer-hours.ts src/charts/modules/__tests__/bug-by-developer-hours.test.ts
git commit -m "feat(charts): add developer hours consumption chart"
```

---

## Chunk 3: 未关闭 Bug 优先级热力表

### Task 3: 创建 `bug-open-priority-heatmap.ts`

**Files:**

- Create: `src/charts/modules/bug-open-priority-heatmap.ts`
- Create: `src/charts/modules/__tests__/bug-open-priority-heatmap.test.ts`

- [ ] **Step 1: 编写失败测试**

新建 `src/charts/modules/__tests__/bug-open-priority-heatmap.test.ts`：

```typescript
import { bugOpenPriorityHeatmapChart } from '../bug-open-priority-heatmap';
import { IssueItem } from '../../../types';

function makeIssue(
  assignee: string,
  severityName: string,
  statusName: string,
  deleted = false
): Partial<IssueItem> {
  return {
    assigned_user: {
      id: 1,
      name: '',
      nick_name: assignee,
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    severity: { id: 1, name: severityName },
    status: { id: 5, name: statusName },
    deleted,
    new_custom_fields: [],
  } as Partial<IssueItem>;
}

describe('bugOpenPriorityHeatmapChart', () => {
  it('标题应为"未关闭 Bug 优先级分布"', () => {
    expect(bugOpenPriorityHeatmapChart.title).toBe('未关闭 Bug 优先级分布');
  });

  it('过滤掉已关闭的 bug', () => {
    const bugs = [
      makeIssue('张三', '重要', '已关闭'),
      makeIssue('张三', '严重', '进行中'),
    ] as IssueItem[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const seriesData: number[][] = option.series[0].data;
    const total = seriesData.reduce((sum, d) => sum + d[2], 0);
    expect(total).toBe(1);
  });

  it('过滤掉 deleted=true 的 bug', () => {
    const bugs = [
      makeIssue('张三', '重要', '进行中', true),
      makeIssue('李四', '一般', '新问题', false),
    ] as IssueItem[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const seriesData: number[][] = option.series[0].data;
    const total = seriesData.reduce((sum, d) => sum + d[2], 0);
    expect(total).toBe(1);
  });

  it('X 轴严重程度按 一般→重要→严重 顺序排列', () => {
    const bugs = [] as IssueItem[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const xData: string[] = option.xAxis.data;
    expect(xData.indexOf('一般')).toBeLessThan(xData.indexOf('重要'));
    expect(xData.indexOf('重要')).toBeLessThan(xData.indexOf('严重'));
  });

  it('visualMap max 至少为 1（防止空数据时 min===max===0）', () => {
    const option = bugOpenPriorityHeatmapChart.buildOption([]) as any;
    expect(option.visualMap.max).toBeGreaterThanOrEqual(1);
  });

  it('未知 severity 值放 X 轴末尾', () => {
    const bugs = [makeIssue('张三', '未知等级', '进行中')] as IssueItem[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const xData: string[] = option.xAxis.data;
    // 未知值应排在已知 severity 之后
    expect(xData[xData.length - 1]).toBe('未知等级');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/charts/modules/__tests__/bug-open-priority-heatmap.test.ts --no-coverage
```

预期：FAIL，报 `Cannot find module '../bug-open-priority-heatmap'`

- [ ] **Step 3: 实现 `bug-open-priority-heatmap.ts`**

新建 `src/charts/modules/bug-open-priority-heatmap.ts`：

```typescript
import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

const SEVERITY_ORDER = ['一般', '重要', '严重'];

export const bugOpenPriorityHeatmapChart: ChartModule = {
  title: '未关闭 Bug 优先级分布',
  buildOption(bugs: IssueItem[]): object {
    const openBugs = bugs.filter((b) => !b.deleted && b.status?.name !== '已关闭');

    // 收集所有出现的 severity，已知顺序在前，未知的追加在后
    const unknownSeverities = [
      ...new Set(
        openBugs.map((b) => b.severity?.name ?? '').filter((s) => s && !SEVERITY_ORDER.includes(s))
      ),
    ];
    const xCategories = [...SEVERITY_ORDER, ...unknownSeverities];

    // 收集处理人，按未关闭 Bug 总数降序
    const assigneeCounts = new Map<string, number>();
    openBugs.forEach((b) => {
      const name = b.assigned_user?.nick_name ?? '未分配';
      assigneeCounts.set(name, (assigneeCounts.get(name) ?? 0) + 1);
    });
    const yCategories = Array.from(assigneeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    // 构建热力数据 [xIdx, yIdx, count]
    const heatMap = new Map<string, number>();
    openBugs.forEach((b) => {
      const xKey = b.severity?.name ?? '';
      const yKey = b.assigned_user?.nick_name ?? '未分配';
      const key = `${xKey}|${yKey}`;
      heatMap.set(key, (heatMap.get(key) ?? 0) + 1);
    });

    const data: number[][] = [];
    xCategories.forEach((x, xi) => {
      yCategories.forEach((y, yi) => {
        const v = heatMap.get(`${x}|${y}`) ?? 0;
        data.push([xi, yi, v]);
      });
    });

    const maxValue = data.reduce((max, d) => Math.max(max, d[2]), 0);

    return {
      tooltip: {
        position: 'top',
        formatter: (params: { data: number[] }) =>
          `${yCategories[params.data[1]]} / ${xCategories[params.data[0]]}: ${params.data[2]} 个`,
      },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xCategories,
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: Math.max(1, maxValue),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: { color: ['#ffffff', '#ee6666'] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: {
            show: true,
            formatter: (params: { data: number[] }) =>
              params.data[2] > 0 ? String(params.data[2]) : '',
          },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
        },
      ],
    };
  },
};
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/charts/modules/__tests__/bug-open-priority-heatmap.test.ts --no-coverage
```

预期：PASS，5 个测试全部通过

- [ ] **Step 5: 提交**

```bash
git add src/charts/modules/bug-open-priority-heatmap.ts src/charts/modules/__tests__/bug-open-priority-heatmap.test.ts
git commit -m "feat(charts): add open bug priority heatmap chart"
```

---

## Chunk 4: 注册新图表并验证

### Task 4: 更新 `src/charts/index.ts`

**Files:**

- Modify: `src/charts/index.ts`

- [ ] **Step 1: 修改 `src/charts/index.ts`，注册 3 个新图表**

将文件内容替换为：

```typescript
import { ChartModule } from './chart.interface';
import { bugByAssigneeChart } from './modules/bug-by-assignee';
import { bugByDefectAnalysisChart } from './modules/bug-by-defect-analysis';
import { bugByModuleChart } from './modules/bug-by-module';
import { bugByFixDurationChart } from './modules/bug-by-fix-duration';
import { bugByDeveloperHoursChart } from './modules/bug-by-developer-hours';
import { bugOpenPriorityHeatmapChart } from './modules/bug-open-priority-heatmap';

export const allCharts: ChartModule[] = [
  bugByDefectAnalysisChart,
  bugByAssigneeChart,
  bugByModuleChart,
  bugByFixDurationChart,
  bugByDeveloperHoursChart,
  bugOpenPriorityHeatmapChart,
];
```

- [ ] **Step 2: 运行全量测试确认无回归**

```bash
npm test
```

预期：所有测试 PASS，无编译错误

- [ ] **Step 3: 构建确认编译通过**

```bash
npm run build
```

预期：无 TypeScript 编译错误，`dist/` 目录生成成功

- [ ] **Step 4: Lint 检查**

```bash
npx eslint "src/charts/**/*.ts"
```

预期：无 ESLint 错误

- [ ] **Step 5: 提交**

```bash
git add src/charts/index.ts
git commit -m "feat(charts): register 3 new bug analysis charts in allCharts"
```
