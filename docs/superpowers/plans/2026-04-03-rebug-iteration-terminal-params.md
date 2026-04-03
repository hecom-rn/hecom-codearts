# rebug 命令新增迭代和终端类型参数 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `rebug chart` 和 `rebug no-tag` 子命令添加 `-i/--iteration` 和 `-t/--terminal` 参数，匹配成功时跳过对应的交互式选择。

**Architecture:** 在 `CliOptions` 接口新增两个可选字段；在 `rebug.command.ts` 顶部添加两个纯匹配函数（模糊、不区分大小写、支持逗号多关键字）；在 `selectBugsInteractive` 函数中加入"匹配成功则跳过交互，未匹配则打印 warn 后回退交互"的控制流；在 `cli.ts` 的两个子命令注册处新增选项。

**Tech Stack:** TypeScript、Commander.js、@inquirer/prompts、Jest

---

## Chunk 1: CliOptions 接口扩展 + 匹配纯函数

### Task 1: 扩展 CliOptions 接口

**Files:**

- Modify: `src/utils/config-loader.ts:152-158`

- [ ] **Step 1: 在 CliOptions 接口中新增两个字段**

在 `developer?: string;` 下方添加：

```typescript
iteration?: string; // 迭代关键字（逗号分隔，模糊匹配迭代名称）
terminal?: string; // 终端类型关键字（逗号分隔，模糊匹配选项）
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

Expected: 无 TypeScript 错误

- [ ] **Step 3: Commit**

```bash
git add src/utils/config-loader.ts
git commit -m "feat: add iteration and terminal fields to CliOptions"
```

---

### Task 2: 添加匹配纯函数

**Files:**

- Modify: `src/commands/rebug.command.ts`（在第 12 行 `interface SelectedBugsResult` 之前插入）

- [ ] **Step 1: 添加 matchIterations 函数**

在 `import` 语句块之后、`interface SelectedBugsResult` 之前插入（`export` 以便单元测试导入）：

```typescript
/**
 * 从迭代列表中按关键字模糊匹配
 * @param iterations 迭代列表
 * @param keywords 逗号分隔的关键字，不区分大小写
 * @returns 命中的迭代列表（保持原列表顺序）
 */
export function matchIterations(iterations: IterationInfo[], keywords: string): IterationInfo[] {
  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (keywordList.length === 0) return [];
  const matched = new Set<number>();
  const result: IterationInfo[] = [];
  for (const iteration of iterations) {
    for (const keyword of keywordList) {
      if (iteration.name.toLowerCase().includes(keyword.toLowerCase())) {
        if (!matched.has(iteration.id)) {
          matched.add(iteration.id);
          result.push(iteration);
        }
        break;
      }
    }
  }
  return result;
}

/**
 * 从终端类型选项列表中按关键字模糊匹配
 * @param availableTerminalTypes 可选的终端类型列表
 * @param keywords 逗号分隔的关键字，不区分大小写
 * @returns 命中的终端类型列表（保持原列表顺序）
 */
