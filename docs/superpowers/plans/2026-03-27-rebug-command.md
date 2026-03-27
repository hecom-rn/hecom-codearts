# rebug 命令实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `codearts rebug` 命令，支持交互式筛选 Bug 列表并生成 ECharts 多维度 HTML 可视化报告。

**Architecture:** 命令层负责交互式查询（选择迭代 + 终端类型），图表层（`src/charts/`）采用模块化设计，每个分析维度一个独立文件实现 `ChartModule` 接口，`renderer.ts` 遍历所有模块生成单页 HTML，新增维度只需在 `modules/` 下添加新文件。

**Tech Stack:** TypeScript、Commander.js、@inquirer/prompts（checkbox）、ora、ECharts（CDN）

---

## Chunk 1: 图表基础架构

### Task 1: ChartModule 接口

**Files:**

- Create: `src/charts/chart.interface.ts`

- [ ] **Step 1: 创建接口文件**

```typescript
// src/charts/chart.interface.ts
import { IssueItem } from '../types';

export interface ChartModule {
  title: string;
  buildOption(bugs: IssueItem[]): object;
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/charts/chart.interface.ts
git commit -m "feat: add ChartModule interface"
```

---

### Task 2: 按缺陷技术分析分布的饼图模块

**Files:**

- Create: `src/charts/modules/bug-by-defect-analysis.ts`

- [ ] **Step 1: 创建图表模块**

```typescript
// src/charts/modules/bug-by-defect-analysis.ts
import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByDefectAnalysisChart: ChartModule = {
  title: '缺陷技术分析分布',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const field = bug.new_custom_fields?.find((f) => f.custom_field === 'custom_field32');
      const value = field?.value || '未填写';
      countMap.set(value, (countMap.get(value) || 0) + 1);
    });

    const data = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left', type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: true,
          label: { show: true, formatter: '{b}: {d}%' },
          data,
        },
      ],
    };
  },
};
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/bug-by-defect-analysis.ts
git commit -m "feat: add bug-by-defect-analysis chart module"
```

---

### Task 3: 按处理人分布的横向柱状图模块

**Files:**

- Create: `src/charts/modules/bug-by-assignee.ts`

- [ ] **Step 1: 创建图表模块**

```typescript
// src/charts/modules/bug-by-assignee.ts
import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByAssigneeChart: ChartModule = {
  title: '修复人 Bug 数量',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.developer?.nick_name || '未设置';
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });

    const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, value]) => value);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: names, inverse: true },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'right' },
          itemStyle: { color: '#5470c6' },
        },
      ],
    };
  },
};
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/bug-by-assignee.ts
git commit -m "feat: add bug-by-assignee chart module"
```

---

### Task 4: 按模块分布的柱状图模块

**Files:**

- Create: `src/charts/modules/bug-by-module.ts`

- [ ] **Step 1: 创建图表模块**

```typescript
// src/charts/modules/bug-by-module.ts
import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByModuleChart: ChartModule = {
  title: '模块 Bug 分布',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.module?.name || '未分配模块';
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });

    const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, value]) => value);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: { rotate: 30, overflow: 'truncate', width: 80 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'top' },
          itemStyle: { color: '#91cc75' },
        },
      ],
    };
  },
};
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/bug-by-module.ts
git commit -m "feat: add bug-by-module chart module"
```

---

### Task 5: 图表模块注册入口

**Files:**

- Create: `src/charts/index.ts`

- [ ] **Step 1: 创建注册文件**

```typescript
// src/charts/index.ts
import { ChartModule } from './chart.interface';
import { bugByAssigneeChart } from './modules/bug-by-assignee';
import { bugByDefectAnalysisChart } from './modules/bug-by-defect-analysis';
import { bugByModuleChart } from './modules/bug-by-module';

export const allCharts: ChartModule[] = [
  bugByDefectAnalysisChart,
  bugByAssigneeChart,
  bugByModuleChart,
];
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/charts/index.ts
git commit -m "feat: register chart modules in charts/index.ts"
```

---

### Task 6: HTML 渲染器

**Files:**

- Create: `src/charts/renderer.ts`

- [ ] **Step 1: 定义 ReportMeta 接口并实现渲染器**

