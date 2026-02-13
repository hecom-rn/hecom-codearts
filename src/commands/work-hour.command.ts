import { calculateExpectedWorkdays } from '../config/holidays';
import { BusinessService } from '../services/business.service';
import { ProjectMember, UserAllWorkHourStats } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';
import { writeCsvFile } from '../utils/csv-writer';
import { logger } from '../utils/logger';

interface UserWithRole extends UserAllWorkHourStats {
  roleName: string;
  roleId: number;
}

interface WorkHourReportData {
  year: string;
  roleCount: number;
  memberCount: number;
  expectedWorkdays: number;
  expectedHours: number;
  actualHours: number;
  completionRate: number;
  entryCount: number;
  userStats: Array<{
    userName: string;
    roleName: string;
    roleId: number;
    domainStats: Record<string, number>;
    total: number;
  }>;
  roleSubtotals: Array<{
    roleName: string;
    domainStats: Record<string, number>;
    total: number;
  }>;
  grandTotal: {
    domainStats: Record<string, number>;
    total: number;
  };
}

/**
 * 查询年度工时数据
 */
async function queryWorkHourReportData(
  businessService: BusinessService,
  projectId: string,
  roleIds: number[],
  targetYear: string
): Promise<WorkHourReportData> {
  const allMembers: ProjectMember[] = [];
  const allUserStats: UserWithRole[] = [];
  const allTypes = new Set<string>();

  for (const roleId of roleIds) {
    const roleMembers = await businessService.getMembersByRoleId(projectId, roleId);

    if (roleMembers.length === 0) {
      logger.warn(`角色ID ${roleId} 未找到用户，跳过`);
      continue;
    }

    const roleName = roleMembers[0].role_name;
    allMembers.push(...roleMembers);

    const roleUserIds = roleMembers.map((member) => member.user_id);

    const stats = await businessService.getAllWorkHourStats(
      projectId,
      roleUserIds,
      `${targetYear}-01-01`,
      `${targetYear}-12-31`
    );

    stats.userStats.forEach((userStat) => {
      allUserStats.push({
        ...userStat,
        roleName,
        roleId,
      });

      userStat.domainStats.forEach((domainStat) => {
        allTypes.add(domainStat.type);
      });
    });
  }

  allUserStats.sort((a, b) => {
    if (a.roleId !== b.roleId) {
      return a.roleId - b.roleId;
    }
    return a.userName.localeCompare(b.userName);
  });

  const expectedWorkdays = calculateExpectedWorkdays(targetYear);
  const expectedHoursPerPerson = expectedWorkdays * 8;
  const totalExpectedHours = expectedHoursPerPerson * allMembers.length;

  const totalHours = allUserStats.reduce((sum, userStat) => sum + userStat.totalHours, 0);
  const totalEntries = allUserStats.reduce(
    (sum, userStat) => sum + userStat.domainStats.reduce((s, d) => s + d.workHours.length, 0),
    0
  );

  const userStatsData: WorkHourReportData['userStats'] = [];
  const roleSubtotals: WorkHourReportData['roleSubtotals'] = [];
  const typeTotals: Record<string, number> = {};

  allTypes.forEach((type) => {
    typeTotals[type] = 0;
  });

  let currentRoleId: number | null = null;
  let currentRoleName = '';
  const roleSubtotalStats: Record<string, number> = {};

  allUserStats.forEach((userStat, index) => {
    if (currentRoleId !== null && currentRoleId !== userStat.roleId) {
      const subtotalDomainStats: Record<string, number> = {};
      let subtotal = 0;
      allTypes.forEach((type) => {
        subtotalDomainStats[type] = roleSubtotalStats[type] || 0;
        subtotal += roleSubtotalStats[type] || 0;
      });

      roleSubtotals.push({
        roleName: currentRoleName,
        domainStats: subtotalDomainStats,
        total: subtotal,
      });

      Object.keys(roleSubtotalStats).forEach((key) => {
        roleSubtotalStats[key] = 0;
      });
    }

    currentRoleId = userStat.roleId;
    currentRoleName = userStat.roleName;

    const domainStats: Record<string, number> = {};
    allTypes.forEach((type) => {
      domainStats[type] = 0;
    });

    let userTotal = 0;
    userStat.domainStats.forEach((domainStat) => {
      domainStats[domainStat.type] = domainStat.totalHours;
      userTotal += domainStat.totalHours;
      typeTotals[domainStat.type] += domainStat.totalHours;

      if (!roleSubtotalStats[domainStat.type]) {
        roleSubtotalStats[domainStat.type] = 0;
      }
      roleSubtotalStats[domainStat.type] += domainStat.totalHours;
    });

    userStatsData.push({
      userName: userStat.userName,
      roleName: userStat.roleName,
      roleId: userStat.roleId,
      domainStats,
      total: userTotal,
    });

    if (index === allUserStats.length - 1) {
      const subtotalDomainStats: Record<string, number> = {};
      let subtotal = 0;
      allTypes.forEach((type) => {
        subtotalDomainStats[type] = roleSubtotalStats[type] || 0;
        subtotal += roleSubtotalStats[type] || 0;
      });

      roleSubtotals.push({
        roleName: currentRoleName,
        domainStats: subtotalDomainStats,
        total: subtotal,
      });
    }
  });

  const grandTotalDomainStats: Record<string, number> = {};
  let grandTotal = 0;
  allTypes.forEach((type) => {
    grandTotalDomainStats[type] = typeTotals[type];
    grandTotal += typeTotals[type];
  });

  return {
    year: targetYear,
    roleCount: roleIds.length,
    memberCount: allMembers.length,
    expectedWorkdays,
    expectedHours: totalExpectedHours,
    actualHours: totalHours,
    completionRate: (totalHours / totalExpectedHours) * 100,
    entryCount: totalEntries,
    userStats: userStatsData,
    roleSubtotals,
    grandTotal: {
      domainStats: grandTotalDomainStats,
      total: grandTotal,
    },
  };
}

