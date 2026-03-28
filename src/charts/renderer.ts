import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IssueItem } from '../types';
import { logger } from '../utils/logger';
import { ChartModule } from './chart.interface';
import macarons from './macarons';

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
  // 使用打包友好的方式：直接从 macarons.ts 导出对象（避免构建后 JSON 丢失）
  const macaronsForHtml = JSON.stringify(macarons || {});
  const chartContainers = charts
    .map(
      (chart, i) =>
        `<div class="chart-card">
          <div class="chart-title">${chart.title}</div>
          <div id="chart-${i}" class="chart-canvas"></div>
        </div>`
    )
    .join('\n');

  const chartScripts =
    charts
      .map((chart, i) => {
        const option = JSON.stringify(chart.buildOption(bugs));
        return `(() => {
        const el = document.getElementById('chart-${i}');
        if (!el) return;
        let myChart;
        try {
          // 优先使用已注册的 macarons 主题进行初始化
          myChart = echarts.init(el, 'macarons');
          myChart.setOption(${option}, true);
        } catch (e) {
          // 回退：若主题不可用或初始化失败，使用原先的默认样式并继续渲染
          const defaultTheme = {
            color: ['#4A6CF7', '#6AD3FF', '#6BCB9B', '#FFD66B', '#FF9A76', '#7E63FF', '#FFA2EC'],
            textStyle: { color: '#2b2b2b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
            tooltip: { backgroundColor: 'rgba(0,0,0,0.75)', textStyle: { color: '#fff' } },
            legend: { textStyle: { color: '#666' } },
            axis: { axisLine: { lineStyle: { color: '#e9edf1' } }, axisLabel: { color: '#9aa0a6' }, splitLine: { lineStyle: { color: '#f0f3f7' } } }
          };
          myChart = echarts.init(el);
          const userOption = ${option};
          const merged = Object.assign({}, defaultTheme, userOption);
          myChart.setOption(merged, true);
        }
        // store instance for global resize handling
        window.__HECOM_CHARTS = window.__HECOM_CHARTS || [];
        window.__HECOM_CHARTS.push(myChart);
        // ensure initial render after layout
        setTimeout(() => myChart.resize(), 60);
      })();`;
      })
      .join('\n') +
    `
    ;(function(){
      if (window.__HECOM_CHARTS_RESIZE_ADDED) return;
      window.__HECOM_CHARTS_RESIZE_ADDED = true;
      let _rt;
      function resizeAll(){
        (window.__HECOM_CHARTS || []).forEach(c => { try { c.resize(); } catch(e){} });
      }
      window.addEventListener('resize', () => { clearTimeout(_rt); _rt = setTimeout(resizeAll, 120); });
      window.addEventListener('load', () => setTimeout(resizeAll, 100));
      // in case layout changes without window resize (e.g. CSS media query), observe container
      try {
        const ro = new ResizeObserver(() => { clearTimeout(_rt); _rt = setTimeout(resizeAll, 80); });
        document.querySelectorAll('.chart-canvas').forEach(el => ro.observe(el));
      } catch (e) {
        // ResizeObserver not available -> fallback only to window resize
      }
    })();`;

  const iterationsText = meta.iterationNames.join(', ') || '全部';
  const terminalText = meta.terminalTypes.join(', ') || '全部';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bug 分析报告</title>
  <style>
    :root{ --bg:#f5f7fa; --card:#ffffff; --muted:#9aa0a6; --text:#2b2b2b; --accent:#4A6CF7; }
    html,body{height:100%;}
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 28px 28px 64px; background: var(--bg); color: var(--text); -webkit-font-smoothing:antialiased; }
    .container{max-width:1200px;margin:0 auto}
    .header { background: var(--card); border-radius: 10px; padding: 28px; margin-bottom: 22px; box-shadow: 0 6px 18px rgba(18,23,34,0.06); }
    .header h1 { margin: 0 0 10px; font-size: 20px; color: #111827; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
    .meta-item { background: #f8f9fb; border-radius: 8px; padding: 14px; }
    .meta-label { font-size: 12px; color: #818a91; margin-bottom: 6px; }
    .meta-value { font-size: 15px; font-weight: 700; color: #111827; }
    .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; align-items: start; }
    .chart-card { background: var(--card); border-radius: 10px; padding: 18px; box-shadow: 0 6px 18px rgba(18,23,34,0.04); display:flex; flex-direction:column; }
    .chart-title { font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px; }
    .chart-canvas { width:100%; height:400px; }
    .page-footer-spacer{height:56px;flex:0 0 56px}
    /* card footer or small notes */
    .muted { color: var(--muted); font-size:12px }

    @media (max-width: 1199px){ .container{max-width:980px} }
    @media (max-width: 900px) {
      body{padding:16px}
      .charts-grid { grid-template-columns: 1fr; }
      .chart-canvas{height:320px}
      .header { padding:18px }
    }
    @media (max-width: 480px){ .chart-canvas{height:280px} }
  </style>
</head>
<body>
  <div class="container">
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
  <div class="page-footer-spacer" aria-hidden="true"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
  <script>
    // 注册 macarons 主题（若可用）
    (function(){
      try {
        const theme = ${macaronsForHtml};
        if (typeof echarts !== 'undefined' && theme && Object.keys(theme).length) {
          echarts.registerTheme('macarons', theme);
        }
      } catch (e) {
        // 主题注册失败则忽略，chart 初始化中有回退处理
      }
    })();
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
