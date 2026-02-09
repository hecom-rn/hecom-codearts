#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { dailyCommand } from '../commands/daily.command';
import { configCommand } from '../commands/config.command';
import { workHourCommand } from '../commands/work-hour.command';
import { globalConfigExists } from '../utils/global-config';

// 读取 package.json 中的版本号
const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version || '0.0.1';

const program = new Command();

program.name('codearts').description('华为云 CodeArts API 工时统计分析工具').version(version);

// 全局选项（环境变量覆盖）
program
  .option('--project-id <id>', '项目 ID')
  .option('--role-id <ids>', '角色 ID（支持逗号分隔，如: 1,2,3）')
  .option('--username <username>', 'IAM 用户名')
  .option('--password <password>', 'IAM 密码（建议使用 .env 文件）')
  .option('--domain <domain>', '华为云账号名')
  .option('--region <region>', '华为云区域')
  .option('--iam-endpoint <url>', 'IAM 认证端点')
  .option('--codearts-url <url>', 'CodeArts API 地址');

// config 命令 - 交互式配置向导
program
  .command('config')
  .description('交互式配置向导\n\n引导用户创建或更新全局配置文件')
  .action(async () => {
    await configCommand();
  });

// daily 命令
program
  .command('daily [date]')
  .description(
    '生成日报统计\n\n示例:\n  $ codearts daily\n  $ codearts daily 2026-01-15\n  $ codearts daily --project-id abc123 --role-id 1,2'
  )
  .action(async (date) => {
    const opts = program.opts();
    await dailyCommand(date, opts);
  });

// work-hour 命令
program
  .command('work-hour [year]')
  .description(
    '生成年度工时统计\n\n示例:\n  $ codearts work-hour\n  $ codearts work-hour 2025\n  $ codearts work-hour 2025 --role-id 1,2,3'
  )
  .action(async (year) => {
    const opts = program.opts();
    await workHourCommand(year, opts);
  });

// 添加帮助信息
program.addHelpText(
  'after',
  `
环境变量:
  命令行参数优先于环境变量。可通过 .env 文件配置以下变量:

  HUAWEI_CLOUD_IAM_ENDPOINT   IAM 认证端点
  HUAWEI_CLOUD_REGION         华为云区域
  HUAWEI_CLOUD_USERNAME       IAM 用户名
  HUAWEI_CLOUD_PASSWORD       IAM 密码
  HUAWEI_CLOUD_DOMAIN         华为云账号名
  CODEARTS_BASE_URL           CodeArts API 地址
  PROJECT_ID                  项目 ID
  ROLE_ID                     角色 ID（支持逗号分隔）

配置优先级:
  命令行参数 > 环境变量 > 默认值

快速开始:
  1. 运行配置向导: codearts config
  2. 生成日报: codearts daily
  3. 生成年度工时统计: codearts work-hour

更多信息:
  https://github.com/hecom-rn/hecom-codearts
`
);

// 检查配置并自动执行 config 命令
async function checkConfigAndRun() {
  const args = process.argv.slice(2);

  // 如果没有参数（直接执行 codearts），检测配置
  if (args.length === 0) {
    // 加载当前目录 .env 文件
    dotenv.config();

    // 检查是否有配置（全局配置或环境变量）
    const hasGlobalConfig = globalConfigExists();
    const hasEnvConfig = process.env.PROJECT_ID && process.env.ROLE_ID;

    if (!hasGlobalConfig && !hasEnvConfig) {
      // 没有配置，自动执行 config 命令
      console.log('未检测到配置文件，启动配置向导...\n');
      await configCommand();
      return;
    }

    // 有配置，显示帮助信息
    program.help();
  }

  // 有参数，正常解析命令
  program.parse();
}

checkConfigAndRun().catch((error) => {
  console.error('执行失败:', error);
  process.exit(1);
});
