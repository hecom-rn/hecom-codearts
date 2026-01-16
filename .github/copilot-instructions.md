# Copilot Instructions for Daily CodeArts

## Code Generation Requirements

When generating code for this project, follow these strict guidelines:

1. **绝对不要生成示例代码** - Never generate example code or usage examples
2. **不要生成说明文档** - Do not generate documentation or explanation comments
3. **除非明确说明，不要生成测试用例** - Do not generate test cases unless explicitly requested

Focus solely on production code implementation without examples, documentation, or tests unless specifically requested.

## Architecture Overview

这是一个使用 TypeScript/Node.js 构建的**工时统计分析**项目。使用 *Huawei Cloud CodeArts API client* 获取issue、人员、工时等数据。 

## Key Files for AI Context

- **`src/services/api.service.ts`**: 华为云基础 API
- **`src/services/business.service.ts`**: 面向具体业务场景的 API 封装，例如通用角色获取人员列表，通过迭代查询所有 issue 等。
- **`src/config/holidays.ts`**: 节假日配置与判断逻辑，用于计算工作日
- **`src/types/index.ts`**: Huawei Cloud API contract definitions
- **`src/daily.ts`**: 统计日报核心逻辑
- **`src/workHour.ts`**: 统计年度工时核心逻辑
- **`.env.example`**: All supported configuration options
