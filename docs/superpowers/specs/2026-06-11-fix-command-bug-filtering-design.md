# Fix 命令 Bug 列表实时搜索过滤设计规范

**日期**: 2026-06-11  
**功能**: `codearts fix` 命令在选择 bug 阶段加入实时搜索过滤  
**优先级**: 中  
**影响范围**: `src/commands/fix.command.ts`、`package.json`

## 1. 概述

### 背景

`codearts fix` 命令目前使用 `@inquirer/prompts` 的 `checkbox` 组件让用户多选 bug。当用户手上的 bug 数量较多（典型场景：开发人员同时维护 10+ 个 bug）时，单纯靠方向键翻页寻找目标 bug 体验较差。

### 目标

在 `selectBugs` 函数中将原生 `checkbox` 替换为带实时搜索过滤能力的多选组件，使用户能够通过关键词快速定位目标 bug。

### 范围

- 仅修改 `src/commands/fix.command.ts` 中的 `selectBugs` 函数
- 新增 1 个 npm 依赖：`inquirerjs-checkbox-search@^2.0.1`
- 不影响 fix 命令的其他流程（数据加载、缺陷分析填写、提交等）
- 不影响其他命令

## 2. 设计决策

### 2.1 选型

| 候选方案 | 结论 |
|----------|------|
| A. `inquirerjs-checkbox-search@^2.0.1`（**采用**） | 官方 inquirer v13 生态，多选 + 实时搜索；API 与现有 `checkbox` 兼容；维护活跃（4 周前发版 v2.0.1） |
| B. 自实现搜索+多选 | 零依赖，但 readline/ANSI 控制复杂、维护成本高 |
| C. 两阶段：先 `@inquirer/search` 后 `checkbox` | 全官方组件，但交互断裂、要按两次回车 |

**选 A 的核心理由**：`inquirerjs-checkbox-search` 基于 `@inquirer/core@^11.1.2` 实现，与项目现有的 inquirer v13（同样使用 `@inquirer/core@^11.x`）共用同一套渲染层，兼容性已通过 `npm view` 验证。API 签名（`message/choices/pageSize/loop/required/validate/default`）与现有 `checkbox` 几乎一致，迁移成本极低。

### 2.2 过滤字段

搜索关键词同时匹配以下三个字段，命中任一即保留（不区分大小写的子串匹配）：

- `bug.id`：转字符串后匹配（支持按 bug 编号搜索，如 `12345`）
- `bug.name`：bug 标题
- `bug.status.name`：状态名（如 "进行中"、"已解决"）

### 2.3 自定义 filter 的必要性

`inquirerjs-checkbox-search` 的默认 `filter` 函数会对 `String(item.value)` 做匹配。本设计中 `value` 是 `IssueItem` 对象，`String(bug)` 会得到 `"[object Object]"`，无法命中任何关键词。**必须显式传入自定义 `filter` 函数**，针对上述三个字段做匹配。

### 2.4 空结果处理

用户选定"提示并提供退出选项"：`inquirerjs-checkbox-search` 原生支持 `Esc` 键清空搜索词重新过滤，无需额外代码即可让用户从"无匹配"状态中恢复。

如果用户希望完全退出 fix 命令，可通过 `Ctrl+C` 触发现有 `ExitPromptError` 处理逻辑（已存在于 `fixCommand` 第 193-194 行）。

### 2.5 Choice 构造

保持与现有 `checkbox` 一致的展示策略：

- `name`：`[${statusName}] ${title}`，标题 > 40 字符时截断为前 47 字符加 `...`
- `value`：`bug` 对象（`IssueItem`），保证 `selectBugs` 返回类型不变

### 2.6 pageSize

沿用原值 `10`。原因为：

- 与现有交互一致，不引入额外的认知负担
- 搜索过滤激活后，pageSize 内的项目数通常已收敛到 < 10
- 避免一次显示过多导致搜索结果滚动过快

## 3. 交互流程

### 阶段：Bug 选择（修改后）

```
显示搜索式多选界面
  ↓
  ┌─────────────────────────────────────────────┐
  │ ? 请选择要修复的 bug（输入关键词过滤，      │
  │   空格选择，回车确认）                       │
  │ (Tab to select, Enter to submit)            │
  │                                              │
  │ Search: <用户输入的关键词>                   │
  │                                              │
  │ ▶ ○ [进行中] 修复登录页跳转问题              │
  │   ○ [已解决] 优化列表性能                    │
  │   ○ [进行中] 修复支付回调失败                │
  │   ...（过滤后的列表）                        │
  └─────────────────────────────────────────────┘
  ↓
用户在 Search 框输入关键词 → 列表实时过滤
  ↓
按 Tab（在该组件中即空格）切换选中
  ↓
按 Esc 清空搜索词回到完整列表
  ↓
按 Enter 提交选中的 bug
  ↓
  - 选中 ≥1 个：进入下一阶段（缺陷分析填写）
  - 选中 0 个：视为取消，输出 "操作取消"
```

## 4. 技术实现

### 4.1 依赖变更

`package.json`：

```diff
   "dependencies": {
     "axios": "^1.5.0",
     "commander": "^14.0.3",
     "echarts": "^6.0.0",
+    "inquirerjs-checkbox-search": "^2.0.1",
     "inquirer": "^13.2.2",
     "ora": "^9.3.0",
     "picocolors": "^1.1.1"
   }
```

`inquirerjs-checkbox-search` 的子依赖（`@inquirer/core@^11.1.2`、`@inquirer/figures@^2.0.2`、`@inquirer/type@^4.0.2`）与项目现有的 `inquirer@^13.2.2` 内部依赖完全一致，npm 不会重复安装。

