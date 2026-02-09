# AGENTS.md - 代码规范与开发指南

本文档面向 AI 编码代理（如 GitHub Copilot、Cursor、OpenCode），提供项目的构建命令、代码风格和架构指南。

## 1. 项目概述

这是一个基于 **TypeScript/Node.js** 构建的**华为云 CodeArts API 工时统计分析工具**。

### 核心功能

- 通过华为云 CodeArts API 获取 issue、人员、工时数据
- 生成日报统计（每日工时、Bug 修复、工作进度）
- 生成年度工时统计报表（按人员、领域分组）
- 支持 IAM Token 自动认证和缓存

### 技术栈

- **语言**: TypeScript 5.2+
- **运行时**: Node.js >= 16
- **HTTP 客户端**: Axios
- **测试框架**: Jest + ts-jest
- **代码检查**: ESLint + Prettier

---

## 2. 构建与测试命令

### 基础命令

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# CLI 命令方式（推荐）
hecom-codearts init                 # 交互式配置向导
hecom-codearts daily                # 运行日报统计（默认当天）
hecom-codearts daily 2026-01-15     # 运行日报统计（指定日期）
hecom-codearts work-hour            # 运行年度工时统计（当前年份）
hecom-codearts work-hour 2025       # 运行年度工时统计（指定年份）

# CLI 命令 - 使用参数覆盖环境变量
hecom-codearts daily --project-id abc123 --role-id 1,2
hecom-codearts work-hour 2025 --role-id 1,2,3

# npm scripts 方式（向后兼容）
npm run daily                       # 运行日报统计（默认当天）
npm run daily 2026-01-15            # 运行日报统计（指定日期）
npm run work-hour                   # 运行年度工时统计
npm run work-hour 2025              # 运行年度工时统计（指定年份）

# 本地开发
npm link                            # 本地链接 CLI 工具
hecom-codearts --help               # 查看帮助
```

### 测试命令

```bash
# 运行所有测试
npm test

# 监听模式运行测试
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage
```

### 运行单个测试文件

```bash
# 方式一：使用 Jest 直接运行
npx jest src/services/api.service.test.ts

# 方式二：使用 pattern 匹配
npm test -- --testPathPattern=api.service

# 方式三：运行特定测试用例（使用 -t 参数）
npm test -- -t "should fetch projects successfully"
```

### 代码检查和格式化

```bash
# 运行 ESLint 检查
npx eslint src/**/*.ts

# 运行 Prettier 格式化
npx prettier --write "src/**/*.ts"
```

---

## 3. 项目架构

### 目录结构

```
src/
├── bin/                    # CLI 入口
│   └── cli.ts              # Commander.js CLI 定义
├── commands/               # 命令实现
│   ├── init.command.ts     # 交互式配置向导
│   ├── daily.command.ts    # 日报命令逻辑
│   ├── work-hour.command.ts# 工时统计命令逻辑
│   └── index.ts            # 命令导出
├── services/               # API 服务层
│   ├── api.service.ts      # 华为云基础 API 封装
│   └── business.service.ts # 业务场景 API 封装
├── utils/                  # 工具函数
│   └── config-loader.ts    # 配置加载器（CLI参数 > 环境变量）
├── config/
│   └── holidays.ts         # 节假日配置与工作日计算
├── types/
│   └── index.ts            # TypeScript 类型定义（API 契约）
├── daily.ts                # 日报统计主程序（向后兼容）
├── workHour.ts             # 年度工时统计主程序（向后兼容）
└── index.ts                # 模块导出入口

bin/
└── hecom-codearts          # CLI 可执行文件
```

### 架构设计

#### CLI 层（src/bin/cli.ts）

使用 Commander.js 框架构建命令行工具：

- 定义全局选项（--project-id, --role-id, --username 等）
- 注册子命令（init, daily, work-hour）
- 处理命令行参数解析
- 提供 --help 帮助信息

#### 命令层（src/commands/）

每个命令一个独立模块：

- `init.command.ts`: 交互式配置向导（使用 inquirer）
- `daily.command.ts`: 日报统计命令实现
- `work-hour.command.ts`: 年度工时统计命令实现
- 命令函数接收可选参数，支持通过环境变量和 CLI 参数配置

#### 配置加载层（src/utils/config-loader.ts）

负责配置合并逻辑：

- 优先级：命令行参数 > 环境变量 > 默认值
- 统一的配置加载接口
- 类型安全的配置对象

#### 服务层（src/services/）

不变，继续提供 API 封装

#### 向后兼容层（src/daily.ts, src/workHour.ts）

简化为调用命令层函数：

```typescript
import dotenv from 'dotenv';
import { dailyCommand } from './commands/daily.command';

