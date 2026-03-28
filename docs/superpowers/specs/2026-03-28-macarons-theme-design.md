# Macarons 主题集成 设计

日期: 2026-03-28

目标：在生成的 HTML 报告中注册并使用 `macarons` 主题（位于 `src/charts/macarons.json`），初始化图表时优先使用该主题，保证样式统一且不影响现有模块接口。

变更要点：

- 在 `src/charts/renderer.ts` 中读取并内嵌 `macarons.json`，在客户端通过 `echarts.registerTheme('macarons', obj)` 注册。
- 修改图表初始化：优先使用 `echarts.init(el, 'macarons')` 并直接 `setOption`；若初始化失败，回退到原有的 `defaultTheme` 合并逻辑并使用 `echarts.init(el)`。
- 不修改各个 chart module 的返回值或接口。

验证步骤：

1. 生成报告：调用 `renderReport(...)`，打开生成的 HTML 文件，检查图表是否使用 macarons 主题色与轴样式。
2. 回退测试：人为破坏主题注册（或替换为空对象），确认页面能够使用 fallback 样式正常渲染。
3. 响应式测试：在窄屏与宽屏下检查图表和布局。

文件影响：

- 修改： `src/charts/renderer.ts`
- 新增（无修改）： `src/charts/macarons.json`（已存在，供内嵌）

兼容性和回退策略：

- 若主题注册失败（例如 JSON 读取失败或浏览器环境中 echarts 未定义），客户端初始化会捕获异常并使用现有 defaultTheme 渲染，保证不出现空白图表。

下一步：实现并验证（已实现代码变更），请确认是否需要我继续：

1. 运行一次本地 `renderReport` 并把生成路径返回给你（我可以执行并展示路径），或
2. 仅提供修改摘要与验证指南供你自行运行。

批准：用户已批准本设计（2026-03-28）。
