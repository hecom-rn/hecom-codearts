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

interface StoryTaskContext {
  businessService: BusinessService;
  projectId: string;
  roleIds: number[];
  version: string;
  developmentEnd: string;
  stories: IssueItem[];
  storyTaskMap: Map<number, IssueItemV2[]>;
}

function normalizeVersionValue(version: string): string {
  return version.toLowerCase().replace(/[\s._\-()[\]【】]+/g, '');
}

function extractVersionDigits(version: string): string {
  return version.replace(/\D/g, '');
}

function isSubsequence(input: string, target: string): boolean {
  if (!input) {
    return false;
  }

  let targetIndex = 0;

  for (const char of input) {
    targetIndex = target.indexOf(char, targetIndex);
    if (targetIndex === -1) {
      return false;
    }
    targetIndex++;
  }

  return true;
}

function scoreVersionCandidate(input: string, candidate: string): number {
  const normalizedInput = normalizeVersionValue(input);
  const normalizedCandidate = normalizeVersionValue(candidate);
  const inputDigits = extractVersionDigits(input);
  const candidateDigits = extractVersionDigits(candidate);

  if (!normalizedInput || !normalizedCandidate) {
    return 0;
  }

  if (normalizedInput === normalizedCandidate) {
    return 100;
  }

  if (inputDigits && inputDigits === candidateDigits) {
    return 95;
  }

  if (
    normalizedCandidate.includes(normalizedInput) ||
    normalizedInput.includes(normalizedCandidate)
  ) {
    return 80;
  }

  if (inputDigits && candidateDigits) {
    if (candidateDigits.includes(inputDigits) || inputDigits.includes(candidateDigits)) {
      return 75;
    }

    const inputNumber = Number(inputDigits);
    const candidateNumber = Number(candidateDigits);
    if (Number.isSafeInteger(inputNumber) && Number.isSafeInteger(candidateNumber)) {
      const diff = Math.abs(inputNumber - candidateNumber);
      if (diff <= 20) {
        return 60 - diff;
      }
    }
  }

  if (
    isSubsequence(normalizedInput, normalizedCandidate) ||
    isSubsequence(normalizedCandidate, normalizedInput)
  ) {
    return 50;
  }

  return 0;
}

function suggestVersionOptions(input: string, options: string[]): string[] {
  return options
    .map((option) => ({
      option,
      score: scoreVersionCandidate(input, option),
    }))
    .filter((item) => item.score >= 50)
    .sort((a, b) => b.score - a.score || a.option.localeCompare(b.option, 'zh-CN'))
    .slice(0, 5)
    .map((item) => item.option);
}

async function resolveStoryVersion(
  businessService: BusinessService,
  projectId: string,
  version: string
): Promise<string> {
  const optionsMap = await businessService.getCustomFieldOptions(projectId, [
    CustomFieldId.VERSION,
  ]);
  const versionOptions = optionsMap[CustomFieldId.VERSION] || [];
  const matchedVersion = versionOptions.find((option) => option === version);

  if (matchedVersion) {
    return matchedVersion;
  }

  const suggestions = suggestVersionOptions(version, versionOptions);
  const suggestionMessage = suggestions.length > 0 ? `，可能的版本：${suggestions.join('、')}` : '';

  throw new Error(`版本 ${version} 不存在${suggestionMessage}`);
}

function getDevelopmentEnd(): string {
  const developmentEnd = getConfig()[ConfigKey.DEVELOPMENT_END];

  if (!developmentEnd) {
    throw new Error('缺少开发端配置，请先执行 codearts config development-end');
  }

  return developmentEnd;
}

function isCurrentDevelopmentTask(issue: IssueItemV2, developmentEnd: string): boolean {
  return (
    issue.tracker?.id === IssueTrackerId.TASK &&
    isActiveIssueStatus(issue.status?.id) &&
    issue.customValueNew?.[CustomFieldId.DEVELOPMENT_END] === developmentEnd
  );
}

