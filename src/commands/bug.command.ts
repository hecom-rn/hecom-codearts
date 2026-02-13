import { BusinessService } from '../services/business.service';
import { DefectAnalysisType, IssueItemV2 } from '../types';
import { CliOptions, loadConfig } from '../utils/config-loader';

/**
 * Bug 统计结果
 */
interface BugStats {
  assignedUser: string;
  userId: number;
  totalBugCount: number; // 总 Bug 数
  productBugCount: number; // 产品问题 Bug 数（需求变更 + 产品设计）
  productDefectRate: number; // 产品缺陷率（产品问题/总Bug）
  stories: Array<{
    storyName: string;
    storyId: number;
    totalBugCount: number;
    productBugCount: number;
  }>;
}

/**
 * 判断 Bug 是否属于需求变更或产品设计问题
 * @param bug Bug 工作项
 * @returns 是否属于需求变更或产品设计问题
 */
function isRequirementOrDesignBug(bug: IssueItemV2): boolean {
  // 检查 customValueNew（v2 版本的自定义字段，是对象格式）
  const defectAnalysisValue = bug.customValueNew?.custom_field32;

  if (defectAnalysisValue) {
    return (
      defectAnalysisValue === DefectAnalysisType.REQUIREMENT_CHANGE ||
      defectAnalysisValue === DefectAnalysisType.PRODUCT_DESIGN
    );
  }

  return false;
}

/**
 * 生成 Bug 统计报告
 */
