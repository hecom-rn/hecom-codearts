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
import { fixCommand } from '../commands/fix.command';
import {
  issueAddNoteCommand,
  issueCommentsCommand,
  issueCreateCommand,
  issueDetailCommand,
  issueListCommand,
  issueOptionsCommand,
  issueUpdateCommand,
  issueWorkHourCommand,
} from '../commands/issue.command';
import { qualityCommand } from '../commands/quality.command';
import { rebugChartCommand, rebugNoTagCommand } from '../commands/rebug.command';
import { storyAllCommand, storyDetailCommand, storySingleCommand } from '../commands/story.command';
import { upgradeCommand } from '../commands/upgrade.command';
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
  .description('交互式配置向导，引导用户创建或更新配置文件')
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
  .description('每日工时统计（默认日期为当天），日期格式：YYYY-MM-DD')
  .option('-r, --report', '显示总结报告', false)
  .action(async (date, options, command) => {
    const cliOptions = { ...command.parent.opts(), report: options.report };
    logger.setOutputFormat(cliOptions.output);
    await dailyCommand(date, cliOptions);
  });

// work-hour 命令
program
  .command('work-hour [year]')
  .description('年度工时统计（默认当前年份），年份格式：YYYY')
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

// fix 命令
program
  .command('fix')
  .description('交互式修复 bug，填写相关信息')
  .action(async (options, command) => {
    const cliOptions = command.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await fixCommand(cliOptions);
  });

// quality 命令
program
  .command('quality')
  .description('生成质量分析报告（缺陷多维分析 + ECharts PNG 图表）')
  .option('-i, --iteration <names>', '迭代名称，逗号分隔（不传时交互式多选）')
  .option('--output-dir <path>', '输出目录', './quality-report')
  .action(async (options, command) => {
    try {
      await qualityCommand({
        iteration: options.iteration,
        outputDir: options.outputDir,
        ...command.parent?.opts(),
      });
    } catch (error: unknown) {
      logger.error(`质量分析命令执行失败: ${String(error)}`);
      process.exit(1);
    }
  });

// upgrade 命令
program
  .command('upgrade')
  .description('升级 @hecom/codearts 到最新版本')
  .action(async () => {
    try {
      await upgradeCommand();
    } catch (error: unknown) {
      logger.error(`升级命令执行失败: ${String(error)}`);
      process.exit(1);
    }
  });

const storyCmd = program.command('story').description('为指定版本的 Story 拆解 Task');

storyCmd
  .command('all <version>')
  .description('为没有拆解的 Story 创建 Task')
  .action(async (version, options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await storyAllCommand(version, cliOptions);
  });

storyCmd
  .command('single <version>')
  .description('交互式选择 Story 和处理人后创建子 Task')
  .action(async (version, options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    await storySingleCommand(version, cliOptions);
  });

storyCmd
  .command('detail <ids...>')
  .description('查询工作项详情，支持多个 ID 和可选评论查询，自动下载内容中的图片')
  .option('-c, --with-comments', '同时查询每个工作项的评论')
  .action(async (ids, options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      withComments: options.withComments,
    };
    logger.setOutputFormat(cliOptions.output);
    await storyDetailCommand(ids, cliOptions);
  });

// issue 命令组
const issueCmd = program.command('issue').description('工作项查询与维护');

issueCmd.addHelpText(
  'after',
  [
    '',
    '推荐流程（面向 Agent/脚本调用）：',
    '  1. 用 issue options 查询字段可用取值（状态/迭代/模块/领域/自定义字段等），再调用 list/create/update',
    '  2. 机器解析输出时加 --json（输出纯 JSON，无 loading 等附加文案）；只要 ID 用 -q；只要条数用 --count',
    '',
    '示例：',
    '  $ codearts issue options                    # 列出全部可查询字段',
    '  $ codearts issue options status             # 查看状态可用取值及适用工作项类型',
    '  $ codearts issue list -t task -i 2608,2609 -a my -l 状态,迭代 --json',
    '  $ codearts issue detail <id> --no-download',
    '  $ codearts issue update <id> --status 已解决',
    '  $ codearts issue create -t task -n "任务标题" --iteration <迭代名或ID>',
  ].join('\n')
);

