# rebug 子命令实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `rebug` 扩展为子命令组，保留 `chart` 原有图表功能，新增 `no-tag` 子命令用于列出指定迭代中未打标签的 bug。

**Architecture:** 在 `rebug.command.ts` 中提取 Step 1-5 的共享交互逻辑为 `selectBugsInteractive`，原逻辑收敛为 `rebugChartCommand`，新增 `rebugNoTagCommand`。`BusinessService` 增加 `getIssueDetails` 方法并发获取 issue 详情。`IssueDetail` 类型新增 `tag_list` 字段。CLI 层 `rebug` 改为命令组。

**Tech Stack:** TypeScript, Commander.js, @inquirer/prompts, ora, Axios

---

## Chunk 1: 类型 + API 层

### Task 1: 新增 `IssueDetail` 类型

**Files:**

- Modify: `src/types/index.ts`

- [ ] **Step 1: 在 `IssueItem` 接口定义之后新增 `IssueDetail` 接口**

在 `src/types/index.ts` 的 `IssueItem` 接口定义之后（约第 374 行 `ListIssuesV4Response` 之前）插入：

```typescript
export interface IssueDetail extends IssueItem {
  tag_list: string[] | null;
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add IssueDetail type with tag_list field"
```

---

### Task 2: 修正 `getIssueById` 返回类型

**Files:**

- Modify: `src/services/api.service.ts`

- [ ] **Step 1: 在 `api.service.ts` 顶部导入中新增 `IssueDetail`**

找到现有的类型导入语句（文件顶部 `import { ... } from '../types'`），在导入列表中追加 `IssueDetail`。

- [ ] **Step 2: 将 `getIssueById` 返回类型从 `unknown` 改为 `IssueDetail`**

找到：

```typescript
async getIssueById(projectId: string, issueId: string): Promise<ApiResponse<unknown>> {
  return this.request(`/v4/projects/${projectId}/issues/${issueId}`, {
    method: 'GET',
  });
}
```

改为：

```typescript
async getIssueById(projectId: string, issueId: string): Promise<ApiResponse<IssueDetail>> {
  return this.request(`/v4/projects/${projectId}/issues/${issueId}`, {
    method: 'GET',
  });
}
```

- [ ] **Step 3: 验证编译通过**

