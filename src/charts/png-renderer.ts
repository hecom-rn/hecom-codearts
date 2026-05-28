import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import macarons from './macarons';

const _require = createRequire(__filename);
const macaronsJson = JSON.stringify(macarons);

export interface ChartRenderTask {
  option: object;
  outputPath: string; // 绝对路径
  width?: number; // 默认 800
  height?: number; // 默认 500
}

/**
 * 批量将 ECharts option 渲染为透明背景 PNG 文件
 * 复用单个 Puppeteer 浏览器实例，串行渲染所有任务
 *
 * 注：使用 element.screenshot() 而非 chart.getDataURL()，
 * 因为 headless 模式下 canvas.toDataURL() 受安全限制返回空白。
 */
export async function renderChartsToPng(tasks: ChartRenderTask[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error(
      'puppeteer 未安装，PNG 渲染功能需要手动安装：npm install puppeteer'
    );
  }

  const echartsPath = _require.resolve('echarts/dist/echarts.min.js');
  const echartsScript = fs.readFileSync(echartsPath, 'utf-8');

  const browser = await (puppeteer.default ?? puppeteer).launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const task of tasks) {
      const { option, outputPath, width = 800, height = 500 } = task;
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        await page.setContent(
          `<!DOCTYPE html>
          <html>
            <head><style>html,body{margin:0;padding:0;background:transparent;}</style></head>
            <body>
              <div id="chart" style="width:${width}px;height:${height}px;"></div>
              <script>${echartsScript}</script>
              <script>
                echarts.registerTheme('macarons', ${macaronsJson});
                const chart = echarts.init(document.getElementById('chart'), 'macarons', {
                  renderer: 'canvas',
                  backgroundColor: 'transparent'
                });
                chart.setOption(Object.assign({ animation: false }, ${JSON.stringify(option)}));
              </script>
            </body>
          </html>`,
          { waitUntil: 'networkidle0' }
        );
        const el = await page.$('#chart');
        if (!el) throw new Error(`Chart element not found for: ${outputPath}`);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        await el.screenshot({ path: outputPath, omitBackground: true });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
