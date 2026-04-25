# Quality Command Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `codearts quality` 顶级命令，查询指定迭代的 Bug 数据，生成 24 张 ECharts PNG 图表，输出包含数据表格与图片的质量分析 Markdown 报告。

**Architecture:** 命令层（quality.command.ts）负责数据查询、切片和 Markdown 生成调度；4 个纯函数图表模块负责生成 ECharts option；PNG 渲染器（png-renderer.ts）使用 Puppeteer + 本地 echarts bundle 渲染图片；所有模块通过明确的函数接口协作，不依赖全局状态。

**Tech Stack:** TypeScript, Commander.js, @inquirer/prompts (via inquirer@13), puppeteer, echarts, Node.js fs/path

---

## Chunk 1: 依赖安装与 PNG 渲染器

### Task 1: 安装新依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 puppeteer 和 echarts**

```bash
npm install puppeteer echarts
```

- [ ] **Step 2: 验证安装成功**

```bash
node -e "require('puppeteer'); require('echarts'); console.log('OK')"
```

Expected: 输出 `OK`，无报错。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add puppeteer and echarts dependencies"
```

---

### Task 2: 实现 PNG 渲染器

**Files:**
- Create: `src/charts/png-renderer.ts`

- [ ] **Step 1: 创建 png-renderer.ts**

```typescript
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import puppeteer from 'puppeteer';

const _require = createRequire(__filename);

export interface ChartRenderTask {
  option: object;
  outputPath: string; // 绝对路径
  width?: number;     // 默认 800
  height?: number;    // 默认 500
}

/**
 * 批量将 ECharts option 渲染为透明背景 PNG 文件
 * 复用单个 Puppeteer 浏览器实例，串行渲染所有任务
 */
export async function renderChartsToPng(tasks: ChartRenderTask[]): Promise<void> {
  const echartsPath = _require.resolve('echarts/dist/echarts.min.js');
  const echartsScript = fs.readFileSync(echartsPath, 'utf-8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const task of tasks) {
      const { option, outputPath, width = 800, height = 500 } = task;
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        await page.setContent(`
          <!DOCTYPE html>
          <html>
            <head><style>body{margin:0;background:transparent}</style></head>
            <body>
              <div id="chart" style="width:${width}px;height:${height}px;"></div>
              <script>${echartsScript}</script>
              <script>
                const chart = echarts.init(document.getElementById('chart'), null, {
                  renderer: 'canvas',
                  backgroundColor: 'transparent'
                });
                chart.setOption(${JSON.stringify(option)});
                window.__dataURL = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: 'transparent' });
              </script>
            </body>
          </html>
        `);
        const dataURL: string = await page.evaluate(() => (window as unknown as { __dataURL: string }).__dataURL);
        const base64 = dataURL.replace(/^data:image\/png;base64,/, '');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | head -30
```

Expected: 无 TypeScript 编译错误（忽略无关警告）。

- [ ] **Step 3: Commit**

```bash
git add src/charts/png-renderer.ts
git commit -m "feat: add Puppeteer PNG chart renderer"
```

---

## Chunk 2: 4 个图表模块（纯函数）

### Task 3: 缺陷技术分析饼图模块

**Files:**
- Create: `src/charts/modules/quality/defect-analysis-pie.ts`

- [ ] **Step 1: 创建饼图模块**

```typescript
import { IssueDetail, CustomFieldId } from '../../../types';

/**
 * 缺陷技术分析饼图（环形）
 * 按 custom_field32 (DEFECT_TECHNICAL_ANALYSIS) 聚合
 */
export function buildDefectAnalysisPieOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const value =
      (bug.new_custom_fields || []).find(
        (f) => f.custom_field === CustomFieldId.DEFECT_TECHNICAL_ANALYSIS
      )?.value ?? '未填写';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const data = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        label: { show: true, formatter: '{b}\n{d}%' },
        data,
      },
    ],
  };
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```

Expected: 无输出（无错误）。

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/quality/defect-analysis-pie.ts
git commit -m "feat: add defect analysis pie chart module"
```