dotenv.config();

async function main() {
  const dateArg = process.argv[2];
  await dailyCommand(dateArg);
}

if (require.main === module) {
  main();
}
```

### 关键文件说明

- **`src/bin/cli.ts`**: CLI 入口，使用 Commander.js 定义命令和选项
- **`src/commands/init.command.ts`**: 交互式配置向导，使用 inquirer 引导用户创建 .env 文件
- **`src/commands/daily.command.ts`**: 日报统计核心逻辑（从 daily.ts 提取）
- **`src/commands/work-hour.command.ts`**: 年度工时统计核心逻辑（从 workHour.ts 提取）
- **`src/utils/config-loader.ts`**: 配置加载器，合并 CLI 参数和环境变量
- **`src/services/api.service.ts`**: 华为云基础 API 封装，包含 IAM Token 认证、项目管理、工作项查询、工时管理等接口
- **`src/services/business.service.ts`**: 面向具体业务场景的 API 封装，例如通过角色获取人员列表、查询迭代内所有 issue、统计工时数据等
- **`src/config/holidays.ts`**: 节假日配置与判断逻辑，用于计算年度应计工作日
- **`src/types/index.ts`**: 华为云 CodeArts API 的 TypeScript 类型定义
- **`src/daily.ts`**: 日报统计入口（向后兼容 npm run daily）
- **`src/workHour.ts`**: 年度工时统计入口（向后兼容 npm run work-hour）
- **`bin/hecom-codearts`**: CLI 可执行文件包装器

---

## 4. 代码风格规范

### 4.1 Import 导入顺序

- 第三方库导入（如 axios, dotenv）
- 项目内部模块导入（使用相对路径）
- 类型导入可与模块导入合并

示例：

```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import { ApiService } from './services/api.service';
import { HuaweiCloudConfig, WorkHour } from './types';
```

### 4.2 命名约定

- **文件名**: 使用 `kebab-case`，例如 `api.service.ts`, `business.service.ts`
- **类名**: 使用 `PascalCase`，例如 `ApiService`, `BusinessService`
- **函数/变量名**: 使用 `camelCase`，例如 `getMembersByRoleId`, `totalHours`
- **接口/类型名**: 使用 `PascalCase`，例如 `HuaweiCloudConfig`, `WorkHour`
- **常量**: 使用 `camelCase` 或 `UPPER_SNAKE_CASE`，根据语义决定

### 4.3 格式化规则（Prettier）

```json
{
  "semi": true, // 语句末尾添加分号
  "singleQuote": true, // 使用单引号
  "trailingComma": "es5", // ES5 兼容的尾随逗号
  "printWidth": 100, // 每行最大 100 字符
  "tabWidth": 2, // 缩进 2 空格
  "useTabs": false, // 使用空格而非 Tab
  "arrowParens": "always", // 箭头函数总是使用括号
  "endOfLine": "lf", // 使用 LF 换行符
  "bracketSameLine": false // 标签闭合符号单独一行
}
```

### 4.4 TypeScript 配置要点

- **严格模式**: `"strict": true`（启用所有严格类型检查）
- **目标版本**: `"target": "ES2020"`
- **模块系统**: `"module": "commonjs"`
- **类型声明**: 所有导出的函数和类必须包含类型声明
- **编译输出**: `"outDir": "./dist"`, `"rootDir": "./src"`

### 4.5 ESLint 规则

- 使用 `@typescript-eslint/parser` 解析器
- 集成 Prettier（`plugin:prettier/recommended`）
- 规则：
  - `@typescript-eslint/no-explicit-any`: `warn`（谨慎使用 any）
  - `no-unused-vars`: `off`（由 TypeScript 处理）
  - `prettier/prettier`: `error`（Prettier 格式错误视为 ESLint 错误）

---

## 5. 类型系统规范

### 5.1 类型定义

- 所有 API 请求和响应必须定义 TypeScript 接口
- 类型定义统一放在 `src/types/index.ts`
- 使用 `export interface` 导出所有类型

### 5.2 类型注解

- 函数参数必须明确类型
- 函数返回值必须明确类型（尤其是 `async` 函数）
- 尽量避免使用 `any`，如有必要使用 `unknown` 替代

示例：

```typescript
async getMembersByRoleId(projectId: string, roleId: number): Promise<ProjectMember[]> {
  const membersResponse = await this.apiService.getMembers(projectId);
  if (!membersResponse.success) {
    throw new Error(`获取成员列表失败: ${membersResponse.error || '未知错误'}`);
  }
  const allMembers = membersResponse.data?.members || [];
  return allMembers.filter((member) => member.role_id === roleId);
}
```

### 5.3 可选属性和默认值

- 使用 `?` 表示可选属性
- 使用 `??` 或 `||` 提供默认值
- 优先使用解构赋值提供默认值

示例：

```typescript
export interface HuaweiCloudConfig {
  iamEndpoint: string;
  region: string;
  endpoint: string;
  username: string;
  password: string;
  domainName: string;
  enableLogging?: boolean;  // 可选属性
}

