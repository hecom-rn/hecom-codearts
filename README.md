# Hecom CodeArts

从CodeArts获取日报信息的Node.js TypeScript项目。

## 项目描述

这是一个Node.js脚本项目，使用TypeScript开发，通过HTTP API从后端服务获取数据，并对数据进行加工处理。

## 技术栈

- **语言**: TypeScript
- **运行环境**: Node.js
- **HTTP客户端**: Axios
- **测试框架**: Jest
- **代码规范**: ESLint

## 项目结构

```
hecom-codearts/
├── src/
│   ├── services/           # API服务类
│   │   └── api.service.ts
│   ├── types/              # 类型定义
│   │   └── index.ts
│   ├── utils/              # 工具类
│   │   └── data-processor.ts
│   ├── __tests__/          # 测试文件
│   │   ├── api.service.test.ts
│   │   └── data-processor.test.ts
│   └── index.ts            # 入口文件
├── dist/                   # 编译输出目录
├── coverage/               # 测试覆盖率报告
├── .env                    # 环境变量
├── .env.example            # 环境变量示例
├── tsconfig.json           # TypeScript配置
├── jest.config.js          # Jest测试配置
├── .eslintrc.js            # ESLint配置
└── package.json            # 项目配置
```

## 安装与运行

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

```bash
npm install
```

### 环境配置

1. 复制环境变量示例文件：
```bash
cp .env.example .env
```

2. 修改 `.env` 文件中的配置：
```env
API_BASE_URL=https://your-backend-api.com
API_KEY=your-api-key-here
API_TIMEOUT=30000
NODE_ENV=development
LOG_LEVEL=info
PORT=3000
```

### 开发与运行

```bash
# 开发模式运行
npm run dev

# 编译TypeScript
npm run build

# 运行编译后的代码
npm start

# 清理编译输出
npm run clean
```

### 测试

```bash
# 运行测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式运行测试
npm run test:watch
```

### 代码规范

```bash
# 检查代码规范
npm run lint

# 自动修复代码规范问题
npm run lint:fix
```

## 核心功能

### API服务 (ApiService)

负责与后端API的通信，包括：

- 数据获取
- 请求/响应拦截
- 错误处理
- 超时控制

### 数据处理器 (DataProcessor)

负责对从API获取的原始数据进行处理，包括：

- 数据清洗
- 格式转换
- 数据验证
- 统计分析

## API接口

### 主要方法

#### ApiService

- `fetchData()`: 获取所有数据
- `fetchDataById(id)`: 根据ID获取特定数据
- `submitProcessedData(data)`: 提交处理后的数据

#### DataProcessor

- `process(rawData)`: 处理原始数据
- `validateData(data)`: 验证数据有效性
- `groupDataBy(data, key)`: 按字段分组数据
- `generateStatistics(data)`: 生成统计信息

## 开发指南

### 添加新的API端点

1. 在 `src/services/api.service.ts` 中添加新方法
2. 在 `src/types/index.ts` 中定义相关类型
3. 编写对应的测试用例

### 添加新的数据处理逻辑

1. 在 `src/utils/data-processor.ts` 中添加处理方法
2. 更新类型定义
3. 编写测试用例

### 环境变量

项目支持以下环境变量：

- `API_BASE_URL`: API基础URL
- `API_KEY`: API密钥
- `API_TIMEOUT`: 请求超时时间（毫秒）
- `NODE_ENV`: 运行环境
- `LOG_LEVEL`: 日志级别
- `PORT`: 服务端口

## 注意事项

1. **API配置**: 请确保在 `.env` 文件中正确配置API相关参数
2. **数据格式**: 根据实际API返回的数据格式，可能需要调整类型定义
3. **错误处理**: 项目已包含基础的错误处理，可根据需要扩展
4. **日志**: 可以集成更完善的日志库（如winston）来替换console输出

## 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

ISC
