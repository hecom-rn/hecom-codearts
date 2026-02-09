import dotenv from 'dotenv';
import { dailyCommand } from './commands/daily.command';

dotenv.config();

async function main() {
  // 从命令行参数获取日期，格式：npm run daily 2026-01-12
  const dateArg = process.argv[2];
  const targetDate = dateArg || process.env.TARGET_DATE;

  await dailyCommand(targetDate);
}

if (require.main === module) {
  main();
}
