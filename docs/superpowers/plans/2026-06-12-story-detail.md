# Story Detail Subcommand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `codearts story detail` subcommand that queries one or more issues by ID, with optional comments, supporting both `console` and `json` output.

**Architecture:** Three-layer extension following project conventions — types in `src/types/index.ts`, low-level API in `src/services/api.service.ts`, batch/business logic in `src/services/business.service.ts`, command orchestration in `src/commands/story.command.ts`, CLI registration in `src/bin/cli.ts`.

**Tech Stack:** TypeScript 5.2+, Commander.js 14, Axios, picocolors, ora

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` | Add `CommentUserV4`, `IssueCommentV4`, `ListIssueCommentsV4Response` types |
| `src/services/api.service.ts` | Add `getIssueComments()` method calling `GET /v4/projects/{project_id}/issues/{issue_id}/comments` |
| `src/services/business.service.ts` | Add `getIssueCommentsBatch()` concurrent batch fetch |
| `src/commands/story.command.ts` | Add `storyDetailCommand()` + `outputDetailConsole()` + `StoryDetailResult` type |
| `src/bin/cli.ts` | Register `story detail` subcommand with `-c, --with-comments` flag |

No new files; all changes are additive to existing files.

---

## Task 1: Add Comment Types

**Files:**
- Modify: `src/types/index.ts` (append at end before final newline)

- [ ] **Step 1: Append the three new interfaces to `src/types/index.ts`**

Append after the `BugFixData` interface (the last interface in the file). The interfaces to add:

```typescript
// 工作项评论相关类型 (ListIssueCommentsV4)
export interface CommentUserV4 {
  nick_name: string;
  user_name: string;
  user_num_id: number;
}

export interface IssueCommentV4 {
  id: number;
  comment: string;
  created_time: string;
  timestamp: string;
  user: CommentUserV4;
}

export interface ListIssueCommentsV4Response {
  total: number;
  comments: IssueCommentV4[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add IssueCommentV4 and ListIssueCommentsV4Response types"
```

---

## Task 2: Add `getIssueComments` to ApiService

**Files:**
- Modify: `src/services/api.service.ts` (add method inside `ApiService` class)

- [ ] **Step 1: Update the imports block at the top of `src/services/api.service.ts`**

Current import block (lines 2-29) imports several types. Add `IssueCommentV4`, `ListIssueCommentsV4Response` to the destructured import from `'../types'`. The relevant imports to add (kept in alphabetical order matching existing style):

```typescript
  IssueCommentV4,
  IssueDetail,
  ListChildIssuesV2Response,
  ListChildIssuesV4Response,
  ListIssueCommentsV4Response,
  ListIssuesV4Request,
  ListIssuesV4Response,
```

(Add `IssueCommentV4,` before `IssueDetail,` and add `ListIssueCommentsV4Response,` after `ListChildIssuesV4Response,`.)

- [ ] **Step 2: Add the new method after `getIssueById` (after line 439) in `ApiService` class**

```typescript
  /**
   * 获取工作项的评论列表
   */
  async getIssueComments(
    projectId: string,
    issueId: number,
    offset: number = 0,
    limit: number = 100
  ): Promise<ApiResponse<ListIssueCommentsV4Response>> {
    return this.request(`/v4/projects/${projectId}/issues/${issueId}/comments`, {
      method: 'GET',
      params: { offset, limit },
    });
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/services/api.service.ts
git commit -m "feat(api): add getIssueComments for ListIssueCommentsV4 endpoint"
```

---

## Task 3: Add `getIssueCommentsBatch` to BusinessService

**Files:**
- Modify: `src/services/business.service.ts` (add method to `BusinessService` class)

- [ ] **Step 1: Update the imports block at the top of `src/services/business.service.ts`**

Current imports (lines 1-26) include several types from `'../types'`. Add `IssueCommentV4` in alphabetical position (after `Issue` prefix group, before `IssueDetail`):

Change the import block from:
```typescript
import {
  AllWorkHourStats,
  BugFixData,
  CustomField,
  CustomFieldId,
  CurrentUserInfo,
  HuaweiCloudConfig,
  IssueDetail,
  IssueItem,
  IssueItemV2,
  IssueNewCustomField,
```

To (insert `IssueCommentV4,` before `IssueDetail,`):
```typescript
import {
  AllWorkHourStats,
  BugFixData,
  CustomField,
  CustomFieldId,
  CurrentUserInfo,
  HuaweiCloudConfig,
  IssueCommentV4,
  IssueDetail,
  IssueItem,
  IssueItemV2,
  IssueNewCustomField,
```

- [ ] **Step 2: Add the batch method after `getIssueDetails` (after the closing `}` at line 1047)**

Insert after the `getIssueDetails` method (after line 1047, before the `parseDateToTimestamp` private method at line 1054):

```typescript
  /**
   * 并发批量获取工作项评论
   * @param projectId 项目ID
   * @param issueIds 工作项ID列表
   * @param concurrency 并发数，默认 10
   * @returns 映射：issueId -> { success, comments?, error? }
   */
  async getIssueCommentsBatch(
    projectId: string,
    issueIds: number[],
    concurrency: number = 10
  ): Promise<Map<number, { success: boolean; comments?: IssueCommentV4[]; error?: string }>> {
    const results = new Map<
      number,
      { success: boolean; comments?: IssueCommentV4[]; error?: string }
    >();

    for (let i = 0; i < issueIds.length; i += concurrency) {
      const batch = issueIds.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const response = await this.apiService.getIssueComments(projectId, id);
            if (response.success && response.data) {
              const sorted = [...response.data.comments].sort(
                (a, b) => Number(a.timestamp) - Number(b.timestamp)
              );
              return { id, success: true, comments: sorted };
            }
            return { id, success: false, error: response.error || '未知错误' };
          } catch (error) {
            logger.warn(`获取工作项 ${id} 评论失败: ${String(error)}`);
            return { id, success: false, error: String(error) };
          }
        })
      );
      batchResults.forEach((r) => {
        results.set(r.id, {
          success: r.success,
          comments: r.comments,
          error: r.error,
        });
      });
    }