### 4.2 代码变更

`src/commands/fix.command.ts`：

```typescript
// 顶部 import 调整
- import { checkbox, confirm, input, select } from '@inquirer/prompts';
+ import { confirm, input, select } from '@inquirer/prompts';
+ import checkboxSearch from 'inquirerjs-checkbox-search';

// selectBugs 函数改造
- async function selectBugs(bugList: IssueItem[]): Promise<IssueItem[]> {
-   const bugChoices = bugList.map((bug) => {
-     const statusName = bug.status?.name || '未知状态';
-     const name = bug.name.length > 40 ? `${bug.name.slice(0, 47)}...` : bug.name;
-     const label = `[${statusName}] ${name}`;
-     return { name: label, value: bug };
-   });
-
-   const selectedBugs = await checkbox({
-     message: '请选择要修复的 bug（空格选择，回车确认）',
-     choices: bugChoices,
-     pageSize: 10,
-   });
-   return selectedBugs;
- }
+ async function selectBugs(bugList: IssueItem[]): Promise<IssueItem[]> {
+   const bugChoices = bugList.map((bug) => {
+     const statusName = bug.status?.name || '未知状态';
+     const name = bug.name.length > 40 ? `${bug.name.slice(0, 47)}...` : bug.name;
+     const label = `[${statusName}] ${name}`;
+     return { name: label, value: bug };
+   });
+
+   const selectedBugs = await checkboxSearch({
+     message: '请选择要修复的 bug（输入关键词过滤，空格选择，回车确认）',
+     choices: bugChoices,
+     pageSize: 10,
+     filter: (items, term) => {
+       if (!term.trim()) return items;
+       const lowerTerm = term.toLowerCase();
+       return items.filter((item) => {
+         const bug = item.value;
+         return (
+           String(bug.id).includes(lowerTerm) ||
+           bug.name.toLowerCase().includes(lowerTerm) ||
+           (bug.status?.name ?? '').toLowerCase().includes(lowerTerm)
+         );
+       });
+     },
+   });
+   return selectedBugs;
+ }
```

### 4.3 受影响接口

- `selectBugs(bugList: IssueItem[]): Promise<IssueItem[]>`：签名、返回类型不变
- `fixCommand(cliOptions?: CliOptions): Promise<void>`：无需修改（`Step 4` 调用 `selectBugs` 不变）
- 业务流程（`Step 5` ~ `Step 9`）：无任何修改

### 4.4 错误处理

- `inquirerjs-checkbox-search` 抛出的 `ExitPromptError`（用户 Ctrl+C）由 `fixCommand` 第 193-194 行的 `try-catch` 捕获并输出 "操作取消"，与现有行为一致
- 该包无异步加载逻辑（不使用 `source` 选项），不存在 `searchError` 分支

## 5. 风险与缓解

| 风险 | 严重性 | 缓解措施 |
|------|--------|----------|
| 第三方包 star 数少（1 star） | 中 | 依赖与官方 inquirer v13 完全兼容；维护活跃（4 周前 v2.0.1）；MIT 协议；如出现停止维护可平滑回退到原生 `checkbox`（仅需删除 import 与替换函数体） |
| 用户使用习惯变化 | 低 | `pageSize=10`、多选用 Tab（在该组件中等价于空格）键等核心交互保持不变 |
| `filter` 性能问题 | 低 | 客户端纯字符串匹配；bug 数量级（< 100）下无可观测开销 |
| 标题截断后用户看不到完整匹配 | 低 | 过滤基于完整 `bug.name`，搜索词匹配原文不受截断影响 |

## 6. 验证标准

### 6.1 构建与代码质量

- [ ] `npm install` 成功，无 peer dependency 冲突
- [ ] `npm run build` 成功（TypeScript 编译通过）
- [ ] `npx eslint src/commands/fix.command.ts` 无新增告警

### 6.2 功能验证

- [ ] bug 列表为空时仍能正确进入"无 bug"分支
- [ ] bug 列表 > pageSize 时，过滤关键词后列表能正确收敛
- [ ] 输入 bug 编号（如 `12345`）能匹配对应 bug
- [ ] 输入 bug 标题关键字能匹配
- [ ] 输入状态名（如"进行中"）能匹配对应 bug
- [ ] 搜索词区分大小写不影响匹配结果
- [ ] 按 Esc 清空搜索词能恢复完整列表
- [ ] 空格键（Tab 键）切换选中状态
- [ ] 回车提交选中的 bug，进入下一阶段
- [ ] 未选中任何 bug 时回车，返回 "操作取消"
- [ ] 选中多个 bug 后能进入缺陷分析填写流程
- [ ] Ctrl+C 仍能中断命令并显示"操作取消"

## 7. 文件变更清单

| 文件 | 类型 | 变更内容 |
|------|------|----------|
| `package.json` | 修改 | `dependencies` 新增 `"inquirerjs-checkbox-search": "^2.0.1"` |
| `package-lock.json` | 自动更新 | `npm install` 后自动生成 |
| `src/commands/fix.command.ts` | 修改 | 移除 `checkbox` 的 import；新增 `checkboxSearch` 的 import；改造 `selectBugs` 函数体 |

## 8. 备注

- 改造范围严格限定在 `selectBugs`，遵循"做小改动"原则
- 不引入新工具类、新配置项、新 CLI 参数
- 与 AGENTS.md 中的代码风格、命名约定保持一致
- 不需要新增测试用例（项目当前未对 `fix.command.ts` 编写单元测试）
