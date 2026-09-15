import ora from 'ora';
import pc from 'picocolors';
import { BusinessService } from '../services/business.service';
import {
  CustomFieldId,
  IssueCommentV4,
  IssueDetail,
  IssueNewCustomField,
  IssueStatusId,
  IssueTrackerId,
  UpdateIssueRequest,
} from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { issueLink } from '../utils/console';
import { logger } from '../utils/logger';

// ==================== detail ====================

export interface IssueDetailImage {
  uri: string;
  localPath?: string;
  error?: string;
}

export interface IssueDetailAttachment {
  name: string; // 附件文件名
  localPath?: string; // 下载成功后的本地路径
  error?: string; // 下载失败原因
}

export interface IssueDetailResult {
  id: number;
  success: boolean;
  detail?: IssueDetail;
  comments?: IssueCommentV4[];
  images?: IssueDetailImage[];
  attachments?: IssueDetailAttachment[];
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
  results: IssueDetailResult[]
): Promise<{ total: number; failed: number }> {
  const urisByResult = new Map<IssueDetailResult, string[]>();

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
  results: IssueDetailResult[]
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
 * a 标签在文本与链接地址不一致时追加链接，避免纯文本丢失实际地址；
 * HTML 实体在标签剥离后统一解码（&amp; 最后处理以避免二次解码）
 */
function renderHtmlText(html: string, imageIndex: Map<string, number>): string {
  const text = html
    .replace(/<img[^>]*>/gi, (tag) => {
      const match = tag.match(IMAGE_URI_PATTERN);
      const index = match ? imageIndex.get(match[0]) : undefined;
      return index ? `[图片${index}]` : '[图片]';
    })
    .replace(
      /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_tag, href: string, inner: string) => {
        const linkText = inner.replace(/<[^>]+>/g, '').trim();
        const url = href.trim();
        return !url || linkText === url ? linkText : `${linkText}（${url}）`;
      }
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(text)
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
  results: IssueDetailResult[],
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
    if (d.tracker?.id === IssueTrackerId.TASK && d.parent_issue) {
      logger.info(`  父工作项: ${d.parent_issue.name} (#${d.parent_issue.id})`);
    }
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

/**
 * 并发获取工作项原始详情，保持入参顺序，失败项为 null
 */
async function fetchRawIssueDetails(
  businessService: BusinessService,
  projectId: string,
  issueIds: number[],
  concurrency: number = 10
): Promise<Array<IssueDetail | null>> {
  const details: Array<IssueDetail | null> = [];

  for (let i = 0; i < issueIds.length; i += concurrency) {
    const batch = issueIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          return await businessService.getIssueDetail(projectId, id);
        } catch {
          return null;
        }
      })
    );
    details.push(...batchResults);
  }

  return details;
}

