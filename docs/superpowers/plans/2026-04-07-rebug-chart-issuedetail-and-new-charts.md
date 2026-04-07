# rebug chart IssueDetail 升级 & 新增 Tag 分析图表实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 rebug chart 命令升级为获取完整 IssueDetail[] 后渲染，并新增 5 个基于 tag_list 的 ECharts 图表模块。

**Architecture:** 修改 `selectBugsInteractive` 在内部拉取 IssueDetail[]，全局升级 ChartModule 接口参数类型，新增 5 个 chart module 文件，renderer.ts 追加 wordcloud CDN。

**Tech Stack:** TypeScript 5.2+, ECharts (CDN), echarts-wordcloud (CDN), ora, Commander.js

**Spec:** `docs/superpowers/specs/2026-04-07-rebug-chart-issuedetail-and-new-charts-design.md`

---

## Chunk 1: 接口升级（chart.interface.ts + 现有 6 个图表模块）

### Task 1: 升级 ChartModule 接口

**Files:**

- Modify: `src/charts/chart.interface.ts`

- [ ] **Step 1: 修改 chart.interface.ts**

将 `IssueItem` import 改为 `IssueDetail`，buildOption 参数类型同步更新：

```typescript
import { IssueDetail } from '../types';

export interface ChartModule {
  title: string;
  buildOption(bugs: IssueDetail[]): object;
}
```

- [ ] **Step 2: 运行构建验证接口修改产生了预期的类型错误（现有 6 个模块会报错）**

```bash
npm run build 2>&1 | grep "error TS"
```

预期：6 个模块各报 `Argument of type 'IssueItem[]' is not assignable to parameter of type 'IssueDetail[]'` 类似的类型错误

---

### Task 2: 升级现有 6 个图表模块

**Files:**

- Modify: `src/charts/modules/bug-by-assignee.ts`
- Modify: `src/charts/modules/bug-by-defect-analysis.ts`
- Modify: `src/charts/modules/bug-by-developer-hours.ts`
- Modify: `src/charts/modules/bug-by-fix-duration.ts`
- Modify: `src/charts/modules/bug-by-module.ts`
- Modify: `src/charts/modules/bug-open-priority-heatmap.ts`

**每个文件的改动**（方法体不变，仅修改两处）：

1. `import { IssueItem }` → `import { IssueDetail }`
2. `buildOption(bugs: IssueItem[])` → `buildOption(bugs: IssueDetail[])`

- [ ] **Step 1: 升级 bug-by-assignee.ts**

```typescript
// 第1行
import { IssueDetail } from '../../types';
// buildOption 签名
buildOption(bugs: IssueDetail[]): object {
```

- [ ] **Step 2: 升级 bug-by-defect-analysis.ts**

```typescript
import { IssueDetail } from '../../types';
buildOption(bugs: IssueDetail[]): object {
```

- [ ] **Step 3: 升级 bug-by-developer-hours.ts**

```typescript
import { IssueDetail } from '../../types';
buildOption(bugs: IssueDetail[]): object {
```

- [ ] **Step 4: 升级 bug-by-fix-duration.ts**

```typescript
import { IssueDetail } from '../../types';
buildOption(bugs: IssueDetail[]): object {
```

- [ ] **Step 5: 升级 bug-by-module.ts**

```typescript
import { IssueDetail } from '../../types';
buildOption(bugs: IssueDetail[]): object {
```

- [ ] **Step 6: 升级 bug-open-priority-heatmap.ts**

```typescript
import { IssueDetail } from '../../types';
buildOption(bugs: IssueDetail[]): object {
```

- [ ] **Step 7: 运行构建，验证不再有接口类型错误**

```bash
npm run build 2>&1 | grep "error TS"
```

预期：无输出（或仅剩 renderer.ts / rebug.command.ts 相关错误）

- [ ] **Step 8: Commit**

```bash
git add src/charts/chart.interface.ts src/charts/modules/bug-by-assignee.ts src/charts/modules/bug-by-defect-analysis.ts src/charts/modules/bug-by-developer-hours.ts src/charts/modules/bug-by-fix-duration.ts src/charts/modules/bug-by-module.ts src/charts/modules/bug-open-priority-heatmap.ts
git commit -m "refactor: upgrade ChartModule interface and existing modules to IssueDetail[]"
```

---

## Chunk 2: renderer.ts 升级 + rebug.command.ts 升级

### Task 3: 升级 renderer.ts

**Files:**

- Modify: `src/charts/renderer.ts`

- [ ] **Step 1: 更新 import，将 IssueItem 改为 IssueDetail**

在文件顶部，将：

```typescript
import { IssueItem } from '../types';
```

改为：

```typescript
import { IssueDetail } from '../types';
```

