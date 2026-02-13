import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigKey, HuaweiCloudConfig, OutputFormat, PartialConfigMap } from '../types';

/**
 * 全局配置管理工具
 * 配置文件存储在用户主目录下的 .hecom-codearts 目录
 */

const CONFIG_DIR = path.join(os.homedir(), '.hecom-codearts');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.env');

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 获取全局配置文件路径
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * 检查全局配置文件是否存在
 */
export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * 读取全局配置
 */
export function readConfig(): PartialConfigMap {
  if (!configExists()) {
    return {};
  }

  const config: Record<string, string> = {};

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();
        // 只保存合法的配置键
        if (Object.values(ConfigKey).includes(key as ConfigKey)) {
          config[key] = value;
        }
      }
    }
  } catch (error) {
    console.error('读取全局配置文件失败:', error);
  }

  return config as PartialConfigMap;
}

/**
 * 配置项分组和顺序定义
 */
const CONFIG_GROUPS = [
  {
    title: '华为云IAM认证端点（根据区域调整）',
    keys: [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT, ConfigKey.HUAWEI_CLOUD_REGION],
  },
  {
    title: 'IAM用户凭证',
    keys: [
      ConfigKey.HUAWEI_CLOUD_USERNAME,
      ConfigKey.HUAWEI_CLOUD_PASSWORD,
      ConfigKey.HUAWEI_CLOUD_DOMAIN,
    ],
  },
  {
    title: '项目配置',
    keys: [ConfigKey.CODEARTS_BASE_URL, ConfigKey.PROJECT_ID, ConfigKey.ROLE_ID],
  },
];

/**
 * 写入全局配置
 * 支持动态配置项，自动按分组组织配置文件
 */
export function writeConfig(config: PartialConfigMap): void {
  ensureConfigDir();

  // 构建配置文件头部
  let content = `# Hecom CodeArts 全局配置文件`;

  // 记录已写入的配置项
  const writtenKeys = new Set<ConfigKey>();

  // 按分组写入配置
  for (const group of CONFIG_GROUPS) {
    content += `\n# ${group.title}\n`;
    for (const key of group.keys) {
      const value = config[key] || '';
      content += `${key}=${value}\n`;
      writtenKeys.add(key);
    }
  }

  // 写入未分组的其他配置项（支持未来扩展）
  const otherKeys = (Object.keys(config) as ConfigKey[]).filter((key) => !writtenKeys.has(key));
  if (otherKeys.length > 0) {
    content += `\n# 其他配置\n`;
    for (const key of otherKeys) {
      const value = config[key] || '';
      content += `${key}=${value}\n`;
    }
  }

  try {
    fs.writeFileSync(CONFIG_FILE, content, 'utf-8');
  } catch (error) {
    throw new Error(`写入全局配置文件失败: ${error}`);
  }
}

/**
 * 删除全局配置
 */
export function deleteConfig(): void {
  if (configExists()) {
    try {
      fs.unlinkSync(CONFIG_FILE);
    } catch (error) {
      throw new Error(`删除全局配置文件失败: ${error}`);
    }
  }
}

// 加载全局配置
const globalConfig = configExists() ? readConfig() : {};

export interface CliOptions {
  roleId?: string;
  output?: string;
  report?: boolean;
}

export interface LoadedConfig {
  projectId: string;
  roleIds: number[];
  config: HuaweiCloudConfig;
  outputFormat: OutputFormat;
}

/**
 * 加载配置，优先级：命令行参数 > 全局配置
 * @param cliOptions 命令行选项
 * @returns 加载的配置
 */
export function loadConfig(cliOptions: CliOptions = {}): LoadedConfig {
  // 命令行参数 > 全局配置
  const projectId = globalConfig[ConfigKey.PROJECT_ID];
  const roleIdStr = cliOptions.roleId || globalConfig[ConfigKey.ROLE_ID];

  if (!projectId) {
    throw new Error('缺少项目 ID');
  }

  if (!roleIdStr) {
    throw new Error('缺少角色 ID');
  }

  const roleIds = roleIdStr.split(',').map((id) => parseInt(id.trim()));

  if (roleIds.some((id) => isNaN(id))) {
    throw new Error('ROLE_ID 格式不正确，应为数字或逗号分隔的数字列表');
  }

  const username = globalConfig[ConfigKey.HUAWEI_CLOUD_USERNAME];
  const password = globalConfig[ConfigKey.HUAWEI_CLOUD_PASSWORD];
  const domain = globalConfig[ConfigKey.HUAWEI_CLOUD_DOMAIN];
  const iamEndpoint = globalConfig[ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT];
  const region = globalConfig[ConfigKey.HUAWEI_CLOUD_REGION];
  const endpoint = globalConfig[ConfigKey.CODEARTS_BASE_URL];

  if (!username || !password || !domain || !iamEndpoint || !region || !endpoint) {
    throw new Error('缺少华为云认证信息，请先运行 `npx @hecom/codearts config` 创建配置');
  }

  // 处理输出格式
  const outputFormat = (cliOptions.output || 'console') as OutputFormat;
  if (!['console', 'csv', 'json'].includes(outputFormat)) {
    throw new Error('输出格式必须是 console、csv 或 json 之一');
  }

  const config: HuaweiCloudConfig = {
    iamEndpoint,
    region,
    endpoint,
    username,
    password,
    domainName: domain,
  };

  return { projectId, roleIds, config, outputFormat };
}

/**
 * 获取最终合并后的配置（用于显示）
 * @returns 合并后的配置映射
 */
export function getConfig(): PartialConfigMap {
  return globalConfig;
}