---

### Task 4: 需求 Bug 分布柱状图模块

**Files:**
- Create: `src/charts/modules/quality/requirement-bug-bar.ts`

- [ ] **Step 1: 创建需求 Bug 分布柱状图模块**

```typescript
import { IssueDetail } from '../../../types';

/**
 * 需求 Bug 分布柱状图（纵向）
 * 按 parent_issue.name 聚合
 */
export function buildRequirementBugBarOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '无父工作项';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => v);

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: 30, interval: 0, overflow: 'truncate', width: 120 },
    },
    yAxis: { type: 'value', name: 'Bug 数量' },
    series: [{ type: 'bar', data: values, label: { show: true, position: 'top' } }],
  };
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```

Expected: 无输出。

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/quality/requirement-bug-bar.ts
git commit -m "feat: add requirement bug bar chart module"
```

---

### Task 5: 修复周期分布柱状图模块

**Files:**
- Create: `src/charts/modules/quality/fix-duration-bar.ts`

- [ ] **Step 1: 创建修复周期柱状图模块**

```typescript
import { IssueDetail } from '../../../types';

const BUCKETS = ['≤1天', '2-3天', '4-7天', '8-14天', '>14天'];

function toBucket(days: number): string {
  if (days <= 1) return '≤1天';
  if (days <= 3) return '2-3天';
  if (days <= 7) return '4-7天';
  if (days <= 14) return '8-14天';
  return '>14天';
}

/**
 * 修复周期分布柱状图
 * 只统计有 closed_time 的 Bug，按创建到关闭天数分桶
 */
export function buildFixDurationBarOption(bugs: IssueDetail[]): object {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const bug of bugs) {
    if (!bug.closed_time) continue;
    const days = Math.ceil(
      (new Date(bug.closed_time).getTime() - new Date(bug.created_time).getTime()) / 86400000
    );
    if (days < 0) continue; // 数据异常保护
    counts[toBucket(days)]++;
  }

  const values = BUCKETS.map((b) => counts[b]);

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
    xAxis: { type: 'category', data: BUCKETS },
    yAxis: { type: 'value', name: 'Bug 数量' },
    series: [{ type: 'bar', data: values, label: { show: true, position: 'top' } }],
  };
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```

Expected: 无输出。

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/quality/fix-duration-bar.ts
git commit -m "feat: add fix duration bar chart module"
```

---

### Task 6: 研发人员 Bug 数量横向柱状图模块

**Files:**
- Create: `src/charts/modules/quality/developer-bug-bar.ts`

- [ ] **Step 1: 创建研发人员横向柱状图模块**

```typescript
import { IssueDetail } from '../../../types';

/**
 * 研发人员 Bug 数量横向柱状图
 * 按 developer.nick_name 聚合，降序排列
 */
export function buildDeveloperBugBarOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.developer?.nick_name ?? '未分配';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => v);

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '15%', right: '8%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', name: 'Bug 数量' },
    yAxis: { type: 'category', data: categories.reverse(), axisLabel: { width: 100, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        data: values.reverse(),
        label: { show: true, position: 'right' },
      },
    ],
  };
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```

Expected: 无输出。

- [ ] **Step 3: Commit**

```bash
git add src/charts/modules/quality/developer-bug-bar.ts
git commit -m "feat: add developer bug horizontal bar chart module"
```

---

## Chunk 3: quality.command.ts — 数据查询与辅助函数

### Task 7: 命令骨架与数据查询

**Files:**
- Create: `src/commands/quality.command.ts`

- [ ] **Step 1: 创建命令文件，实现配置加载、迭代选择、数据查询**