constructor(config: HuaweiCloudConfig) {
  this.enableLogging = config.enableLogging ?? false;  // 提供默认值
}
```

---

## 6. 错误处理规范

### 6.1 异步错误处理

- 所有异步函数使用 `try-catch` 包裹
- 错误信息必须清晰、具体
- 使用 `throw new Error()` 抛出错误

示例：

```typescript
try {
  const response = await this.iamClient.post<IamTokenResponse>('/v3/auth/tokens', requestBody);
  return response.data;
} catch (error: unknown) {
  if (axios.isAxiosError(error)) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    throw new Error(`获取IAM Token失败: ${errorMsg}`);
  }
  throw new Error(`获取IAM Token失败: ${String(error)}`);
}
```

### 6.2 类型安全的错误处理

- 捕获错误时使用 `unknown` 类型
- 使用类型守卫判断错误类型（如 `axios.isAxiosError(error)`）
- 对未知错误使用 `String(error)` 转换

---

## 7. 注释与文档规范

### 7.1 函数注释

- 公共 API 必须使用 JSDoc 注释
- 注释包括：功能说明、参数说明、返回值说明

示例：

```typescript
/**
 * 通过角色ID获取项目成员
 * @param projectId 项目ID
 * @param roleId 角色ID
 * @returns 指定角色的成员列表
 */