- [ ] **Step 2: 更新 renderReport 函数签名**

```typescript
export function renderReport(
  bugs: IssueDetail[],
  charts: ChartModule[],
  meta: ReportMeta,
  outputDir?: string
): string {
```

- [ ] **Step 3: 更新 buildHtml 函数签名（private 函数）**

```typescript
function buildHtml(bugs: IssueDetail[], charts: ChartModule[], meta: ReportMeta): string {
```

- [ ] **Step 4: 在 HTML 模板中追加 echarts-wordcloud CDN 脚本**

找到 renderer.ts 中生成 HTML 的部分（约第 191 行）：

```html
<script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
```

在该行**之后**紧接着插入（顺序不可颠倒）：

```html
<script src="https://cdn.jsdelivr.net/npm/echarts-wordcloud/dist/echarts-wordcloud.min.js"></script>
```

- [ ] **Step 5: 运行构建验证**

```bash
npm run build 2>&1 | grep "error TS"
```

预期：renderer.ts 相关错误消失

---

### Task 4: 升级 rebug.command.ts

**Files:**

- Modify: `src/commands/rebug.command.ts`

- [ ] **Step 1: 更新 SelectedBugsResult 接口**

将 `allBugs: IssueItem[]` 改为 `allBugs: IssueDetail[]`

- [ ] **Step 2: 更新 selectBugsInteractive 函数**

在 `getBugsByIterationsAndTerminals` 成功后，执行以下操作：

- 将现有的 `let allBugs: IssueItem[]`（约第 158 行）重命名为 `let items: IssueItem[]`
- 在 querySpinner.succeed 之后，追加新的详情获取代码块：

```typescript
const detailSpinner = ora(`正在获取 ${items.length} 个 Bug 的详情...`).start();
let allBugs: IssueDetail[];
try {
  allBugs = await businessService.getIssueDetails(
    projectId,
    items.map((b) => b.id)
  );
  detailSpinner.succeed('详情获取完成');
} catch (error) {
  detailSpinner.fail('获取 Bug 详情失败');
  throw error;
}
```

- [ ] **Step 3: 更新 rebugNoTagCommand 函数**

删除约第 228-237 行的原有 getIssueDetails 调用代码块（包含 `detailSpinner`、`getIssueDetails`、相关错误处理）：

```typescript
// 删除以下代码块：
const detailSpinner = ora(`正在获取 ${allBugs.length} 个 Bug 的详情...`).start();
const issueIds = allBugs.map((bug) => bug.id);
let details: IssueDetail[];
try {
  details = await businessService.getIssueDetails(projectId, issueIds);
  detailSpinner.succeed('详情获取完成');
} catch (error) {
  detailSpinner.fail('获取 Bug 详情失败');
  throw error;
}
```

删除后，将该函数中**所有** `details` 变量引用替换为 `allBugs`（共出现在以下位置）：

- 第 239 行：`let untagged = details.filter(...)` → `let untagged = allBugs.filter(...)`
- 第 244-246 行：`untagged = untagged.filter((detail) => ...)` 中的 `detail` 参数名不需要改，但注意变量名 `details` 已替换
- 第 253 行：`allBugs.length` 已存在，不需要改（该行引用的本来就是 `allBugs`）
- 第 255-257 行：`untagged.forEach((detail, index) => {...})` 中的 `detail` 是 forEach 的参数名，不需要改

**验证**：确认 `rebugNoTagCommand` 函数中不再有 `details` 变量引用，`allBugs` 在该函数作用域内类型为 `IssueDetail[]`（来自 `selectBugsInteractive` 返回值），因此 `detail.tag_list` 访问合法。

- [ ] **Step 4: 运行构建验证**

```bash
npm run build 2>&1 | grep "error TS"
```

预期：rebug.command.ts 相关错误消失

- [ ] **Step 5: Commit**

```bash
git add src/charts/renderer.ts src/commands/rebug.command.ts
git commit -m "feat: upgrade selectBugsInteractive to fetch IssueDetail[] and remove duplicate detail fetch in rebugNoTagCommand"
```

---

## Chunk 3: 新增 5 个 Tag 图表模块

### Task 5: bug-by-tag-pie.ts（标签分布环形饼图）

**Files:**

- Create: `src/charts/modules/bug-by-tag-pie.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagPieChart: ChartModule = {
  title: '标签分布',
  buildOption(bugs: IssueDetail[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) {
        countMap.set('未打标签', (countMap.get('未打标签') || 0) + 1);
      } else {
        bug.tag_list.forEach((tag) => {
          countMap.set(tag, (countMap.get(tag) || 0) + 1);
        });
      }
    });

    const data = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}: {d}%',
          },
          labelLine: { length: 18, length2: 6, lineStyle: { width: 1 } },
          data,
        },
      ],
    };
  },
};
```

