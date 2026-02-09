# Hecom CodeArts

基于华为云 CodeArts API 的工时统计分析工具。

## 项目描述

这是一个使用 TypeScript/Node.js 构建的工时统计分析项目，通过华为云 CodeArts API 获取 issue、人员、工时等数据，并生成日报和年度工时统计报表。

## 技术栈

- **语言**: TypeScript
- **运行环境**: Node.js
- **HTTP客户端**: Axios
- **测试框架**: Jest
- **认证方式**: 华为云 IAM Token 认证

## 项目结构

```
hecom-codearts/
├── src/
│   ├── bin/                    # CLI 入口
│   │   └── cli.ts              # Commander.js CLI 定义
│   ├── commands/               # 命令实现
│   │   ├── daily.command.ts    # 日报命令逻辑
│   │   ├── work-hour.command.ts# 工时统计命令逻辑
│   │   └── index.ts            # 命令导出
│   ├── services/               # API服务类
│   │   ├── api.service.ts      # 华为云基础 API 封装
│   │   └── business.service.ts # 业务场景 API 封装
│   ├── utils/                  # 工具函数
│   │   └── config-loader.ts    # 配置加载器（CLI参数 > 环境变量）
│   ├── config/                 # 配置文件
│   │   └── holidays.ts         # 节假日配置与工作日计算
│   ├── types/                  # TypeScript 类型定义
│   │   └── index.ts            # API 契约与数据结构定义
│   ├── daily.ts                # 日报统计主程序（向后兼容）
│   ├── workHour.ts             # 年度工时统计主程序（向后兼容）
│   └── index.ts                # 模块导出
├── bin/
│   └── hecom-codearts          # CLI 可执行文件
├── __tests__/                  # 测试文件
├── dist/                       # 编译输出目录
├── .env                        # 环境变量配置
├── .env.example                # 环境变量配置模板
├── tsconfig.json               # TypeScript配置
├── jest.config.js              # Jest测试配置
└── package.json                # 项目配置
```

## 安装与运行

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装方式

#### 方式一：使用 npx（推荐）

无需安装，直接运行：

```bash
npx hecom-codearts --help
npx hecom-codearts daily
npx hecom-codearts work-hour
```

#### 方式二：全局安装

```bash
npm install -g hecom-codearts
hecom-codearts --help
```

#### 方式三：本地开发

```bash
npm install
npm run build
npm link
hecom-codearts --help
```

### 环境配置

1. 复制环境变量示例文件：

```bash
cp .env.example .env
```

2. 修改 `.env` 文件中的配置：

```env
# 华为云IAM认证端点（根据区域调整）
HUAWEI_CLOUD_IAM_ENDPOINT=https://iam.cn-north-1.myhuaweicloud.com
HUAWEI_CLOUD_REGION=cn-north-1

# IAM用户凭证
HUAWEI_CLOUD_USERNAME=your-iam-username
HUAWEI_CLOUD_PASSWORD=your-iam-password
HUAWEI_CLOUD_DOMAIN=your-domain-name

# 项目配置
CODEARTS_BASE_URL=https://projectman-ext.cn-north-1.myhuaweicloud.cn
PROJECT_ID=your-project-id
ROLE_ID=1,2,3  # 支持逗号分隔的多个角色ID
```

### 使用方式

#### CLI 命令（推荐）

```bash
# 查看帮助
hecom-codearts --help
hecom-codearts daily --help
hecom-codearts work-hour --help

# 生成日报（默认统计当天）
hecom-codearts daily

# 生成指定日期的日报
hecom-codearts daily 2026-01-15

# 使用命令行参数覆盖环境变量
hecom-codearts daily 2026-01-15 --project-id abc123 --role-id 1,2

# 生成年度工时统计（默认统计当前年份）
hecom-codearts work-hour

# 生成指定年份的工时统计
hecom-codearts work-hour 2025

# 使用命令行参数覆盖环境变量
hecom-codearts work-hour 2025 --role-id 1,2,3
```

#### npm scripts（向后兼容）

```bash
# 生成日报（默认统计当天）
npm run daily

# 生成指定日期的日报
npm run daily 2026-01-15

# 生成年度工时统计（默认统计当前年份）
npm run work-hour

# 生成指定年份的工时统计
npm run work-hour 2025

# 编译TypeScript
npm run build
```

