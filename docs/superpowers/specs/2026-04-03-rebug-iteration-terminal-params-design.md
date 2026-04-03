# rebug 命令新增迭代和终端类型参数

**日期**: 2026-04-03  
**状态**: 已批准

---

## 背景

`rebug chart` 和 `rebug no-tag` 子命令目前只支持交互式选择迭代和终端类型。  
本需求为两个子命令新增 CLI 参数，当参数匹配到对应结果时自动跳过交互式选择，提升 CI/自动化场景的使用体验。

---

## 需求

1. `rebug chart` 和 `rebug no-tag` 均新增 `--iteration, -i` 和 `--terminal, -t` 两个可选参数
2. 匹配逻辑宽松（模糊、不区分大小写、支持逗号分隔多关键字）
3. 命中则跳过对应的 `checkbox` 交互；未命中则打印提示后回退到交互式选择

---

## 设计

### CLI 参数（`src/bin/cli.ts`）

`rebug chart` 和 `rebug no-tag` 各自新增：

```
-i, --iteration <keywords>   迭代关键字（逗号分隔，模糊匹配迭代名称）
-t, --terminal <keywords>    终端类型关键字（逗号分隔，模糊匹配选项）
```

通过 `cliOptions` 传入命令函数。

### CliOptions 接口（`src/utils/config-loader.ts`）

新增两个可选字段：

```typescript
iteration?: string;  // 迭代关键字（逗号分隔）
terminal?: string;   // 终端类型关键字（逗号分隔）
```

### 匹配函数（`src/commands/rebug.command.ts`）

在文件顶部提取两个纯函数：

```typescript
function matchIterations(iterations: IterationInfo[], keywords: string): IterationInfo[];
function matchTerminalTypes(options: string[], keywords: string): string[];
```

**匹配算法**：

- 将 `keywords` 按逗号拆分为关键字数组，去空格
- 每个关键字对目标列表做 `toLowerCase().includes(keyword.toLowerCase())` 匹配
- 返回所有命中结果的并集（去重）

### selectBugsInteractive 函数逻辑

**迭代选择：**

1. 若 `cliOptions.iteration` 有值 → 调用 `matchIterations`
2. 命中 >= 1 → 直接使用，跳过 `checkbox`
3. 命中 0 → `logger.warn('迭代参数未匹配到任何结果，请手动选择')` → 回退交互

**终端类型选择：**

1. 若 `cliOptions.terminal` 有值 → 调用 `matchTerminalTypes`
2. 命中 >= 1 → 直接使用，跳过 `checkbox`
3. 命中 0 → `logger.warn('终端类型参数未匹配到任何结果，请手动选择')` → 回退交互

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

# 多迭代多终端
codearts rebug no-tag -i "2025.01,2025.02" -t "iOS,Android"

# 未匹配时自动回退到交互式选择
codearts rebug chart -i "nonexistent"
# > [WARN] 迭代参数未匹配到任何结果，请手动选择
# > [交互式迭代选择界面]
```
