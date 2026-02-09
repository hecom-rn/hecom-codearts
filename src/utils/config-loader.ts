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
