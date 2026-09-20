import ora from 'ora';
import { logger } from './logger';

// loading 展示全局开关：默认关闭。命令主要面向 Agent/脚本调用，loading 文案会污染可解析输出
const SPINNER_ENABLED = false;

export interface Spinner {
  start(): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
}

// 关闭 loading 时仍需保留执行结果反馈，succeed/fail 转由 logger 输出（受 --json 静默约束）
const silentSpinner: Spinner = {
  start() {
    return silentSpinner;
  },
  stop() {
    return silentSpinner;
  },
  succeed(text) {
    if (text) {
      logger.info(text);
    }
    return silentSpinner;
  },
  fail(text) {
    if (text) {
      logger.error(text);
    }
    return silentSpinner;
  },
};

/**
 * 创建 loading spinner，默认全局关闭 loading 展示，结果消息仍通过 logger 输出
 * @param text loading 文案（关闭时仅作为 succeed/fail 未传文案时的兜底）
 * @returns Spinner 实例
 */
export function createSpinner(text: string): Spinner {
  if (!SPINNER_ENABLED) {
    return silentSpinner;
  }
  return ora(text);
}
