import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import ora from 'ora';
import pc from 'picocolors';
import * as readline from 'readline';
import { BusinessService } from '../services/business.service';
import { ConfigKey, ConfigMap, CustomFieldId, Project } from '../types';
import {
  configExists,
  getConfig,
  getConfigPath,
  readConfig,
  writeConfig,
} from '../utils/config-loader';
import { globalTheme } from '../utils/inquirer-theme';
import { logger } from '../utils/logger';

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
  key: ConfigKey; // 配置项的键名（使用枚举）
  label: string; // 配置项的显示名称
  configure: (
    businessService: BusinessService,
    projectId: string,
    existingValue?: string
  ) => Promise<string>;
}
async function inputRoleIds(existingValue?: string): Promise<string> {
  return await input({
    message: '角色 ID（支持逗号分隔，如: 1,2,3）:',
    default: existingValue || '',
    validate: (inputValue: string) => {
      if (!inputValue.trim()) {
        return '角色 ID 不能为空';
      }
      const ids = inputValue.split(',').map((id) => id.trim());
      const allValid = ids.every((id) => /^\d+$/.test(id));
      return allValid ? true : '角色 ID 必须是数字或逗号分隔的数字列表';
    },
  });
}
/**
 * 配置角色 ID
 */
async function configureRoleIds(
  businessService: BusinessService,
  projectId: string,
  existingValue?: string
): Promise<string> {
  let roles = [];
  try {
    const spinner = ora('正在获取角色列表...').start();
    roles = await businessService.getProjectRoles(projectId);
    spinner.stop();
  } catch (error) {
    logger.error('❌ 获取角色列表失败:', error);
    // 如果获取失败，使用手动输入
    return await inputRoleIds(existingValue);
  }
  if (roles.length === 0) {
    // 如果没有获取到角色，使用手动输入
    return await inputRoleIds(existingValue);
  } else {
    // 使用多选框选择角色
    const roleChoices = roles.map((role) => ({
      name: `${role.role_name} (${role.role_id})`,
      value: role.role_id.toString(),
      checked: existingValue ? existingValue.split(',').includes(role.role_id.toString()) : false,
    }));

    const selectedRoleIds = await checkbox({
      message: '请选择角色：',
      choices: roleChoices,
      validate: (answer) => {
        if (answer.length === 0) {
          return '至少需要选择一个角色';
        }
        return true;
      },
      theme: globalTheme,
    });

    return selectedRoleIds.join(',');
  }
}

/**
 * 配置开发端
 */
async function configureDevelopmentEnd(
  businessService: BusinessService,
  projectId: string,
  existingValue?: string
): Promise<string> {
  const customFieldId = CustomFieldId.DEVELOPMENT_END;
  const spinner = ora('正在获取开发端选项...').start();

  let options: string[];
  try {
    const optionsMap = await businessService.getCustomFieldOptions(projectId, [customFieldId]);
    options = optionsMap[customFieldId] || [];
    spinner.stop();
  } catch (error) {
    spinner.fail('获取开发端选项失败');
    logger.error(`${String(error)}`);
    return existingValue || '';
  }

  if (options.length === 0) {
    logger.warn('未获取到开发端选项');
    return existingValue || '';
  }

  const choices = options.map((option) => ({
    name: option,
    value: option,
    checked: existingValue === option,
  }));

  const selected = await select({
    message: '请选择开发端：',
    choices,
    theme: globalTheme,
  });

  return selected;
}

/**
 * 配置终端类型
 */