async function generateBugReport(
  businessService: BusinessService,
  projectId: string,
  roleIds: number[],
  iterationTitles: string[]
): Promise<void> {
  console.log(`\n正在统计迭代中的 Bug 数据...`);
  console.log(`目标迭代: ${iterationTitles.join(', ')}`);
  console.log(`角色过滤: ${roleIds.length > 0 ? roleIds.join(', ') : '无（保留所有人）'}`);
  console.log(`统计规则: 统计所有 Bug，同时标记"需求变更问题"和"产品设计问题"`);

  // Step 1: 获取指定角色的成员列表（如果启用了角色过滤）
  const targetMemberIds = new Set<number>();
  if (roleIds.length > 0) {
    for (const roleId of roleIds) {
      const members = await businessService.getMembersByRoleId(projectId, roleId);
      members.forEach((member) => targetMemberIds.add(member.user_num_id));
    }
    console.log(`\n目标角色成员数: ${targetMemberIds.size} 人`);
  } else {
    console.log(`\n角色过滤: 已禁用，将统计所有人`);
  }

  // Step 2: 获取所有 Story
  const stories = await businessService.getStoriesByIterationTitles(projectId, iterationTitles);

  if (stories.length === 0) {
    console.log('未找到任何 Story');
    return;
  }

  // Step 3: 过滤出目标角色成员处理的 Story（如果启用了角色过滤）
  const filteredStories =
    roleIds.length > 0
      ? stories.filter((story) => {
          const assignedUserId = story.assigned_user?.id;
          return assignedUserId && targetMemberIds.has(assignedUserId);
        })
      : stories;

  if (filteredStories.length === 0) {
    console.log(roleIds.length > 0 ? '未找到目标角色成员处理的 Story' : '未找到任何 Story');
    return;
  }

  if (roleIds.length > 0) {
    console.log(
      `\n找到 ${stories.length} 个 Story，其中 ${filteredStories.length} 个由目标角色成员处理，正在统计 Bug...`
    );
  } else {
    console.log(`\n找到 ${filteredStories.length} 个 Story，正在统计 Bug...`);
  }

  // Step 4: 获取每个 Story 的子工作项（Bug）
  const bugStatsMap = new Map<number, BugStats>();

  for (const story of filteredStories) {
    const childIssues = await businessService.getChildIssues(projectId, String(story.id));

    // 过滤出所有 Bug 类型的子工作项（tracker_id = 3）
    const allBugs = childIssues.filter((issue) => issue.tracker.id === 3);

    if (allBugs.length === 0) {
      continue;
    }

    // 统计产品问题 Bug（需求变更 + 产品设计）
    const productBugs = allBugs.filter((bug) => isRequirementOrDesignBug(bug));

    // Step 3: 按 Story 的处理人统计 Bug
    const assignedUserId = story.assigned_user?.id;
    const assignedUserName = story.assigned_user?.nick_name;

    if (!assignedUserId) {
      continue;
    }

    if (!bugStatsMap.has(assignedUserId)) {
      bugStatsMap.set(assignedUserId, {
        assignedUser: assignedUserName,
        userId: assignedUserId,
        totalBugCount: 0,
        productBugCount: 0,
        productDefectRate: 0,
        stories: [],
      });
    }

    const userStats = bugStatsMap.get(assignedUserId)!;
    userStats.totalBugCount += allBugs.length;
    userStats.productBugCount += productBugs.length;
    userStats.stories.push({
      storyName: story.name,
      storyId: story.id,
      totalBugCount: allBugs.length,
      productBugCount: productBugs.length,
    });
  }

  // 计算每个人的产品缺陷率
  bugStatsMap.forEach((stats) => {
    stats.productDefectRate =
      stats.totalBugCount > 0 ? (stats.productBugCount / stats.totalBugCount) * 100 : 0;
  });

  // Step 4: 输出统计结果
  console.log('\n');
  console.log('='.repeat(80));
  console.log(`Bug 统计报告 [${iterationTitles.join(', ')}]`);
  console.log('='.repeat(80));
  console.log('');

  if (bugStatsMap.size === 0) {
    console.log('未找到任何 Bug');
    return;
  }

  // 按总 Bug 数量降序排列
  const sortedStats = Array.from(bugStatsMap.values()).sort(
    (a, b) => b.totalBugCount - a.totalBugCount
  );

  let totalBugs = 0;
  let totalProductBugs = 0;

  sortedStats.forEach((stats) => {
    console.log(
      `\x1b[31m${stats.assignedUser}: 总 Bug ${stats.totalBugCount} 个 | 产品问题 ${stats.productBugCount} 个 | 产品缺陷率 ${stats.productDefectRate.toFixed(1)}%\x1b[0m`
    );

    // 输出该用户的 Story 及其 Bug 数量
    stats.stories.forEach((story) => {
      console.log(
        `  - ${story.storyName} (总 ${story.totalBugCount} 个 Bug，其中产品问题 ${story.productBugCount} 个)`
      );
    });

    totalBugs += stats.totalBugCount;
    totalProductBugs += stats.productBugCount;
    console.log('');
  });

  const overallProductDefectRate = totalBugs > 0 ? (totalProductBugs / totalBugs) * 100 : 0;

  console.log('='.repeat(80));
  console.log(
    `总计: ${totalBugs} 个 Bug（产品问题 ${totalProductBugs} 个，产品缺陷率 ${overallProductDefectRate.toFixed(1)}%），涉及 ${sortedStats.length} 位处理人`
  );
  console.log('='.repeat(80));
}

/**
 * bug 命令入口
 * @param iterationTitlesStr 迭代标题（支持逗号、分号、空格、竖线、顿号等分隔符）
 * @param cliOptions CLI 选项
 */
export async function bugCommand(
  iterationTitlesStr: string,
  cliOptions: CliOptions = {}
): Promise<void> {
  try {
    if (!iterationTitlesStr || iterationTitlesStr.trim() === '') {
      throw new Error('请指定至少一个迭代标题');
    }

    // 解析迭代标题（支持多种分隔符：逗号、分号、空格、竖线、顿号等）
    const iterationTitles = iterationTitlesStr
      .split(/[,，;；|\s、]+/)
      .map((title) => title.trim())
      .filter((title) => title.length > 0);

    const { projectId, roleIds, config } = loadConfig(cliOptions);
    const businessService = new BusinessService(config);

    await generateBugReport(businessService, projectId, roleIds, iterationTitles);
  } catch (error) {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  }
}
