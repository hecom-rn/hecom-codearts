import dotenv from 'dotenv';
import { HuaweiCloudConfig } from '../types';

dotenv.config();

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
 * 加载配置，命令行参数优先于环境变量
 * @param cliOptions 命令行选项
 * @returns 加载的配置
 */
export function loadConfig(cliOptions: CliOptions = {}): LoadedConfig {
  // 命令行参数优先，否则使用环境变量
  const projectId = cliOptions.projectId || process.env.PROJECT_ID;
  const roleIdStr = cliOptions.roleId || process.env.ROLE_ID;

  if (!projectId) {
    throw new Error('缺少必需参数: --project-id 或环境变量 PROJECT_ID');
  }

  if (!roleIdStr) {
    throw new Error('缺少必需参数: --role-id 或环境变量 ROLE_ID');
  }

  const roleIds = roleIdStr.split(',').map((id) => parseInt(id.trim()));

  if (roleIds.some((id) => isNaN(id))) {
    throw new Error('ROLE_ID 格式不正确，应为数字或逗号分隔的数字列表');
  }

  const username = cliOptions.username || process.env.HUAWEI_CLOUD_USERNAME;
  const password = cliOptions.password || process.env.HUAWEI_CLOUD_PASSWORD;
  const domain = cliOptions.domain || process.env.HUAWEI_CLOUD_DOMAIN;

  if (!username || !password || !domain) {
    throw new Error('缺少华为云认证信息: --username, --password, --domain 或对应的环境变量');
  }

  const config: HuaweiCloudConfig = {
    iamEndpoint:
      cliOptions.iamEndpoint ||
      process.env.HUAWEI_CLOUD_IAM_ENDPOINT ||
      'https://iam.cn-north-1.myhuaweicloud.com',
    region: cliOptions.region || process.env.HUAWEI_CLOUD_REGION || 'cn-north-1',
    endpoint:
      cliOptions.codeartsUrl ||
      process.env.CODEARTS_BASE_URL ||
      'https://projectman-ext.cn-north-1.myhuaweicloud.cn',
    username,
    password,
    domainName: domain,
  };

  return { projectId, roleIds, config };
}