issueCmd
  .command('detail <ids...>')
  .description('查询工作项详情，支持多个 ID 和可选评论查询，自动下载内容中的图片')
  .option('-c, --with-comments', '同时查询每个工作项的评论')
  .option('--no-download', '跳过图片和附件下载')
  .option('--json', '输出原始接口的完整 JSON（跳过图片/附件下载）')
  .addHelpText(
    'after',
    [
      '',
      '示例：',
      '  $ codearts issue detail <id>',
      '  $ codearts issue detail <id1> <id2> -c --no-download',
      '  $ codearts issue detail <id> --json',
    ].join('\n')
  )
  .action(async (ids, options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      withComments: options.withComments,
      json: options.json,
      noDownload: options.download === false,
    };
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueDetailCommand(ids, cliOptions);
    } catch (error: unknown) {
      logger.error(`查询工作项详情失败: ${String(error)}`);
      process.exit(1);
    }
  });

// issue list 子命令 - 按条件筛选工作项列表
issueCmd
  .command('list')
  .description('按条件筛选工作项列表，输出标题与链接')
  .option('-k, --keyword <text>', '标题关键字')
  .option('-t, --type <名称或ID>', '工作项类型，逗号分隔：bug/task/story/feature/epic 或数字 ID')
  .option('--status <名称或ID>', '状态，逗号分隔，如：新问题,进行中')
  .option(
    '-a, --assigned <昵称或ID>',
    '处理人，逗号分隔（昵称、用户名、成员数字 ID，my 表示当前用户）'
  )
  .option('--creator <昵称或ID>', '创建人，逗号分隔（昵称、用户名、成员数字 ID，my 表示当前用户）')
  .option(
    '-d, --developer <昵称或ID>',
    '开发人员，逗号分隔（昵称、用户名、成员数字 ID，my 表示当前用户）'
  )
  .option('-i, --iteration <名称或ID>', '迭代名称或 ID，逗号分隔，支持模糊匹配')
  .option('--priority <名称或ID>', '优先级，逗号分隔：低/中/高 或数字 ID')
  .option('--severity <名称或ID>', '重要程度，逗号分隔：关键/重要/一般/提示 或数字 ID')
  .option('--domain <名称或ID>', '领域名称或数字 ID，逗号分隔')
  .option('--module <名称或ID>', '模块名称或数字 ID，逗号分隔')
  .option(
    '-f, --field <名称=值>',
    '自定义字段过滤，如：-f 产品模块=APP（可重复传入）',
    (value: string, previous: string[]) => [...(previous || []), value],
    []
  )
  .option('--created <start,end>', '创建时间区间，YYYY-MM-DD,YYYY-MM-DD（一侧可留空）')
  .option('--updated <start,end>', '更新时间区间，YYYY-MM-DD,YYYY-MM-DD（一侧可留空）')
  .option('--limit <n>', '最多返回条数（默认返回全部）')
  .option(
    '-l, --meta <名称列表>',
    '元数据字段，逗号分隔，范围同 issue options 的字段（类型/状态/处理人/开发人员/迭代/优先级/重要程度/领域/模块/父工作项/自定义字段名），缺省输出 类型,状态,处理人,迭代,重要程度'
  )
  .option('-q, --quiet', '仅输出工作项 ID，每行一个（便于管道组合其他命令）')
  .option('--count', '仅输出匹配条数，不拉取列表（忽略 --limit）')
  .option('--json', '以 JSON 格式输出工作项数据')
  .addHelpText(
    'after',
    [
      '',
      '示例：',
      '  $ codearts issue list -t task -i 2608,2609 -a 白宇东 -l 状态,迭代',
      '  $ codearts issue list -t bug --status 新问题,进行中 -i 2609 --json',
      '  $ codearts issue list -k "登录" --count',
      '  $ codearts issue list -t bug -f 产品模块=APP -q',
      '  $ codearts issue list -a my --updated 2026-09-01, --count',
      '',
      '提示：',
      '  迭代/状态/模块/领域/自定义字段的取值不确定时，先用 issue options <字段> 查询可用取值',
      '  -a/--creator/-d 支持 my 表示当前用户；迭代支持名称模糊匹配，逗号分隔多个',
      '  自定义字段 -f 传错值不会报错，只会返回空结果，取值务必先通过 issue options 确认',
    ].join('\n')
  )
  .action(async (options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueListCommand(options, cliOptions);
    } catch (error: unknown) {
      logger.error(`查询工作项列表失败: ${String(error)}`);
      process.exit(1);
    }
  });

issueCmd
  .command('comments <id>')
  .description('查询工作项评论，按时间正序输出')
  .option('-n, --last <n>', '只显示最近 N 条')
  .option('--json', '以 JSON 格式输出评论数据')
  .addHelpText(
    'after',
    [
      '',
      '示例：',
      '  $ codearts issue comments <id> -n 5',
      '  $ codearts issue comments <id> --json',
    ].join('\n')
  )
  .action(async (id, options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueCommentsCommand(id, options, cliOptions);
    } catch (error: unknown) {
      logger.error(`查询工作项评论失败: ${String(error)}`);
      process.exit(1);
    }
  });

