import dotenv from 'dotenv';
import { HOLIDAYS } from './config/holidays';
import { BusinessService } from './services/business.service';
import { HuaweiCloudConfig } from './types';

dotenv.config();

/**
 * 判断是否为周末（周六或周日）
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 判断是否为工作日
 */
function isWorkday(date: Date, year: string): boolean {
  const dateStr = formatDate(date);
  const yearConfig = HOLIDAYS[year];

  if (!yearConfig) {
    // 如果没有配置，按普通周末计算
    return !isWeekend(date);
  }

  // 如果在调休工作日列表中，是工作日
  if (yearConfig.workdays.includes(dateStr)) {
    return true;
  }

  // 如果在法定节假日列表中，不是工作日
  if (yearConfig.holidays.includes(dateStr)) {
    return false;
  }

  // 否则按周末判断
  return !isWeekend(date);
}

/**
 * 计算应计工时
 * @param year 年份
 * @returns 应计工作日天数
 */
function calculateExpectedWorkdays(year: string): number {
  const yearNum = parseInt(year);
  const currentYear = new Date().getFullYear();
  const currentDate = new Date();

  let endDate: Date;

  if (yearNum < currentYear) {
    // 历史年份，计算全年
    endDate = new Date(yearNum, 11, 31);
  } else if (yearNum === currentYear) {
    // 当前年份，计算到今天
    endDate = currentDate;
  } else {
    // 未来年份，返回0
    return 0;
  }

  const startDate = new Date(yearNum, 0, 1);
  let workdays = 0;

  // 遍历每一天
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    if (isWorkday(d, year)) {
      workdays++;
    }
  }

  return workdays;
}

async function main() {
  try {
    // 从命令行参数获取年份，格式：npm run work-hour 2025
    const yearArg = process.argv[2];
    const year = yearArg || new Date().getFullYear().toString();
    console.log(`开始获取 ${year} 年工时统计...`);

    const projectId = process.env.PROJECT_ID;
    const roleId = process.env.ROLE_ID;

    if (!projectId) {
      console.error('错误: 未设置环境变量 PROJECT_ID');
      process.exit(1);
    }

    if (!roleId) {
      console.error('错误: 未设置环境变量 ROLE_ID');
      process.exit(1);
    }

    const config: HuaweiCloudConfig = {
      iamEndpoint:
        process.env.HUAWEI_CLOUD_IAM_ENDPOINT || 'https://iam.cn-north-1.myhuaweicloud.com',
      region: process.env.HUAWEI_CLOUD_REGION || 'cn-north-1',
      endpoint:
        process.env.CODEARTS_BASE_URL || 'https://projectman-ext.cn-north-1.myhuaweicloud.cn',
      username: process.env.HUAWEI_CLOUD_USERNAME || '',
      password: process.env.HUAWEI_CLOUD_PASSWORD || '',
      domainName: process.env.HUAWEI_CLOUD_DOMAIN || '',
    };

    const businessService = new BusinessService(config);

    const roleMembers = await businessService.getMembersByRoleId(projectId, parseInt(roleId));

    if (roleMembers.length === 0) {
      console.log('未找到指定角色的用户');
      return;
    }

    const roleUserIds = roleMembers.map((member) => member.user_id);

    const stats = await businessService.getAllWorkHourStats(
      projectId,
      roleUserIds,
      `${year}-01-01`,
      `${year}-12-31`
    );

    const expectedWorkdays = calculateExpectedWorkdays(year);
    const expectedHoursPerPerson = expectedWorkdays * 8;
    const totalExpectedHours = expectedHoursPerPerson * roleMembers.length;

    console.log(`\n${year}年工时统计报告`);
    console.log('='.repeat(80));
    console.log(`统计期间: ${stats.beginDate} 至 ${stats.endDate}`);
    console.log(`统计人数: ${roleMembers.length} 人`);
    console.log(`应计工作日: ${expectedWorkdays} 天`);
    console.log(`应计工时: ${totalExpectedHours} 小时 (${expectedHoursPerPerson} 小时/人)`);
    console.log(`实际工时: ${stats.totalHours} 小时`);
    console.log(`工时完成率: ${((stats.totalHours / totalExpectedHours) * 100).toFixed(2)}%`);
    console.log(`工时条目: ${stats.totalEntries} 条`);
    console.log('='.repeat(80));

    // 收集所有的领域类型
    const allTypes = new Set<string>();
    stats.userStats.forEach((userStat) => {
      userStat.domainStats.forEach((domainStat) => {
        allTypes.add(domainStat.type);
      });
    });

    // 构建表格数据：人作为行，type作为列
    const tableData: Record<string, Record<string, number>> = {};
    const typeTotals: Record<string, number> = {};

    // 初始化总计
    allTypes.forEach((type) => {
      typeTotals[type] = 0;
    });

    // 填充用户数据
    stats.userStats.forEach((userStat) => {
      const row: Record<string, number> = {};

      // 初始化所有类型为0
      allTypes.forEach((type) => {
        row[type] = 0;
      });

      // 填充实际工时
      let userTotal = 0;
      userStat.domainStats.forEach((domainStat) => {
        row[domainStat.type] = domainStat.totalHours;
        userTotal += domainStat.totalHours;
        typeTotals[domainStat.type] += domainStat.totalHours;
      });

      row['合计'] = userTotal;
      tableData[userStat.userName] = row;
    });

    // 添加总计行
    const totalRow: Record<string, number> = {};
    let grandTotal = 0;
    allTypes.forEach((type) => {
      totalRow[type] = typeTotals[type];
      grandTotal += typeTotals[type];
    });
    totalRow['合计'] = grandTotal;
    tableData['总计'] = totalRow;

    console.log('\n工时统计表:');
    console.table(tableData);
  } catch (error) {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
