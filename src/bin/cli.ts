#!/usr/bin/env node
import { Command } from 'commander';
import { dailyCommand } from '../commands/daily.command';
import { workHourCommand } from '../commands/work-hour.command';
import { initCommand } from '../commands/init.command';
import * as path from 'path';
import * as fs from 'fs';

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

// init 命令 - 交互式配置向导
program
  .command('init')
  .description('交互式配置向导\n\n引导用户创建或更新 .env 配置文件')
  .action(async () => {
    await initCommand();
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
  1. 运行配置向导: codearts init
  2. 生成日报: codearts daily
  3. 生成年度工时统计: codearts work-hour

更多信息:
  https://github.com/summer88123/hecom-codearts
`
);

program.parse();