---

### Task 6: bug-by-tag-trend.ts（标签趋势折线图）

**Files:**

- Create: `src/charts/modules/bug-by-tag-trend.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

/**
 * 计算 ISO 8601 周 key，格式 YYYY-Www（如 2026-W14）
 * ISO 8601: 周一为起始日，含 1 月第一个周四的周为第 1 周
 */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 将周日(0)转为7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 调至周四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const bugByTagTrendChart: ChartModule = {
  title: '标签趋势（按周）',
  buildOption(bugs: IssueDetail[]): object {
    // 统计 (tag, weekKey) -> count
    const tagWeekMap = new Map<string, Map<string, number>>();
    const allWeeks = new Set<string>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      const week = getISOWeekKey(new Date(bug.created_time));
      allWeeks.add(week);
      bug.tag_list.forEach((tag) => {
        if (!tagWeekMap.has(tag)) tagWeekMap.set(tag, new Map());
        const weekMap = tagWeekMap.get(tag)!;
        weekMap.set(week, (weekMap.get(week) || 0) + 1);
      });
    });

    // 按总频率取 Top 10 标签
    const tagTotals = Array.from(tagWeekMap.entries()).map(([tag, wm]) => ({
      tag,
      total: Array.from(wm.values()).reduce((a, b) => a + b, 0),
    }));
    const top10Tags = tagTotals
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((t) => t.tag);

    const sortedWeeks = Array.from(allWeeks).sort();

    const series = top10Tags.map((tag) => {
      const weekMap = tagWeekMap.get(tag)!;
      return {
        name: tag,
        type: 'line',
        smooth: true,
        data: sortedWeeks.map((w) => weekMap.get(w) || 0),
      };
    });

    return {
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll', bottom: 0 },
      xAxis: { type: 'category', data: sortedWeeks, axisLabel: { rotate: 30 } },
      yAxis: { type: 'value', minInterval: 1 },
      series,
    };
  },
};
```

---

### Task 7: bug-by-tag-module-heatmap.ts（标签-模块热力图）

**Files:**

- Create: `src/charts/modules/bug-by-tag-module-heatmap.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagModuleHeatmapChart: ChartModule = {
  title: '标签-模块热力图',
  buildOption(bugs: IssueDetail[]): object {
    const heatMap = new Map<string, number>();
    const allTags = new Set<string>();
    const allModules = new Set<string>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      const moduleName = bug.module?.name?.trim() || '未设置模块';
      allModules.add(moduleName);
      bug.tag_list.forEach((tag) => {
        allTags.add(tag);
        const key = `${tag}|${moduleName}`;
        heatMap.set(key, (heatMap.get(key) || 0) + 1);
      });
    });

    const tags = Array.from(allTags);
    const modules = Array.from(allModules);

    const data: number[][] = [];
    tags.forEach((tag, xi) => {
      modules.forEach((mod, yi) => {
        const v = heatMap.get(`${tag}|${mod}`) || 0;
        data.push([xi, yi, v]);
      });
    });

    const maxValue = data.reduce((max, d) => Math.max(max, d[2]), 0);

    return {
      tooltip: {
        position: 'top',
        formatter: (params: { data: number[] }) =>
          `${tags[params.data[0]]} / ${modules[params.data[1]]}: ${params.data[2]} 个`,
      },
      xAxis: { type: 'category', data: tags, axisLabel: { rotate: 30 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: modules, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max: Math.max(1, maxValue),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
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
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        },
      ],
    };
  },
};
```

---

### Task 8: bug-by-tag-wordcloud.ts（标签词云图）

**Files:**

- Create: `src/charts/modules/bug-by-tag-wordcloud.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagWordcloudChart: ChartModule = {
  title: '标签词云',
  buildOption(bugs: IssueDetail[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      bug.tag_list.forEach((tag) => {
        countMap.set(tag, (countMap.get(tag) || 0) + 1);
      });
    });

    const data = Array.from(countMap.entries()).map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      series: [
        {
          type: 'wordCloud',
          sizeRange: [14, 60],
          rotationRange: [0, 0],
          shape: 'circle',
          width: '100%',
          height: '100%',
          data,
          textStyle: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
        },
      ],
    };
  },
};
```

---

### Task 9: bug-by-tag-developer-sankey.ts（开发人员-标签桑基图）

**Files:**

