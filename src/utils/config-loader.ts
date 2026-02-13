import dotenv from 'dotenv';
import { HuaweiCloudConfig } from '../types';
import { globalConfigExists, readGlobalConfig } from './global-config';

// 加载当前目录的 .env 文件（如果存在）
dotenv.config();

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
 * 加载配置，优先级：命令行参数 > 当前目录 .env > 全局配置 > 默认值
 * @param cliOptions 命令行选项
 * @returns 加载的配置
 */
export function loadConfig(cliOptions: CliOptions = {}): LoadedConfig {
  // 命令行参数 > 当前目录 .env > 全局配置
  const projectId = cliOptions.projectId || process.env.PROJECT_ID || globalConfig.PROJECT_ID;
  const roleIdStr = cliOptions.roleId || process.env.ROLE_ID || globalConfig.ROLE_ID;

  if (!projectId) {
    throw new Error(
      '缺少必需参数: --project-id 或环境变量 PROJECT_ID\n提示：运行 codearts config 创建配置'
    );
  }

  if (!roleIdStr) {
    throw new Error(
      '缺少必需参数: --role-id 或环境变量 ROLE_ID\n提示：运行 codearts config 创建配置'
    );
  }

  const roleIds = roleIdStr.split(',').map((id) => parseInt(id.trim()));

  if (roleIds.some((id) => isNaN(id))) {
    throw new Error('ROLE_ID 格式不正确，应为数字或逗号分隔的数字列表');
  }

  const username =
    cliOptions.username || process.env.HUAWEI_CLOUD_USERNAME || globalConfig.HUAWEI_CLOUD_USERNAME;
  const password =
    cliOptions.password || process.env.HUAWEI_CLOUD_PASSWORD || globalConfig.HUAWEI_CLOUD_PASSWORD;
  const domain =
    cliOptions.domain || process.env.HUAWEI_CLOUD_DOMAIN || globalConfig.HUAWEI_CLOUD_DOMAIN;

  if (!username || !password || !domain) {
    throw new Error(
      '缺少华为云认证信息: --username, --password, --domain 或对应的环境变量\n提示：运行 codearts config 创建配置'
    );
  }

  const config: HuaweiCloudConfig = {
    iamEndpoint:
      cliOptions.iamEndpoint ||
      process.env.HUAWEI_CLOUD_IAM_ENDPOINT ||
      globalConfig.HUAWEI_CLOUD_IAM_ENDPOINT ||
      'https://iam.cn-north-4.myhuaweicloud.com',
    region:
      cliOptions.region ||
      process.env.HUAWEI_CLOUD_REGION ||
      globalConfig.HUAWEI_CLOUD_REGION ||
      'cn-north-4',
    endpoint:
      cliOptions.codeartsUrl ||
      process.env.CODEARTS_BASE_URL ||
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
 * 优先级：命令行参数 > 当前目录 .env > 全局配置 > 默认值
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
      envKey: 'HUAWEI_CLOUD_IAM_ENDPOINT',
      default: 'https://iam.cn-north-4.myhuaweicloud.com',
    },
    {
      key: 'HUAWEI_CLOUD_REGION',
      cliKey: 'region',
      envKey: 'HUAWEI_CLOUD_REGION',
      default: 'cn-north-4',
    },
    {
      key: 'HUAWEI_CLOUD_USERNAME',
      cliKey: 'username',
      envKey: 'HUAWEI_CLOUD_USERNAME',
      default: '',
    },
    {
      key: 'HUAWEI_CLOUD_PASSWORD',
      cliKey: 'password',
      envKey: 'HUAWEI_CLOUD_PASSWORD',
      default: '',
    },
    { key: 'HUAWEI_CLOUD_DOMAIN', cliKey: 'domain', envKey: 'HUAWEI_CLOUD_DOMAIN', default: '' },
    {
      key: 'CODEARTS_BASE_URL',
      cliKey: 'codeartsUrl',
      envKey: 'CODEARTS_BASE_URL',
      default: 'https://projectman-ext.cn-north-4.myhuaweicloud.cn',
    },
    { key: 'PROJECT_ID', cliKey: 'projectId', envKey: 'PROJECT_ID', default: '' },
    { key: 'ROLE_ID', cliKey: 'roleId', envKey: 'ROLE_ID', default: '' },
  ];

  for (const item of configItems) {
    const cliValue = cliOptions[item.cliKey as keyof CliOptions];
    const envValue = process.env[item.envKey];
    const globalValue = globalConfig[item.key];

    merged[item.key] = cliValue || envValue || globalValue || item.default;
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

  if (process.env[configKey]) {
    return '当前目录 .env';
  }

  if (globalConfig[configKey]) {
    return '全局配置';
  }

  return '默认值';
}
