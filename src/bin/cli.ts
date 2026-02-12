#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { bugCommand } from '../commands/bug.command';
import { configCommand } from '../commands/config.command';
import { dailyCommand } from '../commands/daily.command';
import { workHourCommand } from '../commands/work-hour.command';
import { globalConfigExists } from '../utils/global-config';

// 读取 package.json 中的版本号
const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

const program = new Command();

program.name('codearts').description('华为云 CodeArts 统计分析工具').version(version);

// 全局选项（环境变量覆盖）
program.option('--role-id <ids>', '角色 ID（支持逗号分隔，如: 1,2,3），优先级高于环境变量 ROLE_ID');

// config 命令 - 交互式配置向导
program
  .command('config')
  .description('交互式配置向导，引导用户创建或更新全局配置文件\n\n')
  .action(async () => {
    await configCommand();
  });

// daily 命令
program
  .command('daily [date]')
  .description('生成日报统计\n\n示例:\n  $ codearts daily\n  $ codearts daily 2026-01-15\n')
  .action(async (date) => {
    const opts = program.opts();
    await dailyCommand(date, opts);
  });

// work-hour 命令
program
  .command('work-hour [year]')
  .description('生成年度工时统计\n\n示例:\n  $ codearts work-hour\n  $ codearts work-hour 2025\n')
  .action(async (year) => {
    const opts = program.opts();
    await workHourCommand(year, opts);
  });

// bug-rate 命令
program
  .command('bug-rate <iterations>')
  .description(
    '按迭代统计产品缺陷率，支持多个迭代（逗号分隔）\n\n示例:\n  $ codearts bug-rate "迭代1,迭代2"\n'
  )
  .action(async (iterations) => {
    const opts = program.opts();
    await bugCommand(iterations, opts);
  });

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
