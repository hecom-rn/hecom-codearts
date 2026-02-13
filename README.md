# @hecom/codearts

基于华为云 CodeArts API 的统计分析工具。

## 快速开始

### 1. 初始化

```bash
npx @hecom/codearts
```

自动运行交互式配置向导，根据提示输入必要的配置项。配置文件将保存在 `~/.hecom-codearts/config.env`，配置一次后全局可用。

### 2. 使用

```bash
# 查看帮助
npx @hecom/codearts --help

# 生成今日工时日报
npx @hecom/codearts daily

# 生成当年工时统计
npx @hecom/codearts work-hour

# 更新全局配置
npx @hecom/codearts config

# 单独更新角色配置
npx @hecom/codearts config role-id
```

### 3. 升级

```bash
# 更新最新版本
npx @hecom/codearts@latest

```

---

## 本地开发与调试

### 环境要求

- Node.js >= 23.0.0
- npm >= 7.0.0

### 安装依赖

```bash
npm install
```

### 本地运行

```bash
# 运行命令
npm run dev

npm run dev daily

npm run dev work-hour
```

### 本地链接 CLI 工具

```bash
npm run build
npm link
codearts --help
```

### 配置项

| 配置项                      | 说明                               | 必填 |
| --------------------------- | ---------------------------------- | ---- |
| `HUAWEI_CLOUD_IAM_ENDPOINT` | IAM 认证端点                       | 是   |
| `HUAWEI_CLOUD_REGION`       | 华为云区域                         | 是   |
| `HUAWEI_CLOUD_USERNAME`     | IAM 用户名                         | 是   |
| `HUAWEI_CLOUD_PASSWORD`     | IAM 密码                           | 是   |
| `HUAWEI_CLOUD_DOMAIN`       | 华为云账号名                       | 是   |
| `CODEARTS_BASE_URL`         | CodeArts API 地址                  | 是   |
| `PROJECT_ID`                | 项目 ID                            | 是   |
| `ROLE_ID`                   | 角色 ID（支持逗号分隔，如: 1,2,3） | 是   |

---

## License

MIT