    return results;
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/services/business.service.ts
git commit -m "feat(business): add getIssueCommentsBatch for concurrent issue comments"
```

---

## Task 4: Add `storyDetailCommand` and Console Formatter

**Files:**
- Modify: `src/commands/story.command.ts` (append new exports at end of file)

- [ ] **Step 1: Update the imports block at the top of `src/commands/story.command.ts`**

Current imports (lines 1-16). Add `IssueCommentV4` to the type import. Replace the import block:

```typescript
import { checkbox, select } from '@inquirer/prompts';
import ora from 'ora';
import pc from 'picocolors';
import { BusinessService } from '../services/business.service';
import {
  ConfigKey,
  CustomFieldId,
  IssueCommentV4,
  IssueDetail,
  IssueItem,
  IssueItemV2,
  IssueStatusId,
  IssueTrackerId,
  ProjectMember,
} from '../types';
import { CliOptions, getConfig, loadConfig } from '../utils/config-loader';
import { issueLink } from '../utils/console';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';
```

(`IssueCommentV4` inserted in alphabetical order before `IssueDetail`; `pc from 'picocolors'` added at top with other module imports.)

- [ ] **Step 2: Append the new types and functions at the end of `src/commands/story.command.ts`**

```typescript
export interface StoryDetailResult {
  id: number;
  success: boolean;
  detail?: IssueDetail;
  comments?: IssueCommentV4[];
  error?: string;
}

function statusColor(statusName: string): (text: string) => string {
  const map: Record<string, (text: string) => string> = {
    进行中: pc.cyan,
    已解决: pc.green,
    已关闭: pc.gray,
    已拒绝: pc.red,
    测试中: pc.yellow,
    重新打开: pc.red,
    新问题: pc.red,
    新需求: pc.blue,
  };
  return map[statusName] || ((text: string) => text);
}

function formatTimestamp(ts: string): string {
  if (!ts) {
    return '';
  }
  const n = Number(ts);
  if (isNaN(n)) {
    return ts;
  }
  const d = new Date(n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function outputDetailConsole(
  results: StoryDetailResult[],
  projectId: string,
  withComments: boolean
): void {
  results.forEach((result, index) => {
    logger.info('');
    if (!result.success || !result.detail) {
      logger.info(pc.red(`[${index + 1}] #${result.id} ✗ 查询失败: ${result.error || '未知错误'}`));
      return;
    }
    const d = result.detail;
    const status = d.status?.name || '-';
    logger.info(
      pc.bold(`[${index + 1}] #${d.id}  ${d.name}`) +
        (d.deleted ? pc.red(' [已删除]') : '')
    );
    logger.info(
      `    状态: ${statusColor(status)(status)}   类型: ${d.tracker?.name || '-'}   优先级: ${d.priority?.name || '-'}   重要程度: ${d.severity?.name || '-'}`
    );
    logger.info(
      `    处理人: ${d.assigned_user?.nick_name || d.assigned_user?.name || '-'}   开发人员: ${d.developer?.nick_name || d.developer?.name || '-'}   创建人: ${d.creator?.nick_name || d.creator?.name || '-'}`
    );
    logger.info(
      `    迭代: ${d.iteration?.name || '-'}   模块: ${d.module?.name || '-'}   领域: ${d.domain?.name || '-'}`
    );
    logger.info(
      `    预计工时: ${d.expected_work_hours ?? 0}h   实际工时: ${d.actual_work_hours ?? 0}h   完成度: ${d.done_ratio ?? 0}%`
    );
    logger.info(
      `    创建: ${d.created_time || '-'}   更新: ${d.updated_time || '-'}   关闭: ${d.closed_time || '-'}`
    );
    logger.info(`    链接: ${issueLink(projectId, d.id)}`);

    if (withComments) {
      if (!result.comments || result.comments.length === 0) {
        logger.info(pc.gray('    评论 (0): 无'));
      } else {
        logger.info(`    评论 (${result.comments.length}):`);
        result.comments.forEach((c) => {
          const time = formatTimestamp(c.timestamp);
          const author = c.user?.nick_name || c.user?.user_name || '匿名';
          const text = c.comment.replace(/<[^>]+>/g, '').trim();
          logger.info(pc.gray(`      [${time}] ${author}: ${text}`));
        });
      }
      if (result.error) {
        logger.info(pc.yellow(`    警告: ${result.error}`));
      }
    }
  });
}

export async function storyDetailCommand(
  ids: string[],
  cliOptions: CliOptions & { withComments?: boolean } = {}
): Promise<void> {
  const issueIds = ids
    .map((id) => parseInt(id, 10))
    .filter((n) => !isNaN(n) && n > 0);

  if (issueIds.length === 0) {
    logger.error('未提供有效的工作项 ID');
    return;
  }

  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);
  const withComments = cliOptions.withComments ?? false;

  const spinner = ora('正在查询工作项详情...').start();
  const details = await businessService.getIssueDetails(projectId, issueIds, 10);
  spinner.stop();

  const detailMap = new Map(details.map((d) => [d.id, d]));
  const results: StoryDetailResult[] = issueIds.map((id) => {
    const detail = detailMap.get(id);
    if (!detail) {
      return { id, success: false, error: '未找到该工作项或无访问权限' };
    }
    return { id, success: true, detail };
  });

  if (withComments) {
    const commentSpinner = ora('正在查询评论...').start();
    const commentResults = await businessService.getIssueCommentsBatch(
      projectId,
      results.filter((r) => r.success).map((r) => r.id)
    );
    commentSpinner.stop();
    results.forEach((r) => {
      if (r.success) {
        const c = commentResults.get(r.id);
        if (c?.success) {
          r.comments = c.comments;
        } else {
          r.comments = [];
          if (c && !c.success) {
            r.error = `评论获取失败: ${c.error}`;
          }
        }
      }
    });
  }

  if (outputFormat === 'json') {
    logger.json(results);
  } else {
    outputDetailConsole(results, projectId, withComments);
    const failedCount = results.filter((r) => !r.success).length;
    if (failedCount > 0) {
      logger.warn(`共 ${failedCount} 个工作项查询失败`);
    }
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run ESLint on the modified file**

Run: `npx eslint src/commands/story.command.ts`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/commands/story.command.ts
git commit -m "feat(story): add storyDetailCommand with -c/--with-comments flag"
```

---

## Task 5: Register `story detail` Subcommand in CLI

**Files:**
- Modify: `src/bin/cli.ts` (add subcommand registration inside the `storyCmd` block)

- [ ] **Step 1: Update the imports at the top of `src/bin/cli.ts`**

Current import line for story.command (line 16):

```typescript
import { storyAllCommand, storySingleCommand } from '../commands/story.command';
```

Change to:

```typescript
import {
  storyAllCommand,
  storyDetailCommand,
  storySingleCommand,
} from '../commands/story.command';
```

- [ ] **Step 2: Add the new subcommand registration after the `story single` block (after line 159, before the empty line preceding the `rebugCmd` block)**

```typescript
storyCmd
  .command('detail <ids...>')
  .description('查询工作项详情，支持多个 ID 和可选评论查询')
  .option('-c, --with-comments', '同时查询每个工作项的评论')
  .action(async (ids, options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      withComments: options.withComments,
    };
    logger.setOutputFormat(cliOptions.output);
    await storyDetailCommand(ids, cliOptions);
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Verify the CLI parses help correctly**

Run: `npx ts-node src/bin/cli.ts story detail --help`
Expected: output displays the help text including `<ids...>`, `-c, --with-comments`, and the description

- [ ] **Step 5: Run ESLint**

Run: `npx eslint src/bin/cli.ts`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/bin/cli.ts
git commit -m "feat(cli): register story detail subcommand"
```

---

## Task 6: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full TypeScript build**

Run: `npm run build`
Expected: builds without errors. The build script removes `dist/`, runs `tsc`, and re-links the CLI.

- [ ] **Step 2: Run ESLint on the whole project**

Run: `npx eslint "src/**/*.ts"`
Expected: no errors

- [ ] **Step 3: Run Prettier check**

Run: `npx prettier --check "src/**/*.ts"`
Expected: all files report `All matched files use Prettier code style!`

- [ ] **Step 4: Manual smoke test (requires valid config)**

The following require `codearts config` to have been run previously with valid credentials. If config is not available, skip these steps.

Run: `codearts story detail 12345` (replace with a real issue ID)
Expected: shows a card-style block for the issue, exit code 0

Run: `codearts story detail 12345 67890` (replace with two real IDs)
Expected: shows two card-style blocks, one after the other

Run: `codearts story detail -c 12345` (replace with a real issue ID that has comments)
Expected: shows the issue card followed by a "评论 (N):" list

Run: `codearts story detail --output json 12345 67890`
Expected: prints a single JSON array to stdout containing two result objects (no logs/spinners text leaking into the JSON output)

- [ ] **Step 5: Commit any formatting fixes if Prettier reformatted files in Step 3**

```bash
git status
# If any file was reformatted:
git add -u
git commit -m "style: apply prettier formatting"
```

---

## Self-Review Notes

**Spec coverage:**

| Spec Requirement | Task |
|------------------|------|
| Add `CommentUserV4`, `IssueCommentV4`, `ListIssueCommentsV4Response` types | Task 1 |
| Add `getIssueComments` to `ApiService` | Task 2 |
| Add `getIssueCommentsBatch` to `BusinessService` with concurrency | Task 3 |
| Add `storyDetailCommand` + `StoryDetailResult` to `src/commands/story.command.ts` | Task 4 |
| Add `outputDetailConsole` formatter with card layout, status colors, link | Task 4 |
| Register `story detail` subcommand with `-c, --with-comments` flag in `src/bin/cli.ts` | Task 5 |
| Error handling: per-issue failures recorded, others continue | Task 4 |
| JSON output: structured array, no spinner/log interference | Task 4 (uses `logger.json` which respects `silent` mode set by `setOutputFormat` in CLI action) |

**Placeholder scan:** No "TBD"/"TODO" in steps. All code blocks contain the actual implementation.

**Type consistency:** All method signatures and property names match across tasks (`getIssueComments`, `getIssueCommentsBatch`, `StoryDetailResult`, `withComments`).
