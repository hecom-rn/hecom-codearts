import { HuaweiCloudConfig } from '../types';
import { globalConfigExists, readGlobalConfig } from './global-config';

// 加载全局配置
const globalConfig = globalConfigExists() ? readGlobalConfig() : {};

export interface CliOptions {
  projectId?: string;
  roleId?: string;
  username?: string;
  password?: string;
  domain?: string;
  region?: string;
  iamEndpoint?: string;
  codeartsUrl?: string;
}

export interface LoadedConfig {
  projectId: string;
  roleIds: number[];
  config: HuaweiCloudConfig;
}

/**
 * 加载配置，优先级：命令行参数 > 全局配置 > 默认值
 * @param cliOptions 命令行选项
 * @returns 加载的配置
 */
export function loadConfig(cliOptions: CliOptions = {}): LoadedConfig {
  // 命令行参数 > 全局配置
  const projectId = cliOptions.projectId || globalConfig.PROJECT_ID;
  const roleIdStr = cliOptions.roleId || globalConfig.ROLE_ID;

  if (!projectId) {
    throw new Error('缺少必需参数: --project-id\n提示：运行 codearts config 创建配置');
  }

  if (!roleIdStr) {
    throw new Error('缺少必需参数: --role-id\n提示：运行 codearts config 创建配置');
  }

  const roleIds = roleIdStr.split(',').map((id) => parseInt(id.trim()));

  if (roleIds.some((id) => isNaN(id))) {
    throw new Error('ROLE_ID 格式不正确，应为数字或逗号分隔的数字列表');
  }

  const username = cliOptions.username || globalConfig.HUAWEI_CLOUD_USERNAME;
  const password = cliOptions.password || globalConfig.HUAWEI_CLOUD_PASSWORD;
  const domain = cliOptions.domain || globalConfig.HUAWEI_CLOUD_DOMAIN;

  if (!username || !password || !domain) {
    throw new Error(
      '缺少华为云认证信息: --username, --password, --domain\n提示：运行 codearts config 创建配置'
    );
  }

  const config: HuaweiCloudConfig = {
    iamEndpoint:
      cliOptions.iamEndpoint ||
      globalConfig.HUAWEI_CLOUD_IAM_ENDPOINT ||
      'https://iam.cn-north-4.myhuaweicloud.com',
    region: cliOptions.region || globalConfig.HUAWEI_CLOUD_REGION || 'cn-north-4',
    endpoint:
      cliOptions.codeartsUrl ||
      globalConfig.CODEARTS_BASE_URL ||
      'https://projectman-ext.cn-north-4.myhuaweicloud.cn',
    username,
    password,
    domainName: domain,
  };

  return { projectId, roleIds, config };
}

/**
 * 获取最终合并后的配置（用于显示）
 * 优先级：命令行参数 > 全局配置 > 默认值
 * @param cliOptions 命令行选项
 * @returns 合并后的配置映射
 */
export function getMergedConfig(cliOptions: CliOptions = {}): Record<string, string> {
  const merged: Record<string, string> = {};

  // 定义配置项及其来源
  const configItems = [
    {
      key: 'HUAWEI_CLOUD_IAM_ENDPOINT',
      cliKey: 'iamEndpoint',
      default: 'https://iam.cn-north-4.myhuaweicloud.com',
    },
    {
      key: 'HUAWEI_CLOUD_REGION',
      cliKey: 'region',
      default: 'cn-north-4',
    },
    {
      key: 'HUAWEI_CLOUD_USERNAME',
      cliKey: 'username',
      default: '',
    },
    {
      key: 'HUAWEI_CLOUD_PASSWORD',
      cliKey: 'password',
      default: '',
    },
    { key: 'HUAWEI_CLOUD_DOMAIN', cliKey: 'domain', default: '' },
    {
      key: 'CODEARTS_BASE_URL',
      cliKey: 'codeartsUrl',
      default: 'https://projectman-ext.cn-north-4.myhuaweicloud.cn',
    },
    { key: 'PROJECT_ID', cliKey: 'projectId', default: '' },
    { key: 'ROLE_ID', cliKey: 'roleId', default: '' },
  ];

  for (const item of configItems) {
    const cliValue = cliOptions[item.cliKey as keyof CliOptions];
    const globalValue = globalConfig[item.key];

    merged[item.key] = cliValue || globalValue || item.default;
  }

  return merged;
}

/**
 * 获取配置来源信息
 * @param configKey 配置项的键名
 * @param cliOptions 命令行选项
 * @returns 配置来源描述
 */
export function getConfigSource(configKey: string, cliOptions: CliOptions = {}): string {
  const cliKeyMap: Record<string, keyof CliOptions> = {
    HUAWEI_CLOUD_IAM_ENDPOINT: 'iamEndpoint',
    HUAWEI_CLOUD_REGION: 'region',
    HUAWEI_CLOUD_USERNAME: 'username',
    HUAWEI_CLOUD_PASSWORD: 'password',
    HUAWEI_CLOUD_DOMAIN: 'domain',
    CODEARTS_BASE_URL: 'codeartsUrl',
    PROJECT_ID: 'projectId',
    ROLE_ID: 'roleId',
  };

  const cliKey = cliKeyMap[configKey];
  if (cliKey && cliOptions[cliKey]) {
    return '命令行参数';
  }

  if (globalConfig[configKey]) {
    return '全局配置';
  }

  return '默认值';
}
