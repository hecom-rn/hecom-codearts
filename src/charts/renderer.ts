import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IssueItem } from '../types';
import { logger } from '../utils/logger';
import { ChartModule } from './chart.interface';

export interface ReportMeta {
  iterationNames: string[];
  terminalTypes: string[];
  totalCount: number;
  generatedAt: string;
}

/**
 * 生成 HTML 报告并写入文件，返回文件路径。
 * @param bugs Bug 列表
 * @param charts 图表模块列表
 * @param meta 报告元数据
 * @param outputDir 输出目录，若不指定则使用系统 cache 目录
 * 若文件写入失败，将 HTML 内容通过 logger 输出作为兜底，然后抛出错误。
 */
export function renderReport(
  bugs: IssueItem[],
  charts: ChartModule[],
  meta: ReportMeta,
  outputDir?: string
): string {
  const d = new Date(meta.generatedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const filename = `rebug-report-${timestamp}.html`;

  // 如果未指定输出目录，使用系统 cache 目录
  let targetDir = outputDir;
  if (!targetDir) {
    const os = require('os');
    const platform = process.platform;
    if (platform === 'darwin') {
      targetDir = path.join(os.homedir(), 'Library', 'Caches', 'hecom-codearts');
    } else if (platform === 'linux') {
      targetDir = path.join(os.homedir(), '.cache', 'hecom-codearts');
    } else if (platform === 'win32') {
      targetDir = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'hecom-codearts');
    } else {
      targetDir = path.join(os.tmpdir(), 'hecom-codearts');
    }
  }

  // 确保目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const outputPath = path.join(targetDir, filename);

  const html = buildHtml(bugs, charts, meta);

  try {
    fs.writeFileSync(outputPath, html, 'utf-8');
  } catch (writeError) {
    logger.warn('文件写入失败，请手动保存以下 HTML 内容：');
    logger.warn(html);
    throw writeError;
  }

  return outputPath;
}

function buildHtml(bugs: IssueItem[], charts: ChartModule[], meta: ReportMeta): string {
  const chartContainers = charts
    .map(
      (chart, i) =>
        `<div class="chart-card">
          <div class="chart-title">${chart.title}</div>
          <div id="chart-${i}" style="height:400px;"></div>
        </div>`
    )
    .join('\n');

  const chartScripts = charts
    .map((chart, i) => {
      const option = JSON.stringify(chart.buildOption(bugs));
      return `echarts.init(document.getElementById('chart-${i}')).setOption(${option});`;
    })
    .join('\n');

  const iterationsText = meta.iterationNames.join(', ') || '全部';
  const terminalText = meta.terminalTypes.join(', ') || '全部';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bug 分析报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #333; }
    .header { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { margin: 0 0 16px; font-size: 22px; color: #1a1a1a; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .meta-item { background: #f8f9fa; border-radius: 6px; padding: 12px; }
    .meta-label { font-size: 12px; color: #888; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 600; color: #333; }
    .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .chart-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; }
    @media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Bug 分析报告</h1>
    <div class="meta-grid">
      <div class="meta-item"><div class="meta-label">总 Bug 数</div><div class="meta-value">${meta.totalCount}</div></div>
      <div class="meta-item"><div class="meta-label">迭代</div><div class="meta-value">${iterationsText}</div></div>
      <div class="meta-item"><div class="meta-label">终端类型</div><div class="meta-value">${terminalText}</div></div>
      <div class="meta-item"><div class="meta-label">生成时间</div><div class="meta-value">${new Date(meta.generatedAt).toLocaleString('zh-CN')}</div></div>
    </div>
  </div>
  <div class="charts-grid">
    ${chartContainers}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
  <script>
    ${chartScripts}
  </script>
</body>
</html>`;
}

/**
 * 自动在系统默认浏览器中打开文件
 */
export function openInBrowser(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${filePath}"`);
    } else if (platform === 'linux') {
      execSync(`xdg-open "${filePath}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${filePath}"`);
    }
  } catch {
    // 打开失败不中断流程，路径已打印
  }
}
