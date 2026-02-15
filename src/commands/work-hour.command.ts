import ora from 'ora';
import { calculateExpectedWorkdays } from '../config/holidays';
import { BusinessService } from '../services/business.service';
import { ConsoleTotal, ProjectMember, UserAllWorkHourStats } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { consoleTotal } from '../utils/console';
import { buildCsvRow, writeCsvFile } from '../utils/csv-writer';
import { logger } from '../utils/logger';

/**
 * 处理浮点数精度，保留2位小数
 */
function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}

interface UserWithRole extends UserAllWorkHourStats {
  roleName: string;
  roleId: number;
}

interface UserStats {
  userName: string;
  roleName: string;
  domainStats: Record<string, number>;
  total: number;
}

/**
 * 查询年度工时数据
 */
async function queryWorkHourReportData(
  businessService: BusinessService,
  projectId: string,
  roleIds: number[],
  targetYear: string
): Promise<ConsoleTotal<UserStats>> {
  const members = await businessService.getMembersByRoleIds(projectId, roleIds);

  const userIds = members.map((member) => member.user_id);

  const stats = await businessService.getAllWorkHourStats(
    projectId,
    userIds,
    `${targetYear}-01-01`,
    `${targetYear}-12-31`
  );

  // 创建用户ID到成员信息的映射
  const userIdToMember = new Map<string, ProjectMember>();
  members.forEach((member) => {
    userIdToMember.set(member.user_id, member);
  });

  const allUserStats: UserWithRole[] = [];
  const allTypes = new Set<string>();

  stats.userStats.forEach((userStat) => {
    const member = userIdToMember.get(userStat.userId);
    if (member) {
      allUserStats.push({
        ...userStat,
        roleName: member.role_name,
        roleId: member.role_id,
      });

      userStat.domainStats.forEach((domainStat) => {
        allTypes.add(domainStat.type);
      });
    }
  });

  allUserStats.sort((a, b) => {
    if (a.roleId !== b.roleId) {
      return a.roleId - b.roleId;
    }
    return a.userName.localeCompare(b.userName);
  });

  const expectedWorkdays = calculateExpectedWorkdays(targetYear);
  const expectedHoursPerPerson = expectedWorkdays * 8;
  const totalExpectedHours = expectedHoursPerPerson * members.length;

  const totalHours = roundToTwo(
    allUserStats.reduce((sum, userStat) => sum + userStat.totalHours, 0)
  );

  const userStatsData: UserStats[] = [];

  allUserStats.forEach((userStat) => {
    const domainStats: Record<string, number> = {};
    allTypes.forEach((type) => {
      domainStats[type] = 0;
    });

    let userTotal = 0;
    userStat.domainStats.forEach((domainStat) => {
      domainStats[domainStat.type] = domainStat.totalHours;
      userTotal = roundToTwo(userTotal + domainStat.totalHours);
    });

    userStatsData.push({
      userName: userStat.userName,
      roleName: userStat.roleName,
      domainStats,
      total: userTotal,
    });
  });

  return {
    title: `${targetYear}年工时统计`,
    roleNames: Array.from(new Set(members.map((m) => m.role_name))),
    totalMap: [
      ['统计人数', `${members.length} 人`],
      ['应计工日', `${expectedWorkdays} 天`],
      ['应计工时', `${totalExpectedHours} 小时`],
      ['实际工时', `${totalHours} 小时`],
      ['工时完成率', `${((totalHours / totalExpectedHours) * 100).toFixed(2)}%`],
    ],
    list: userStatsData,
  };
}

/**
 * 控制台输出工时统计
 */
function outputConsole(data: ConsoleTotal<UserStats>): void {
  consoleTotal(data);

  // 构建表格数据
  const tableData: Record<string, Record<string, string | number>> = {};

  data.list.forEach((userStat) => {
    const row: Record<string, string | number> = {
      ...userStat.domainStats,
      合计: userStat.total,
    };
    tableData[userStat.userName] = row;
  });

  logger.table(tableData);
}

/**
 * CSV 文件输出
 */
function outputCsv(list: UserStats[], targetYear: string): void {
  const domains = Object.keys(list[0].domainStats);
  const csvLines: string[] = [];

  const headerRow = ['用户', '角色', ...domains, '合计'];
  csvLines.push(buildCsvRow(headerRow));

  list.forEach((userStat) => {
    const domainValues = domains.map((domain) => userStat.domainStats[domain] || 0);
    csvLines.push(
      buildCsvRow([userStat.userName, userStat.roleName, ...domainValues, userStat.total])
    );
  });

  const filename = `work-hour-${targetYear}.csv`;
  writeCsvFile(filename, csvLines, logger);
}

/**
 * JSON 输出（直接打印到控制台，供编程调用）
 */
function outputJson(data: UserStats[]): void {
  logger.json(data);
}

/**
 * work-hour 命令入口
 */
export async function workHourCommand(year?: string, cliOptions: CliOptions = {}): Promise<void> {
  const spinner = ora('正在查询数据...').start();
  const targetYear = year || new Date().getFullYear().toString();

  const { projectId, roleIds, config, outputFormat } = loadConfig(cliOptions);

  const businessService = new BusinessService(config);

  const reportData = await queryWorkHourReportData(businessService, projectId, roleIds, targetYear);
  spinner.stop();
  if (outputFormat === 'console') {
    outputConsole(reportData);
  } else if (outputFormat === 'csv') {
    outputCsv(reportData.list, targetYear);
  } else if (outputFormat === 'json') {
    outputJson(reportData.list);
  }
}
