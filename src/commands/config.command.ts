import inquirer from 'inquirer';
import * as readline from 'readline';
import { BusinessService } from '../services/business.service';
import {
  getGlobalConfigPath,
  globalConfigExists,
  readGlobalConfig,
  writeGlobalConfig,
} from '../utils/global-config';

/**
 * 清除终端上指定行数的内容
 * @param lines 要清除的行数
 */
function clearLines(lines: number): void {
  for (let i = 0; i < lines; i++) {
    readline.moveCursor(process.stdout, 0, -1); // 光标向上移动一行
    readline.clearLine(process.stdout, 0); // 清除当前行
  }
}

/**
 * 交互式配置向导命令
 * 引导用户创建或更新全局配置文件
 */
export async function configCommand(): Promise<void> {
  console.log('\n欢迎使用 Hecom CodeArts 配置向导');
  console.log('='.repeat(60));
  console.log('此向导将帮助您配置华为云 CodeArts API 访问凭证。');
  console.log(`配置将保存到: ${getGlobalConfigPath()}\n`);

  const existingConfig = globalConfigExists() ? readGlobalConfig() : {};

  if (globalConfigExists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: '检测到已存在全局配置，是否覆盖？',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log('\n已取消配置。');
      return;
    }
  }

  // 第一阶段：IAM 凭证配置
  let credentialsValid = false;
  let businessService: BusinessService | null = null;
  let iamAnswers = {
    iamEndpoint: '',
    region: '',
    codeartsUrl: '',
    domain: '',
    username: '',
    password: '',
  };

  while (!credentialsValid) {
    iamAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'iamEndpoint',
        message: 'IAM 认证端点:',
        default:
          existingConfig.HUAWEI_CLOUD_IAM_ENDPOINT || 'https://iam.cn-north-4.myhuaweicloud.com',
      },
      {
        type: 'input',
        name: 'region',
        message: '华为云区域:',
        default: existingConfig.HUAWEI_CLOUD_REGION || 'cn-north-4',
      },
      {
        type: 'input',
        name: 'codeartsUrl',
        message: 'CodeArts API 地址:',
        default:
          existingConfig.CODEARTS_BASE_URL || 'https://projectman-ext.cn-north-4.myhuaweicloud.cn',
      },
      {
        type: 'input',
        name: 'domain',
        message: '华为云账号名:',
        default: existingConfig.HUAWEI_CLOUD_DOMAIN || '',
        validate: (input: string) => (input.trim() ? true : '华为云账号名不能为空'),
      },
      {
        type: 'input',
        name: 'username',
        message: 'IAM 用户名:',
        default: existingConfig.HUAWEI_CLOUD_USERNAME || '',
        validate: (input: string) => (input.trim() ? true : 'IAM 用户名不能为空'),
      },
      {
        type: 'password',
        name: 'password',
        message: 'IAM 密码:',
        mask: '*',
        default: existingConfig.HUAWEI_CLOUD_PASSWORD || '',
        validate: (input: string) => (input.trim() ? true : 'IAM 密码不能为空'),
      },
    ]);

    // 创建 BusinessService 实例
    businessService = new BusinessService({
      iamEndpoint: iamAnswers.iamEndpoint,
      region: iamAnswers.region,
      endpoint: iamAnswers.codeartsUrl,
      username: iamAnswers.username,
      password: iamAnswers.password,
      domainName: iamAnswers.domain,
      enableLogging: false,
    });

    // 验证凭证
    const validationResult = await businessService.validateCredentials();

    if (validationResult.success) {
      credentialsValid = true;
    } else {
      const errorMessage = `❌ IAM 凭证验证失败: ${validationResult.error}\n`;
      console.error(errorMessage);

      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: '是否重新配置 IAM 凭证？',
          default: true,
        },
      ]);

      if (!retry) {
        console.log('\n已取消配置。');
        return;
      }

      // 计算需要清除的行数
      // 6个配置问题 + 错误信息行数 + 1行重试提示
      const errorLines = errorMessage.split('\n').length - 1; // 减1因为最后一个\n不产生新行
      const totalLines = 6 + errorLines + 1;
      clearLines(totalLines);
    }
  }

  // 第二阶段：获取项目列表并选择项目
  let projectId: string;

  try {
    const projects = await businessService!.getProjects(100);

    if (projects.length === 0) {
      const { manualProjectId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'manualProjectId',
          message: '项目 ID:',
          default: existingConfig.PROJECT_ID || '',
          validate: (input: string) => (input.trim() ? true : '项目 ID 不能为空'),
        },
      ]);
      projectId = manualProjectId;
    } else {
      const projectChoices = projects.map((p) => ({
        name: `${p.project_name} (${p.project_id})`,
        value: p.project_id,
      }));

      const { selectedProjectId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedProjectId',
          message: '请选择项目:',
          choices: projectChoices,
          default: existingConfig.PROJECT_ID || projectChoices[0]?.value,
        },
      ]);
      projectId = selectedProjectId;
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ 获取项目列表失败:', errorMsg, '\n');

    // 获取失败，使用手动输入
    const { manualProjectId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualProjectId',
        message: '项目 ID:',
        default: existingConfig.PROJECT_ID || '',
        validate: (input: string) => (input.trim() ? true : '项目 ID 不能为空'),
      },
    ]);
    projectId = manualProjectId;
  }

  // 第三阶段：获取角色列表并选择角色
  let roleIds: string;

  try {
    const roles = await businessService!.getProjectRoles(projectId);

    if (roles.length === 0) {
      // 如果没有获取到角色，使用手动输入
      const { manualRoleId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'manualRoleId',
          message: '角色 ID（支持逗号分隔，如: 1,2,3）:',
          default: existingConfig.ROLE_ID || '',
          validate: (input: string) => {
            if (!input.trim()) {
              return '角色 ID 不能为空';
            }
            const ids = input.split(',').map((id) => id.trim());
            const allValid = ids.every((id) => /^\d+$/.test(id));
            return allValid ? true : '角色 ID 必须是数字或逗号分隔的数字列表';
          },
        },
      ]);
      roleIds = manualRoleId;
    } else {
      // 使用多选框选择角色
      const roleChoices = roles.map((role) => ({
        name: `${role.role_name} (${role.role_id})`,
        value: role.role_id.toString(),
        checked: existingConfig.ROLE_ID
          ? existingConfig.ROLE_ID.split(',').includes(role.role_id.toString())
          : false,
      }));

      const { selectedRoleIds } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedRoleIds',
          message: '请选择角色：',
          choices: roleChoices,
          validate: (input: string[]) => {
            if (input.length === 0) {
              return '至少选择一个角色';
            }
            return true;
          },
        },
      ]);

      roleIds = selectedRoleIds.join(',');
    }
  } catch (error) {
    console.error('❌ 获取角色列表失败:', error);
    // 如果获取失败，使用手动输入
    const { manualRoleId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualRoleId',
        message: '角色 ID（支持逗号分隔，如: 1,2,3）:',
        default: existingConfig.ROLE_ID || '',
        validate: (input: string) => {
          if (!input.trim()) {
            return '角色 ID 不能为空';
          }
          const ids = input.split(',').map((id) => id.trim());
          const allValid = ids.every((id) => /^\d+$/.test(id));
          return allValid ? true : '角色 ID 必须是数字或逗号分隔的数字列表';
        },
      },
    ]);
    roleIds = manualRoleId;
  }

  // 合并所有配置
  const finalConfig = {
    iamEndpoint: iamAnswers.iamEndpoint,
    region: iamAnswers.region,
    codeartsUrl: iamAnswers.codeartsUrl,
    domain: iamAnswers.domain,
    username: iamAnswers.username,
    password: iamAnswers.password,
    projectId,
    roleId: roleIds,
  };

  try {
    writeGlobalConfig(finalConfig);
    console.log('\n✅ 全局配置已成功保存');
    console.log(`配置文件位置: ${getGlobalConfigPath()}`);
    console.log('\n提示：配置文件包含敏感信息，请妥善保管。');
  } catch (error) {
    console.error('\n❌ 保存配置文件失败:', error);
    process.exit(1);
  }
}