```typescript
// src/charts/renderer.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IssueItem } from '../types';
import { ChartModule } from './chart.interface';

export interface ReportMeta {
  iterationNames: string[];
  terminalTypes: string[];
  totalCount: number;
  generatedAt: string;
}

/**
 * 生成 HTML 报告并写入文件，返回文件路径。
 * 若文件写入失败，将 HTML 内容打印到控制台作为兜底，然后抛出错误。
 */
export function renderReport(bugs: IssueItem[], charts: ChartModule[], meta: ReportMeta): string {
  const d = new Date(meta.generatedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const filename = `rebug-report-${timestamp}.html`;
  const outputPath = path.join(process.cwd(), filename);

  const html = buildHtml(bugs, charts, meta);

  try {
    fs.writeFileSync(outputPath, html, 'utf-8');
  } catch (writeError) {
    // 写入失败时将 HTML 内容输出到控制台作为兜底
    console.log('\n========== HTML 报告内容（文件写入失败，请手动保存）==========\n');
    console.log(html);
    console.log('\n=================================================================\n');
    throw writeError;
  }

  return outputPath;
}

function buildHtml(bugs: IssueItem[], charts: ChartModule[], meta: ReportMeta): string {
  const chartContainers = charts
    .map(
      (chart, i) =>
        `<div class="chart-card">
          <div class="chart-title">${chart.title}</div>
          <div id="chart-${i}" style="height:400px;"></div>
        </div>`
    )
    .join('\n');

  const chartScripts = charts
    .map((chart, i) => {
      const option = JSON.stringify(chart.buildOption(bugs));
      return `echarts.init(document.getElementById('chart-${i}')).setOption(${option});`;
    })
    .join('\n');

  const iterationsText = meta.iterationNames.join(', ') || '全部';
  const terminalText = meta.terminalTypes.join(', ') || '全部';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bug 分析报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #333; }
    .header { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { margin: 0 0 16px; font-size: 22px; color: #1a1a1a; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .meta-item { background: #f8f9fa; border-radius: 6px; padding: 12px; }
    .meta-label { font-size: 12px; color: #888; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 600; color: #333; }
    .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .chart-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; }
    @media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Bug 分析报告</h1>
    <div class="meta-grid">
      <div class="meta-item"><div class="meta-label">总 Bug 数</div><div class="meta-value">${meta.totalCount}</div></div>
      <div class="meta-item"><div class="meta-label">迭代</div><div class="meta-value">${iterationsText}</div></div>
      <div class="meta-item"><div class="meta-label">终端类型</div><div class="meta-value">${terminalText}</div></div>
      <div class="meta-item"><div class="meta-label">生成时间</div><div class="meta-value">${new Date(meta.generatedAt).toLocaleString('zh-CN')}</div></div>
    </div>
  </div>
  <div class="charts-grid">
    ${chartContainers}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
  <script>
    ${chartScripts}
  </script>
</body>
</html>`;
}

/**
 * 自动在系统默认浏览器中打开文件
 */
export function openInBrowser(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${filePath}"`);
    } else if (platform === 'linux') {
      execSync(`xdg-open "${filePath}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${filePath}"`);
    }
  } catch {
    // 打开失败不中断流程，路径已打印
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/charts/renderer.ts
git commit -m "feat: add HTML report renderer"
```

---

## Chunk 2: 命令层

### Task 7: 在 BusinessService 新增 getBugsByIterationsAndTerminals 公共方法

**Files:**

- Modify: `src/services/business.service.ts`

- [ ] **Step 1: 在 business.service.ts 末尾（fixBug 方法之前）添加公共方法**

在 `BusinessService` 类中，紧接在 `getCurrentUserBugs` 方法之后添加：

```typescript
/**
 * 根据迭代 ID 和终端类型查询有效 Bug（分页获取全量）
 * @param projectId 项目ID
 * @param iterationIds 迭代 ID 列表
 * @param terminalTypes 终端类型列表（对应 custom_field24），为空则不过滤
 * @returns Bug 类型工作项列表
 */
async getBugsByIterationsAndTerminals(
  projectId: string,
  iterationIds: number[],
  terminalTypes: string[]
): Promise<IssueItem[]> {
  if (iterationIds.length === 0) {
    return [];
  }

  const customFieldsFilter: CustomField[] =
    terminalTypes.length > 0
      ? [{ custom_field: 'custom_field24', value: terminalTypes.join(',') }]
      : [];

  const allBugs: IssueItem[] = [];
  const pageSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const issuesResponse = await this.apiService.getIssues(projectId, {
      tracker_ids: [IssueTrackerId.BUG],
      iteration_ids: iterationIds,
      custom_fields: customFieldsFilter.length > 0 ? customFieldsFilter : undefined,
      include_deleted: false,
      limit: pageSize,
      offset,
    });

    if (!issuesResponse.success) {
      throw new Error(`查询 Bug 失败: ${issuesResponse.error || '未知错误'}`);
    }

    const bugs = issuesResponse.data?.issues || [];
    allBugs.push(...bugs);

    const total = issuesResponse.data?.total || 0;
    offset += pageSize;
    hasMore = offset < total;
  }

  return allBugs.filter((bug) => bug.status?.id !== IssueStatusId.REJECTED);
}
```

同时在文件顶部 import 中确认 `CustomField` 已导入（已在 `src/types/index.ts` 中定义）：

在 `business.service.ts` 顶部 import 行添加 `CustomField`：

```typescript
import {
  AllWorkHourStats,
  BugFixData,
  CustomField, // 新增
  HuaweiCloudConfig,
  IssueItem,
  // ... 其余保持不变
} from '../types';
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/services/business.service.ts
git commit -m "feat: add getBugsByIterationsAndTerminals to BusinessService"
```

---

### Task 8: rebug 命令入口

**Files:**

- Create: `src/commands/rebug.command.ts`

- [ ] **Step 1: 创建命令文件**

```typescript
// src/commands/rebug.command.ts
import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { allCharts } from '../charts';
import { ReportMeta, openInBrowser, renderReport } from '../charts/renderer';
import { BusinessService } from '../services/business.service';
import { CustomFieldId, IssueItem, IterationInfo } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';