```bash
npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 4: Commit**

```bash
git add src/services/api.service.ts
git commit -m "feat: type getIssueById response as IssueDetail"
```

---

### Task 3: `BusinessService` 新增 `getIssueDetails` 方法

**Files:**

- Modify: `src/services/business.service.ts`

- [ ] **Step 1: 在 `business.service.ts` 顶部导入中追加 `IssueDetail`**

找到文件顶部的类型导入语句（`import { ... } from '../types'`），在导入列表中追加 `IssueDetail`。

- [ ] **Step 2: 确认 `logger` 已导入（如未导入则添加）**

检查 `business.service.ts` 顶部是否有 `import { logger } from '../utils/logger'`，若无则在其他 import 语句之后添加：

```typescript
import { logger } from '../utils/logger';
```

- [ ] **Step 3: 在 `BusinessService` 类末尾（`parseDateToTimestamp` 方法之前）新增方法**

找到 `private parseDateToTimestamp(dateStr: string): number | null {` 这一行，在其前面插入：

````typescript
/**
 * 并发批量获取工作项详情（含 tag_list）
 * @param projectId 项目ID
 * @param issueIds 工作项ID列表（调用 getIssueById 时转为 string）
 * @param concurrency 并发数，默认 10
 */
async getIssueDetails(
  projectId: string,
  issueIds: number[],
  concurrency: number = 10
): Promise<IssueDetail[]> {
  const results: IssueDetail[] = [];

  for (let i = 0; i < issueIds.length; i += concurrency) {
    const batch = issueIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          const response = await this.apiService.getIssueById(projectId, String(id));
          return response.success && response.data ? response.data : null;
        } catch (error) {
          logger.warn(`获取工作项 ${id} 详情失败: ${String(error)}`);
          return null;
        }
      })
    );
    results.push(...(batchResults.filter((r) => r !== null) as IssueDetail[]));
  }

  return results;
}

- [ ] **Step 4: 验证编译通过**

```bash
npx tsc --noEmit
````

Expected: 无报错输出

- [ ] **Step 5: Commit**

```bash
git add src/services/business.service.ts
git commit -m "feat: add getIssueDetails method with concurrency control"
```

---

## Chunk 2: 命令层重构

### Task 4: 重构 `rebug.command.ts`

**Files:**

- Modify: `src/commands/rebug.command.ts`

当前文件共 117 行。重构后文件包含三个函数：`selectBugsInteractive`（不导出）、`rebugChartCommand`（导出）、`rebugNoTagCommand`（导出）。

- [ ] **Step 1: 用以下完整内容替换 `src/commands/rebug.command.ts`**

```typescript
import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { allCharts } from '../charts';
import { ReportMeta, openInBrowser, renderReport } from '../charts/renderer';
import { BusinessService } from '../services/business.service';
import { CustomFieldId, IssueDetail, IssueItem, IterationInfo } from '../types';
import { issueLink } from '../utils/console';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';

interface SelectedBugsResult {
  selectedIterations: IterationInfo[];
  selectedTerminalTypes: string[];
  allBugs: IssueItem[];
  projectId: string;
  businessService: BusinessService;
}

/**
 * 共享交互逻辑：选择迭代、终端类型并查询 bug 列表（Step 1-5）
 */
async function selectBugsInteractive(cliOptions: CliOptions): Promise<SelectedBugsResult> {
  const { projectId, config } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

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

  let terminalTypeOptions: string[] = [];
  try {
    const customFieldOptions = await businessService.getCustomFieldOptions(projectId, [
      CustomFieldId.TERMINAL_TYPE,
    ]);
    terminalTypeOptions = customFieldOptions[CustomFieldId.TERMINAL_TYPE] || [];
  } catch {
    logger.warn('获取终端类型选项失败，将跳过终端类型筛选');
  }

  let selectedTerminalTypes: string[] = [];
  if (terminalTypeOptions.length > 0) {
    selectedTerminalTypes = await checkbox({
      message: '请选择终端类型（不选则查询全部）：',
      choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
      theme: globalTheme,
    });
  }

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

  return { selectedIterations, selectedTerminalTypes, allBugs, projectId, businessService };
}

/**
 * rebug chart 子命令：交互式查询 Bug 列表并生成 ECharts 可视化报告
 */
export async function rebugChartCommand(cliOptions: CliOptions = {}): Promise<void> {
  try {
    const { selectedIterations, selectedTerminalTypes, allBugs } =
      await selectBugsInteractive(cliOptions);

    logger.info(`迭代：${selectedIterations.map((it) => it.name).join(', ')}`);
    if (selectedTerminalTypes.length > 0) {
      logger.info(`终端类型：${selectedTerminalTypes.join(', ')}`);
    }
    logger.info('正在生成分析报告...');

    const meta: ReportMeta = {
      iterationNames: selectedIterations.map((it) => it.name),
      terminalTypes: selectedTerminalTypes,
      totalCount: allBugs.length,
      generatedAt: new Date().toISOString(),
    };

    let reportPath: string;
    try {
      const outputDir = cliOptions.outputDir || undefined;
      reportPath = renderReport(allBugs, allCharts, meta, outputDir);
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
      logger.error(`执行 rebug chart 命令失败: ${String(error)}`);
    }
  }
}

/**
 * rebug no-tag 子命令：展示指定迭代中未添加标签的 Bug 列表
 */
export async function rebugNoTagCommand(cliOptions: CliOptions = {}): Promise<void> {
  try {
    const { selectedIterations, selectedTerminalTypes, allBugs, projectId, businessService } =
      await selectBugsInteractive(cliOptions);

    logger.info(`迭代：${selectedIterations.map((it) => it.name).join(', ')}`);
    if (selectedTerminalTypes.length > 0) {
      logger.info(`终端类型：${selectedTerminalTypes.join(', ')}`);
    }

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

    let untagged = details.filter(
      (detail) => detail.tag_list === null || detail.tag_list.length === 0
    );

    const developer = cliOptions.developer;
    if (developer && developer.trim() !== '') {
      untagged = untagged.filter((detail) => detail.developer?.nick_name?.includes(developer));
    }

    if (untagged.length === 0) {
      logger.info('所有 Bug 均已添加标签。');
      return;
    }

    logger.info(`找到 ${untagged.length} 个未打标签的 Bug（共 ${allBugs.length} 个）：`);
    logger.info('');
    untagged.forEach((detail, index) => {
      logger.info(`  [${index + 1}] ${detail.name}`);
      logger.info(`      ${issueLink(projectId, detail.id)}`);
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      logger.info('操作取消');
    } else {
      logger.error(`执行 rebug no-tag 命令失败: ${String(error)}`);
    }
  }
}
```

- [ ] **Step 2: 验证编译通过（CLI 层未更新前会有 import 报错，可暂忽略）**

```bash
npx tsc --noEmit 2>&1 | grep -v "cli.ts"
```

Expected: 无 rebug.command.ts 相关报错

- [ ] **Step 3: Commit**

```bash
git add src/commands/rebug.command.ts
git commit -m "feat: refactor rebug command into chart and no-tag subcommands"
```

---

## Chunk 3: CLI 层 + CliOptions 扩展

### Task 5: 扩展 `CliOptions` 类型

**Files:**

- Modify: `src/utils/config-loader.ts`

- [ ] **Step 1: 在 `CliOptions` 接口中添加 `developer` 可选字段**

打开 `src/utils/config-loader.ts`，找到 `CliOptions` 接口定义，新增字段：

```typescript
developer?: string; // 按处理人昵称过滤（rebug no-tag 命令）
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 3: Commit**

```bash
git add src/utils/config-loader.ts
git commit -m "feat: add developer option to CliOptions"
```

---

### Task 6: 更新 `cli.ts` — 将 `rebug` 改为子命令组

**Files:**

- Modify: `src/bin/cli.ts`

- [ ] **Step 1: 更新导入语句**

找到：

```typescript
import { rebugCommand } from '../commands/rebug.command';
```

改为：

```typescript
import { rebugChartCommand, rebugNoTagCommand } from '../commands/rebug.command';
```

- [ ] **Step 2: 将 `rebug` 命令改为命令组并注册子命令**

找到现有的 `rebug` 命令注册代码（约 107-118 行），完整替换为：

```typescript
// rebug 命令组
const rebugCmd = program.command('rebug').description('Bug 列表交互式查询与分析');

// rebug chart 子命令
rebugCmd
  .command('chart')
  .description('多维度 ECharts 可视化分析报告')
  .option(
    '--output-dir <path>',
    '输出 HTML 报告的目录（默认输出到系统 cache 目录，指定此参数则输出到当前目录）'
  )
  .action(async (options, command) => {
    const cliOptions = { ...command.parent.parent.opts(), outputDir: options.outputDir };
    logger.setOutputFormat(cliOptions.output);
    await rebugChartCommand(cliOptions);
  });

// rebug no-tag 子命令
rebugCmd
  .command('no-tag')
  .description('展示未添加标签的 Bug 列表')
  .option('--developer <name>', '按处理人昵称过滤（包含匹配）')
  .action(async (options, command) => {
    const cliOptions = { ...command.parent.parent.opts(), developer: options.developer };
    logger.setOutputFormat(cliOptions.output);
    await rebugNoTagCommand(cliOptions);
  });
```

注意：Commander.js 子命令中 `command.parent` 指向父命令（`rebug`），`command.parent.parent` 指向根命令（`program`），全局选项（`--role`、`--output`）在根命令上。

- [ ] **Step 3: 验证编译通过**

```bash
npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 4: 构建并验证命令帮助信息**

```bash
npm run build
node dist/bin/cli.js rebug --help
```

Expected 输出包含：

```
Commands:
  chart     多维度 ECharts 可视化分析报告
  no-tag    展示未添加标签的 Bug 列表
```

```bash
node dist/bin/cli.js rebug chart --help
```

Expected: 包含 `--output-dir` 选项

```bash
node dist/bin/cli.js rebug no-tag --help
```

Expected: 包含 `--developer` 选项

- [ ] **Step 5: Commit**

```bash
git add src/bin/cli.ts
git commit -m "feat: convert rebug to subcommand group with chart and no-tag"
```

---

## Chunk 4: 集成验证

### Task 7: 完整验证

- [ ] **Step 1: 完整构建**

```bash
npm run build
```

Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 2: 验证根命令帮助**

```bash
node dist/bin/cli.js --help
```

Expected: `rebug` 出现在命令列表中

- [ ] **Step 3: ESLint 检查**

```bash
npx eslint "src/**/*.ts"
```

Expected: 无 error 级别报错

- [ ] **Step 4: Prettier 格式化并提交（若有改动）**

```bash
npx prettier --write "src/**/*.ts"
git add -A
git diff --cached --stat
```

若有改动：

```bash
git commit -m "style: apply prettier formatting"
```