// issue create 子命令 - 创建工作项
issueCmd
  .command('create')
  .description('创建工作项，字段用法与 issue update 一致')
  .requiredOption('-t, --type <名称或ID>', '工作项类型：bug/task/story/feature/epic 或数字 ID')
  .requiredOption('-n, --name <标题>', '标题')
  .option('--description <text>', '描述（支持 HTML）')
  .option('--status <名称或ID>', '状态，如：新问题')
  .option('--assigned <昵称或ID>', '处理人（昵称、用户名或成员数字 ID）')
  .option('--developer <昵称或ID>', '开发人员（昵称、用户名或成员数字 ID）')
  .option('--iteration <名称或ID>', '迭代名称或 ID')
  .option('--priority <名称或ID>', '优先级：低/中/高 或数字 ID')
  .option('--severity <名称或ID>', '重要程度：关键/重要/一般/提示 或数字 ID')
  .option('--domain <名称或ID>', '领域名称或数字 ID')
  .option('--module <名称或ID>', '模块名称或数字 ID')
  .option('--parent <id>', '父工作项 ID')
  .option('--begin <date>', '预计开始时间，YYYY-MM-DD')
  .option('--end <date>', '预计结束时间，YYYY-MM-DD')
  .option('--done-ratio <0-100>', '完成度')
  .option('--expected-work-hours <hours>', '预计工时')
  .option('--actual-work-hours <hours>', '实际工时')
  .option(
    '-f, --field <名称=值>',
    '自定义字段，如：-f 终端类型=手机端（可重复传入）',
    (value: string, previous: string[]) => [...(previous || []), value],
    []
  )
  .addHelpText(
    'after',
    [
      '',
      '示例：',
      '  $ codearts issue create -t task -n "任务标题" --iteration <迭代名或ID> --assigned 白宇东',
      '  $ codearts issue create -t bug -n "Bug 标题" --priority 高 -f 终端类型=手机端',
      '',
      '提示：',
      '  Bug 类型必须带 --priority（低/中/高）',
      '  状态/迭代/处理人/自定义字段等取值不确定时，先用 issue options <字段> 查询可用取值',
    ].join('\n')
  )
  .action(async (options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueCreateCommand(options, cliOptions);
    } catch (error: unknown) {
      logger.error(`创建工作项失败: ${String(error)}`);
      process.exit(1);
    }
  });

issueCmd
  .command('addNote <id> <notes>')
  .description('为工作项添加评论，内容支持 HTML')
  .addHelpText('after', ['', '示例：', '  $ codearts issue addNote <id> "评论内容"'].join('\n'))
  .action(async (id, notes, options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueAddNoteCommand(id, notes, cliOptions);
    } catch (error: unknown) {
      logger.error(`添加评论失败: ${String(error)}`);
      process.exit(1);
    }
  });

issueCmd
  .command('workhour <id> <hours>')
  .description('为工作项登记工时，日期缺省为当天，跨多天时按天均摊')
  .option('-t, --type <名称或ID>', '工时类型名称或 ID（如：后端开发）')
  .option('--start <date>', '开始日期 YYYY-MM-DD（默认当天）')
  .option('--end <date>', '结束日期 YYYY-MM-DD（默认与开始日期一致）')
  .addHelpText(
    'after',
    [
      '',
      '示例：',
      '  $ codearts issue workhour <id> 8 -t 后端开发',
      '  $ codearts issue workhour <id> 4 --start 2026-09-18 --end 2026-09-19',
      '',
      '提示：',
      '  工时类型取值不确定时，先通过项目配置或接口确认（未指定类型时不传 -t）',
    ].join('\n')
  )
  .action(async (id, hours, options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueWorkHourCommand(id, hours, options, cliOptions);
    } catch (error: unknown) {
      logger.error(`工时登记失败: ${String(error)}`);
      process.exit(1);
    }
  });

issueCmd
  .command('options [field]')
  .description(
    '查询字段可用的选项，支持系统字段与自定义字段（如：状态、status、缺陷分析；不带字段时列出全部可查询字段）'
  )
  .addHelpText(
    'after',
    [
      '',
      '调用 list/create/update 前先用本命令确认字段取值，可避免传错值静默返回空结果：',
      '',
      '示例：',
      '  $ codearts issue options               # 列出全部可查询字段（含别名与说明）',
      '  $ codearts issue options status        # 状态可用取值（标注适用工作项类型）',
      '  $ codearts issue options iteration     # 迭代列表（名称与 ID）',
      '  $ codearts issue options 产品模块       # 自定义字段可选值（自由文本字段会提示无固定选项）',
      '  $ codearts issue options --json',
    ].join('\n')
  )
  .option('--json', '以 JSON 格式输出')
  .action(async (field, options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      json: options.json,
    };
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueOptionsCommand(field, cliOptions);
    } catch (error: unknown) {
      logger.error(`查询字段选项失败: ${String(error)}`);
      process.exit(1);
    }
  });

