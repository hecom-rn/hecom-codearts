import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
export function getGlobalConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * 检查全局配置文件是否存在
 */
export function globalConfigExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * 读取全局配置
 */
export function readGlobalConfig(): Record<string, string> {
  if (!globalConfigExists()) {
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
        config[key] = value;
      }
    }
  } catch (error) {
    console.error('读取全局配置文件失败:', error);
  }

  return config;
}

/**
 * 配置项分组和顺序定义
 */
const CONFIG_GROUPS = [
  {
    title: '华为云IAM认证端点（根据区域调整）',
    keys: ['HUAWEI_CLOUD_IAM_ENDPOINT', 'HUAWEI_CLOUD_REGION'],
  },
  {
    title: 'IAM用户凭证',
    keys: ['HUAWEI_CLOUD_USERNAME', 'HUAWEI_CLOUD_PASSWORD', 'HUAWEI_CLOUD_DOMAIN'],
  },
  {
    title: '项目配置',
    keys: ['CODEARTS_BASE_URL', 'PROJECT_ID', 'ROLE_ID'],
  },
];

/**
 * 写入全局配置
 * 支持动态配置项，自动按分组组织配置文件
 */
export function writeGlobalConfig(config: Record<string, string>): void {
  ensureConfigDir();

  // 构建配置文件头部
  let content = `# Hecom CodeArts 全局配置文件
# 此文件由 codearts config 命令自动生成
# 位置: ${CONFIG_FILE}
`;

  // 记录已写入的配置项
  const writtenKeys = new Set<string>();

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
  const otherKeys = Object.keys(config).filter((key) => !writtenKeys.has(key));
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
export function deleteGlobalConfig(): void {
  if (globalConfigExists()) {
    try {
      fs.unlinkSync(CONFIG_FILE);
    } catch (error) {
      throw new Error(`删除全局配置文件失败: ${error}`);
    }
  }
}

/**
 * 获取配置信息（用于显示）
 */
export function getConfigInfo(): string {
  if (globalConfigExists()) {
    return `全局配置文件: ${CONFIG_FILE}`;
  } else {
    return `全局配置文件不存在\n建议运行: codearts config`;
  }
}
