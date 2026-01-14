import dotenv from 'dotenv';
import { BusinessService } from './services/business.service';
import { HuaweiCloudConfig } from './types';

dotenv.config();

async function main() {
  try {
    // 从命令行参数获取年份，格式：npm run work-hour 2025
    const yearArg = process.argv[2];
    const year = yearArg || '2025';
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

    console.log(`\n${year}年工时统计报告`);
    console.log('='.repeat(80));
    console.log(`统计期间: ${stats.beginDate} 至 ${stats.endDate}`);
    console.log(`总工时: ${stats.totalHours} 小时`);
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
