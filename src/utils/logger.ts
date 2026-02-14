/**
 * 日志工具类（单例模式）
 * 根据输出格式自动控制日志输出：
 * - console/csv: 正常输出所有日志
 * - json: 静默所有用户日志，只输出纯 JSON
 */
export class Logger {
  private static instance: Logger;
  private silent: boolean;

  private constructor() {
    this.silent = false;
  }

  /**
   * 获取 Logger 单例实例
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 设置输出格式，更新静默状态
   * @param outputFormat 输出格式
   */
  public setOutputFormat(outputFormat: string | null | undefined): void {
    this.silent = outputFormat === 'json';
  }

  /**
   * 信息日志（输出到 stdout）
   * json 模式下会被静默
   */
  info(message?: string, ...optionalParams: any[]): void {
    if (!this.silent) {
      if (message) {
        console.log(message, ...optionalParams);
      } else {
        console.log();
      }
    }
  }

  /**
   * 警告日志（输出到 stdout）
   * json 模式下会被静默
   */
  warn(message: string, ...optionalParams: any[]): void {
    if (!this.silent) {
      console.warn(message, ...optionalParams);
    }
  }

  /**
   * 成功日志（输出到 stdout）
   * json 模式下会被静默
   */
  success(message: string): void {
    if (!this.silent) {
      console.log(message);
    }
  }

  /**
   * 错误日志（输出到 stderr）
   * 始终输出，不受 silent 影响
   */
  error(message: string, ...optionalParams: any[]): void {
    console.error(message, ...optionalParams);
  }

  /**
   * 调试日志（输出到 stdout）
   * json 模式下会被静默
   */
  debug(message: string): void {
    if (!this.silent) {
      console.log(message);
    }
  }

  /**
   * JSON 数据输出（输出到 stdout）
   * 输出格式化的 JSON 字符串
   * @param data 要输出的数据对象
   */
  json(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * 表格输出（输出到 stdout）
   * json 模式下会被静默
   */
  table(data: any): void {
    if (!this.silent) {
      console.table(data);
    }
  }

  /**
   * 检查是否处于静默模式
   */
  isSilent(): boolean {
    return this.silent;
  }
}

export const logger = Logger.getInstance();
