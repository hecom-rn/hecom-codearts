import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

/**
 * CSV 转义函数：处理双引号
 */
export function escapeCsv(value: string): string {
  if (!value) return '';
  return value.replace(/"/g, '""');
}

/**
 * 写入 CSV 文件到当前工作目录
 * @param filename 文件名
 * @param lines CSV 行数组
 * @param logger 日志记录器（可选）
 */
export function writeCsvFile(filename: string, lines: string[], logger?: Logger): void {
  const filepath = path.join(process.cwd(), filename);
  fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
  if (logger) {
    logger.success(`CSV 文件已生成: ${filepath}`);
  }
}
