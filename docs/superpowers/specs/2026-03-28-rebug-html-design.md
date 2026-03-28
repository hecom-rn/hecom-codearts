题目: rebug 报告 HTML 与 ECharts 美化设计
日期: 2026-03-28

目的

- 对现有 `rebug` HTML 报告（`src/charts/renderer.ts` 生成的静态页面）进行样式美化：视觉层次、响应式布局、卡片化展示；同时定义一致的 ECharts 主题，提升图表可读性与整体风格统一性。

目标

- 在桌面端尽量多展示图表，默认使用两列卡片布局，移动端单列堆叠。
- 优化卡片和仪表区的视觉层次（卡片阴影、圆角、间距、字体权重）。
- 统一图表配色与交互样式（tooltip、legend、label、grid、axis）。
- 保持生成逻辑简单：尽量只修改 `src/charts/renderer.ts`（页面结构与样式）与各 `src/charts/modules/*.ts`（如需设置 series 样式或 label 格式），不改变业务数据生成流程。

修改范围

- 必改：
  - `src/charts/renderer.ts` — 页面模板、CSS、ECharts 初始化代码注入点
  - `src/charts/modules/*.ts` — 在需要的模块中调整 `buildOption` 返回的 option（例如：颜色、label 样式）

视觉规范（概要）

- 布局：两列卡片网格（`.charts-grid`），卡片最小宽度 320px，间距 20px；在 <=900px 时降为单列。
- 卡片：白色背景、8px 圆角、轻微阴影（0 6px 18px rgba(18,23,34,0.06)），内边距 20px。
- 页面背景：浅灰 `#f5f7fa`，容器内间距 24px。
- 字体：系统优先栈（-apple-system, Segoe UI）；标题使用 16-18px，卡片标题加粗 600。
- 色彩：主色采用柔和蓝 `#4A6CF7`（用于主柱状/高亮色），辅助色采用柔和冷灰与配色组（见 ECharts 主题）。

ECharts 主题（建议）

- 调色板: `['#4A6CF7', '#6AD3FF', '#6BCB9B', '#FFD66B', '#FF9A76', '#7E63FF', '#FFA2EC']`（保持足够对比并兼顾色盲友好）。
- 文本样式: color `#2b2b2b`, fontFamily 与页面一致，fontSize 12~13px。
- 提示框（tooltip）: 背景 `rgba(0,0,0,0.75)`, 文字白色, 圆角 6px, padding 8px。
- 图例（legend）: 垂直或水平自适应，文字颜色 `#666`。
- 坐标轴: 轴线使用 `#e9edf1`，刻度文字 `#9aa0a6`，网格线 `#f0f3f7`。
- 折线/柱形/饼图 series 通用样式: 圆角柱形、平滑折线、饼图 label 外侧连接线细、文字颜色深。

响应式断点

- > = 1200px: 主容器宽度为 1200px 居中显示，charts-grid 为两列（等宽）。
- 900px ~ 1199px: 两列布局，卡片保持适当高度，图表高度建议 360~420px。
- <= 900px: 单列布局，卡片宽度 100%，图表高度压缩至 300px，标题与 meta 区垂直堆叠。

可访问性与可用性要点

- 色彩对比: 确保文本与背景对比度满足 WCAG AA（重要信息色块使用深色文字或加粗）。
- 可缩放: 祖盘（root）不使用固定字体大小，允许浏览器缩放。
- 打印友好: 添加简单的 @media print 隐藏导航、阴影，并保持图表可读性（可选）。

实现细节（步骤）

1. 在 `src/charts/renderer.ts` 中替换内联样式与简单 CSS 为一组更完整的样式规则（卡片、grid、meta、标题、响应式）。
2. 在 `buildHtml` 中将每个图表容器的高度调整为响应式尺寸（desktop 400px，mobile 300px）；并为每个图表初始化时统一注入一个 ECharts 主题对象（通过 echarts.registerTheme 或直接在 setOption 前合并 theme-like defaults）。
3. 在需要的 chart module 中（例如 `bug-by-assignee.ts`, `bug-by-module.ts` 等）调整 series 默认样式（柱子圆角、label 位置、字体颜色），但不改变业务数据结构。
4. 保持 `echarts.min.js` 由 CDN 加载；若未来需要离线部署，可考虑把主题写入本地小脚本并内联。

验证步骤

- 运行现有命令 `codearts rebug` 生成报告文件，打开浏览器检查：
  - 页面在 1280px 宽度下显示两列并且卡片样式、间距一致；
  - 在 800px 宽度下为单列，图表高度与标题可读；
  - ECharts tooltip、legend 与颜色生效且文字颜色清晰；

变更记录（计划修改文件）

- `src/charts/renderer.ts`
- `src/charts/modules/bug-by-assignee.ts`
- `src/charts/modules/bug-by-defect-analysis.ts`
- `src/charts/modules/bug-by-module.ts`
  （根据需要微调其 buildOption 返回值）

下一步

- 如果你同意此设计，我将：
  1. 将该 spec 提交到 git（已生成本文件）；
  2. 发起 Spec Review（自动或人工检查）；
  3. 在通过审查后，进入实现计划（writing-plans），列出具体代码修改步骤并开始实现。

请在回复中指出是否有需要调整的地方（配色、字体尺度、断点或优先展示的图表），或者直接回复“批准”以继续进入实现计划阶段。