export function matchTerminalTypes(availableTerminalTypes: string[], keywords: string): string[] {
  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (keywordList.length === 0) return [];
  const matched = new Set<string>();
  const result: string[] = [];
  for (const type of availableTerminalTypes) {
    for (const keyword of keywordList) {
      if (type.toLowerCase().includes(keyword.toLowerCase())) {
        if (!matched.has(type)) {
          matched.add(type);
          result.push(type);
        }
        break;
      }
    }
  }
  return result;
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

Expected: 无 TypeScript 错误

- [ ] **Step 3: Commit**

```bash
git add src/commands/rebug.command.ts
git commit -m "feat: add matchIterations and matchTerminalTypes pure functions"
```

---

## Chunk 2: selectBugsInteractive 控制流 + CLI 参数注册

### Task 3: 修改 selectBugsInteractive 加入跳过逻辑

**Files:**

- Modify: `src/commands/rebug.command.ts`（`selectBugsInteractive` 函数体）

- [ ] **Step 1: 替换迭代交互式选择逻辑**

将当前代码（约第 41-50 行）：

```typescript
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
```

替换为：

```typescript
let selectedIterations: IterationInfo[];
const hasIterationParam = cliOptions.iteration && cliOptions.iteration.trim().length > 0;
if (hasIterationParam) {
  const matched = matchIterations(iterations, cliOptions.iteration!);
  if (matched.length > 0) {
    selectedIterations = matched;
  } else {
    logger.warn(`迭代关键字 "${cliOptions.iteration}" 未匹配到任何结果，请手动选择`);
    selectedIterations = await checkbox({
      message: '请选择要查询的迭代：',
      choices: iterations.map((it) => ({
        name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
        value: it,
        checked: false,
      })),
      validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
      theme: globalTheme,
    });
  }
} else {
  selectedIterations = await checkbox({
    message: '请选择要查询的迭代：',
    choices: iterations.map((it) => ({
      name: `${it.name} (${it.begin_time} ~ ${it.end_time})`,
      value: it,
      checked: false,
    })),
    validate: (answer) => (answer.length === 0 ? '至少需要选择一个迭代' : true),
    theme: globalTheme,
  });
}
```

- [ ] **Step 2: 替换终端类型交互式选择逻辑**

将当前代码（约第 63-68 行）：

```typescript
let selectedTerminalTypes: string[] = [];
if (terminalTypeOptions.length > 0) {
  selectedTerminalTypes = await checkbox({
    message: '请选择终端类型（不选则查询全部）：',
    choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
    theme: globalTheme,
  });
}
```

替换为：

```typescript
let selectedTerminalTypes: string[] = [];
if (terminalTypeOptions.length > 0) {
  const hasTerminalParam = cliOptions.terminal && cliOptions.terminal.trim().length > 0;
  if (hasTerminalParam) {
    const matched = matchTerminalTypes(terminalTypeOptions, cliOptions.terminal!);
    if (matched.length > 0) {
      selectedTerminalTypes = matched;
    } else {
      logger.warn(`终端类型关键字 "${cliOptions.terminal}" 未匹配到任何结果，请手动选择`);
      selectedTerminalTypes = await checkbox({
        message: '请选择终端类型（不选则查询全部）：',
        choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
        theme: globalTheme,
      });
    }
  } else {
    selectedTerminalTypes = await checkbox({
      message: '请选择终端类型（不选则查询全部）：',
      choices: terminalTypeOptions.map((t) => ({ name: t, value: t, checked: false })),
      theme: globalTheme,
    });
  }
}
```

- [ ] **Step 3: 编译验证**

```bash
npm run build
```

Expected: 无 TypeScript 错误

- [ ] **Step 4: Commit**

```bash
git add src/commands/rebug.command.ts
git commit -m "feat: skip interactive selection when iteration/terminal params match"
```

---

### Task 4: CLI 参数注册

**Files:**

- Modify: `src/bin/cli.ts`（`rebug chart` 和 `rebug no-tag` 子命令注册处）

- [ ] **Step 1: 为 rebug chart 子命令新增选项**

将当前代码（约第 110-121 行）：

```typescript
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
```

替换为：

```typescript
rebugCmd
  .command('chart')
  .description('多维度 ECharts 可视化分析报告')
  .option('-i, --iteration <keywords>', '迭代关键字（逗号分隔，模糊匹配迭代名称）')
  .option('-t, --terminal <keywords>', '终端类型关键字（逗号分隔，模糊匹配选项）')
  .option(
    '--output-dir <path>',
    '输出 HTML 报告的目录（默认输出到系统 cache 目录，指定此参数则输出到当前目录）'
  )
  .action(async (options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      iteration: options.iteration,
      terminal: options.terminal,
      outputDir: options.outputDir,
    };
    logger.setOutputFormat(cliOptions.output);
    await rebugChartCommand(cliOptions);
  });
```

- [ ] **Step 2: 为 rebug no-tag 子命令新增选项**

将当前代码（约第 123-132 行）：

```typescript
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

替换为：

```typescript
rebugCmd
  .command('no-tag')
  .description('展示未添加标签的 Bug 列表')
  .option('-i, --iteration <keywords>', '迭代关键字（逗号分隔，模糊匹配迭代名称）')
  .option('-t, --terminal <keywords>', '终端类型关键字（逗号分隔，模糊匹配选项）')
  .option('--developer <name>', '按处理人昵称过滤（包含匹配）')
  .action(async (options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      iteration: options.iteration,
      terminal: options.terminal,
      developer: options.developer,
    };
    logger.setOutputFormat(cliOptions.output);
    await rebugNoTagCommand(cliOptions);
  });