/**
 * 控制台输出工时统计
 */
function outputConsole(data: WorkHourReportData): void {
  logger.info(`\n${data.year}年工时统计报告`);
  logger.info('='.repeat(80));
  logger.info(`统计期间: ${data.year}-01-01 至 ${data.year}-12-31`);
  logger.info(`统计角色: ${data.roleCount} 个角色`);
  logger.info(`统计人数: ${data.memberCount} 人`);
  logger.info(`应计工作日: ${data.expectedWorkdays} 天`);
  logger.info(`应计工时: ${data.expectedHours} 小时`);
  logger.info(`实际工时: ${data.actualHours} 小时`);
  logger.info(`工时完成率: ${data.completionRate.toFixed(2)}%`);
  logger.info(`工时条目: ${data.entryCount} 条`);
  logger.info('='.repeat(80));

  // 构建表格数据
  const tableData: Record<string, Record<string, string | number>> = {};

  data.userStats.forEach((userStat) => {
    const row: Record<string, string | number> = {
      角色: userStat.roleName,
      ...userStat.domainStats,
      合计: userStat.total,
    };
    tableData[userStat.userName] = row;
  });

  // 添加角色小计行
  data.roleSubtotals.forEach((subtotal) => {
    const row: Record<string, string | number> = {
      角色: `${subtotal.roleName} 小计`,
      ...subtotal.domainStats,
      合计: subtotal.total,
    };
    tableData[`─ ${subtotal.roleName} 小计`] = row;
  });

  // 添加总计行
  tableData['━━ 总计'] = {
    角色: '━ 总计',
    ...data.grandTotal.domainStats,
    合计: data.grandTotal.total,
  };

  logger.info('\n工时统计表:');
  logger.table(tableData);
}

/**
 * CSV 文件输出
 */
function outputCsv(data: WorkHourReportData, targetYear: string): void {
  const domains = Object.keys(data.grandTotal.domainStats);
  const csvLines: string[] = [];
  csvLines.push(`用户,角色,${domains.join(',')},合计`);

  data.userStats.forEach((userStat) => {
    const domainValues = domains.map((domain) => userStat.domainStats[domain] || 0);
    csvLines.push(
      `${userStat.userName},${userStat.roleName},${domainValues.join(',')},${userStat.total}`
    );
  });

  data.roleSubtotals.forEach((subtotal) => {
    const domainValues = domains.map((domain) => subtotal.domainStats[domain] || 0);
    csvLines.push(`${subtotal.roleName} 小计,,${domainValues.join(',')},${subtotal.total}`);
  });

  const totalDomainValues = domains.map((domain) => data.grandTotal.domainStats[domain] || 0);
  csvLines.push(`总计,,${totalDomainValues.join(',')},${data.grandTotal.total}`);

  const filename = `work-hour-${targetYear}.csv`;
  writeCsvFile(filename, csvLines, logger);
}

/**
 * JSON 输出（直接打印到控制台，供编程调用）
 */
function outputJson(data: WorkHourReportData): void {
  logger.json(data);
}

/**
 * work-hour 命令入口
 */
export async function workHourCommand(year?: string, cliOptions: CliOptions = {}): Promise<void> {
  try {
    const targetYear = year || new Date().getFullYear().toString();

    const { projectId, roleIds, config, outputFormat } = loadConfig(cliOptions);

    const businessService = new BusinessService(config);

    const reportData = await queryWorkHourReportData(
      businessService,
      projectId,
      roleIds,
      targetYear
    );

    if (outputFormat === 'console') {
      outputConsole(reportData);
    } else if (outputFormat === 'csv') {
      outputCsv(reportData, targetYear);
    } else if (outputFormat === 'json') {
      outputJson(reportData);
    }
  } catch (error) {
    logger.error(`执行过程中发生错误:`, error);
    process.exit(1);
  }
}