```typescript
import path from 'path';
import fs from 'fs';
import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { loadConfig } from '../utils/config-loader';
import { logger } from '../utils/logger';
import { ApiService } from '../services/api.service';
import { BusinessService } from '../services/business.service';
import { ConfigKey, IssueDetail, CustomFieldId } from '../types';
import { globalTheme } from '../utils/inquirer-theme';
import { matchIterations } from './rebug.command';
import { renderChartsToPng, ChartRenderTask } from '../charts/png-renderer';
import { buildDefectAnalysisPieOption } from '../charts/modules/quality/defect-analysis-pie';
import { buildRequirementBugBarOption } from '../charts/modules/quality/requirement-bug-bar';
import { buildFixDurationBarOption } from '../charts/modules/quality/fix-duration-bar';
import { buildDeveloperBugBarOption } from '../charts/modules/quality/developer-bug-bar';

// ---- 辅助函数 ----

function getCustomField(bug: IssueDetail, fieldId: CustomFieldId): string | undefined {
  return (bug.new_custom_fields || []).find((f) => f.custom_field === fieldId)?.value;
}

function filterByTerminal(bugs: IssueDetail[], terminalType: string): IssueDetail[] {
  return bugs.filter((b) => getCustomField(b, CustomFieldId.TERMINAL_TYPE) === terminalType);
}

function filterByDesignDefect(bugs: IssueDetail[]): IssueDetail[] {
  const designValues = ['需求变更问题', '产品设计问题'];
  return bugs.filter((b) =>
    designValues.includes(getCustomField(b, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS) ?? '')
  );
}

function getTopRequirement(bugs: IssueDetail[]): string | null {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '无父工作项';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

// ---- 主命令函数 ----

export interface QualityCommandOptions {
  iteration?: string;
  outputDir?: string;
}

export async function qualityCommand(cliOptions: QualityCommandOptions): Promise<void> {
  const config = loadConfig(cliOptions);
  const projectId = config[ConfigKey.PROJECT_ID];

  const apiService = new ApiService(config);
  const businessService = new BusinessService(apiService);

  // 1. 加载迭代列表
  const loadSpinner = ora('正在加载迭代列表...').start();
  const iterations = await businessService.getIterations(projectId, { limit: 12 });
  loadSpinner.succeed('迭代列表加载完成');

  // 2. 选择迭代
  const promptIterations = () =>
    checkbox({
      message: '请选择要分析的迭代：',
      choices: iterations.map((it) => ({
        name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
        value: it,
        checked: false,
      })),
      validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
      theme: globalTheme,
    });

  let selectedIterations;
  if (cliOptions.iteration?.trim()) {
    const matched = matchIterations(iterations, cliOptions.iteration);
    if (matched.length > 0) {
      selectedIterations = matched;
    } else {
      logger.warn(`迭代关键字 "${cliOptions.iteration}" 未匹配到任何结果，请手动选择`);
      selectedIterations = await promptIterations();
    }
  } else {
    selectedIterations = await promptIterations();
  }

  const iterationIds = selectedIterations.map((it) => it.id);
  const iterationNames = selectedIterations.map((it) => it.name).join(', ');

  // 3. 查询 Bug
  const bugSpinner = ora('正在查询 Bug 数据...').start();
  const rawBugs = await businessService.getBugsByIterationsAndTerminals(projectId, iterationIds, []);
  const issueIds = rawBugs.map((b) => b.id);
  const allBugs = await businessService.getIssueDetails(projectId, issueIds, 10);
  bugSpinner.succeed(`已加载 ${allBugs.length} 个 Bug`);

  // 4. 准备输出目录
  const outputDir = path.resolve(cliOptions.outputDir ?? './quality-report');
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  // 5. 生成报告（图表 + Markdown）
  await generateReport({ allBugs, outputDir, imagesDir, iterationNames });

  logger.info(`质量分析报告已生成：${path.join(outputDir, 'quality-report.md')}`);
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 无 TypeScript 编译错误（`matchIterations` 导出可能提示，后续步骤修复）。

> 注：此步骤暂不提交，Task 10 Step 3 统一 commit quality.command.ts。

---

## Chunk 4: quality.command.ts — 报告生成逻辑

### Task 8: 单部分报告生成函数

**Files:**
- Modify: `src/commands/quality.command.ts`（在 Task 7 文件中继续添加）

- [ ] **Step 1: 添加单部分图表渲染与 Markdown 片段生成函数**

在 `quality.command.ts` 文件末尾继续添加以下内容：

```typescript
// ---- 数据聚合辅助 ----