/**
 * rebug 命令：交互式查询 Bug 列表并生成 ECharts 可视化报告
 */
export async function rebugCommand(cliOptions: CliOptions = {}): Promise<void> {
  try {
    const { projectId, config } = loadConfig(cliOptions);
    const businessService = new BusinessService(config);

    // Step 1: 加载迭代列表（前12个）
    const loadSpinner = ora('正在加载迭代列表...').start();
    let iterations: IterationInfo[];
    try {
      iterations = await businessService.getIterations(projectId, { limit: 12 });
      loadSpinner.succeed('迭代列表加载完成');
    } catch (error) {
      loadSpinner.fail('加载迭代列表失败');
      throw error;
    }

    if (iterations.length === 0) {
      throw new Error('未获取到任何迭代信息');
    }

    // Step 2: 用户选择迭代
    const selectedIterations = await checkbox({
      message: '请选择要查询的迭代：',
      choices: iterations.map((it) => ({
        name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
        value: it,
        checked: false,
      })),
      validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
      theme: globalTheme,
    });

    // Step 3: 加载终端类型选项
    let terminalTypeOptions: string[] = [];
    try {
      const customFieldOptions = await businessService.getCustomFieldOptions(projectId, [
        CustomFieldId.TERMINAL_TYPE,
      ]);
      terminalTypeOptions = customFieldOptions[CustomFieldId.TERMINAL_TYPE] || [];
    } catch {
      logger.warn('获取终端类型选项失败，将跳过终端类型筛选');
    }

    // Step 4: 用户选择终端类型（如果有选项）
    let selectedTerminalTypes: string[] = [];
    if (terminalTypeOptions.length > 0) {
      selectedTerminalTypes = await checkbox({
        message: '请选择终端类型（不选则查询全部）：',
        choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
        theme: globalTheme,
      });
    }

    // Step 5: 查询 Bug 列表
    const querySpinner = ora('正在查询 Bug 列表...').start();
    const iterationIds = selectedIterations.map((it) => it.id);
    let allBugs: IssueItem[];

    try {
      allBugs = await businessService.getBugsByIterationsAndTerminals(
        projectId,
        iterationIds,
        selectedTerminalTypes
      );
      querySpinner.succeed(`查询完成：共找到 ${allBugs.length} 个 Bug`);
    } catch (error) {
      querySpinner.fail('Bug 查询失败');
      throw error;
    }

    // Step 6: 控制台摘要
    logger.info(`迭代：${selectedIterations.map((it) => it.name).join(', ')}`);
    if (selectedTerminalTypes.length > 0) {
      logger.info(`终端类型：${selectedTerminalTypes.join(', ')}`);
    }
    logger.info('正在生成分析报告...');

    // Step 7: 生成报告
    const meta: ReportMeta = {
      iterationNames: selectedIterations.map((it) => it.name),
      terminalTypes: selectedTerminalTypes,
      totalCount: allBugs.length,
      generatedAt: new Date().toISOString(),
    };

    let reportPath: string;
    try {
      reportPath = renderReport(allBugs, allCharts, meta);
    } catch (error) {
      logger.error(`生成报告文件失败: ${String(error)}`);
      return;
    }

    logger.info(`报告已生成：${reportPath}`);
    openInBrowser(reportPath);
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      logger.info('操作取消');
    } else {
      logger.error(`执行 rebug 命令失败: ${String(error)}`);
    }
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/commands/rebug.command.ts
git commit -m "feat: add rebug command"
```

---

### Task 9: 在 CLI 注册 rebug 命令

**Files:**

- Modify: `src/bin/cli.ts`

- [ ] **Step 1: 添加 import 语句**

在 `src/bin/cli.ts` 顶部的 import 区域添加：

```typescript
import { rebugCommand } from '../commands/rebug.command';
```

- [ ] **Step 2: 在 fix 命令后注册 rebug 命令**

在 `fix` 命令注册代码之后添加：

```typescript
// rebug 命令
program
  .command('rebug')
  .description('Bug 列表交互式查询与多维度可视化分析')
  .action(async (options, command) => {
    const cliOptions = command.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await rebugCommand(cliOptions);
  });
```

- [ ] **Step 3: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 验证命令注册成功**

```bash
npm run build && node dist/bin/cli.js --help
```

Expected: 帮助信息中出现 `rebug` 命令

- [ ] **Step 5: Commit**

```bash
git add src/bin/cli.ts
git commit -m "feat: register rebug command in CLI"
```

---

## 注意事项

- **ECharts CDN**：HTML 报告依赖 CDN 加载 ECharts，需要网络连接才能正常显示图表。
