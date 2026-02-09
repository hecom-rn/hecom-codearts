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
 * 写入全局配置
 */
export function writeGlobalConfig(config: Record<string, string>): void {
  ensureConfigDir();

  const content = `# Hecom CodeArts 全局配置文件
# 此文件由 hecom-codearts init 命令自动生成
# 位置: ${CONFIG_FILE}

# 华为云IAM认证端点（根据区域调整）
HUAWEI_CLOUD_IAM_ENDPOINT=${config.iamEndpoint || ''}
HUAWEI_CLOUD_REGION=${config.region || ''}

# IAM用户凭证
HUAWEI_CLOUD_USERNAME=${config.username || ''}
HUAWEI_CLOUD_PASSWORD=${config.password || ''}
HUAWEI_CLOUD_DOMAIN=${config.domain || ''}

# 项目配置
CODEARTS_BASE_URL=${config.codeartsUrl || ''}
PROJECT_ID=${config.projectId || ''}
ROLE_ID=${config.roleId || ''}
`;

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
    return `全局配置文件不存在\n建议运行: hecom-codearts init`;
  }
}
