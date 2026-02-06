import dotenv from 'dotenv';
import { calculateExpectedWorkdays } from './config/holidays';
import { BusinessService } from './services/business.service';
import { HuaweiCloudConfig, ProjectMember, UserAllWorkHourStats } from './types';

dotenv.config();

interface UserWithRole extends UserAllWorkHourStats {
  roleName: string;
  roleId: number;
}

async function main() {
  try {
    // 从命令行参数获取年份，格式：npm run work-hour 2025
    const yearArg = process.argv[2];
    const year = yearArg || new Date().getFullYear().toString();
    console.log(`开始获取 ${year} 年工时统计...`);

    const projectId = process.env.PROJECT_ID;
    const roleIdStr = process.env.ROLE_ID;

    if (!projectId) {
      console.error('错误: 未设置环境变量 PROJECT_ID');
      process.exit(1);
    }

    if (!roleIdStr) {
      console.error('错误: 未设置环境变量 ROLE_ID');
      process.exit(1);
    }

    // 支持逗号分隔的多个 ROLE_ID
    const roleIds = roleIdStr.split(',').map((id) => parseInt(id.trim()));

    if (roleIds.some((id) => isNaN(id))) {
      console.error('错误: ROLE_ID 格式不正确，应为数字或逗号分隔的数字列表');
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

    // 收集所有角色的成员和工时数据
    const allMembers: ProjectMember[] = [];
    const allUserStats: UserWithRole[] = [];
    const allTypes = new Set<string>();

    for (const roleId of roleIds) {
      const roleMembers = await businessService.getMembersByRoleId(projectId, roleId);

      if (roleMembers.length === 0) {
        console.log(`角色ID ${roleId} 未找到用户，跳过`);
        continue;
      }

      const roleName = roleMembers[0].role_name;
      allMembers.push(...roleMembers);

      const roleUserIds = roleMembers.map((member) => member.user_id);

      const stats = await businessService.getAllWorkHourStats(
        projectId,
        roleUserIds,
        `${year}-01-01`,
        `${year}-12-31`
      );

      // 为每个用户添加角色信息
      stats.userStats.forEach((userStat) => {
        allUserStats.push({
          ...userStat,
          roleName,
          roleId,
        });

        // 收集所有领域类型
        userStat.domainStats.forEach((domainStat) => {
          allTypes.add(domainStat.type);
        });
      });
    }

    if (allMembers.length === 0) {
      console.log('未找到任何角色的用户');
      return;
    }

    // 按角色ID排序用户
    allUserStats.sort((a, b) => {
      if (a.roleId !== b.roleId) {
        return a.roleId - b.roleId;
      }
      return a.userName.localeCompare(b.userName);
    });

    const expectedWorkdays = calculateExpectedWorkdays(year);
    const expectedHoursPerPerson = expectedWorkdays * 8;
    const totalExpectedHours = expectedHoursPerPerson * allMembers.length;

    // 计算总工时
    const totalHours = allUserStats.reduce((sum, userStat) => sum + userStat.totalHours, 0);
    const totalEntries = allUserStats.reduce(
      (sum, userStat) => sum + userStat.domainStats.reduce((s, d) => s + d.workHours.length, 0),
      0
    );

    console.log(`\n${year}年工时统计报告`);
    console.log('='.repeat(80));
    console.log(`统计期间: ${year}-01-01 至 ${year}-12-31`);
    console.log(`统计角色: ${roleIds.length} 个角色`);
    console.log(`统计人数: ${allMembers.length} 人`);
    console.log(`应计工作日: ${expectedWorkdays} 天`);
    console.log(`应计工时: ${totalExpectedHours} 小时 (${expectedHoursPerPerson} 小时/人)`);
    console.log(`实际工时: ${totalHours} 小时`);
    console.log(`工时完成率: ${((totalHours / totalExpectedHours) * 100).toFixed(2)}%`);
    console.log(`工时条目: ${totalEntries} 条`);
    console.log('='.repeat(80));

    // 构建表格数据：人作为行，type作为列
    const tableData: Record<string, Record<string, string | number>> = {};
    const typeTotals: Record<string, number> = {};

    // 初始化总计
    allTypes.forEach((type) => {
      typeTotals[type] = 0;
    });

    // 按角色分组并填充数据
    let currentRoleId: number | null = null;
    let currentRoleName = '';
    const roleSubtotals: Record<string, number> = {};

    allUserStats.forEach((userStat, index) => {
      // 检测角色变化，插入小计行
      if (currentRoleId !== null && currentRoleId !== userStat.roleId) {
        const subtotalRow: Record<string, string | number> = {};
        subtotalRow['角色'] = `${currentRoleName} 小计`;
        let subtotal = 0;
        allTypes.forEach((type) => {
          subtotalRow[type] = roleSubtotals[type] || 0;
          subtotal += roleSubtotals[type] || 0;
        });
        subtotalRow['合计'] = subtotal;
        tableData[`─ ${currentRoleName} 小计`] = subtotalRow;

        // 重置小计
        Object.keys(roleSubtotals).forEach((key) => {
          roleSubtotals[key] = 0;
        });
      }

      // 更新当前角色
      currentRoleId = userStat.roleId;
      currentRoleName = userStat.roleName;

      // 填充用户数据
      const row: Record<string, string | number> = {};
      row['角色'] = userStat.roleName;

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

        // 累加到角色小计
        if (!roleSubtotals[domainStat.type]) {
          roleSubtotals[domainStat.type] = 0;
        }
        roleSubtotals[domainStat.type] += domainStat.totalHours;
      });

      row['合计'] = userTotal;
      tableData[userStat.userName] = row;

      // 如果是最后一个用户，添加最后一个角色的小计
      if (index === allUserStats.length - 1) {
        const subtotalRow: Record<string, string | number> = {};
        subtotalRow['角色'] = `${currentRoleName} 小计`;
        let subtotal = 0;
        allTypes.forEach((type) => {
          subtotalRow[type] = roleSubtotals[type] || 0;
          subtotal += roleSubtotals[type] || 0;
        });
        subtotalRow['合计'] = subtotal;
        tableData[`─ ${currentRoleName} 小计`] = subtotalRow;
      }
    });

    // 添加总计行
    const totalRow: Record<string, string | number> = {};
    totalRow['角色'] = '━ 总计';
    let grandTotal = 0;
    allTypes.forEach((type) => {
      totalRow[type] = typeTotals[type];
      grandTotal += typeTotals[type];
    });
    totalRow['合计'] = grandTotal;
    tableData['━━ 总计'] = totalRow;

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
