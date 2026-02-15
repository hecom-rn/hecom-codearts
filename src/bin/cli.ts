#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { bugCommand } from '../commands/bug.command';
import {
  configCommand,
  getAvailableProjectConfigs,
  showConfigCommand,
  updateProjectConfigCommand,
} from '../commands/config.command';
import { dailyCommand } from '../commands/daily.command';
import { workHourCommand } from '../commands/work-hour.command';
import { configExists } from '../utils/config-loader';
import { showLogo } from '../utils/console';
import { logger } from '../utils/logger';

// 读取 package.json 中的版本号
const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

const program = new Command();

program.name('codearts').description('华为云 CodeArts 统计分析工具').version(version);

// 全局选项（环境变量覆盖）
program
  .option('--role <ids>', '角色 ID（支持逗号分隔，如: 1,2）')
  .option('--output <format>', '输出格式：console、csv、json', 'console');

// config 命令 - 交互式配置向导
const configCmd = program
  .command('config')
  .description('交互式配置向导，引导用户创建或更新全局配置文件')
  .action(async () => {
    showLogo();
    await configCommand();
  });

// config show 子命令 - 显示当前配置
configCmd
  .command('show')
  .description('显示当前配置信息')
  .action(async () => {
    showLogo();
    await showConfigCommand();
  });

// 为每个项目配置项添加子命令
const availableConfigs = getAvailableProjectConfigs();
availableConfigs.forEach((configItem) => {
  const subCommandName = configItem.key.toLowerCase().replace(/_/g, '-');
  configCmd
    .command(subCommandName)
    .description(`更新${configItem.label}`)
    .action(async () => {
      showLogo();
      await updateProjectConfigCommand(configItem.key);
    });
});

// daily 命令
program
  .command('daily [date]')
  .description('每日工时统计（默认日期为当天）')
  .option('-r, --report', '显示总结报告', false)
  .action(async (date, options, command) => {
    const cliOptions = { ...command.parent.opts(), report: options.report };
    logger.setOutputFormat(cliOptions.output);
    await dailyCommand(date, cliOptions);
  });

// work-hour 命令
program
  .command('work-hour [year]')
  .description('年度工时统计（默认当前年份）')
  .action(async (year, options, command) => {
    const cliOptions = command.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await workHourCommand(year, cliOptions);
  });

// bug-rate 命令
program
  .command('bug-rate')
  .description('产品缺陷率统计')
  .action(async (options, command) => {
    const cliOptions = command.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await bugCommand(cliOptions);
  });

// 检查配置并自动执行 config 命令
async function checkConfigAndRun() {
  const args = process.argv.slice(2);

  // 如果没有参数（直接执行 codearts），检测配置
  if (args.length === 0) {
    showLogo();
    // 检查是否有全局配置
    const hasConfig = configExists();

    if (!hasConfig) {
      // 没有配置，自动执行 config 命令
      logger.info('未检测到配置文件，启动配置向导...\n');
      await configCommand();
      return;
    }

    // 有配置，显示帮助信息
    program.help();
  }

  // 有参数，正常解析命令
  program.parse();
}

process.on('uncaughtException', (error) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('👋 操作取消!');
    process.exit(0);
  } else {
    // 重新抛出未知错误
    throw error;
  }
});

checkConfigAndRun().catch((error) => {
  logger.error('执行失败: ', error);
  process.exit(1);
});
