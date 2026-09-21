import pc from 'picocolors';
import { BusinessService } from '../services/business.service';
import {
  CreateIssueV4Response,
  CustomFieldId,
  IssueCommentV4,
  IssueDetail,
  IssueItem,
  IssueNewCustomField,
  IssueStatusId,
  IssueTrackerId,
  ListIssuesV4Request,
  ProjectIssueStatus,
  ProjectMember,
  UpdateIssueRequest,
} from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { issueLink } from '../utils/console';
import { logger } from '../utils/logger';
import { createSpinner } from '../utils/spinner';

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
  cliOptions: CliOptions & {
    withComments?: boolean;
    json?: boolean;
    noDownload?: boolean;
  } = {}
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
    const spinner = createSpinner('正在查询工作项详情...').start();
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

  const spinner = createSpinner('正在查询工作项详情...').start();
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
    const commentSpinner = createSpinner('正在查询评论...').start();
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

  if (!cliOptions.noDownload) {
    const imageSpinner = createSpinner('正在解析并下载工作项图片...').start();
    const { total, failed } = await downloadIssueImages(businessService, projectId, results);
    if (total > 0) {
      imageSpinner.succeed(
        `图片处理完成：共 ${total} 张${failed > 0 ? `，失败 ${failed} 张` : ''}`
      );
    } else {
      imageSpinner.stop();
    }

    const attachmentSpinner = createSpinner('正在下载工作项附件...').start();
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

  const spinner = createSpinner(`正在为工作项 ${issueId} 添加评论...`).start();
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

// 状态名称与 IssueStatusId 枚举对应（静态快速路径，未命中时查询项目状态配置）
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

// 工作项类型 ID 与名称对照（状态适用类型展示用）
const TRACKER_ID_TO_NAME: Record<number, string> = {
  [IssueTrackerId.TASK]: 'Task',
  [IssueTrackerId.BUG]: 'Bug',
  [IssueTrackerId.EPIC]: 'Epic',
  [IssueTrackerId.FEATURE]: 'Feature',
  [IssueTrackerId.STORY]: 'Story',
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

async function resolveStatusId(
  businessService: BusinessService,
  projectId: string,
  value: string
): Promise<number> {
  if (isNumericString(value)) {
    return Number(value.trim());
  }
  const staticId = STATUS_NAME_TO_ID[value.trim()];
  if (staticId !== undefined) {
    return staticId;
  }
  // 静态枚举未命中时查询项目状态配置，覆盖项目模板扩展的状态
  const statuses = await businessService.getProjectStatuses(projectId);
  const matched = statuses.filter((s) => s.name === value.trim());
  if (matched.length === 0) {
    throw new Error(`未知状态 "${value}"，请通过 codearts issue options status 查看可用状态`);
  }
  const statusIds = [...new Set(matched.map((s) => s.status_id))];
  if (statusIds.length > 1) {
    throw new Error(`状态 "${value}" 在不同工作项类型下对应不同 ID，请改用状态数字 ID`);
  }
  return statusIds[0];
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
  const iterations = await businessService.getIterations(projectId, { limit: 1000 });

  // 数值优先按迭代名精确匹配（迭代名可能为纯数字），无命中再按 ID 处理
  if (isNumericString(value)) {
    const byName = iterations.find((i) => i.name === value.trim());
    if (byName) {
      return byName.id;
    }
    return Number(value.trim());
  }

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

/**
 * 解析自定义字段条目并合并同字段重复传入：
 * 多选字段（如 开发端）值按逗号分隔保存，同字段多次传入时合并去重为一条
 */
function parseCustomFieldUpdates(
  businessService: BusinessService,
  entries: string[]
): IssueNewCustomField[] {
  const merged: IssueNewCustomField[] = [];
  const indexByField = new Map<string, number>();

  entries
    .map((entry) => parseCustomFieldUpdate(businessService, entry))
    .forEach((field) => {
      const index = indexByField.get(field.custom_field);
      if (index === undefined) {
        indexByField.set(field.custom_field, merged.length);
        merged.push(field);
        return;
      }
      const values = merged[index].value.split(',').concat(field.value.split(','));
      merged[index].value = [...new Set(values.map((v) => v.trim()).filter((v) => v))].join(',');
    });

  return merged;
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
    updateData.status_id = await resolveStatusId(businessService, projectId, options.status);
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
    const customFields = parseCustomFieldUpdates(businessService, options.field);
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

  const checkSpinner = createSpinner(`正在校验工作项 ${issueId}...`).start();
  let issueName = '';
  try {
    const detail = await businessService.getIssueDetail(projectId, parseInt(issueId, 10));
    issueName = detail.name;
    checkSpinner.succeed(`工作项：${issueName}`);
  } catch (error: unknown) {
    checkSpinner.fail(`工作项 ${issueId} 不存在或无访问权限`);
    throw error;
  }

  const spinner = createSpinner('正在更新工作项...').start();
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

  const spinner = createSpinner(`正在为工作项 ${issueId} 登记工时...`).start();
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

// 自定义字段 type 元数据与展示标签对应（checkbox 为多选字段）
const CUSTOM_FIELD_TYPE_LABELS: Record<string, string> = {
  checkbox: '多选',
  radio: '单选',
  select: '单选',
  textbox: '文本',
  textarea: '文本',
  text: '文本',
  textArea: '文本',
  date: '日期',
  number: '数字',
  user: '人员',
};

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
      source: 'dynamic',
      description: '项目状态配置（标注适用工作项类型）',
      load: async () => {
        const statuses = await businessService.getProjectStatuses(projectId);
        const merged = new Map<number, { name: string; trackers: Set<number> }>();
        statuses.forEach((s) => {
          const existing = merged.get(s.status_id);
          if (existing) {
            s.tracker_ids.forEach((t) => existing.trackers.add(t));
          } else {
            merged.set(s.status_id, { name: s.name, trackers: new Set(s.tracker_ids) });
          }
        });
        return [...merged.entries()].map(([id, { name, trackers }]) => {
          const trackerLabel = [...trackers]
            .map((t) => TRACKER_ID_TO_NAME[t] || String(t))
            .join('/');
          return { id, name: trackerLabel ? `${name}（${trackerLabel}）` : name };
        });
      },
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
  cliOptions: CliOptions & { json?: boolean } = {}
): Promise<void> {
  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);
  const useJson = cliOptions.json || outputFormat === 'json';
  const specs = buildOptionFieldSpecs(businessService, projectId);

  // 不带字段名时列出全部可查询字段
  if (!field) {
    // 自定义字段补充类型标注（多选/单选/文本等），便于判断字段取值方式
    const customSpecs = specs.filter((s) => s.source === 'custom' && s.customFieldId);
    const typeByField = new Map<string, string>();
    (
      await businessService.getCustomFieldMetas(
        projectId,
        customSpecs.map((s) => s.customFieldId!)
      )
    ).forEach((meta) => {
      const label = CUSTOM_FIELD_TYPE_LABELS[meta.type];
      if (label) {
        typeByField.set(meta.custom_field, label);
      }
    });
    const described = specs.map((s) => ({
      ...s,
      description:
        s.source === 'custom' && s.customFieldId && typeByField.has(s.customFieldId)
          ? `${s.description}（${typeByField.get(s.customFieldId)}）`
          : s.description,
    }));
    if (useJson) {
      logger.json(
        described.map((s) => ({
          field: s.label,
          aliases: s.aliases,
          description: s.description,
          source: s.source,
        }))
      );
      return;
    }
    logger.info('可查询的字段（用法：issue options <字段>）：');
    const labelWidth = Math.max(...described.map((s) => displayWidth(s.label)));
    described.forEach((s) => {
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
    const metas = await businessService.getCustomFieldMetas(projectId, [spec.customFieldId]);
    const meta = metas.find((m) => m.custom_field === spec.customFieldId);
    const typeLabel = meta ? CUSTOM_FIELD_TYPE_LABELS[meta.type] : undefined;
    const values = meta?.options ? meta.options.split(',').map((option) => option.trim()) : [];
    if (useJson) {
      logger.json({ field: spec.label, type: meta?.type, options: values });
      return;
    }
    const header = typeLabel
      ? `${spec.label}（${spec.aliases.join('/')}，${typeLabel}）`
      : `${spec.label}（${spec.aliases.join('/')}）`;
    if (values.length === 0) {
      logger.info(`${header}：该字段为自由文本，无固定选项`);
      return;
    }
    logger.info(`${header}可选项：`);
    values.forEach((v) => logger.info(`  ${v}`));
    if (typeLabel === '多选') {
      logger.info(
        pc.gray(
          `  该字段支持多选：值用逗号分隔，如 -f ${spec.label}=${values[0]},${values[1] || values[0]}`
        )
      );
    }
    return;
  }

  const options: FieldOption[] =
    spec.source === 'static' ? spec.staticOptions || [] : (await spec.load?.()) || [];
  if (useJson) {
    logger.json({ field: spec.label, options });
    return;
  }
  logger.info(`${spec.label}（${spec.aliases.join('/')}）可选项：`);
  const nameWidth = Math.max(...options.map((o) => displayWidth(o.name)));
  options.forEach((o) => logger.info(`  ${padCell(o.name, nameWidth + 4)}${o.id}`));
}

// ==================== list ====================

export interface IssueListOptions {
  keyword?: string; // 标题关键字
  type?: string; // 工作项类型，逗号分隔
  status?: string; // 状态，逗号分隔
  assigned?: string; // 处理人，逗号分隔，支持 my 表示当前用户
  creator?: string; // 创建人，逗号分隔，支持 my 表示当前用户
  developer?: string; // 开发人员，逗号分隔，支持 my 表示当前用户
  iteration?: string; // 迭代名称或 ID，逗号分隔
  priority?: string; // 优先级，逗号分隔
  severity?: string; // 重要程度，逗号分隔
  domain?: string; // 领域，逗号分隔
  module?: string; // 模块，逗号分隔
  field?: string[]; // 自定义字段过滤，格式 名称=值（可重复传入）
  created?: string; // 创建时间区间，YYYY-MM-DD,YYYY-MM-DD
  updated?: string; // 更新时间区间，YYYY-MM-DD,YYYY-MM-DD
  limit?: string; // 返回条数上限，缺省取全量
  meta?: string; // 元数据字段，逗号分隔，缺省 类型/状态/处理人/迭代/重要程度
  quiet?: boolean; // 仅输出工作项 ID
  count?: boolean; // 仅输出匹配条数
  json?: boolean; // 以 JSON 格式输出
}

const TRACKER_NAME_TO_ID: Record<string, number> = {
  bug: IssueTrackerId.BUG,
  缺陷: IssueTrackerId.BUG,
  task: IssueTrackerId.TASK,
  任务: IssueTrackerId.TASK,
  story: IssueTrackerId.STORY,
  需求: IssueTrackerId.STORY,
  feature: IssueTrackerId.FEATURE,
  特性: IssueTrackerId.FEATURE,
  epic: IssueTrackerId.EPIC,
  史诗: IssueTrackerId.EPIC,
};

// Epic/Feature 需使用各自的 query_type 才能命中，其余类型走 backlog
type IssueQueryGroup = {
  queryType: 'backlog' | 'epic' | 'feature';
  trackerIds?: number[];
};

function buildTypeGroups(type?: string): IssueQueryGroup[] {
  if (!type) {
    return [{ queryType: 'backlog' }];
  }
  const trackerIds = resolveFilterEnumIds('工作项类型', type, TRACKER_NAME_TO_ID);
  const backlogIds = trackerIds.filter(
    (id) => id !== IssueTrackerId.EPIC && id !== IssueTrackerId.FEATURE
  );
  const groups: IssueQueryGroup[] = [];
  if (backlogIds.length > 0) {
    groups.push({ queryType: 'backlog', trackerIds: backlogIds });
  }
  if (trackerIds.includes(IssueTrackerId.FEATURE)) {
    groups.push({ queryType: 'feature', trackerIds: [IssueTrackerId.FEATURE] });
  }
  if (trackerIds.includes(IssueTrackerId.EPIC)) {
    groups.push({ queryType: 'epic', trackerIds: [IssueTrackerId.EPIC] });
  }
  return groups;
}

/**
 * 解析状态筛选值为状态 ID 列表：以项目状态配置为准，数字 ID 直通，
 * 同名状态在不同工作项类型下 ID 不同时展开为全部匹配 ID
 */
function resolveStatusFilterIds(statuses: ProjectIssueStatus[], value: string): number[] {
  const ids = new Set<number>();
  splitFilterValues(value).forEach((v) => {
    if (isNumericString(v)) {
      ids.add(Number(v.trim()));
      return;
    }
    const matched = statuses.filter(
      (s) => s.name === v || s.name.toLowerCase() === v.toLowerCase()
    );
    if (matched.length === 0) {
      const names = [...new Set(statuses.map((s) => s.name))].join('、');
      throw new Error(`未知状态 "${v}"，可用状态：${names} 或数字 ID`);
    }
    matched.forEach((s) => ids.add(s.status_id));
  });
  return [...ids];
}

// 默认输出的元数据字段
const DEFAULT_META_FIELDS = ['类型', '状态', '处理人', '迭代', '重要程度'];

// 元数据字段范围与 issue options 的可查询字段一致（另含 类型）
type IssueMetaFieldSpec = {
  label: string;
  aliases: string[];
  extract: (issue: IssueItem) => string;
};

function buildMetaFieldSpecs(): IssueMetaFieldSpec[] {
  const userName = (user?: { nick_name: string; name: string }): string =>
    user ? user.nick_name || user.name || '' : '';
  return [
    {
      label: '类型',
      aliases: ['type', 'tracker', '工作项类型'],
      extract: (issue) => issue.tracker?.name || '',
    },
    {
      label: '状态',
      aliases: ['status'],
      extract: (issue) => issue.status?.name || '',
    },
    {
      label: '处理人',
      aliases: ['assigned', 'assignee'],
      extract: (issue) => userName(issue.assigned_user),
    },
    {
      label: '开发人员',
      aliases: ['developer', 'dev'],
      extract: (issue) => userName(issue.developer),
    },
    {
      label: '迭代',
      aliases: ['iteration'],
      extract: (issue) => issue.iteration?.name || '',
    },
    {
      label: '优先级',
      aliases: ['priority'],
      extract: (issue) => issue.priority?.name || '',
    },
    {
      label: '重要程度',
      aliases: ['severity'],
      extract: (issue) => issue.severity?.name || '',
    },
    {
      label: '领域',
      aliases: ['domain'],
      extract: (issue) => issue.domain?.name || '',
    },
    {
      label: '模块',
      aliases: ['module'],
      extract: (issue) => issue.module?.name || '',
    },
    {
      label: '父工作项',
      aliases: ['parent'],
      extract: (issue) =>
        issue.parent_issue ? `${issue.parent_issue.name} (#${issue.parent_issue.id})` : '',
    },
    // 自定义字段值取自工作项数据，无需调用选项接口
    ...Object.entries(CUSTOM_FIELD_NAME_TO_ID).map(([label, fieldId]) => ({
      label,
      aliases: [fieldId],
      extract: (issue: IssueItem): string =>
        issue.new_custom_fields?.find((f) => f.custom_field === fieldId)?.value || '',
    })),
  ];
}

function resolveMetaFieldSpecs(specs: IssueMetaFieldSpec[], input: string): IssueMetaFieldSpec[] {
  const resolved = splitFilterValues(input).map((v) => {
    const spec = specs.find(
      (s) => s.label === v || s.aliases.some((a) => a.toLowerCase() === v.toLowerCase())
    );
    if (!spec) {
      throw new Error(`未知元数据字段 "${v}"，可用字段：${specs.map((s) => s.label).join('、')}`);
    }
    return spec;
  });
  return [...new Map(resolved.map((s) => [s.label, s])).values()];
}

function splitFilterValues(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * 解析逗号分隔的固定枚举筛选值（数字 ID 或名称），英文名称不区分大小写
 */
function resolveFilterEnumIds(
  fieldLabel: string,
  value: string,
  nameMap: Record<string, number>
): number[] {
  return splitFilterValues(value).map((v) => {
    if (isNumericString(v)) {
      return Number(v.trim());
    }
    const id = nameMap[v] ?? nameMap[v.toLowerCase()];
    if (id === undefined) {
      throw new Error(
        `未知${fieldLabel} "${v}"，支持：${Object.keys(nameMap).join('、')} 或数字 ID`
      );
    }
    return id;
  });
}

/**
 * 解析逗号分隔的列表筛选值（数字 ID 或名称），名称精确匹配优先，其次包含匹配，
 * 多个匹配项全部保留（筛选项之间为 OR 关系）
 */
function resolveFuzzyFilterIds(
  candidates: Array<{ id: number; name: string }>,
  fieldLabel: string,
  value: string
): number[] {
  const ids = new Set<number>();
  splitFilterValues(value).forEach((v) => {
    if (isNumericString(v)) {
      // 数字值优先按名称精确匹配（迭代等选项名可能为纯数字），无命中再按 ID 处理
      const byName = candidates.filter((c) => c.name === v);
      if (byName.length > 0) {
        byName.forEach((c) => ids.add(c.id));
      } else {
        ids.add(Number(v.trim()));
      }
      return;
    }
    const exact = candidates.filter((c) => c.name === v);
    const matched = exact.length > 0 ? exact : candidates.filter((c) => c.name.includes(v));
    if (matched.length === 0) {
      throw new Error(
        `未找到${fieldLabel} "${v}"，可用选项：${candidates.map((c) => c.name).join('、')}`
      );
    }
    matched.forEach((c) => ids.add(c.id));
  });
  return [...ids];
}

/**
 * 将成员筛选值（昵称/用户名/数字 ID/my）解析为列表接口所需的成员 uuid，
 * my 解析为当前用户 uuid（myUserId）
 */
function resolveMemberUuids(
  members: ProjectMember[],
  fieldLabel: string,
  value: string,
  myUserId?: string
): string[] {
  return splitFilterValues(value).map((v) => {
    if (myUserId && v.toLowerCase() === 'my') {
      return myUserId;
    }
    let candidates: ProjectMember[];
    if (isNumericString(v)) {
      candidates = members.filter((m) => m.user_num_id === Number(v.trim()));
      if (candidates.length === 0) {
        throw new Error(`${fieldLabel} "${v}" 不是项目成员的数字 ID`);
      }
    } else {
      const exact = members.filter((m) => m.nick_name === v || m.user_name === v);
      candidates =
        exact.length > 0
          ? exact
          : members.filter(
              (m) => (m.nick_name || '').includes(v) || (m.user_name || '').includes(v)
            );
      if (candidates.length === 0) {
        throw new Error(`未找到${fieldLabel} "${v}" 对应的项目成员`);
      }
      if (candidates.length > 1) {
        const names = candidates.map((m) => m.nick_name || m.user_name).join('、');
        throw new Error(`${fieldLabel} "${v}" 匹配到多个成员：${names}，请改用成员数字 ID`);
      }
    }
    return candidates[0].user_id;
  });
}

// 时间区间一侧留空时的默认边界（接口要求毫秒时间戳，取远早/晚于项目存在期的值）
const TIME_INTERVAL_EMPTY_START = '1000000000000';
const TIME_INTERVAL_EMPTY_END = '9999999999999';

/**
 * 解析时间区间筛选值为接口要求的毫秒时间戳格式，入参支持 YYYY-MM-DD 或毫秒时间戳，一侧留空表示不设界
 */
function resolveTimeInterval(
  businessService: BusinessService,
  fieldLabel: string,
  value: string
): string {
  const parts = value.split(',');
  if (parts.length !== 2) {
    throw new Error(`${fieldLabel}区间格式应为 YYYY-MM-DD,YYYY-MM-DD，收到 "${value}"`);
  }
  return parts
    .map((part, index) => {
      const v = part.trim();
      if (v === '') {
        return index === 0 ? TIME_INTERVAL_EMPTY_START : TIME_INTERVAL_EMPTY_END;
      }
      if (/^\d+$/.test(v)) {
        return v;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const timestamp = businessService.parseDateToTimestamp(v);
        if (timestamp !== null) {
          return String(timestamp);
        }
      }
      throw new Error(`${fieldLabel}区间的时间 "${v}" 无效，应为 YYYY-MM-DD 或毫秒时间戳`);
    })
    .join(',');
}

export async function issueListCommand(
  options: IssueListOptions,
  cliOptions: CliOptions = {}
): Promise<void> {
  if (options.count && options.quiet) {
    throw new Error('--count 与 --quiet 不能同时使用');
  }

  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const request: ListIssuesV4Request = {};

  if (options.keyword) {
    request.subject = options.keyword;
  }
  if (options.priority) {
    request.priority_ids = resolveFilterEnumIds('优先级', options.priority, PRIORITY_NAME_TO_ID);
  }
  if (options.severity) {
    request.severity_ids = resolveFilterEnumIds('重要程度', options.severity, SEVERITY_NAME_TO_ID);
  }

  let limitNum: number | undefined;
  if (options.limit !== undefined) {
    limitNum = resolveNumber('返回条数上限', options.limit);
    if (!Number.isInteger(limitNum) || limitNum <= 0) {
      throw new Error(`返回条数上限应为正整数，收到 "${options.limit}"`);
    }
  }

  // Epic/Feature 需各自的 query_type 才能命中，混合类型筛选时拆分为多次查询
  const typeGroups = buildTypeGroups(options.type);

  // 筛选解析所需的选项数据一次性并行获取
  const needMembers = Boolean(options.assigned || options.creator || options.developer);
  const usesMy = [options.assigned, options.creator, options.developer].some(
    (v) => v !== undefined && splitFilterValues(v).some((x) => x.toLowerCase() === 'my')
  );
  const [members, currentUser, iterations, domains, modules, statuses] = await Promise.all([
    needMembers ? businessService.getMembers(projectId) : Promise.resolve([]),
    usesMy ? businessService.getCurrentUser() : Promise.resolve(undefined),
    options.iteration
      ? businessService.getIterations(projectId, { limit: 1000 })
      : Promise.resolve([]),
    options.domain ? businessService.getProjectDomains(projectId) : Promise.resolve([]),
    options.module ? businessService.getProjectModules(projectId) : Promise.resolve([]),
    options.status ? businessService.getProjectStatuses(projectId) : Promise.resolve([]),
  ]);
  const myUserId = currentUser?.user_id;

  if (options.assigned) {
    request.assigned_ids = resolveMemberUuids(members, '处理人', options.assigned, myUserId);
  }
  if (options.creator) {
    request.creator_ids = resolveMemberUuids(members, '创建人', options.creator, myUserId);
  }
  if (options.developer) {
    request.developer_ids = resolveMemberUuids(members, '开发人员', options.developer, myUserId);
  }
  if (options.status) {
    request.status_ids = resolveStatusFilterIds(statuses, options.status);
  }
  if (options.iteration) {
    request.iteration_ids = resolveFuzzyFilterIds(iterations, '迭代', options.iteration);
  }
  if (options.domain) {
    request.domain_ids = resolveFuzzyFilterIds(domains, '领域', options.domain);
  }
  if (options.module) {
    request.module_ids = resolveFuzzyFilterIds(modules, '模块', options.module);
  }

  if (options.field && options.field.length > 0) {
    request.custom_fields = parseCustomFieldUpdates(businessService, options.field).map((f) => ({
      custom_field: f.custom_field,
      value: f.value,
    }));
  }
  if (options.created) {
    request.created_time_interval = resolveTimeInterval(
      businessService,
      '创建时间',
      options.created
    );
  }
  if (options.updated) {
    request.updated_time_interval = resolveTimeInterval(
      businessService,
      '更新时间',
      options.updated
    );
  }
  if (limitNum !== undefined) {
    request.limit = limitNum;
  }

  const queries = typeGroups.map((group) => ({
    ...request,
    query_type: group.queryType,
    ...(group.trackerIds ? { tracker_ids: group.trackerIds } : {}),
  }));

  if (options.count) {
    const spinner = createSpinner('正在统计工作项数量...').start();
    let total = 0;
    try {
      for (const query of queries) {
        total += await businessService.countIssues(projectId, query);
      }
      spinner.stop();
    } catch (error: unknown) {
      spinner.fail('统计工作项数量失败');
      throw error;
    }
    logger.info(String(total));
    return;
  }

  const spinner = createSpinner(
    queries.length > 1
      ? `正在查询工作项列表（按工作项类型分 ${queries.length} 次查询）...`
      : '正在查询工作项列表...'
  ).start();
  let issues: IssueItem[] = [];
  try {
    for (const query of queries) {
      issues.push(...(await businessService.listIssues(projectId, query)));
    }
    spinner.stop();
  } catch (error: unknown) {
    spinner.fail('查询工作项列表失败');
    throw error;
  }

  // limit 是输出总条数上限，多组查询合并后统一截断
  if (limitNum !== undefined) {
    issues = issues.slice(0, limitNum);
  }

  if (options.json || outputFormat === 'json') {
    logger.json(issues);
    return;
  }

  if (options.quiet) {
    issues.forEach((issue) => logger.info(String(issue.id)));
    return;
  }

  if (issues.length === 0) {
    logger.warn('未找到匹配的工作项');
    return;
  }

  const metaFields = options.meta
    ? resolveMetaFieldSpecs(buildMetaFieldSpecs(), options.meta)
    : buildMetaFieldSpecs().filter((s) => DEFAULT_META_FIELDS.includes(s.label));

  issues.forEach((issue) => {
    logger.info(pc.bold(`#${issue.id}  ${issue.name}`));
    const parts = metaFields
      .map((spec) => ({ label: spec.label, value: spec.extract(issue) }))
      .filter((p) => p.value);
    if (parts.length > 0) {
      logger.info(pc.gray(`  ${parts.map((p) => `${p.label} ${p.value}`).join(' · ')}`));
    }
    logger.info(pc.gray(`  ${issueLink(projectId, issue.id)}`));
  });
  logger.info(`共 ${issues.length} 条`);
}

// ==================== comments ====================

export interface IssueCommentsOptions {
  last?: string; // 只显示最近 N 条
  json?: boolean; // 以 JSON 格式输出
}

export async function issueCommentsCommand(
  issueId: string,
  options: IssueCommentsOptions,
  cliOptions: CliOptions = {}
): Promise<void> {
  const id = parseInt(issueId, 10);
  if (isNaN(id) || id <= 0) {
    throw new Error(`无效的工作项 ID "${issueId}"`);
  }
  let last: number | undefined;
  if (options.last !== undefined) {
    last = resolveNumber('评论条数', options.last);
    if (!Number.isInteger(last) || last <= 0) {
      throw new Error(`评论条数应为正整数，收到 "${options.last}"`);
    }
  }

  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const spinner = createSpinner('正在查询工作项评论...').start();
  let issueName = '';
  let comments: IssueCommentV4[] = [];
  try {
    const detail = await businessService.getIssueDetail(projectId, id);
    issueName = detail.name;
    comments = await businessService.getIssueComments(projectId, id);
    spinner.stop();
  } catch (error: unknown) {
    spinner.fail('查询工作项评论失败');
    throw error;
  }

  if (options.json || outputFormat === 'json') {
    logger.json(comments);
    return;
  }

  const shown = last !== undefined ? comments.slice(-last) : comments;
  const titleNote =
    last !== undefined && shown.length < comments.length ? `，显示最近 ${shown.length} 条` : '';
  logger.info(
    pc.bold(`#${id}  ${issueName}`) + pc.gray(`（评论 ${comments.length} 条${titleNote}）`)
  );
  if (shown.length === 0) {
    logger.info(pc.gray('  无评论'));
    return;
  }
  shown.forEach((c) => {
    const time = formatTimestamp(c.timestamp);
    const author = c.user?.nick_name || c.user?.user_name || '匿名';
    const text = renderHtmlText(c.comment, new Map());
    logger.info(pc.gray(`  [${time}] ${author}: ${text}`));
  });
}

// ==================== create ====================

export interface IssueCreateOptions {
  type: string; // 工作项类型名称或 ID（必填）
  name: string; // 标题（必填）
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

export async function issueCreateCommand(
  options: IssueCreateOptions,
  cliOptions: CliOptions = {}
): Promise<void> {
  const { projectId, config } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const trackerIds = resolveFilterEnumIds('工作项类型', options.type, TRACKER_NAME_TO_ID);
  if (trackerIds.length > 1) {
    throw new Error('工作项类型只能指定一个');
  }

  const createData: UpdateIssueRequest = {
    name: options.name,
    tracker_id: trackerIds[0],
  };
  const changeSummary: string[] = [`类型: ${options.type}`, `标题: ${options.name}`];

  if (options.description) {
    createData.description = options.description;
    changeSummary.push(`描述: <${options.description.length} 字符>`);
  }
  if (options.status) {
    createData.status_id = await resolveStatusId(businessService, projectId, options.status);
    changeSummary.push(`状态: ${options.status} -> ${createData.status_id}`);
  }
  if (options.assigned) {
    createData.assigned_id = await resolveMemberId(
      businessService,
      projectId,
      '处理人',
      options.assigned
    );
    changeSummary.push(`处理人: ${options.assigned} -> ${createData.assigned_id}`);
  }
  if (options.developer) {
    createData.developer_id = await resolveMemberId(
      businessService,
      projectId,
      '开发人员',
      options.developer
    );
    changeSummary.push(`开发人员: ${options.developer} -> ${createData.developer_id}`);
  }
  if (options.iteration) {
    createData.iteration_id = await resolveIterationId(
      businessService,
      projectId,
      options.iteration
    );
    changeSummary.push(`迭代: ${options.iteration} -> ${createData.iteration_id}`);
  }
  if (options.priority) {
    createData.priority_id = resolveEnumId(options.priority, PRIORITY_NAME_TO_ID, '优先级');
  } else {
    // 接口要求创建必须携带 priority_id（Task/Bug 实测均报 PM.02100001），未指定时默认"中"
    createData.priority_id = PRIORITY_NAME_TO_ID['中'];
  }
  changeSummary.push(`优先级: ${options.priority || '中（默认）'} -> ${createData.priority_id}`);
  if (options.severity) {
    createData.severity_id = resolveEnumId(options.severity, SEVERITY_NAME_TO_ID, '重要程度');
    changeSummary.push(`重要程度: ${options.severity} -> ${createData.severity_id}`);
  }
  if (options.domain) {
    createData.domain_id = await resolveOptionId(
      businessService,
      projectId,
      '领域',
      options.domain,
      () => businessService.getProjectDomains(projectId)
    );
    changeSummary.push(`领域: ${options.domain} -> ${createData.domain_id}`);
  }
  if (options.module) {
    createData.module_id = await resolveOptionId(
      businessService,
      projectId,
      '模块',
      options.module,
      () => businessService.getProjectModules(projectId)
    );
    changeSummary.push(`模块: ${options.module} -> ${createData.module_id}`);
  }
  if (options.parent) {
    createData.parent_issue_id = resolveNumericId('父工作项', options.parent);
    changeSummary.push(`父工作项 ID: ${createData.parent_issue_id}`);
  }
  if (options.begin) {
    assertDateFormat('预计开始时间', options.begin);
    createData.begin_time = options.begin;
    changeSummary.push(`预计开始: ${options.begin}`);
  }
  if (options.end) {
    assertDateFormat('预计结束时间', options.end);
    createData.end_time = options.end;
    changeSummary.push(`预计结束: ${options.end}`);
  }
  if (options.doneRatio) {
    const ratio = resolveNumber('完成度', options.doneRatio);
    if (ratio < 0 || ratio > 100) {
      throw new Error(`完成度应在 0-100 之间，收到 "${options.doneRatio}"`);
    }
    createData.done_ratio = ratio;
    changeSummary.push(`完成度: ${ratio}`);
  }
  if (options.expectedWorkHours) {
    createData.expected_work_hours = resolveNumber('预计工时', options.expectedWorkHours);
    changeSummary.push(`预计工时: ${createData.expected_work_hours}`);
  }
  if (options.actualWorkHours) {
    createData.actual_work_hours = resolveNumber('实际工时', options.actualWorkHours);
    changeSummary.push(`实际工时: ${createData.actual_work_hours}`);
  }
  if (options.field && options.field.length > 0) {
    const customFields = parseCustomFieldUpdates(businessService, options.field);
    createData.new_custom_fields = customFields;
    customFields.forEach((f) => changeSummary.push(`${f.field_name}: ${f.value}`));
  }

  const spinner = createSpinner('正在创建工作项...').start();
  let created: CreateIssueV4Response;
  try {
    created = await businessService.createIssue(projectId, createData);
    spinner.succeed(`创建成功：#${created.id} ${created.name}`);
  } catch (error: unknown) {
    spinner.fail('创建工作项失败');
    throw error;
  }

  changeSummary.forEach((line) => logger.info(`  ${line}`));
  logger.info(`  ${issueLink(projectId, created.id)}`);
}