async getMembersByRoleId(projectId: string, roleId: number): Promise<ProjectMember[]> {
  // 实现代码
}
```

### 7.2 注释原则

- **不要生成示例代码** - 除非用户明确要求，否则不生成使用示例
- **不要生成说明文档** - 不要在代码中生成冗长的文档注释
- **不要生成测试用例** - 除非用户明确要求，否则不生成测试代码
- 注释应该解释"为什么"而不是"是什么"
- 复杂逻辑必须添加注释说明

---

## 8. API 设计原则

### 8.1 服务分层

- **ApiService**: 封装华为云 CodeArts 的原始 API 调用
- **BusinessService**: 封装面向业务场景的高级操作

### 8.2 响应格式

- 统一使用 `ApiResponse<T>` 包装响应
- 响应结构：
  ```typescript
  interface ApiResponse<T> {
    success: boolean;
    data: T | null;
    message?: string;
    error?: string;
  }
  ```

### 8.3 参数传递

- 使用接口定义复杂参数（如查询参数、请求体）
- 可选参数使用 `?` 标记
- 提供合理的默认值

---

## 9. 配置管理

### 配置方式

项目支持三种配置方式，优先级从高到低：

1. **命令行参数** - 运行时指定，最高优先级
2. **当前目录 .env 文件** - 项目级配置
3. **全局配置文件** - 用户级配置（`~/.hecom-codearts/config.env`）

### 全局配置

使用 `hecom-codearts init` 创建全局配置：

```bash
hecom-codearts init
```

全局配置文件位置：`~/.hecom-codearts/config.env`

配置示例：

```env
HUAWEI_CLOUD_IAM_ENDPOINT=https://iam.cn-north-1.myhuaweicloud.com
HUAWEI_CLOUD_REGION=cn-north-1
HUAWEI_CLOUD_USERNAME=your-iam-username
HUAWEI_CLOUD_PASSWORD=your-iam-password
HUAWEI_CLOUD_DOMAIN=your-domain-name
CODEARTS_BASE_URL=https://projectman-ext.cn-north-1.myhuaweicloud.cn
PROJECT_ID=your-project-id
ROLE_ID=1,2,3  # 逗号分隔的多个角色ID
```

### 项目级配置

在项目目录创建 `.env` 文件：

```bash
cp .env.example .env
# 编辑 .env 文件
```

项目级配置优先级高于全局配置，适用于：

- 团队协作，不同项目使用不同配置
- 需要版本控制的配置（记得加密敏感信息）

### 多角色支持

`ROLE_ID` 支持多个角色ID，使用逗号分隔：

```env
ROLE_ID=1,2,3
```

当配置多个角色ID时：

- `daily` 命令会分别为每个角色生成独立的日报
- `work-hour` 命令会合并所有角色到一张表，按角色分组显示小计

### CLI 参数优先级

配置加载优先级：**命令行参数 > 当前目录 .env > 全局配置 > 默认值**

支持的 CLI 参数：

- `--project-id <id>`: 项目 ID
- `--role-id <ids>`: 角色 ID（支持逗号分隔）
- `--username <username>`: IAM 用户名
- `--password <password>`: IAM 密码
- `--domain <domain>`: 华为云账号名
- `--region <region>`: 华为云区域
- `--iam-endpoint <url>`: IAM 认证端点
- `--codearts-url <url>`: CodeArts API 地址

配置加载实现：

```typescript
import dotenv from 'dotenv';
import { readGlobalConfig, globalConfigExists } from './global-config';

// 加载当前目录的 .env 文件
dotenv.config();

// 加载全局配置
const globalConfig = globalConfigExists() ? readGlobalConfig() : {};

// 合并配置：命令行参数 > 当前目录 .env > 全局配置 > 默认值
const projectId = cliOptions.projectId || process.env.PROJECT_ID || globalConfig.PROJECT_ID;
```

---

## 10. 编码最佳实践

1. **不要硬编码**: 使用环境变量或配置文件
2. **避免重复代码**: 提取公共逻辑到独立函数
3. **保持函数简洁**: 单个函数不超过 50 行（建议）
4. **使用解构赋值**: 简化对象和数组操作
5. **优先使用箭头函数**: 保持 `this` 上下文清晰
6. **使用可选链**: `?.` 和 `??` 简化空值处理
7. **遵循 DRY 原则**: Don't Repeat Yourself

---

## 11. Git 提交规范

提交信息格式：

```
<type>: <subject>

<body>
```

类型（type）：

- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `docs`: 文档更新
- `test`: 测试相关
- `chore`: 构建/工具链相关

示例：

```
feat: 添加按领域统计工时功能

- 在 getAllWorkHourStats 方法中增加按领域分组逻辑
- 为每个工时记录关联 issue 的领域信息
- 输出按领域汇总的工时统计
```

---

## 12. 特别注意事项

### Copilot 指令（来自 `.github/copilot-instructions.md`）

1. **绝对不要生成示例代码** - Never generate example code or usage examples
2. **不要生成说明文档** - Do not generate documentation or explanation comments
3. **除非明确说明，不要生成测试用例** - Do not generate test cases unless explicitly requested

Focus solely on production code implementation without examples, documentation, or tests unless specifically requested.

### TypeScript 编译配置

`tsconfig.json` 编译配置：

- 编译所有 `src/` 下的 TypeScript 文件到 `dist/`
- `src/daily.ts` 和 `src/workHour.ts` 会被编译（用于向后兼容 npm scripts）
- CLI 入口文件在 `src/bin/cli.ts`，编译后为 `dist/bin/cli.js`
- `bin/hecom-codearts` 可执行文件通过 `require('../dist/bin/cli.js')` 加载

---

**本文档版本**: 2026-02-09  
**适用于**: AI 编码代理（GitHub Copilot, Cursor, OpenCode 等）