async function configureTerminalType(
  businessService: BusinessService,
  projectId: string,
  existingValue?: string
): Promise<string> {
  const customFieldId = CustomFieldId.TERMINAL_TYPE;
  const spinner = ora('正在获取终端类型选项...').start();

  let options: string[];
  try {
    const optionsMap = await businessService.getCustomFieldOptions(projectId, [customFieldId]);
    options = optionsMap[customFieldId] || [];
    spinner.stop();
  } catch (error) {
    spinner.fail('获取终端类型选项失败');
    logger.error(`${String(error)}`);
    return existingValue || '';
  }

  if (options.length === 0) {
    logger.warn('未获取到终端类型选项');
    return existingValue || '';
  }

  const choices = options.map((option) => ({
    name: option,
    value: option,
    checked: existingValue === option,
  }));

  const selected = await select({
    message: '请选择终端类型：',
    choices,
    theme: globalTheme,
  });

  return selected;
}

/**
 * 第三阶段项目配置项列表
 */
const PROJECT_CONFIG_ITEMS: ProjectConfigItem[] = [
  {
    key: ConfigKey.ROLE_ID,
    label: '角色配置',
    configure: configureRoleIds,
  },
  {
    key: ConfigKey.DEVELOPMENT_END,
    label: '开发端配置',
    configure: configureDevelopmentEnd,
  },
  {
    key: ConfigKey.TERMINAL_TYPE,
    label: '终端类型配置',
    configure: configureTerminalType,
  },
];
async function inputPassword(): Promise<string> {
  return await password({
    message: 'IAM 密码:',
    mask: '*',
    validate: (inputValue: string) => (inputValue.trim() ? true : 'IAM 密码不能为空'),
  });
}
/**
 * 交互式配置向导命令
 * 引导用户创建或更新配置文件
 */
