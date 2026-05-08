import { checkbox, select } from '@inquirer/prompts';
import ora from 'ora';
import { BusinessService } from '../services/business.service';
import {
  ConfigKey,
  CustomFieldId,
  IssueItem,
  IssueItemV2,
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

function validateVersion(version: string): void {
  if (!/^\d{4}$/.test(version)) {
    throw new Error('版本格式不正确，应为 4 位数字，例如 2605');
  }
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
    issue.customValueNew?.[CustomFieldId.DEVELOPMENT_END] === developmentEnd
  );
}

async function loadStoryTaskContext(
  version: string,
  cliOptions: CliOptions = {}
): Promise<StoryTaskContext> {
  validateVersion(version);

  const { projectId, roleIds, config } = loadConfig(cliOptions);
  const developmentEnd = getDevelopmentEnd();
  const businessService = new BusinessService(config);

  const stories = await businessService.getStoriesByVersionAndDevelopmentEnd(
    projectId,
    version,
    developmentEnd
  );
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
    version,
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
        const taskUser = context.storyTaskMap
          .get(story.id)
          ?.map((issue) => issue.assigned_to?.assignedNickName)
          .join(', ');
        return {
          name: `[${story.assigned_user?.nick_name || '未知处理人'}]${story.name}${taskUser ? '(已有Task:' + taskUser + ')' : ''}`,
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

export async function stroyAllCommand(version: string, cliOptions: CliOptions = {}): Promise<void> {
  const spinner = ora('正在查询 Story 和子 Task...').start();

  try {
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
  } catch (error) {
    spinner.fail('执行失败');
    logger.error(`${String(error)}`);
  }
}

export async function stroySingleCommand(
  version: string,
  cliOptions: CliOptions = {}
): Promise<void> {
  const spinner = ora('正在查询 Story 和子 Task...').start();

  try {
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
    const createdCount = await createTasksWithSpinner(
      context,
      selectedStories,
      assignee.user_num_id
    );

    if (createdCount !== null) {
      logger.success(`处理人：${assignee.nick_name || assignee.user_name}`);
    }
  } catch (error) {
    spinner.fail('执行失败');
    logger.error(`${String(error)}`);
  }
}