export async function issueDetailCommand(
  ids: string[],
  cliOptions: CliOptions & { withComments?: boolean; json?: boolean } = {}
): Promise<void> {
  const issueIds = ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n) && n > 0);

  if (issueIds.length === 0) {
    logger.error('未提供有效的工作项 ID');
    return;
  }

  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);
  const withComments = cliOptions.withComments ?? false;

  // --json：输出原始接口的完整 JSON，跳过图片/附件下载等加工步骤
  if (cliOptions.json) {
    const spinner = ora('正在查询工作项详情...').start();
    const details = await fetchRawIssueDetails(businessService, projectId, issueIds);
    if (withComments) {
      const commentMap = await businessService.getIssueCommentsBatch(projectId, issueIds);
      details.forEach((detail, index) => {
        const commentResult = commentMap.get(issueIds[index]);
        if (detail && commentResult?.success) {
          (detail as unknown as Record<string, unknown>).comments = commentResult.comments;
        }
      });
    }
    spinner.stop();
    logger.json(details);
    return;
  }

  const spinner = ora('正在查询工作项详情...').start();
  const details = await businessService.getIssueDetails(projectId, issueIds, 10);
  spinner.stop();

  const detailMap = new Map(details.map((d) => [d.id, d]));
  const results: IssueDetailResult[] = issueIds.map((id) => {
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

// ==================== addNote ====================

export async function issueAddNoteCommand(
  issueId: string,
  notes: string,
  cliOptions: CliOptions = {}
): Promise<void> {
  const { projectId, config } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const spinner = ora(`正在为工作项 ${issueId} 添加评论...`).start();
  try {
    await businessService.addIssueNote(projectId, parseInt(issueId, 10), notes);
    spinner.succeed('评论添加成功');
    logger.info(`  ${issueLink(projectId, parseInt(issueId, 10))}`);
  } catch (error: unknown) {
    spinner.fail('评论添加失败');
    throw error;
  }
}

// ==================== update ====================

export interface IssueUpdateOptions {
  name?: string; // 标题
  description?: string; // 描述（支持 HTML）
  status?: string; // 状态名称或 ID
  assigned?: string; // 处理人昵称/用户名/数字 ID
  developer?: string; // 开发人员昵称/用户名/数字 ID
  iteration?: string; // 迭代名称或 ID
  priority?: string; // 优先级：低/中/高 或数字 ID
  severity?: string; // 重要程度：关键/重要/一般/提示 或数字 ID
  domain?: string; // 领域名称或数字 ID
  module?: string; // 模块名称或数字 ID
  parent?: string; // 父工作项 ID
  begin?: string; // 预计开始时间，YYYY-MM-DD
  end?: string; // 预计结束时间，YYYY-MM-DD
  doneRatio?: string; // 完成度 0-100
  expectedWorkHours?: string; // 预计工时
  actualWorkHours?: string; // 实际工时
  field?: string[]; // 自定义字段，格式 名称=值（可重复传入）
}

// 状态名称与 IssueStatusId 枚举对应
const STATUS_NAME_TO_ID: Record<string, IssueStatusId> = {
  新需求: IssueStatusId.NEW_REQUIREMENT,
  进行中: IssueStatusId.IN_PROGRESS,
  已解决: IssueStatusId.RESOLVED,
  测试中: IssueStatusId.TESTING,
  已关闭: IssueStatusId.CLOSED,
  已拒绝: IssueStatusId.REJECTED,
  产品设计: IssueStatusId.PRODUCT_DESIGN,
  可评审: IssueStatusId.REVIEW_READY,
  开发池: IssueStatusId.DEV_POOL,
  开发中: IssueStatusId.DEVELOPING,
  可提测: IssueStatusId.TEST_READY,
  转体验: IssueStatusId.HANDOFF_EXPERIENCE,
  接受处理: IssueStatusId.ACCEPTED,
  已验证: IssueStatusId.VERIFIED,
  重新打开: IssueStatusId.REOPENED,
};

// 自定义字段名称与 CustomFieldId 枚举对应
const CUSTOM_FIELD_NAME_TO_ID: Record<string, CustomFieldId> = {
  反馈人: CustomFieldId.FEEDBACK_PERSON,
  缺陷技术分析: CustomFieldId.DEFECT_TECHNICAL_ANALYSIS,
  影响范围: CustomFieldId.IMPACT_SCOPE,
  环境: CustomFieldId.ENVIRONMENT,
  终端类型: CustomFieldId.TERMINAL_TYPE,
  缺陷类型: CustomFieldId.DEFECT_TYPE,
  产品模块: CustomFieldId.PRODUCT_MODULE,
  客户反馈编号: CustomFieldId.CUSTOMER_FEEDBACK_NO,
  测试用例覆盖: CustomFieldId.TEST_CASE_COVERAGE,
  测试阶段: CustomFieldId.TEST_STAGE,
  企业名称: CustomFieldId.COMPANY_NAME,
  缺陷根源: CustomFieldId.DEFECT_ROOT_CAUSE,
  问题原因及解决办法: CustomFieldId.PROBLEM_CAUSE_AND_SOLUTION,
  发布时间: CustomFieldId.RELEASE_TIME,
  引入阶段: CustomFieldId.INTRODUCTION_PHASE,
  版本: CustomFieldId.VERSION,
  测试人员: CustomFieldId.TESTER,
  开发端: CustomFieldId.DEVELOPMENT_END,
  AI相关: CustomFieldId.AI_RELATED,
};

// 优先级固定枚举（UpdateIssueV4 文档：1低 2中 3高）
const PRIORITY_NAME_TO_ID: Record<string, number> = { 低: 1, 中: 2, 高: 3 };

// 重要程度固定枚举（UpdateIssueV4 文档：10关键 11重要 12一般 13提示）
const SEVERITY_NAME_TO_ID: Record<string, number> = {
  关键: 10,
  重要: 11,
  一般: 12,
  提示: 13,
};

function isNumericString(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function resolveStatusId(value: string): number {
  if (isNumericString(value)) {
    return Number(value.trim());
  }
  const id = STATUS_NAME_TO_ID[value.trim()];
  if (id === undefined) {
    throw new Error(
      `未知状态 "${value}"，支持：${Object.keys(STATUS_NAME_TO_ID).join('、')} 或状态 ID`
    );
  }
  return id;
}

/**
 * 按昵称/用户名解析项目成员，返回成员数字 ID；精确匹配优先，其次包含匹配
 */
async function resolveMemberId(
  businessService: BusinessService,
  projectId: string,
  fieldLabel: string,
  value: string
): Promise<number> {
  const members = await businessService.getMembers(projectId);

  if (isNumericString(value)) {
    const member = members.find((m) => m.user_num_id === Number(value.trim()));
    if (!member) {
      throw new Error(`${fieldLabel} "${value}" 不是项目成员的数字 ID`);
    }
    return member.user_num_id;
  }

  const exact = members.filter((m) => m.nick_name === value || m.user_name === value);
  const candidates =
    exact.length > 0
      ? exact
      : members.filter(
          (m) => (m.nick_name || '').includes(value) || (m.user_name || '').includes(value)
        );

  if (candidates.length === 0) {
    throw new Error(`未找到${fieldLabel} "${value}" 对应的项目成员`);
  }
  if (candidates.length > 1) {
    const names = candidates.map((m) => m.nick_name || m.user_name).join('、');
    throw new Error(`${fieldLabel} "${value}" 匹配到多个成员：${names}，请改用成员数字 ID`);
  }
  return candidates[0].user_num_id;
}

async function resolveIterationId(
  businessService: BusinessService,
  projectId: string,
  value: string
): Promise<number> {
  if (isNumericString(value)) {
    return Number(value.trim());
  }

  const iterations = await businessService.getIterations(projectId, { limit: 1000 });
  const exact = iterations.filter((i) => i.name === value);
  const candidates = exact.length > 0 ? exact : iterations.filter((i) => i.name.includes(value));

  if (candidates.length === 0) {
    throw new Error(`未找到迭代 "${value}"，可用迭代：${iterations.map((i) => i.name).join('、')}`);
  }
  if (candidates.length > 1) {
    const names = candidates.map((i) => i.name).join('、');
    throw new Error(`迭代 "${value}" 匹配到多个：${names}，请改用迭代 ID`);
  }
  return candidates[0].id;
}

function resolveNumericId(fieldLabel: string, value: string): number {
  if (!isNumericString(value)) {
    throw new Error(`${fieldLabel} 仅支持数字 ID，收到 "${value}"`);
  }
  return Number(value.trim());
}

/**
 * 按固定枚举解析字段值（数字 ID 或中文名称）
 */
function resolveEnumId(value: string, nameMap: Record<string, number>, fieldLabel: string): number {
  if (isNumericString(value)) {
    return Number(value.trim());
  }
  const id = nameMap[value.trim()];
  if (id === undefined) {
    throw new Error(
      `未知${fieldLabel} "${value}"，支持：${Object.keys(nameMap).join('、')} 或数字 ID`
    );
  }
  return id;
}

/**
 * 按项目选项列表解析字段值（数字 ID 或名称），精确匹配优先，其次包含匹配
 */
async function resolveOptionId(
  businessService: BusinessService,
  projectId: string,
  fieldLabel: string,
  value: string,
  optionsLoader: () => Promise<Array<{ id: number; name: string }>>
): Promise<number> {
  if (isNumericString(value)) {
    return Number(value.trim());
  }

  const options = await optionsLoader();
  const exact = options.filter((o) => o.name === value);
  const candidates = exact.length > 0 ? exact : options.filter((o) => o.name.includes(value));

  if (candidates.length === 0) {
    throw new Error(
      `未找到${fieldLabel} "${value}"，可用选项：${options.map((o) => o.name).join('、')}`
    );
  }
  if (candidates.length > 1) {
    const names = candidates.map((o) => o.name).join('、');
    throw new Error(`${fieldLabel} "${value}" 匹配到多个：${names}，请改用数字 ID`);
  }
  return candidates[0].id;
}

function resolveNumber(fieldLabel: string, value: string): number {
  const numeric = Number(value);
  if (isNaN(numeric)) {
    throw new Error(`${fieldLabel} 应为数字，收到 "${value}"`);
  }
  return numeric;
}

function assertDateFormat(fieldLabel: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldLabel} 格式应为 YYYY-MM-DD，收到 "${value}"`);
  }
}

function parseCustomFieldUpdate(
  businessService: BusinessService,
  entry: string
): IssueNewCustomField {
  const separatorIndex = entry.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error(`自定义字段格式错误 "${entry}"，应为 名称=值`);
  }
  const name = entry.slice(0, separatorIndex).trim();
  const value = entry.slice(separatorIndex + 1).trim();
  const fieldId =
    CUSTOM_FIELD_NAME_TO_ID[name] ||
    (/^custom_field\d+$/.test(name) ? (name as CustomFieldId) : undefined);

  if (!fieldId) {
    throw new Error(
      `未知自定义字段 "${name}"，支持：${Object.keys(CUSTOM_FIELD_NAME_TO_ID).join(
        '、'
      )} 或 custom_fieldXX`
    );
  }

  // 发布时间为日期类型字段，YYYY-MM-DD 输入转换为毫秒时间戳
  if (fieldId === CustomFieldId.RELEASE_TIME && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = businessService.parseDateToTimestamp(value);
    if (timestamp !== null) {
      return { custom_field: fieldId, field_name: name, value: String(timestamp) };
    }
  }

  return { custom_field: fieldId, field_name: name, value };
}

export async function issueUpdateCommand(
  issueId: string,
  options: IssueUpdateOptions,
  cliOptions: CliOptions = {}
): Promise<void> {
  const { projectId, config } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const updateData: UpdateIssueRequest = {};
  const changeSummary: string[] = [];

  if (options.name) {
    updateData.name = options.name;
    changeSummary.push(`标题: ${options.name}`);
  }
  if (options.description) {
    updateData.description = options.description;
    changeSummary.push(`描述: <${options.description.length} 字符>`);
  }
  if (options.status) {
    updateData.status_id = resolveStatusId(options.status);
    changeSummary.push(`状态: ${options.status} -> ${updateData.status_id}`);
  }
  if (options.assigned) {
    updateData.assigned_id = await resolveMemberId(
      businessService,
      projectId,
      '处理人',
      options.assigned
    );
    changeSummary.push(`处理人: ${options.assigned} -> ${updateData.assigned_id}`);
  }
  if (options.developer) {
    updateData.developer_id = await resolveMemberId(
      businessService,
      projectId,
      '开发人员',
      options.developer
    );
    changeSummary.push(`开发人员: ${options.developer} -> ${updateData.developer_id}`);
  }
  if (options.iteration) {
    updateData.iteration_id = await resolveIterationId(
      businessService,
      projectId,
      options.iteration
    );
    changeSummary.push(`迭代: ${options.iteration} -> ${updateData.iteration_id}`);
  }
  if (options.priority) {
    updateData.priority_id = resolveEnumId(options.priority, PRIORITY_NAME_TO_ID, '优先级');
    changeSummary.push(`优先级: ${options.priority} -> ${updateData.priority_id}`);
  }
  if (options.severity) {
    updateData.severity_id = resolveEnumId(options.severity, SEVERITY_NAME_TO_ID, '重要程度');
    changeSummary.push(`重要程度: ${options.severity} -> ${updateData.severity_id}`);
  }
  if (options.domain) {
    updateData.domain_id = await resolveOptionId(
      businessService,
      projectId,
      '领域',
      options.domain,
      () => businessService.getProjectDomains(projectId)
    );
    changeSummary.push(`领域: ${options.domain} -> ${updateData.domain_id}`);
  }
  if (options.module) {
    updateData.module_id = await resolveOptionId(
      businessService,
      projectId,
      '模块',
      options.module,
      () => businessService.getProjectModules(projectId)
    );
    changeSummary.push(`模块: ${options.module} -> ${updateData.module_id}`);
  }
  if (options.parent) {
    updateData.parent_issue_id = resolveNumericId('父工作项', options.parent);
    changeSummary.push(`父工作项 ID: ${updateData.parent_issue_id}`);
  }
  if (options.begin) {
    assertDateFormat('预计开始时间', options.begin);
    updateData.begin_time = options.begin;
    changeSummary.push(`预计开始: ${options.begin}`);
  }
  if (options.end) {
    assertDateFormat('预计结束时间', options.end);
    updateData.end_time = options.end;
    changeSummary.push(`预计结束: ${options.end}`);
  }
  if (options.doneRatio) {
    const ratio = resolveNumber('完成度', options.doneRatio);
    if (ratio < 0 || ratio > 100) {
      throw new Error(`完成度应在 0-100 之间，收到 "${options.doneRatio}"`);
    }
    updateData.done_ratio = ratio;
    changeSummary.push(`完成度: ${ratio}`);
  }
  if (options.expectedWorkHours) {
    updateData.expected_work_hours = resolveNumber('预计工时', options.expectedWorkHours);
    changeSummary.push(`预计工时: ${updateData.expected_work_hours}`);
  }
  if (options.actualWorkHours) {
    updateData.actual_work_hours = resolveNumber('实际工时', options.actualWorkHours);
    changeSummary.push(`实际工时: ${updateData.actual_work_hours}`);
  }
  if (options.field && options.field.length > 0) {
    const customFields = options.field.map((entry) =>
      parseCustomFieldUpdate(businessService, entry)
    );
    updateData.new_custom_fields = customFields;
    customFields.forEach((f) => changeSummary.push(`${f.field_name}: ${f.value}`));
  }

  if (changeSummary.length === 0) {
    logger.error('未提供任何要更新的字段');
    logger.info(
      '可用字段：--name --description --status --assigned --developer --iteration --priority ' +
        '--severity --domain --module --parent --begin --end --done-ratio ' +
        '--expected-work-hours --actual-work-hours -f/--field <名称=值>'
    );
    return;
  }

  const checkSpinner = ora(`正在校验工作项 ${issueId}...`).start();
  let issueName = '';
  try {
    const detail = await businessService.getIssueDetail(projectId, parseInt(issueId, 10));
    issueName = detail.name;
    checkSpinner.succeed(`工作项：${issueName}`);
  } catch (error: unknown) {
    checkSpinner.fail(`工作项 ${issueId} 不存在或无访问权限`);
    throw error;
  }

  const spinner = ora('正在更新工作项...').start();
  try {
    await businessService.updateIssue(projectId, issueId, updateData);
    spinner.succeed(`更新成功，共更新 ${changeSummary.length} 个字段`);
  } catch (error: unknown) {
    spinner.fail('更新工作项失败');
    throw error;
  }

  changeSummary.forEach((line) => logger.info(`  ${line}`));
  logger.info(`  ${issueLink(projectId, parseInt(issueId, 10))}`);
}

// ==================== workhour ====================

export interface IssueWorkHourOptions {
  type?: string; // 工时类型名称或 ID
  start?: string; // 开始日期 YYYY-MM-DD，默认当天
  end?: string; // 结束日期 YYYY-MM-DD，默认当天
}

function todayString(): string {
  const now = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 按名称或 ID 解析工时类型，名称精确匹配优先，其次包含匹配
 */
async function resolveWorkHoursTypeId(
  businessService: BusinessService,
  projectId: string,
  value: string
): Promise<number> {
  if (isNumericString(value)) {
    return Number(value.trim());
  }

  const types = await businessService.getWorkHoursTypes(projectId);
  const available = types.filter((t) => t.status === 1);
  const exact = available.filter((t) => t.name === value);
  const candidates = exact.length > 0 ? exact : available.filter((t) => t.name.includes(value));

  if (candidates.length === 0) {
    throw new Error(
      `未找到工时类型 "${value}"，可用类型：${available.map((t) => `${t.name}(${t.id})`).join('、')}`
    );
  }
  if (candidates.length > 1) {
    const names = candidates.map((t) => `${t.name}(${t.id})`).join('、');
    throw new Error(`工时类型 "${value}" 匹配到多个：${names}，请改用数字 ID`);
  }
  return candidates[0].id;
}

export async function issueWorkHourCommand(
  issueId: string,
  hours: string,
  options: IssueWorkHourOptions,
  cliOptions: CliOptions = {}
): Promise<void> {
  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum <= 0) {
    throw new Error(`工时数应为大于 0 的数字，收到 "${hours}"`);
  }

  const startDate = options.start || todayString();
  const dueDate = options.end || startDate;
  assertDateFormat('开始日期', startDate);
  assertDateFormat('结束日期', dueDate);

  const { projectId, config } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const typeId = options.type
    ? await resolveWorkHoursTypeId(businessService, projectId, options.type)
    : undefined;

  const spinner = ora(`正在为工作项 ${issueId} 登记工时...`).start();
  let records;
  try {
    records = await businessService.addIssueWorkHour(projectId, parseInt(issueId, 10), hoursNum, {
      typeId,
      startDate,
      dueDate,
    });
    spinner.succeed(
      `工时登记成功：${hoursNum} 小时（${startDate}${startDate !== dueDate ? ` ~ ${dueDate}` : ''}）`
    );
  } catch (error: unknown) {
    spinner.fail('工时登记失败');
    throw error;
  }

  records.forEach((r) =>
    logger.info(
      `  ${r.work_date}: ${r.work_hours} 小时（${r.work_hours_type_name || '未指定类型'}）`
    )
  );
  logger.info(`  ${issueLink(projectId, parseInt(issueId, 10))}`);
}

// ==================== options ====================

type FieldOption = { id: number; name: string };

interface OptionFieldSpec {
  label: string; // 主名称（中文）
  aliases: string[]; // 别名（英文名、custom_fieldXX 等）
  source: 'static' | 'dynamic' | 'custom' | 'free';
  description: string;
  staticOptions?: FieldOption[];
  load?: () => Promise<FieldOption[]>;
  customFieldId?: string;
}

function mapToOptions(map: Record<string, number>): FieldOption[] {
  return Object.entries(map).map(([name, id]) => ({ id, name }));
}

function buildOptionFieldSpecs(
  businessService: BusinessService,
  projectId: string
): OptionFieldSpec[] {
  const memberOptions = async (): Promise<FieldOption[]> =>
    (await businessService.getMembers(projectId)).map((m) => ({
      id: m.user_num_id,
      name: m.nick_name ? `${m.nick_name}(${m.user_name})` : m.user_name,
    }));

  return [
    {
      label: '状态',
      aliases: ['status'],
      source: 'static',
      description: '固定枚举',
      staticOptions: mapToOptions(STATUS_NAME_TO_ID),
    },
    {
      label: '优先级',
      aliases: ['priority'],
      source: 'static',
      description: '固定枚举',
      staticOptions: mapToOptions(PRIORITY_NAME_TO_ID),
    },
    {
      label: '重要程度',
      aliases: ['severity'],
      source: 'static',
      description: '固定枚举',
      staticOptions: mapToOptions(SEVERITY_NAME_TO_ID),
    },
    {
      label: '迭代',
      aliases: ['iteration'],
      source: 'dynamic',
      description: '项目迭代列表',
      load: async () =>
        (await businessService.getIterations(projectId, { limit: 1000 })).map((i) => ({
          id: i.id,
          name: i.name,
        })),
    },
    {
      label: '领域',
      aliases: ['domain'],
      source: 'dynamic',
      description: '项目领域列表',
      load: () => businessService.getProjectDomains(projectId),
    },
    {
      label: '模块',
      aliases: ['module'],
      source: 'dynamic',
      description: '项目模块列表（含各级子模块）',
      load: () => businessService.getProjectModules(projectId),
    },
    {
      label: '处理人',
      aliases: ['assigned'],
      source: 'dynamic',
      description: '项目成员列表',
      load: memberOptions,
    },
    {
      label: '开发人员',
      aliases: ['developer'],
      source: 'dynamic',
      description: '项目成员列表',
      load: memberOptions,
    },
    {
      label: '父工作项',
      aliases: ['parent'],
      source: 'free',
      description: '仅支持数字 ID（工作项 ID），无选项列表',
    },
    ...Object.entries(CUSTOM_FIELD_NAME_TO_ID).map(([label, fieldId]) => ({
      label,
      aliases: [fieldId],
      source: 'custom' as const,
      description: '自定义字段选项',
      customFieldId: fieldId,
    })),
  ];
}

function resolveOptionFieldSpec(specs: OptionFieldSpec[], input: string): OptionFieldSpec {
  const key = input.trim();
  const exact = specs.find(
    (s) => s.label === key || s.aliases.some((a) => a.toLowerCase() === key.toLowerCase())
  );
  if (exact) {
    return exact;
  }

  const candidates = specs.filter(
    (s) =>
      s.label.includes(key) || s.aliases.some((a) => a.toLowerCase().includes(key.toLowerCase()))
  );
  if (candidates.length === 1) {
    return candidates[0];
  }
  throw new Error(
    candidates.length === 0
      ? `未知字段 "${input}"，可查询：${specs.map((s) => s.label).join('、')}`
      : `字段 "${input}" 匹配到多个：${candidates.map((s) => s.label).join('、')}，请使用完整名称`
  );
}

export async function issueOptionsCommand(
  field: string | undefined,
  cliOptions: CliOptions = {}
): Promise<void> {
  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);
  const specs = buildOptionFieldSpecs(businessService, projectId);

  // 不带字段名时列出全部可查询字段
  if (!field) {
    if (outputFormat === 'json') {
      logger.json(
        specs.map((s) => ({
          field: s.label,
          aliases: s.aliases,
          description: s.description,
          source: s.source,
        }))
      );
      return;
    }
    logger.info('可查询的字段（用法：issue options <字段>）：');
    const labelWidth = Math.max(...specs.map((s) => displayWidth(s.label)));
    specs.forEach((s) => {
      logger.info(`  ${padCell(s.label, labelWidth + 4)}${s.aliases.join('/')}  ${s.description}`);
    });
    return;
  }

  const spec = resolveOptionFieldSpec(specs, field);

  if (spec.source === 'free') {
    logger.info(`${spec.label}（${spec.aliases.join('/')}）：${spec.description}`);
    return;
  }

  if (spec.source === 'custom' && spec.customFieldId) {
    const optionsMap = await businessService.getCustomFieldOptions(projectId, [spec.customFieldId]);
    const values = optionsMap[spec.customFieldId] || [];
    if (outputFormat === 'json') {
      logger.json({ field: spec.label, options: values });
      return;
    }
    if (values.length === 0) {
      logger.info(`${spec.label}（${spec.aliases.join('/')}）：该字段为自由文本，无固定选项`);
      return;
    }
    logger.info(`${spec.label}（${spec.aliases.join('/')}）可选项：`);
    values.forEach((v) => logger.info(`  ${v}`));
    return;
  }

  const options: FieldOption[] =
    spec.source === 'static' ? spec.staticOptions || [] : (await spec.load?.()) || [];
  if (outputFormat === 'json') {
    logger.json({ field: spec.label, options });
    return;
  }
  logger.info(`${spec.label}（${spec.aliases.join('/')}）可选项：`);
  const nameWidth = Math.max(...options.map((o) => displayWidth(o.name)));
  options.forEach((o) => logger.info(`  ${padCell(o.name, nameWidth + 4)}${o.id}`));
}
