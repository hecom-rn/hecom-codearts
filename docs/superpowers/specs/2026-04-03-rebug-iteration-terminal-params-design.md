# rebug 命令新增迭代和终端类型参数

**日期**: 2026-04-03  
**状态**: 已批准

---

## 背景

`rebug chart` 和 `rebug no-tag` 子命令目前只支持交互式选择迭代和终端类型。  
本需求为两个子命令新增 CLI 参数，当参数匹配到对应结果时自动跳过交互式选择，提升 CI/自动化场景的使用体验。

---

## 需求

1. `rebug chart` 和 `rebug no-tag` 均新增 `-i, --iteration` 和 `-t, --terminal` 两个可选参数
2. 匹配逻辑宽松：模糊、不区分大小写、支持逗号分隔多关键字（取并集）
3. 命中则跳过对应的 `checkbox` 交互；未命中则打印提示（含关键字内容）后回退到交互式选择
4. 空字符串/纯空白关键字视为"未提供"，直接进入交互式选择

---

## 设计

### CLI 参数（`src/bin/cli.ts`）

`rebug chart` 和 `rebug no-tag` 各自新增（两个子命令代码一致）：

```typescript
rebugCmd
  .command('chart')
  .description('多维度 ECharts 可视化分析报告')
  .option('-i, --iteration <keywords>', '迭代关键字（逗号分隔，模糊匹配迭代名称）')
  .option('-t, --terminal <keywords>', '终端类型关键字（逗号分隔，模糊匹配选项）')
  .option('--output-dir <path>', '输出 HTML 报告的目录（默认系统 cache 目录）')
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

`rebug no-tag` 同理，传入 `iteration`、`terminal`、`developer`。

### CliOptions 接口（`src/utils/config-loader.ts`）

新增两个可选字段（与现有 `developer` 命名风格一致）：

```typescript
export interface CliOptions {
  role?: string;
  output?: string;
  report?: boolean;
  outputDir?: string;
  developer?: string;
  iteration?: string; // 迭代关键字（逗号分隔）
  terminal?: string; // 终端类型关键字（逗号分隔）
}
```

### 匹配函数（`src/commands/rebug.command.ts` 文件顶部）

提取两个纯函数：

```typescript
function matchIterations(iterations: IterationInfo[], keywords: string): IterationInfo[];
function matchTerminalTypes(options: string[], keywords: string): string[];
```

**匹配算法**：

1. 将 `keywords` 按逗号拆分，每项 `trim()`，过滤掉空字符串
2. 若拆分后关键字数组为空，返回空数组（调用方将此视为"无匹配，回退交互"）
3. 每个非空关键字对目标列表做 `target.toLowerCase().includes(keyword.toLowerCase())` 匹配
4. 返回所有命中结果的并集（使用 Set 去重）
5. 关键字包含正则元字符时，使用 `includes()` 字面匹配，不做正则解析

### selectBugsInteractive 控制流（`src/commands/rebug.command.ts`）

**迭代选择：**

```
if (cliOptions.iteration 有值且非空) {
  matched = matchIterations(iterations, cliOptions.iteration);
  if (matched.length > 0) {
    selectedIterations = matched;  // 跳过 checkbox
  } else {
    logger.warn(`迭代关键字 "${cliOptions.iteration}" 未匹配到任何结果，请手动选择`);
    selectedIterations = await checkbox({ /* ... */ });  // 回退交互
  }
} else {
  selectedIterations = await checkbox({ /* ... */ });  // 无参数，直接交互
}
```

**终端类型选择：**

```
if (cliOptions.terminal 有值且非空) {
  matched = matchTerminalTypes(terminalTypeOptions, cliOptions.terminal);
  if (matched.length > 0) {
    selectedTerminalTypes = matched;  // 跳过 checkbox
  } else {
    logger.warn(`终端类型关键字 "${cliOptions.terminal}" 未匹配到任何结果，请手动选择`);
    selectedTerminalTypes = await checkbox({ /* ... */ });  // 回退交互
  }
} else {
  selectedTerminalTypes = await checkbox({ /* ... */ });  // 无参数，直接交互
}
```

---

## 边界条件处理

| 情况                          | 行为                                               |
| ----------------------------- | -------------------------------------------------- |
| 空字符串 `-i ""`              | 视为未提供，直接交互式选择                         |
| 纯空白 `-i "  "`              | trim 后为空，视为未提供，直接交互式选择            |
| 全逗号 `-i ",,"`              | 拆分后全为空字符串，视为未提供，直接交互式选择     |
| 大小写不一致 `-t "ios"`       | 不区分大小写，可匹配 "iOS"                         |
| 包含正则元字符 `-i "2025.01"` | 使用 `includes()` 字面匹配，`.` 不作为通配符       |
| 重复关键字 `-i "2025,2025"`   | 结果去重，不返回重复迭代                           |
| 未匹配任何结果                | 打印含关键字内容的 warn 日志，回退到 checkbox 交互 |
| 交互式回退后                  | checkbox 仍保持"至少选 1 项"的校验                 |

---

## 改动范围

| 文件                            | 改动                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/utils/config-loader.ts`    | `CliOptions` 新增 `iteration?` 和 `terminal?`                                                 |
| `src/commands/rebug.command.ts` | 新增 `matchIterations`、`matchTerminalTypes` 纯函数；`selectBugsInteractive` 加入匹配跳过逻辑 |
| `src/bin/cli.ts`                | `rebug chart` 和 `rebug no-tag` 各自新增 `-i`/`--iteration` 和 `-t`/`--terminal` 选项         |

---

## 使用示例

```bash
# 匹配含 "2025.01" 的迭代，终端类型含 "iOS"
codearts rebug chart -i "2025.01" -t "iOS"

# 多迭代多终端（逗号分隔）
codearts rebug no-tag -i "2025.01,2025.02" -t "iOS,Android"

# 未匹配时自动回退到交互式选择
codearts rebug chart -i "nonexistent"
# > [WARN] 迭代关键字 "nonexistent" 未匹配到任何结果，请手动选择
# > [交互式迭代选择界面]

# 短参数形式
codearts rebug chart -i "Sprint 5" -t "移动端"
```
