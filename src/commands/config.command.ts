import inquirer from 'inquirer';
import {
  globalConfigExists,
  readGlobalConfig,
  writeGlobalConfig,
  getGlobalConfigPath,
} from '../utils/global-config';

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

  const answers = await inquirer.prompt([
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
    {
      type: 'input',
      name: 'domain',
      message: '华为云账号名:',
      default: existingConfig.HUAWEI_CLOUD_DOMAIN || '',
      validate: (input: string) => (input.trim() ? true : '华为云账号名不能为空'),
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
      name: 'projectId',
      message: '项目 ID:',
      default: existingConfig.PROJECT_ID || '',
      validate: (input: string) => (input.trim() ? true : '项目 ID 不能为空'),
    },
    {
      type: 'input',
      name: 'roleId',
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

  try {
    writeGlobalConfig(answers);
    console.log('\n✅ 全局配置已成功保存');
    console.log(`配置文件位置: ${getGlobalConfigPath()}`);
    console.log('\n您现在可以在任何目录使用以下命令：');
    console.log('  codearts daily              # 生成日报');
    console.log('  codearts work-hour          # 生成年度工时统计');
    console.log('\n提示：配置文件包含敏感信息，请妥善保管。');
  } catch (error) {
    console.error('\n❌ 保存配置文件失败:', error);
    process.exit(1);
  }
}