function calcDefectAnalysisTable(bugs: IssueDetail[]): Array<{ name: string; count: number; ratio: string }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const v = getCustomField(bug, CustomFieldId.DEFECT_TECHNICAL_ANALYSIS) ?? '未填写';
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = bugs.length;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, ratio: `${((count / total) * 100).toFixed(1)}%` }));
}

function calcRequirementBugTable(bugs: IssueDetail[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '无父工作项';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function calcFixDurationTable(bugs: IssueDetail[]): Array<{ bucket: string; count: number; ratio: string }> {
  const BUCKETS = ['≤1天', '2-3天', '4-7天', '8-14天', '>14天'];
  const toBucket = (days: number) => {
    if (days <= 1) return '≤1天';
    if (days <= 3) return '2-3天';
    if (days <= 7) return '4-7天';
    if (days <= 14) return '8-14天';
    return '>14天';
  };
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  let total = 0;
  for (const bug of bugs) {
    if (!bug.closed_time) continue;
    const days = Math.ceil(
      (new Date(bug.closed_time).getTime() - new Date(bug.created_time).getTime()) / 86400000
    );
    if (days < 0) continue;
    counts[toBucket(days)]++;
    total++;
  }
  return BUCKETS.map((b) => ({
    bucket: b,
    count: counts[b],
    ratio: total > 0 ? `${((counts[b] / total) * 100).toFixed(1)}%` : '0%',
  }));
}

function calcDeveloperBugTable(bugs: IssueDetail[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.developer?.nick_name ?? '未分配';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// ---- Markdown 表格生成 ----

function mdDefectAnalysisTable(rows: ReturnType<typeof calcDefectAnalysisTable>): string {
  const header = '| 缺陷技术分析 | 数量 | 占比 |\n|-------------|------|------|\n';
  return header + rows.map((r) => `| ${r.name} | ${r.count} | ${r.ratio} |`).join('\n');
}

function mdRequirementBugTable(rows: ReturnType<typeof calcRequirementBugTable>): string {
  const header = '| 需求（父工作项） | Bug 数量 |\n|----------------|----------|\n';
  return header + rows.map((r) => `| ${r.name} | ${r.count} |`).join('\n');
}

function mdFixDurationTable(rows: ReturnType<typeof calcFixDurationTable>, closedCount: number): string {
  const header = `**可统计 Bug 数**（已关闭/解决）：${closedCount} 个\n\n| 修复周期 | 数量 | 占比 |\n|---------|------|------|\n`;
  return header + rows.map((r) => `| ${r.bucket} | ${r.count} | ${r.ratio} |`).join('\n');
}

function mdDeveloperBugTable(rows: ReturnType<typeof calcDeveloperBugTable>): string {
  const header = '| 研发人员 | Bug 数量 |\n|---------|----------|\n';
  return header + rows.map((r) => `| ${r.name} | ${r.count} |`).join('\n');
}

// ---- 单部分图表渲染 + Markdown 片段生成 ----

interface SectionConfig {
  prefix: string;          // 图片文件名前缀，如 'overview'
  sectionTitle: string;    // 如 '一、缺陷总览'
  headingPrefix: string;   // 子章节编号前缀，如 '1'
}

async function renderSection(
  bugs: IssueDetail[],
  config: SectionConfig,
  imagesDir: string
): Promise<string> {
  const { prefix, sectionTitle, headingPrefix } = config;

  if (bugs.length === 0) {
    return `## ${sectionTitle}\n\n> 暂无数据\n\n---\n`;
  }

  const renderTasks: ChartRenderTask[] = [];
  const imgBase = (name: string) => path.join(imagesDir, `${prefix}-${name}.png`);

  renderTasks.push({ option: buildDefectAnalysisPieOption(bugs), outputPath: imgBase('defect-analysis'), width: 600, height: 500 });
  renderTasks.push({ option: buildRequirementBugBarOption(bugs), outputPath: imgBase('requirement-bug'), width: 800, height: 500 });
  renderTasks.push({ option: buildFixDurationBarOption(bugs), outputPath: imgBase('fix-duration'), width: 800, height: 500 });
  renderTasks.push({ option: buildDeveloperBugBarOption(bugs), outputPath: imgBase('developer-bug'), width: 800, height: 400 });

  await renderChartsToPng(renderTasks);

  const defectRows = calcDefectAnalysisTable(bugs);
  const reqRows = calcRequirementBugTable(bugs);
  const durationRows = calcFixDurationTable(bugs);
  const devRows = calcDeveloperBugTable(bugs);
  const closedCount = bugs.filter((b) => b.closed_time).length;
  const imgRef = (name: string) => `./images/${prefix}-${name}.png`;

  return [
    `## ${sectionTitle}`,
    '',
    `**缺陷总数**：${bugs.length} 个`,
    '',
    `### ${headingPrefix}.1 缺陷技术分析`,
    '',
    mdDefectAnalysisTable(defectRows),
    '',
    `![缺陷技术分析](${imgRef('defect-analysis')})`,
    '',
    `### ${headingPrefix}.2 需求 Bug 分布`,
    '',
    mdRequirementBugTable(reqRows),
    '',
    `![需求 Bug 分布](${imgRef('requirement-bug')})`,
    '',
    `### ${headingPrefix}.3 修复周期分布`,
    '',
    mdFixDurationTable(durationRows, closedCount),
    '',
    `![修复周期分布](${imgRef('fix-duration')})`,
    '',
    `### ${headingPrefix}.4 研发人员 Bug 数量`,
    '',
    mdDeveloperBugTable(devRows),
    '',
    `![研发人员 Bug 数量](${imgRef('developer-bug')})`,
    '',
    '---',
    '',
  ].join('\n');
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 无错误。

---

### Task 9: 第六部分（需求缺陷率）和第七部分（设计缺陷率）生成函数

**Files:**
- Modify: `src/commands/quality.command.ts`（继续追加）

- [ ] **Step 1: 添加第六部分和第七部分的生成函数**

```typescript
async function renderSection6(bugs: IssueDetail[], imagesDir: string): Promise<string> {
  if (bugs.length === 0) {
    return `## 六、需求缺陷率\n\n> 暂无数据\n\n---\n`;
  }

  const reqRows = calcRequirementBugTable(bugs);
  const requirementCount = new Set(bugs.map((b) => b.parent_issue?.name ?? '无父工作项')).size;
  const topReqName = getTopRequirement(bugs);
  const topReqBugs = topReqName
    ? bugs.filter((b) => (b.parent_issue?.name ?? '无父工作项') === topReqName)
    : [];

  const renderTasks: ChartRenderTask[] = [
    { option: buildRequirementBugBarOption(bugs), outputPath: path.join(imagesDir, 'req-rate-bug-bar.png'), width: 800, height: 500 },
  ];
  if (topReqBugs.length > 0) {
    renderTasks.push({ option: buildDefectAnalysisPieOption(topReqBugs), outputPath: path.join(imagesDir, 'req-rate-top-defect-pie.png'), width: 600, height: 500 });
    renderTasks.push({ option: buildDeveloperBugBarOption(topReqBugs), outputPath: path.join(imagesDir, 'req-rate-top-developer-bar.png'), width: 800, height: 400 });
  }

  await renderChartsToPng(renderTasks);

  const lines = [
    '## 六、需求缺陷率',
    '',
    `**缺陷总数**：${bugs.length} 个 | **涉及需求数**：${requirementCount} 个`,
    '',
    '### 6.1 需求 Bug 分布',
    '',
    mdRequirementBugTable(reqRows),
    '',
    '![需求 Bug 分布](./images/req-rate-bug-bar.png)',
    '',
  ];

  if (topReqBugs.length > 0 && topReqName) {
    lines.push(
      `### 6.2 缺陷最多的需求 — 缺陷技术分析`,
      '',
      `**需求名称**：${topReqName}（共 ${topReqBugs.length} 个 Bug）`,
      '',
      mdDefectAnalysisTable(calcDefectAnalysisTable(topReqBugs)),
      '',
      '![缺陷技术分析](./images/req-rate-top-defect-pie.png)',
      '',
      `### 6.3 缺陷最多的需求 — 研发人员分析`,
      '',
      mdDeveloperBugTable(calcDeveloperBugTable(topReqBugs)),
      '',
      '![研发人员分析](./images/req-rate-top-developer-bar.png)',
      '',
    );
  }

  lines.push('---', '');
  return lines.join('\n');
}

async function renderSection7(allBugs: IssueDetail[], imagesDir: string): Promise<string> {
  const designBugs = filterByDesignDefect(allBugs);

  if (designBugs.length === 0) {
    return `## 七、设计缺陷率\n\n> 暂无数据\n\n---\n`;
  }

  const ratio = ((designBugs.length / allBugs.length) * 100).toFixed(1);
  const reqRows = calcRequirementBugTable(designBugs);

  await renderChartsToPng([
    { option: buildRequirementBugBarOption(designBugs), outputPath: path.join(imagesDir, 'design-defect-bar.png'), width: 800, height: 500 },
  ]);

  return [
    '## 七、设计缺陷率',
    '',
    `**设计缺陷总数**：${designBugs.length} 个 | **占全量 Bug 比率**：${ratio}%`,
    '',
    '（筛选条件：缺陷技术分析 = 需求变更问题 或 产品设计问题）',
    '',
    '### 7.1 设计缺陷按需求分布',
    '',
    mdRequirementBugTable(reqRows),
    '',
    '![设计缺陷按需求分布](./images/design-defect-bar.png)',
    '',
    '---',
    '',
  ].join('\n');
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 无错误。

---

### Task 10: generateReport 总调度函数与 Markdown 写入

**Files:**
- Modify: `src/commands/quality.command.ts`（继续追加）

- [ ] **Step 1: 添加 generateReport 函数**

```typescript
interface GenerateReportParams {
  allBugs: IssueDetail[];
  outputDir: string;
  imagesDir: string;
  iterationNames: string;
}

async function generateReport({
  allBugs,
  outputDir,
  imagesDir,
  iterationNames,
}: GenerateReportParams): Promise<void> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });

  const spinner = ora('正在生成图表和报告...').start();

  const sections: string[] = [];

  // 报告头
  sections.push(
    `# 质量分析报告\n\n> 迭代：${iterationNames} | 生成时间：${now}\n\n---\n`
  );

  // 第一至第五部分
  const terminalSections: Array<{ title: string; heading: string; filter: IssueDetail[] }> = [
    { title: '一、缺陷总览', heading: '1', filter: allBugs },
    { title: '二、网页端', heading: '2', filter: filterByTerminal(allBugs, '网页端') },
    { title: '三、移动端', heading: '3', filter: filterByTerminal(allBugs, '手机端') },
    { title: '四、平台服务端', heading: '4', filter: filterByTerminal(allBugs, '平台服务端') },
    { title: '五、业务服务端', heading: '5', filter: filterByTerminal(allBugs, '业务服务端') },
  ];
  const prefixes = ['overview', 'web', 'mobile', 'platform', 'business'];

  for (let i = 0; i < terminalSections.length; i++) {
    const { title, heading, filter } = terminalSections[i];
    sections.push(
      await renderSection(filter, { prefix: prefixes[i], sectionTitle: title, headingPrefix: heading }, imagesDir)
    );
  }

  // 第六部分：需求缺陷率
  sections.push(await renderSection6(allBugs, imagesDir));

  // 第七部分：设计缺陷率
  sections.push(await renderSection7(allBugs, imagesDir));

  const markdown = sections.join('');
  fs.writeFileSync(path.join(outputDir, 'quality-report.md'), markdown, 'utf-8');

  spinner.succeed('质量分析报告生成完成');
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/commands/quality.command.ts
git commit -m "feat: implement quality command with report generation"
```

---

## Chunk 5: CLI 注册与导出

### Task 11: 导出 matchIterations 供 quality.command.ts 复用

**Files:**
- Modify: `src/commands/rebug.command.ts`（确认 matchIterations 已 export）

- [ ] **Step 1: 确认并确保 matchIterations 已导出**

```bash
grep "export function matchIterations" src/commands/rebug.command.ts
```

如果有输出，说明已导出，跳到 Step 2。如果无输出，执行以下命令添加 export：

```bash
sed -i 's/^function matchIterations/export function matchIterations/' src/commands/rebug.command.ts
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```

Expected: 无错误。

---

### Task 12: 注册 CLI 命令

**Files:**
- Modify: `src/commands/index.ts`
- Modify: `src/bin/cli.ts`

- [ ] **Step 1: 在 src/commands/index.ts 中导出 qualityCommand**

在文件末尾添加：

```typescript
export { qualityCommand } from './quality.command';
```

- [ ] **Step 2: 在 src/bin/cli.ts 中注册 quality 命令**

在文件中找到其他命令的注册位置（如 `rebug` 命令附近），添加：

```typescript
import { qualityCommand } from '../commands';

// ... 在其他命令注册后添加：

program
  .command('quality')
  .description('生成质量分析报告（缺陷多维分析 + ECharts PNG 图表）')
  .option('-i, --iteration <names>', '迭代名称，逗号分隔（不传时交互式多选）')
  .option('--output-dir <path>', '输出目录', './quality-report')
  .action(async (options, command) => {
    try {
      await qualityCommand({
        iteration: options.iteration,
        outputDir: options.outputDir,
        ...command.parent?.opts(),
      });
    } catch (error: unknown) {
      logger.error(`质量分析命令执行失败: ${String(error)}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 2: 编译验证**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```

Expected: 无错误。

---

## Chunk 6: 集成验证

### Task 13: 构建与冒烟测试

**Files:** 无新文件，仅验证

- [ ] **Step 1: 全量构建**

```bash
npm run build
```

Expected: 构建成功，无错误。

- [ ] **Step 2: 运行现有测试（回归）**

```bash
npm test
```

Expected: 所有现有测试通过，无新的失败。

- [ ] **Step 3: 验证 CLI help 输出**

```bash
node dist/bin/cli.js --help
```

Expected: 命令列表中包含 `quality`。

```bash
node dist/bin/cli.js quality --help
```

Expected:
```
Usage: codearts quality [options]

生成质量分析报告（缺陷多维分析 + ECharts PNG 图表）

Options:
  -i, --iteration <names>  迭代名称，逗号分隔（不传时交互式多选）
  --output-dir <path>      输出目录 (default: "./quality-report")
  -h, --help               display help for command
```

- [ ] **Step 4: ESLint 检查**

```bash
npx eslint src/commands/quality.command.ts src/charts/png-renderer.ts src/charts/modules/quality/*.ts
```

Expected: 无错误（警告可接受，修复 error 级别问题）。

- [ ] **Step 5: Prettier 格式化**

```bash
npx prettier --write "src/commands/quality.command.ts" "src/charts/png-renderer.ts" "src/charts/modules/quality/*.ts"
```

- [ ] **Step 6: Final commit**

```bash
git add src/commands/quality.command.ts src/charts/png-renderer.ts src/charts/modules/quality/ src/commands/index.ts src/bin/cli.ts src/commands/rebug.command.ts
git commit -m "chore: lint and format quality command files"
```
```
