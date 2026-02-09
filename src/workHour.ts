import dotenv from 'dotenv';
import { workHourCommand } from './commands/work-hour.command';

dotenv.config();

async function main() {
  const yearArg = process.argv[2];
  await workHourCommand(yearArg);
}

if (require.main === module) {
  main();
}