### CLI 选项

全局选项（适用于所有命令）：

```
--project-id <id>      项目 ID
--role-id <ids>        角色 ID（支持逗号分隔，如: 1,2,3）
--username <username>  IAM 用户名
--password <password>  IAM 密码（建议使用 .env 文件）
--domain <domain>      华为云账号名
--region <region>      华为云区域
--iam-endpoint <url>   IAM 认证端点
--codearts-url <url>   CodeArts API 地址
```

配置优先级：**命令行参数 > 环境变量 > 默认值**

## 核心功能

### 日报统计 (daily.ts)

生成指定日期的工时日报，包括：

- 按人员统计当日工时
- 统计 Bug 修复工时（自动合并同一 Bug 的多人工时）
- 统计活跃的工作项数量
- 计算工时完成率（基于角色成员数）
- 生成可读的日报格式输出

### 年度工时统计 (workHour.ts)

生成指定年份的工时统计报表，包括：

- 计算年度应计工作日（自动排除法定节假日和周末）
- 统计实际工时与应计工时的完成率
- 按人员生成工时明细表
- 按领域类型（需求、缺陷、任务等）统计工时分布
- 支持多角色统计（按角色分组，显示小计和总计）
- 生成 Markdown 格式的统计表格

### 多角色支持

项目支持同时统计多个角色的数据：

- **日报**: 为每个角色生成独立的日报
- **工时统计**: 所有角色合并到一张表，按角色分组显示小计

配置方式：

```env
ROLE_ID=1,2,3  # 使用逗号分隔多个角色ID
```

或通过命令行参数：

```bash
hecom-codearts daily --role-id 1,2,3
hecom-codearts work-hour --role-id 1,2,3
```

### API服务层

#### ApiService (api.service.ts)

华为云 CodeArts 基础 API 封装：

- IAM Token 认证管理（自动获取和缓存）
- 项目管理 API（项目列表、成员查询）
- 迭代管理 API（迭代列表、迭代详情）
- 工作项 API（Issue 列表、详情、创建、更新）
- 工时管理 API（工时查询、提交）
- 请求日志（可选的 curl 风格日志输出）
- 完善的错误处理

#### BusinessService (business.service.ts)

面向业务场景的高级 API 封装：

- `getMembersByRoleId()`: 通过角色获取人员列表
- `getActiveIterationsOnDate()`: 查询指定日期的活跃迭代
- `getWorkloadByIterationsAndUsers()`: 批量查询工作量
- `getAllIssuesByIteration()`: 查询迭代内所有 Issue（自动分页）
- `getDailyWorkHourStats()`: 获取日报工时统计
- `getAllWorkHourStats()`: 获取年度工时统计
- `addIssueNote()`: 添加工作项备注

### 节假日配置 (config/holidays.ts)

- 支持中国法定节假日配置
- 支持调休工作日配置
- 支持大小周制度
- 自动计算年度应计工作日
- 判断指定日期是否为工作日

## 环境变量

项目支持以下环境变量：

| 变量名                      | 说明                               | 必填 | 默认值                                               |
| --------------------------- | ---------------------------------- | ---- | ---------------------------------------------------- |
| `HUAWEI_CLOUD_IAM_ENDPOINT` | IAM 认证端点                       | 否   | `https://iam.cn-north-1.myhuaweicloud.com`           |
| `HUAWEI_CLOUD_REGION`       | 华为云区域                         | 否   | `cn-north-1`                                         |
| `HUAWEI_CLOUD_USERNAME`     | IAM 用户名                         | 是   | -                                                    |
| `HUAWEI_CLOUD_PASSWORD`     | IAM 密码                           | 是   | -                                                    |
| `HUAWEI_CLOUD_DOMAIN`       | 华为云账号名                       | 是   | -                                                    |
| `CODEARTS_BASE_URL`         | CodeArts API 地址                  | 否   | `https://projectman-ext.cn-north-1.myhuaweicloud.cn` |
| `PROJECT_ID`                | 项目 ID                            | 是   | -                                                    |
| `ROLE_ID`                   | 角色 ID（支持逗号分隔，如: 1,2,3） | 是   | -                                                    |
| `TARGET_DATE`               | 目标日期（YYYY-MM-DD）             | 否   | 当天日期                                             |