- Create: `src/charts/modules/bug-by-tag-developer-sankey.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagDeveloperSankeyChart: ChartModule = {
  title: '开发人员-标签桑基图',
  buildOption(bugs: IssueDetail[]): object {
    const edgeMap = new Map<string, number>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      const developer = bug.developer?.nick_name?.trim() || '未指派';
      bug.tag_list.forEach((tag) => {
        const key = `${developer}|||${tag}`;
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      });
    });

    // Top 20 条边（按数量降序）
    const top20Edges = Array.from(edgeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // 从 Top 20 边中提取涉及的所有节点
    const nodeSet = new Set<string>();
    top20Edges.forEach(([key]) => {
      const [dev, tag] = key.split('|||');
      nodeSet.add(`dev:${dev}`);
      nodeSet.add(`tag:${tag}`);
    });

    const nodes = Array.from(nodeSet).map((n) => ({ name: n.replace(/^(dev:|tag:)/, '') }));

    // 构造边数组，source/target 使用去掉前缀的名称
    const links = top20Edges.map(([key, value]) => {
      const [dev, tag] = key.split('|||');
      return { source: dev, target: tag, value };
    });

    // 处理 source 和 target 同名冲突：为开发人员节点加后缀
    const tagNames = new Set(top20Edges.map(([key]) => key.split('|||')[1]));
    const devNames = new Set(top20Edges.map(([key]) => key.split('|||')[0]));
    const conflicts = new Set([...tagNames].filter((t) => devNames.has(t)));

    const finalNodes: { name: string }[] = [];
    const nameMap = new Map<string, string>(); // original prefixed key → display name

    Array.from(nodeSet).forEach((n) => {
      const isDevPrefix = n.startsWith('dev:');
      const rawName = n.replace(/^(dev:|tag:)/, '');
      let displayName = rawName;
      if (isDevPrefix && conflicts.has(rawName)) {
        displayName = `${rawName}（开发）`;
      }
      nameMap.set(n, displayName);
      finalNodes.push({ name: displayName });
    });

    const finalLinks = top20Edges.map(([key, value]) => {
      const [dev, tag] = key.split('|||');
      const sourceName = nameMap.get(`dev:${dev}`) || dev;
      const targetName = nameMap.get(`tag:${tag}`) || tag;
      return { source: sourceName, target: targetName, value };
    });

    return {
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [
        {
          type: 'sankey',
          data: finalNodes,
          links: finalLinks,
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.5 },
          label: { position: 'right' },
        },
      ],
    };
  },
};
```

---

### Task 10: 更新 charts/index.ts

**Files:**

- Modify: `src/charts/index.ts`

- [ ] **Step 1: 追加新图表的 import 和注册**

```typescript
import { ChartModule } from './chart.interface';
import { bugByAssigneeChart } from './modules/bug-by-assignee';
import { bugByDefectAnalysisChart } from './modules/bug-by-defect-analysis';
import { bugByModuleChart } from './modules/bug-by-module';
import { bugByFixDurationChart } from './modules/bug-by-fix-duration';
import { bugByDeveloperHoursChart } from './modules/bug-by-developer-hours';
import { bugOpenPriorityHeatmapChart } from './modules/bug-open-priority-heatmap';
import { bugByTagPieChart } from './modules/bug-by-tag-pie';
import { bugByTagTrendChart } from './modules/bug-by-tag-trend';
import { bugByTagModuleHeatmapChart } from './modules/bug-by-tag-module-heatmap';
import { bugByTagWordcloudChart } from './modules/bug-by-tag-wordcloud';
import { bugByTagDeveloperSankeyChart } from './modules/bug-by-tag-developer-sankey';

export const allCharts: ChartModule[] = [
  bugByModuleChart,
  bugByDefectAnalysisChart,
  bugByFixDurationChart,
  bugOpenPriorityHeatmapChart,
  bugByAssigneeChart,
  bugByDeveloperHoursChart,
  bugByTagPieChart,
  bugByTagTrendChart,
  bugByTagModuleHeatmapChart,
  bugByTagWordcloudChart,
  bugByTagDeveloperSankeyChart,
];
```

- [ ] **Step 2: 运行全量构建，确认零错误**

```bash
npm run build 2>&1
```

预期：`Found 0 errors.`（或构建成功无报错）

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/bug-by-tag-pie.ts src/charts/modules/bug-by-tag-trend.ts src/charts/modules/bug-by-tag-module-heatmap.ts src/charts/modules/bug-by-tag-wordcloud.ts src/charts/modules/bug-by-tag-developer-sankey.ts src/charts/index.ts
git commit -m "feat: add 5 tag-based chart modules (pie, trend, heatmap, wordcloud, sankey)"
```

---

## 完成验证

- [ ] `npm run build` 无 TypeScript 错误
- [ ] `npm test` 通过（如有相关测试）
- [ ] 手动运行 `codearts rebug chart` 生成 HTML 报告，在浏览器中验证 11 个图表均正常渲染（含词云）