issueCmd
  .command('update <id>')
  .description('更新工作项字段，支持系统字段与自定义字段')
  .option('--name <title>', '标题')
  .option('--description <text>', '描述（支持 HTML）')
  .option('--status <名称或ID>', '状态，如：已解决')
  .option('--assigned <昵称或ID>', '处理人（昵称、用户名或成员数字 ID）')
  .option('--developer <昵称或ID>', '开发人员（昵称、用户名或成员数字 ID）')
  .option('--iteration <名称或ID>', '迭代名称或 ID')
  .option('--priority <名称或ID>', '优先级：低/中/高 或数字 ID')
  .option('--severity <名称或ID>', '重要程度：关键/重要/一般/提示 或数字 ID')
  .option('--domain <名称或ID>', '领域名称或数字 ID')
  .option('--module <名称或ID>', '模块名称或数字 ID')
  .option('--parent <id>', '父工作项 ID')
  .option('--begin <date>', '预计开始时间，YYYY-MM-DD')
  .option('--end <date>', '预计结束时间，YYYY-MM-DD')
  .option('--done-ratio <0-100>', '完成度')
  .option('--expected-work-hours <hours>', '预计工时')
  .option('--actual-work-hours <hours>', '实际工时')
  .option(
    '-f, --field <名称=值>',
    '自定义字段，如：-f 产品模块=APP（可重复传入）',
    (value: string, previous: string[]) => [...(previous || []), value],
    []
  )
  .addHelpText(
    'after',
    [
      '',
      '示例：',
      '  $ codearts issue update <id> --status 已解决',
      '  $ codearts issue update <id> --iteration <迭代名或ID> --assigned 白宇东 -f 产品模块=APP',
      '  $ codearts issue update <id> -f 缺陷技术分析="空指针异常" -f AI相关=否',
      '',
      '提示：',
      '  至少提供一个要更新的字段；-f 名称=值 可重复传入',
      '  状态/迭代/处理人/自定义字段等取值不确定时，先用 issue options <字段> 查询可用取值',
    ].join('\n')
  )
  .action(async (id, options, command) => {
    const cliOptions = command.parent.parent.opts();
    logger.setOutputFormat(cliOptions.output);
    try {
      await issueUpdateCommand(id, options, cliOptions);
    } catch (error: unknown) {
      logger.error(`更新工作项失败: ${String(error)}`);
      process.exit(1);
    }
  });

// rebug 命令组
const rebugCmd = program.command('rebug').description('Bug 列表交互式查询与分析');
// rebug chart 子命令
rebugCmd
  .command('chart')
  .description('多维度 ECharts 可视化分析报告')
  .option('-i, --iteration <keywords>', '迭代关键字（逗号分隔，模糊匹配迭代名称）')
  .option('-t, --terminal <keywords>', '终端类型关键字（逗号分隔，模糊匹配选项）')
  .option(
    '--output-dir <path>',
    '输出 HTML 报告的目录（默认输出到系统 cache 目录，指定此参数则输出到当前目录）'
  )
  .action(async (options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      iteration: options.iteration,
      terminal: options.terminal,
      outputDir: options.outputDir,
    };
    logger.setOutputFormat(cliOptions.output);
    await rebugChartCommand(cliOptions);
  });

// rebug no-tag 子命令
rebugCmd
  .command('no-tag')
  .description('展示未添加标签的 Bug 列表')
  .option('-i, --iteration <keywords>', '迭代关键字（逗号分隔，模糊匹配迭代名称）')
  .option('-t, --terminal <keywords>', '终端类型关键字（逗号分隔，模糊匹配选项）')
  .option('--developer <name>', '按处理人昵称过滤（包含匹配）')
  .action(async (options, command) => {
    const cliOptions = {
      ...command.parent.parent.opts(),
      iteration: options.iteration,
      terminal: options.terminal,
      developer: options.developer,
    };
    logger.setOutputFormat(cliOptions.output);
    await rebugNoTagCommand(cliOptions);
  });

// 检查配置并自动执行 config 命令
async function checkConfigAndRun() {
  const args = process.argv.slice(2);

  // 如果没有参数（直接执行 codearts），检测配置
  if (args.length === 0) {
    showLogo();
    // 检查是否有配置文件
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
