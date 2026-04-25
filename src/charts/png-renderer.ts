import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import puppeteer from 'puppeteer';

const _require = createRequire(__filename);

export interface ChartRenderTask {
  option: object;
  outputPath: string; // 绝对路径
  width?: number; // 默认 800
  height?: number; // 默认 500
}

/**
 * 批量将 ECharts option 渲染为透明背景 PNG 文件
 * 复用单个 Puppeteer 浏览器实例，串行渲染所有任务
 */
export async function renderChartsToPng(tasks: ChartRenderTask[]): Promise<void> {
  const echartsPath = _require.resolve('echarts/dist/echarts.min.js');
  const echartsScript = fs.readFileSync(echartsPath, 'utf-8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const task of tasks) {
      const { option, outputPath, width = 800, height = 500 } = task;
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        await page.setContent(`
          <!DOCTYPE html>
          <html>
            <head><style>body{margin:0;background:transparent}</style></head>
            <body>
              <div id="chart" style="width:${width}px;height:${height}px;"></div>
              <script>${echartsScript}</script>
              <script>
                const chart = echarts.init(document.getElementById('chart'), null, {
                  renderer: 'canvas',
                  backgroundColor: 'transparent'
                });
                chart.setOption(${JSON.stringify(option)});
                window.__dataURL = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: 'transparent' });
              </script>
            </body>
          </html>
        `);
        const dataURL: string = await page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (globalThis as any).__dataURL as string
        );
        const base64 = dataURL.replace(/^data:image\/png;base64,/, '');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
