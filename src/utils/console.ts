import { ConsoleTotal } from '../types';
import { logger } from '../utils/logger';
const LOGO_LINES = [
  '██╗  ██╗███████╗ ██████╗ ██████╗ ███╗   ███╗',
  '██║  ██║██╔════╝██╔════╝██╔═══██╗████╗ ████║',
  '███████║█████╗  ██║     ██║   ██║██╔████╔██║',
  '██╔══██║██╔══╝  ██║     ██║   ██║██║╚██╔╝██║',
  '██║  ██║███████╗╚██████╗╚██████╔╝██║ ╚═╝ ██║',
  '╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝',
];

const RESET = '\x1b[0m';

// 256-color middle grays - visible on both light and dark backgrounds
const GRAYS = [
  '\x1b[38;5;250m', // lighter gray
  '\x1b[38;5;248m',
  '\x1b[38;5;245m', // mid gray
  '\x1b[38;5;243m',
  '\x1b[38;5;240m',
  '\x1b[38;5;238m', // darker gray
];
export function showLogo(): void {
  logger.info();
  LOGO_LINES.forEach((line, i) => {
    logger.info(`${GRAYS[i]}${line}${RESET}`);
  });
  logger.info();
}

export function consoleTotal<T>(total: ConsoleTotal<T>): void {
  logger.info(`${total.title} [${total.roleNames.join(', ')}]`);
  logger.info('='.repeat(80));
  total.totalMap.forEach(([key, value]) => {
    if (typeof value === 'function') {
      logger.info(`${key}: ${value()}`);
    } else {
      logger.info(`${key}: ${value}`);
    }
  });
  logger.info('='.repeat(80));
}

export function issueLink(projectId: string, issueId: string | number): string {
  return `https://devcloud.cn-north-4.huaweicloud.com/projectman/scrum/${projectId}/task/detail/${issueId}`;
}