function isActiveIssueStatus(statusId?: number): boolean {
  return statusId !== IssueStatusId.REJECTED && statusId !== IssueStatusId.CLOSED;
}

async function loadStoryTaskContext(
  version: string,
  cliOptions: CliOptions = {}
): Promise<StoryTaskContext> {
  const { projectId, roleIds, config } = loadConfig(cliOptions);
  const developmentEnd = getDevelopmentEnd();
  const businessService = new BusinessService(config);
  const resolvedVersion = await resolveStoryVersion(businessService, projectId, version);

  const stories = (
    await businessService.getStoriesByVersionAndDevelopmentEnd(
      projectId,
      resolvedVersion,
      developmentEnd
    )
  ).filter((story) => isActiveIssueStatus(story.status?.id));
  const storyTaskMap = new Map<number, IssueItemV2[]>();

  for (const story of stories) {
    const childIssues = await businessService.getChildIssues(projectId, String(story.id));
    storyTaskMap.set(
      story.id,
      childIssues.filter((issue) => isCurrentDevelopmentTask(issue, developmentEnd))
    );
  }

  return {
    businessService,
    projectId,
    roleIds,
    version: resolvedVersion,
    developmentEnd,
    stories,
    storyTaskMap,
  };
}

async function selectStories(context: StoryTaskContext): Promise<IssueItem[]> {
  return await checkbox({
    message: '请选择要拆解 Task 的 Story：',
    choices: context.stories
      .sort((a, b) => a.assigned_user?.id - b.assigned_user?.id)
      .map((story) => {
        const tasks = context.storyTaskMap.get(story.id) || [];
        const taskUser = tasks.map((issue) => issue.assigned_to?.assignedNickName).join(', ');
        const hasTasks = tasks.length > 0;
        const assigneePart = `[${story.assigned_user?.nick_name || '未知处理人'}]`;
        const taskPart = taskUser ? `(已有Task:${taskUser})` : '';
        const label = `${assigneePart}${story.name}${taskPart}`;
        return {
          name: hasTasks ? label : `\x1b[33m${label}\x1b[0m`,
          value: story,
        };
      }),
    validate: (answer) => (answer.length > 0 ? true : '至少需要选择一个 Story'),
    pageSize: 10,
    theme: globalTheme,
  });
}

async function selectAssignee(
  businessService: BusinessService,
  projectId: string,
  roleIds: number[]
): Promise<ProjectMember> {
  const members = await businessService.getMembers(projectId, roleIds);
  const availableMembers = members.filter((member) => member.forbidden === 0);

  if (availableMembers.length === 0) {
    throw new Error('当前配置角色下没有可选人员');
  }

  return await select({
    message: '请选择 Task 处理人：',
    choices: availableMembers.map((member) => ({
      name: `${member.nick_name || member.user_name}（${member.role_name}）`,
      value: member,
    })),
    pageSize: 10,
    theme: globalTheme,
  });
}

async function createTasks(
  context: StoryTaskContext,
  stories: IssueItem[],
  assignedId?: number
): Promise<number> {
  let createdCount = 0;

  for (const story of stories) {
    await context.businessService.createStoryTask(
      context.projectId,
      story,
      context.version,
      context.developmentEnd,
      assignedId
    );
    createdCount++;
    logger.info(`已创建：${story.name} -> ${issueLink(context.projectId, story.id)}`);
  }

  return createdCount;
}

async function createTasksWithSpinner(
  context: StoryTaskContext,
  stories: IssueItem[],
  assignedId?: number
): Promise<number | null> {
  const createSpinner = ora(`正在创建 ${stories.length} 条 Task...`).start();

  try {
    const createdCount = await createTasks(context, stories, assignedId);
    createSpinner.succeed(`创建完成，共创建 ${createdCount} 条 Task`);
    return createdCount;
  } catch (error) {
    createSpinner.fail('创建 Task 失败');
    logger.error(`${String(error)}`);
    return null;
  }
}

