# @hecom/codearts

基于华为云 CodeArts API 的统计分析工具。

## 快速开始

### 1. 初始化

```bash
npm install -g @hecom/codearts
codearts config
```

运行交互式配置向导，根据提示输入必要的配置项。配置文件将保存在 `~/.hecom-codearts/config.env`，配置一次后全局可用。

### 2. 使用

```bash
# 查看帮助
codearts --help

# 生成今日工时日报
codearts daily

# 生成指定日期工时日报并显示总结报告
codearts daily 2026-03-27 --report

# 生成当年工时统计
codearts work-hour

# 生成指定年份工时统计
codearts work-hour 2026

# 统计产品缺陷率
codearts bug-rate

# 交互式修复当前用户的 Bug
codearts fix

# 生成质量分析报告
codearts quality --iteration "迭代1,迭代2"

# 生成 Bug 多维度可视化分析报告
codearts rebug chart --iteration "迭代1,迭代2" --terminal "移动端"

# 查看未添加标签的 Bug 列表
codearts rebug no-tag --iteration "迭代1,迭代2" --developer "张三"

# 为指定版本的 Story 拆解 Task
codearts story all "版本1"
codearts story single "版本1"
```

### 3. 更新配置

```bash
# 更新配置文件
codearts config

# 单独更新角色配置
codearts config role-id

# 单独更新开发端配置
codearts config development-end

# 单独更新终端类型配置
codearts config terminal-type

# 查看当前配置
codearts config show
```

### 4. 升级

```bash
# 更新最新版本
codearts upgrade
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

> 本地运行命令时，注意使用 `--` 分隔 npm 参数和 CLI 参数，否则 CLI 参数可能无法正确传递。

```bash
# 运行命令
npm run dev

npm run dev -- daily

npm run dev -- work-hour
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
| `CODEARTS_BASE_URL`         | CodeArts API 地址                  | 是   |
| `HUAWEI_CLOUD_DOMAIN`       | 华为云账号名                       | 是   |
| `HUAWEI_CLOUD_USERNAME`     | IAM 用户名                         | 是   |
| `HUAWEI_CLOUD_PASSWORD`     | IAM 密码                           | 是   |
| `PROJECT_ID`                | 项目 ID                            | 是   |
| `ROLE_ID`                   | 角色 ID（支持逗号分隔，如: 1,2,3） | 是   |

---

## License

MIT