export async function configCommand(): Promise<void> {
  logger.info('欢迎使用 Hecom CodeArts 配置向导');
  logger.info('='.repeat(60));
  logger.info('此向导将帮助您配置华为云 CodeArts API 访问凭证以及项目相关设置');
  logger.info(`配置将保存到: ${getConfigPath()}\n`);

  const existingConfig = configExists() ? readConfig() : {};

  if (configExists()) {
    const overwrite = await confirm({
      message: '检测到已存在配置文件，是否覆盖？',
      default: true,
    });

    if (!overwrite) {
      logger.info('\n已取消配置。');
      return;
    }
  }

  // 第一阶段：IAM 凭证配置
  let credentialsValid = false;
  let businessService: BusinessService | null = null;
  let iamAnswers = {
    iamEndpoint: '',
    region: '',
    domain: '',
    username: '',
    password: '',
  };

  while (!credentialsValid) {
    iamAnswers = {
      iamEndpoint: await input({
        message: 'IAM 认证端点:',
        default:
          existingConfig[ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT] ||
          'https://iam.cn-north-4.myhuaweicloud.com',
        validate: (inputValue: string) => (inputValue.trim() ? true : 'IAM 认证端点不能为空'),
      }),
      region: await input({
        message: '华为云区域:',
        default: existingConfig[ConfigKey.HUAWEI_CLOUD_REGION] || 'cn-north-4',
        validate: (inputValue: string) => (inputValue.trim() ? true : '华为云区域不能为空'),
      }),
      domain: await input({
        message: '租户名/原华为云账号:',
        default: existingConfig[ConfigKey.HUAWEI_CLOUD_DOMAIN] || '',
        validate: (inputValue: string) =>
          inputValue.trim() ? true : '租户名/原华为云账号不能为空',
      }),
      username: await input({
        message: 'IAM 用户名:',
        default: existingConfig[ConfigKey.HUAWEI_CLOUD_USERNAME] || '',
        validate: (inputValue: string) => (inputValue.trim() ? true : 'IAM 用户名不能为空'),
      }),
      password: '',
    };

    // 处理密码：如果存在旧密码，询问是否重用
    if (existingConfig[ConfigKey.HUAWEI_CLOUD_PASSWORD]) {
      const useExistingPassword = await confirm({
        message: 'IAM 密码: 是否使用已保存的密码？',
        default: true,
      });

      if (useExistingPassword) {
        iamAnswers.password = existingConfig[ConfigKey.HUAWEI_CLOUD_PASSWORD]!;
      } else {
        iamAnswers.password = await inputPassword();
      }
    } else {
      iamAnswers.password = await inputPassword();
    }

    // 创建 BusinessService 实例
    businessService = new BusinessService({
      iamEndpoint: iamAnswers.iamEndpoint,
      region: iamAnswers.region,
      username: iamAnswers.username,
      password: iamAnswers.password,
      domainName: iamAnswers.domain,
      enableLogging: false,
    });

    // 验证凭证
    const spinner = ora('正在验证 IAM 凭证...').start();
    const validationResult = await businessService.validateCredentials();
    spinner.stop();

    if (validationResult.success) {
      credentialsValid = true;
    } else {
      const errorMessage = `❌ IAM 凭证验证失败: ${validationResult.error}\n`;
      logger.error(errorMessage);

      const retry = await confirm({
        message: '是否重新配置 IAM 凭证？',
        default: true,
      });

      if (!retry) {
        logger.info('\n已取消配置。');
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
  let projects: Project[] = [];

  async function inputProjectId(): Promise<string> {
    return await input({
      message: '项目 ID:',
      default: existingConfig[ConfigKey.PROJECT_ID] || '',
      validate: (inputValue: string) => (inputValue.trim() ? true : '项目 ID 不能为空'),
    });
  }

  try {
    const spinner = ora('正在获取项目列表...').start();
    projects = await businessService!.getProjects(100);
    spinner.stop();
  } catch (error: unknown) {
    logger.error(`❌ 获取项目列表失败: `, error);
    // 获取失败，使用手动输入
    projectId = await inputProjectId();
  }

  if (projects.length === 0) {
    projectId = await inputProjectId();
  } else {
    const projectChoices = projects.map((p) => ({
      name: `${p.project_name} (${p.project_id})`,
      value: p.project_id,
    }));

    // 确定默认项目 ID
    const existingProjectId = existingConfig[ConfigKey.PROJECT_ID];
    const isExistingProjectValid =
      existingProjectId && projects.some((p) => p.project_id === existingProjectId);
    const defaultProjectId = isExistingProjectValid ? existingProjectId : projectChoices[0]?.value;

    projectId = await select({
      message: '请选择项目:',
      choices: projectChoices,
      default: defaultProjectId,
      theme: globalTheme,
    });
  }

  // 第三阶段：配置项目相关配置
  const projectConfigs: Partial<ConfigMap> = {};

  for (const configItem of PROJECT_CONFIG_ITEMS) {
    const value = await configItem.configure(
      businessService!,
      projectId,
      existingConfig[configItem.key]
    );
    projectConfigs[configItem.key] = value;
  }

  // 合并所有配置（转换为标准环境变量名）
  const finalConfig: Partial<ConfigMap> = {
    [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]: iamAnswers.iamEndpoint,
    [ConfigKey.HUAWEI_CLOUD_REGION]: iamAnswers.region,
    [ConfigKey.HUAWEI_CLOUD_DOMAIN]: iamAnswers.domain,
    [ConfigKey.HUAWEI_CLOUD_USERNAME]: iamAnswers.username,
    [ConfigKey.HUAWEI_CLOUD_PASSWORD]: iamAnswers.password,
    [ConfigKey.PROJECT_ID]: projectId,
    ...projectConfigs,
  };

  try {
    writeConfig(finalConfig);
    logger.success('\n✅ 配置完成！');
    logger.info(`配置文件位置: ${getConfigPath()}`);
    logger.info('\n提示：配置文件包含敏感信息，请妥善保管。');
  } catch (error) {
    logger.error('\n❌ 保存配置文件失败:', error);
    process.exit(1);
  }
}

/**
 * 单独更新某个项目配置项
 * @param configKey 配置项的键名（例如 ConfigKey.ROLE_ID）
 */
export async function updateProjectConfigCommand(configKey: ConfigKey): Promise<void> {
  // 检查配置文件是否存在
  if (!configExists()) {
    logger.error('\n❌ 配置文件不存在，请先运行 `npx @hecom/codearts config` 创建配置。');
    process.exit(1);
  }

  // 查找对应的配置项
  const configItem = PROJECT_CONFIG_ITEMS.find((item) => item.key === configKey);
  if (!configItem) {
    logger.error(`\n❌ 未知的配置项: ${configKey}`);
    logger.info(`\n可用的配置项:`);
    PROJECT_CONFIG_ITEMS.forEach((item) => {
      logger.info(`  - ${item.key}: ${item.label}`);
    });
    process.exit(1);
  }

  // 读取现有配置
  const existingConfig = readConfig();

  // 创建 BusinessService 实例
  const businessService = new BusinessService({
    iamEndpoint: existingConfig[ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]!,
    region: existingConfig[ConfigKey.HUAWEI_CLOUD_REGION]!,
    username: existingConfig[ConfigKey.HUAWEI_CLOUD_USERNAME]!,
    password: existingConfig[ConfigKey.HUAWEI_CLOUD_PASSWORD]!,
    domainName: existingConfig[ConfigKey.HUAWEI_CLOUD_DOMAIN]!,
    enableLogging: false,
  });

  // 执行配置
  const newValue = await configItem.configure(
    businessService,
    existingConfig[ConfigKey.PROJECT_ID]!,
    existingConfig[configKey]
  );

  // 更新配置
  const updatedConfig: Partial<ConfigMap> = {
    ...existingConfig,
    [configKey]: newValue,
  };

  try {
    writeConfig(updatedConfig);
    logger.success(`\n✅ ${configItem.label}已成功更新`);
    logger.info(`配置文件位置: ${getConfigPath()}`);
  } catch (error) {
    logger.error('\n❌ 保存配置文件失败:', error);
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
 *
 */
export async function showConfigCommand(): Promise<void> {
  // 获取最终合并后的配置
  const config = getConfig();

  // 按类别显示配置
  logger.info(pc.cyan('【华为云 IAM 凭证】'));
  const iamKeys: ConfigKey[] = [
    ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT,
    ConfigKey.HUAWEI_CLOUD_REGION,
    ConfigKey.HUAWEI_CLOUD_USERNAME,
    ConfigKey.HUAWEI_CLOUD_PASSWORD,
    ConfigKey.HUAWEI_CLOUD_DOMAIN,
  ];
  for (const key of iamKeys) {
    const value = config[key] || '(未配置)';
    const displayValue = key.includes('PASSWORD') && value !== '(未配置)' ? '********' : value;
    logger.info(`  ${formatKeyName(key)}: ${displayValue}`);
  }
  logger.info();
  logger.info(pc.cyanBright('【CodeArts 配置】'));
  const codeartsKeys: ConfigKey[] = [
    ConfigKey.PROJECT_ID,
    ConfigKey.ROLE_ID,
    ConfigKey.DEVELOPMENT_END,
    ConfigKey.TERMINAL_TYPE,
  ];
  for (const key of codeartsKeys) {
    const value = config[key] || '(未配置)';
    logger.info(`  ${formatKeyName(key)}: ${value}`);
  }
}

/**
 * 格式化配置项名称（用于显示）
 */
function formatKeyName(key: ConfigKey): string {
  const nameMap: Record<ConfigKey, string> = {
    [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]: 'IAM 认证端点',
    [ConfigKey.HUAWEI_CLOUD_REGION]: '华为云区域',
    [ConfigKey.HUAWEI_CLOUD_USERNAME]: 'IAM 用户名',
    [ConfigKey.HUAWEI_CLOUD_PASSWORD]: 'IAM 密码',
    [ConfigKey.HUAWEI_CLOUD_DOMAIN]: '华为云账号名',
    [ConfigKey.PROJECT_ID]: '项目 ID',
    [ConfigKey.ROLE_ID]: '角色 ID',
    [ConfigKey.DEVELOPMENT_END]: '开发端',
    [ConfigKey.TERMINAL_TYPE]: '终端类型',
  };
  return nameMap[key] || key;
}
