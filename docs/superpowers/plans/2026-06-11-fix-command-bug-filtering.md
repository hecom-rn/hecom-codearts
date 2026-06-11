# Fix 命令 Bug 列表搜索过滤实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `codearts fix` 命令的 bug 选择阶段加入实时关键词搜索过滤，提升 bug 数量较多时的定位效率。

**Architecture:** 在 `selectBugs` 内部将 `@inquirer/prompts` 的 `checkbox` 替换为 `inquirerjs-checkbox-search@^2.0.1`（基于官方 `@inquirer/core@^11.1.2`，与项目 inquirer v13 完全兼容）。通过自定义 `filter` 函数，对 `bug.id`（字符串形式）、`bug.name`、`bug.status.name` 做不区分大小写的子串匹配。`selectBugs` 签名、返回类型、外层调用均不变。

**Tech Stack:** TypeScript 5.2+、Node.js >= 23、`@inquirer/prompts` v13、`inquirerjs-checkbox-search` v2.0.1

**参考规范：** `docs/superpowers/specs/2026-06-11-fix-command-bug-filtering-design.md`

---

## 文件结构

| 文件 | 类型 | 职责 |
|------|------|------|
| `package.json` | 修改 | 新增 `inquirerjs-checkbox-search` 依赖声明 |
| `package-lock.json` | 自动生成 | `npm install` 同步生成 |
| `src/commands/fix.command.ts` | 修改 | 移除 `checkbox` import；新增 `checkboxSearch` import；改造 `selectBugs` 函数体 |

无新增文件。`fixCommand`、`business.service.ts`、其他命令均不修改。

---

## Task 1: 添加依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 编辑 `package.json`，在 `dependencies` 中新增 `inquirerjs-checkbox-search`**

在 `package.json` 第 53 行（`"inquirer": "^13.2.2",`）之前插入一行，使新依赖按字母序位于 `inquirer` 之前：

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

- [ ] **Step 2: 安装依赖**

Run:
```bash
npm install
```

Expected: 安装成功；`inquirerjs-checkbox-search@2.0.x` 出现在 `node_modules/`；无 `peer dependency` 冲突警告；`package-lock.json` 自动更新。

- [ ] **Step 3: 验证依赖可被解析**

Run:
```bash
node -e "console.log(require('inquirerjs-checkbox-search'))"
```