```

- [ ] **Step 3: 编译验证**

```bash
npm run build
```

Expected: 无 TypeScript 错误

- [ ] **Step 4: 验证 --help 输出包含新参数**

```bash
node dist/bin/cli.js rebug chart --help
node dist/bin/cli.js rebug no-tag --help
```

Expected: 两个命令的 help 中均显示 `-i, --iteration <keywords>` 和 `-t, --terminal <keywords>`

- [ ] **Step 5: Commit**

```bash
git add src/bin/cli.ts
git commit -m "feat: register -i/--iteration and -t/--terminal options for rebug subcommands"
```

---

## Chunk 3: 测试

### Task 5: 编写 matchIterations 和 matchTerminalTypes 单元测试

**Files:**

- Create: `src/commands/__tests__/rebug-matchers.test.ts`

- [ ] **Step 1: 创建测试文件**

创建 `src/commands/__tests__/rebug-matchers.test.ts`，直接从 `rebug.command` 导入已 export 的函数：

```typescript
import { matchIterations, matchTerminalTypes } from '../rebug.command';
import { IterationInfo, IterationStatus } from '../../types';

const makeIteration = (id: number, name: string): IterationInfo => ({
  id,
  name,
  begin_time: '2025-01-01',
  end_time: '2025-01-14',
  description: '',
  deleted: false,
  status: IterationStatus.IN_PROGRESS,
  updated_time: 0,
});

describe('matchIterations', () => {
  const iterations = [
    makeIteration(1, 'Sprint 2025.01'),
    makeIteration(2, 'Sprint 2025.02'),
    makeIteration(3, 'Sprint 2025.03'),
    makeIteration(4, 'Bugfix 2025.01'),
  ];

  it('按子字符串模糊匹配', () => {
    expect(matchIterations(iterations, '2025.01').map((i) => i.id)).toEqual([1, 4]);
  });

  it('不区分大小写', () => {
    expect(matchIterations(iterations, 'sprint').map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it('多关键字取并集', () => {
    expect(matchIterations(iterations, '2025.02,2025.03').map((i) => i.id)).toEqual([2, 3]);
  });

  it('空字符串关键字返回空数组', () => {
    expect(matchIterations(iterations, '')).toEqual([]);
    expect(matchIterations(iterations, '  ')).toEqual([]);
    expect(matchIterations(iterations, ',,')).toEqual([]);
  });

  it('无匹配返回空数组', () => {
    expect(matchIterations(iterations, 'nonexistent')).toEqual([]);
  });

  it('重复关键字结果去重', () => {
    expect(matchIterations(iterations, '2025.01,2025.01').map((i) => i.id)).toEqual([1, 4]);
  });

  it('保持原列表顺序', () => {
    const result = matchIterations(iterations, '2025.03,2025.01');
    expect(result.map((i) => i.id)).toEqual([1, 3, 4]);
  });

  it('正则元字符作为字面量匹配', () => {
    expect(matchIterations(iterations, '2025.01').length).toBeGreaterThan(0);
  });
});

describe('matchTerminalTypes', () => {
  const types = ['iOS', 'Android', 'Web', 'iOS Pad'];

  it('按子字符串模糊匹配', () => {
    expect(matchTerminalTypes(types, 'iOS')).toEqual(['iOS', 'iOS Pad']);
  });

  it('不区分大小写', () => {
    expect(matchTerminalTypes(types, 'ios')).toEqual(['iOS', 'iOS Pad']);
    expect(matchTerminalTypes(types, 'IOS')).toEqual(['iOS', 'iOS Pad']);
  });

  it('多关键字取并集', () => {
    expect(matchTerminalTypes(types, 'iOS,Android')).toEqual(['iOS', 'Android', 'iOS Pad']);
  });

  it('空字符串关键字返回空数组', () => {
    expect(matchTerminalTypes(types, '')).toEqual([]);
    expect(matchTerminalTypes(types, ' ')).toEqual([]);
  });

  it('无匹配返回空数组', () => {
    expect(matchTerminalTypes(types, 'Desktop')).toEqual([]);
  });

  it('重复关键字结果去重', () => {
    expect(matchTerminalTypes(types, 'iOS,iOS')).toEqual(['iOS', 'iOS Pad']);
  });

  it('保持原列表顺序', () => {
    expect(matchTerminalTypes(types, 'Web,iOS')).toEqual(['iOS', 'Web', 'iOS Pad']);
  });
});
```

- [ ] **Step 2: 运行测试确认全部通过**

```bash
npm test -- --testPathPattern="rebug-matchers"
```

Expected: 所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/__tests__/rebug-matchers.test.ts
git commit -m "test: add unit tests for matchIterations and matchTerminalTypes"
```
