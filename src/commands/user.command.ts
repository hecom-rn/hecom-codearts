import pc from 'picocolors';
import { BusinessService } from '../services/business.service';
import { ProjectMember } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { logger } from '../utils/logger';
import { createSpinner } from '../utils/spinner';

// ==================== detail ====================

interface UserDetailGroup {
  member: ProjectMember; // 该用户任意一行成员记录，作为详情代表
  roles: Array<{ role_id: number; role_name: string }>;
}

// 一个用户可持有多角色（成员列表中按 user_id 出现多行），按 user_id 聚合并合并角色
function groupByUser(members: ProjectMember[]): UserDetailGroup[] {
  const groups = new Map<string, UserDetailGroup>();
  members.forEach((m) => {
    const group = groups.get(m.user_id);
    if (group) {
      if (!group.roles.some((r) => r.role_id === m.role_id)) {
        group.roles.push({ role_id: m.role_id, role_name: m.role_name });
      }
    } else {
      groups.set(m.user_id, {
        member: m,
        roles: [{ role_id: m.role_id, role_name: m.role_name }],
      });
    }
  });
  return [...groups.values()];
}

// 按定位符匹配成员：数字 → 数字 ID；my → 当前配置用户；其余 → 用户名（忽略大小写）或昵称精确匹配
function matchMembers(
  members: ProjectMember[],
  identifier: string,
  currentUsername: string
): ProjectMember[] {
  if (/^\d+$/.test(identifier)) {
    const numId = parseInt(identifier, 10);
    return members.filter((m) => m.user_num_id === numId);
  }
  const name = identifier.toLowerCase() === 'my' ? currentUsername : identifier;
  const lowerName = name.toLowerCase();
  return members.filter((m) => m.user_name.toLowerCase() === lowerName || m.nick_name === name);
}

function outputDetailConsole(groups: UserDetailGroup[], index: number): void {
  groups.forEach((group) => {
    const u = group.member;
    logger.info(pc.bold(`[${index}] ${u.nick_name || u.user_name} (${u.user_name})`));
    logger.info(`  用户 ID: ${u.user_id}  数字 ID: ${u.user_num_id}`);
    logger.info(`  类型: ${u.user_type || '-'}  状态: ${u.forbidden === 1 ? '已禁用' : '正常'}`);
    const roles = group.roles.map((r) => `${r.role_name}(${r.role_id})`).join('、');
    logger.info(`  角色 (${group.roles.length}): ${roles}`);
  });
}

/**
 * 查询项目成员详情与角色
 * @param identifiers 用户定位符列表：用户名、数字 ID、昵称，my 表示当前配置用户
 * @param cliOptions 命令行选项，json 为 true 时输出原始成员记录
 */
export async function userDetailCommand(
  identifiers: string[],
  cliOptions: CliOptions & { json?: boolean } = {}
): Promise<void> {
  const { projectId, config, outputFormat } = loadConfig(cliOptions);
  const businessService = new BusinessService(config);

  const spinner = createSpinner('正在查询项目成员...').start();
  const members = await businessService.getMembers(projectId);
  spinner.stop();

  const matched = identifiers.map((identifier) => ({
    identifier,
    members: matchMembers(members, identifier, config.username),
  }));

  if (cliOptions.json || outputFormat === 'json') {
    logger.json(matched.flatMap((m) => m.members));
    return;
  }

  matched.forEach(({ identifier, members: matchedMembers }, index) => {
    const groups = groupByUser(matchedMembers);
    if (groups.length === 0) {
      logger.info(pc.red(`[${index + 1}] 未找到用户: ${identifier}`));
      return;
    }
    outputDetailConsole(groups, index + 1);
  });

  const failedCount = matched.filter((m) => m.members.length === 0).length;
  if (failedCount > 0) {
    logger.warn(`共 ${failedCount} 个定位符未匹配到项目成员`);
  }
}