export async function storyAllCommand(version: string, cliOptions: CliOptions = {}): Promise<void> {
  const spinner = ora('正在查询 Story 和子 Task...').start();

  const context = await loadStoryTaskContext(version, cliOptions);
  spinner.succeed('查询完成');

  if (context.stories.length === 0) {
    logger.warn(`未查询到版本 ${version}、开发端 ${context.developmentEnd} 的 Story`);
    return;
  }

  const targetStories = context.stories.filter(
    (story) => (context.storyTaskMap.get(story.id)?.length || 0) === 0
  );

  if (targetStories.length === 0) {
    logger.info('所有 Story 都已有本开发端 Task');
    return;
  }

  const currentUser = await context.businessService.getCurrentUser();
  const createdCount = await createTasksWithSpinner(
    context,
    targetStories,
    currentUser.user_num_id
  );

  if (createdCount !== null) {
    logger.success(`处理人：${currentUser.nick_name || currentUser.name}`);
  }
}

export async function storySingleCommand(
  version: string,
  cliOptions: CliOptions = {}
): Promise<void> {
  const spinner = ora('正在查询 Story 和子 Task...').start();

  const context = await loadStoryTaskContext(version, cliOptions);
  spinner.succeed('查询完成');

  if (context.stories.length === 0) {
    logger.warn(`未查询到版本 ${version}、开发端 ${context.developmentEnd} 的 Story`);
    return;
  }

  const selectedStories = await selectStories(context);
  const assignee = await selectAssignee(
    context.businessService,
    context.projectId,
    context.roleIds
  );
  const createdCount = await createTasksWithSpinner(context, selectedStories, assignee.user_num_id);

  if (createdCount !== null) {
    logger.success(`处理人：${assignee.nick_name || assignee.user_name}`);
  }
}

export interface StoryDetailImage {
  uri: string;
  localPath?: string;
  error?: string;
}

export interface StoryDetailAttachment {
  name: string; // 附件文件名
  localPath?: string; // 下载成功后的本地路径
  error?: string; // 下载失败原因
}

export interface StoryDetailResult {
  id: number;
  success: boolean;
  detail?: IssueDetail;
  comments?: IssueCommentV4[];
  images?: StoryDetailImage[];
  attachments?: StoryDetailAttachment[];
  error?: string;
}

// issue 内容中图片地址（下载接口要求 v1 前缀，业务层自动替换 v2）
const IMAGE_URI_PATTERN = /\/v[12]\/upload\/[A-Za-z0-9]{1,32}\/\d{6}\/[A-Za-z0-9]+\.[A-Za-z0-9]+/g;

function extractImageUris(texts: Array<string | undefined>): string[] {
  const uris = new Set<string>();
  texts.forEach((text) => {
    if (!text) {
      return;
    }
    (text.match(IMAGE_URI_PATTERN) || []).forEach((uri) => uris.add(uri));
  });
  return [...uris];
}

/**
 * 并发下载详情与评论中的图片，结果写入各 result.images
 */
async function downloadIssueImages(
  businessService: BusinessService,
  projectId: string,
  results: StoryDetailResult[]
): Promise<{ total: number; failed: number }> {
  const urisByResult = new Map<StoryDetailResult, string[]>();

  results.forEach((result) => {
    if (!result.success) {
      return;
    }
    const uris = extractImageUris([
      result.detail?.description,
      ...(result.comments || []).map((c) => c.comment),
    ]);
    if (uris.length > 0) {
      urisByResult.set(result, uris);
    }
  });

  const uniqueUris = [...new Set([...urisByResult.values()].flat())];
  if (uniqueUris.length === 0) {
    return { total: 0, failed: 0 };
  }

  const pathByUri = new Map<string, string | Error>();
  const concurrency = 5;

  for (let i = 0; i < uniqueUris.length; i += concurrency) {
    const batch = uniqueUris.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (uri) => {
        try {
          pathByUri.set(uri, await businessService.downloadIssueImage(projectId, uri));
        } catch (error: unknown) {
          pathByUri.set(uri, error instanceof Error ? error : new Error(String(error)));
        }
      })
    );
  }

  let failed = 0;
  urisByResult.forEach((uris, result) => {
    result.images = uris.map((uri) => {
      const target = pathByUri.get(uri);
      if (target instanceof Error) {
        failed++;
        return { uri, error: target.message };
      }
      return { uri, localPath: target };
    });
  });

  return { total: uniqueUris.length, failed };
}

