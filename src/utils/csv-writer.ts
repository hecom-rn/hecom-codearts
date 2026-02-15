import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

/**
 * 转义 CSV 字段中的特殊字符
 * RFC 4180 标准：包含逗号、引号或换行符的字段需要用双引号包围，内部引号转义为两个双引号
 * @param value 字段值
 * @returns 转义后的 CSV 字段
 */
function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n');
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/**
 * 转义公式字符串中的双引号
 * @param text 文本
 * @returns 转义后的文本
 */
function escapeFormulaString(text: string): string {
  return text.replace(/"/g, '""');
}

/**
 * 构建 CSV 行
 * @param fields CSV 字段数组
 * @returns CSV 行字符串
 */
export function buildCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map((field) => escapeField(String(field ?? ''))).join(',');
}

/**
 * 创建 Excel HYPERLINK 公式
 * @param url 链接地址
 * @param displayText 显示文本
 * @returns Excel HYPERLINK 公式字符串
 */
export function createHyperlinkFormula(url: string, displayText: string): string {
  const escapedText = escapeFormulaString(displayText);
  return `=HYPERLINK("${url}","${escapedText}")`;
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