Expected: 输出 `[Function: createPrompt]` 包装的函数（默认导出的 prompt 函数），进程退出码 0。

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "deps: add inquirerjs-checkbox-search for fix command bug filtering"
```

---

## Task 2: 改造 `selectBugs` 函数

**Files:**
- Modify: `src/commands/fix.command.ts:1`（import 调整）
- Modify: `src/commands/fix.command.ts:206-225`（函数体改造）

- [ ] **Step 1: 修改 import 语句**

在 `src/commands/fix.command.ts` 第 1 行：

```diff
- import { checkbox, confirm, input, select } from '@inquirer/prompts';
+ import { confirm, input, select } from '@inquirer/prompts';
+ import checkboxSearch from 'inquirerjs-checkbox-search';
```

- [ ] **Step 2: 替换 `selectBugs` 函数体**

将 `src/commands/fix.command.ts` 第 206-225 行（原 `selectBugs` 函数）整体替换为：

```typescript
async function selectBugs(bugList: IssueItem[]): Promise<IssueItem[]> {
  const bugChoices = bugList.map((bug) => {
    const statusName = bug.status?.name || '未知状态';
    const name = bug.name.length > 40 ? `${bug.name.slice(0, 47)}...` : bug.name;
    const label = `[${statusName}] ${name}`;

    return {
      name: label,
      value: bug,
    };
  });

  const selectedBugs = await checkboxSearch({
    message: '请选择要修复的 bug（输入关键词过滤，空格选择，回车确认）',
    choices: bugChoices,
    pageSize: 10,
    filter: (items, term) => {
      if (!term.trim()) {
        return items;
      }
      const lowerTerm = term.toLowerCase();
      return items.filter((item) => {
        const bug = item.value;
        return (
          String(bug.id).includes(lowerTerm) ||
          bug.name.toLowerCase().includes(lowerTerm) ||
          (bug.status?.name ?? '').toLowerCase().includes(lowerTerm)
        );
      });
    },
  });

  return selectedBugs;
}
```

- [ ] **Step 3: 检查 diff 完整性**

Run:
```bash
git diff src/commands/fix.command.ts
```

Expected: 仅包含第 1 步（import 调整）和第 2 步（函数体替换）的变更；其他逻辑（`fixCommand`、`checkIsCustomerFeedback`、`showSummaryAndConfirm` 等）无任何改动。

- [ ] **Step 4: 提交**

```bash
git add src/commands/fix.command.ts
git commit -m "feat(fix): add real-time search filtering to bug selection"
```

---

## Task 3: 构建与代码质量验证

**Files:** 无

- [ ] **Step 1: TypeScript 编译**

Run:
```bash
npm run build
```

Expected: 编译成功；`dist/commands/fix.command.js` 与 `dist/commands/fix.command.d.ts` 重新生成；无 TypeScript 错误。

- [ ] **Step 2: ESLint 检查**

Run:
```bash
npx eslint src/commands/fix.command.ts
```

Expected: 退出码 0；无新增告警或错误（与变更前等价）。若之前已有告警，数量不应增加。

- [ ] **Step 3: 检查无意外的文件残留**

Run:
```bash
git status --short
```

Expected: 工作区干净（除前述三个 commit 涉及的 `package.json`、`package-lock.json`、`src/commands/fix.command.ts` 之外，无未跟踪或已修改文件）。

- [ ] **Step 4: 提交验证结果（如有需要）**

若前几步产生了中间文件（如 `dist/` 构建产物），按项目惯例决定是否清理。本项目 `package.json` 未将 `dist/` 列入 `.gitignore`（已存在），所以 `npm run build` 的产物不会被 git 跟踪，无需提交。

---

## 验证清单（人工执行）

实现完成后，请在本地手动验证以下场景：

- [ ] bug 列表为空时仍走 "当前用户没有分配的 bug" 分支
- [ ] bug 列表 > 10 时，输入 bug 编号能正确过滤
- [ ] 输入 bug 标题关键字能正确过滤
- [ ] 输入状态名（如"进行中"）能正确过滤
- [ ] 大小写混合的搜索词能正确匹配（小写比较生效）
- [ ] Esc 键清空搜索词能恢复完整列表
- [ ] 空格（或 Tab）键切换选中状态正常
- [ ] 回车提交后进入缺陷分析填写流程
- [ ] Ctrl+C 中断时显示 "操作取消"

---

## 回滚方案

若运行时发现 `inquirerjs-checkbox-search` 存在未预期问题：

1. `git revert` 上述 3 个 commit（或 `git reset --hard HEAD~3`）
2. `npm install` 同步还原
3. 回到原始 `checkbox` 实现

回滚后 `selectBugs` 函数恢复为：

```typescript
async function selectBugs(bugList: IssueItem[]): Promise<IssueItem[]> {
  const bugChoices = bugList.map((bug) => {
    const statusName = bug.status?.name || '未知状态';
    const name = bug.name.length > 40 ? `${bug.name.slice(0, 47)}...` : bug.name;
    const label = `[${statusName}] ${name}`;

    return {
      name: label,
      value: bug,
    };
  });

  const selectedBugs = await checkbox({
    message: '请选择要修复的 bug（空格选择，回车确认）',
    choices: bugChoices,
    pageSize: 10,
  });

  return selectedBugs;
}
```

Import 恢复为：

```typescript
import { checkbox, confirm, input, select } from '@inquirer/prompts';
```