/**
 * 并发下载详情中的附件，结果写入各 result.attachments
 */
async function downloadIssueAttachments(
  businessService: BusinessService,
  projectId: string,
  results: StoryDetailResult[]
): Promise<{ total: number; failed: number }> {
  const tasks = results.flatMap((result) =>
    (result.success ? result.detail?.accessories || [] : []).map((accessory, index) => ({
      result,
      accessory,
      index,
    }))
  );
  if (tasks.length === 0) {
    return { total: 0, failed: 0 };
  }

  tasks.forEach(({ result }) => {
    result.attachments = (result.detail?.accessories || []).map((a) => ({ name: a.file_name }));
  });

  let failed = 0;
  const concurrency = 5;

  for (let i = 0; i < tasks.length; i += concurrency) {
    await Promise.all(
      tasks.slice(i, i + concurrency).map(async ({ result, accessory, index }) => {
        const item = result.attachments![index];
        try {
          item.localPath = await businessService.downloadIssueAttachment(
            projectId,
            result.id,
            accessory
          );
        } catch (error: unknown) {
          failed++;
          item.error = error instanceof Error ? error.message : String(error);
        }
      })
    );
  }

  return { total: tasks.length, failed };
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

// 解码常见 HTML 实体，&amp; 必须最后处理以避免二次解码
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * 将 HTML 内容转为纯文本，图片标签替换为 [图片N] 占位符（N 对应图片列表序号）；
 * a 标签在文本与链接地址不一致时追加链接，避免纯文本丢失实际地址
 */
function renderHtmlText(html: string, imageIndex: Map<string, number>): string {
  return html
    .replace(/<img[^>]*>/gi, (tag) => {
      const match = tag.match(IMAGE_URI_PATTERN);
      const index = match ? imageIndex.get(match[0]) : undefined;
      return index ? `[图片${index}]` : '[图片]';
    })
    .replace(
      /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_tag, href: string, inner: string) => {
        const text = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
        const url = decodeHtmlEntities(href).trim();
        return !url || text === url ? text : `${text}（${url}）`;
      }
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

// 计算终端显示宽度：ANSI 颜色序列不计宽，中日韩及全角字符按 2 列
function displayWidth(text: string): number {
  let width = 0;
  let inAnsi = false;
  for (const char of text) {
    if (char === '\x1b') {
      inAnsi = true;
      continue;
    }
    if (inAnsi) {
      if (char === 'm') {
        inAnsi = false;
      }
      continue;
    }
    width += char.charCodeAt(0) > 0xff ? 2 : 1;
  }
  return width;
}

// 按列宽填充空格（列间至少 4 空格），替代制表符以避免中文内容下错位
function padCell(text: string, width: number): string {
  return text + ' '.repeat(Math.max(4, width - displayWidth(text) + 4));
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
    const imageIndex = new Map((result.images || []).map((img, i) => [img.uri, i + 1]));
    logger.info(
      pc.bold(`[${index + 1}] #${d.id}  ${d.name}`) + (d.deleted ? pc.red(' [已删除]') : '')
    );
    const defectType =
      d.tracker?.id === IssueTrackerId.BUG
        ? `缺陷类型: ${
            (d.new_custom_fields || []).find((f) => f.custom_field === CustomFieldId.DEFECT_TYPE)
              ?.value || '-'
          }`
        : '';
    const statusCell = `状态: ${statusColor(status)(status)}`;
    const typeCell = `类型: ${d.tracker?.name || '-'}`;
    const iterationCell = `迭代: ${d.iteration?.name || '-'}`;
    const domainCell = `领域: ${d.domain?.name || '-'}`;
    const firstColWidth = Math.max(displayWidth(statusCell), displayWidth(iterationCell));
    const secondColWidth = Math.max(displayWidth(typeCell), displayWidth(domainCell));
    logger.info(
      `  ${padCell(statusCell, firstColWidth)}${padCell(typeCell, secondColWidth)}处理人: ${
        d.assigned_user?.nick_name || d.assigned_user?.name || '-'
      }`
    );
    const domainPart = defectType ? padCell(domainCell, secondColWidth) : domainCell;
    logger.info(`  ${padCell(iterationCell, firstColWidth)}${domainPart}${defectType}`);
    logger.info(`  链接: ${issueLink(projectId, d.id)}`);
    if (d.description) {
      logger.info(`  描述:`);
      const text = renderHtmlText(d.description, imageIndex);
      if (text) {
        text.split('\n').forEach((line) => {
          logger.info(pc.gray(`    ${line}`));
        });
      }
    }

    if (result.images && result.images.length > 0) {
      logger.info(`  图片 (${result.images.length}):`);
      result.images.forEach((img, i) => {
        const line = img.error
          ? `${i + 1}. ✗ ${img.uri}（${img.error}）`
          : `${i + 1}. ${img.localPath || '-'}`;
        logger.info(pc.gray(`    ${line}`));
      });
    }

    if (result.attachments && result.attachments.length > 0) {
      logger.info(`  附件 (${result.attachments.length}):`);
      result.attachments.forEach((att, i) => {
        const line = att.error
          ? `${i + 1}. ✗ ${att.name}（${att.error}）`
          : `${i + 1}. ${att.name} -> ${att.localPath || '-'}`;
        logger.info(pc.gray(`    ${line}`));
      });
    }

    if (withComments) {
      if (!result.comments || result.comments.length === 0) {
        logger.info(pc.gray('  评论 (0): 无'));
      } else {
        logger.info(`  评论 (${result.comments.length}):`);
        result.comments.forEach((c) => {
          const time = formatTimestamp(c.timestamp);
          const author = c.user?.nick_name || c.user?.user_name || '匿名';
          const text = renderHtmlText(c.comment, imageIndex);
          logger.info(pc.gray(`    [${time}] ${author}: ${text}`));
        });
      }
      if (result.error) {
        logger.info(pc.yellow(`  警告: ${result.error}`));
      }
    }
  });
}

export async function storyDetailCommand(
  ids: string[],
  cliOptions: CliOptions & { withComments?: boolean } = {}
): Promise<void> {
  const issueIds = ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n) && n > 0);

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

  const imageSpinner = ora('正在解析并下载工作项图片...').start();
  const { total, failed } = await downloadIssueImages(businessService, projectId, results);
  if (total > 0) {
    imageSpinner.succeed(`图片处理完成：共 ${total} 张${failed > 0 ? `，失败 ${failed} 张` : ''}`);
  } else {
    imageSpinner.stop();
  }

  const attachmentSpinner = ora('正在下载工作项附件...').start();
  const attachmentStats = await downloadIssueAttachments(businessService, projectId, results);
  if (attachmentStats.total > 0) {
    attachmentSpinner.succeed(
      `附件处理完成：共 ${attachmentStats.total} 个${
        attachmentStats.failed > 0 ? `，失败 ${attachmentStats.failed} 个` : ''
      }`
    );
  } else {
    attachmentSpinner.stop();
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
