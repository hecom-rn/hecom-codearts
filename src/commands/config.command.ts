import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { BusinessService } from '../services/business.service';
import {
  getGlobalConfigPath,
  globalConfigExists,
  readGlobalConfig,
  writeGlobalConfig,
} from '../utils/global-config';
import { getMergedConfig, getConfigSource, CliOptions } from '../utils/config-loader';

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
 * 第三阶段项目配置的配置项定义
 */
interface ProjectConfigItem {
  key: string; // 配置项的键名（用于存储）
  label: string; // 配置项的显示名称
  configure: (
    businessService: BusinessService,
    projectId: string,
    existingValue?: string
  ) => Promise<string>;
}

/**
 * 配置角色 ID
 */
async function configureRoleIds(
  businessService: BusinessService,
  projectId: string,
  existingValue?: string
): Promise<string> {
  try {
    const roles = await businessService.getProjectRoles(projectId);

    if (roles.length === 0) {
      // 如果没有获取到角色，使用手动输入
      const { manualRoleId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'manualRoleId',
          message: '角色 ID（支持逗号分隔，如: 1,2,3）:',
          default: existingValue || '',
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
      return manualRoleId;
    } else {
      // 使用多选框选择角色
      const roleChoices = roles.map((role) => ({
        name: `${role.role_name} (${role.role_id})`,
        value: role.role_id.toString(),
        checked: existingValue ? existingValue.split(',').includes(role.role_id.toString()) : false,
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

      return selectedRoleIds.join(',');
    }
  } catch (error) {
    console.error('❌ 获取角色列表失败:', error);
    // 如果获取失败，使用手动输入
    const { manualRoleId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualRoleId',
        message: '角色 ID（支持逗号分隔，如: 1,2,3）:',
        default: existingValue || '',
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
    return manualRoleId;
  }
}

/**
 * 第三阶段项目配置项列表
 * 未来可以在这里添加更多配置项
 */
const PROJECT_CONFIG_ITEMS: ProjectConfigItem[] = [
  {
    key: 'ROLE_ID',
    label: '角色配置',
    configure: configureRoleIds,
  },
  // 未来可以在这里添加更多配置项，例如：
  // {
  //   key: 'CUSTOM_FIELD',
  //   label: '自定义字段配置',
  //   configure: configureCustomField,
  // },
];

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

  // 第三阶段：配置项目相关配置
  const projectConfigs: Record<string, string> = {};

  for (const configItem of PROJECT_CONFIG_ITEMS) {
    const value = await configItem.configure(
      businessService!,
      projectId,
      existingConfig[configItem.key]
    );
    projectConfigs[configItem.key] = value;
  }

  // 合并所有配置（转换为标准环境变量名）
  const finalConfig = {
    HUAWEI_CLOUD_IAM_ENDPOINT: iamAnswers.iamEndpoint,
    HUAWEI_CLOUD_REGION: iamAnswers.region,
    CODEARTS_BASE_URL: iamAnswers.codeartsUrl,
    HUAWEI_CLOUD_DOMAIN: iamAnswers.domain,
    HUAWEI_CLOUD_USERNAME: iamAnswers.username,
    HUAWEI_CLOUD_PASSWORD: iamAnswers.password,
    PROJECT_ID: projectId,
    ...projectConfigs,
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

/**
 * 单独更新某个项目配置项
 * @param configKey 配置项的键名（例如 'ROLE_ID'）
 */
export async function updateProjectConfigCommand(configKey: string): Promise<void> {
  // 检查配置文件是否存在
  if (!globalConfigExists()) {
    console.error('\n❌ 全局配置文件不存在，请先运行 `codearts config` 创建配置。');
    process.exit(1);
  }

  // 查找对应的配置项
  const configItem = PROJECT_CONFIG_ITEMS.find((item) => item.key === configKey);
  if (!configItem) {
    console.error(`\n❌ 未知的配置项: ${configKey}`);
    console.log(`\n可用的配置项:`);
    PROJECT_CONFIG_ITEMS.forEach((item) => {
      console.log(`  - ${item.key}: ${item.label}`);
    });
    process.exit(1);
  }

  // 读取现有配置
  const existingConfig = readGlobalConfig();

  // 检查必要的配置是否存在
  if (!existingConfig.HUAWEI_CLOUD_USERNAME || !existingConfig.HUAWEI_CLOUD_PASSWORD) {
    console.error('\n❌ 全局配置不完整，请先运行 `codearts config` 完成配置。');
    process.exit(1);
  }

  if (!existingConfig.PROJECT_ID) {
    console.error('\n❌ 项目 ID 未配置，请先运行 `codearts config` 完成配置。');
    process.exit(1);
  }

  console.log(`\n更新 ${configItem.label}...`);
  console.log('='.repeat(60));

  // 创建 BusinessService 实例
  const businessService = new BusinessService({
    iamEndpoint:
      existingConfig.HUAWEI_CLOUD_IAM_ENDPOINT || 'https://iam.cn-north-4.myhuaweicloud.com',
    region: existingConfig.HUAWEI_CLOUD_REGION || 'cn-north-4',
    endpoint:
      existingConfig.CODEARTS_BASE_URL || 'https://projectman-ext.cn-north-4.myhuaweicloud.cn',
    username: existingConfig.HUAWEI_CLOUD_USERNAME,
    password: existingConfig.HUAWEI_CLOUD_PASSWORD,
    domainName: existingConfig.HUAWEI_CLOUD_DOMAIN,
    enableLogging: false,
  });

  // 执行配置
  const newValue = await configItem.configure(
    businessService,
    existingConfig.PROJECT_ID,
    existingConfig[configKey]
  );

  // 更新配置
  const updatedConfig = {
    ...existingConfig,
    [configKey]: newValue,
  };

  try {
    writeGlobalConfig(updatedConfig);
    console.log(`\n✅ ${configItem.label}已成功更新`);
    console.log(`配置文件位置: ${getGlobalConfigPath()}`);
  } catch (error) {
    console.error('\n❌ 保存配置文件失败:', error);
    process.exit(1);
  }
}

/**
 * 获取所有可用的项目配置项
 */
export function getAvailableProjectConfigs(): ProjectConfigItem[] {
  return PROJECT_CONFIG_ITEMS;
}

/**
 * 显示当前配置
 * 显示最终合并后的配置信息（包含配置来源）
 * @param cliOptions 命令行选项
 */
export async function showConfigCommand(cliOptions: CliOptions = {}): Promise<void> {
  console.log('\n当前配置信息');
  console.log('='.repeat(60));

  // 获取最终合并后的配置
  const mergedConfig = getMergedConfig(cliOptions);

  // 按类别显示配置
  console.log('\n【华为云 IAM 凭证】');
  const iamKeys = [
    'HUAWEI_CLOUD_IAM_ENDPOINT',
    'HUAWEI_CLOUD_REGION',
    'HUAWEI_CLOUD_USERNAME',
    'HUAWEI_CLOUD_PASSWORD',
    'HUAWEI_CLOUD_DOMAIN',
  ];
  for (const key of iamKeys) {
    const value = mergedConfig[key] || '(未配置)';
    const displayValue = key.includes('PASSWORD') && value !== '(未配置)' ? '********' : value;
    const source = value !== '(未配置)' ? getConfigSource(key, cliOptions) : '';
    const sourceInfo = source ? ` [来源: ${source}]` : '';
    console.log(`  ${formatKeyName(key)}: ${displayValue}${sourceInfo}`);
  }

  console.log('\n【CodeArts 配置】');
  const codeartsKeys = ['CODEARTS_BASE_URL', 'PROJECT_ID', 'ROLE_ID'];
  for (const key of codeartsKeys) {
    const value = mergedConfig[key] || '(未配置)';
    const source = value !== '(未配置)' ? getConfigSource(key, cliOptions) : '';
    const sourceInfo = source ? ` [来源: ${source}]` : '';
    console.log(`  ${formatKeyName(key)}: ${value}${sourceInfo}`);
  }

  // 显示配置文件位置
  console.log('\n【配置文件位置】');
  if (globalConfigExists()) {
    console.log(`  全局配置: ${getGlobalConfigPath()}`);
  } else {
    console.log(`  全局配置: (不存在)`);
  }

  const localEnvPath = path.resolve('.env');
  if (fs.existsSync('.env')) {
    console.log(`  当前目录: ${localEnvPath}`);
  } else {
    console.log(`  当前目录: (不存在)`);
  }

  // 显示配置优先级说明
  console.log('\n【配置加载优先级】');
  console.log('  命令行参数 > 当前目录 .env > 全局配置 > 默认值');

  // 提示
  if (!globalConfigExists() && !fs.existsSync('.env')) {
    console.log('\n💡 提示: 未检测到任何配置文件，建议运行 `codearts config` 创建配置');
  }

  console.log('');
}

/**
 * 格式化配置项名称（用于显示）
 */
function formatKeyName(key: string): string {
  const nameMap: Record<string, string> = {
    HUAWEI_CLOUD_IAM_ENDPOINT: 'IAM 认证端点',
    HUAWEI_CLOUD_REGION: '华为云区域',
    HUAWEI_CLOUD_USERNAME: 'IAM 用户名',
    HUAWEI_CLOUD_PASSWORD: 'IAM 密码',
    HUAWEI_CLOUD_DOMAIN: '华为云账号名',
    CODEARTS_BASE_URL: 'CodeArts API 地址',
    PROJECT_ID: '项目 ID',
    ROLE_ID: '角色 ID',
  };
  return nameMap[key] || key;
}
