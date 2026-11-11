# @hecom/codearts

基于华为云 CodeArts API 的统计分析与工作项管理工具。

## 快速开始

### 1. 初始化

```bash
npm install -g @hecom/codearts
codearts config
```

运行交互式配置向导，根据提示输入必要的配置项。配置文件将保存在 `~/.hecom-codearts/config.env`，配置一次后全局可用。

### 2. 使用

全局选项（对所有命令生效）：

- `--role <ids>`：角色 ID（支持逗号分隔），覆盖配置文件中的角色配置
- `--output <format>`：输出格式，`console`（默认）/ `csv` / `json`

#### 统计报表

```bash
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

# 生成质量分析报告（缺陷多维分析 + ECharts PNG 图表）
codearts quality --iteration "迭代1,迭代2"
```

#### Bug 处理与分析

```bash
# 交互式修复当前用户的 Bug
codearts fix

# 非交互式修复指定 Bug（缺陷技术分析必填）
codearts fix <id> -a 空指针异常 -r "未判空" -i "登录模块"

# 生成 Bug 多维度可视化分析报告（HTML）
codearts rebug chart --iteration "迭代1,迭代2" --terminal "移动端"

# 查看未添加标签的 Bug 列表
codearts rebug no-tag --iteration "迭代1,迭代2" --developer "张三"
```

> `fix` 选中客户反馈类 bug 时，`-r`（问题原因及解决办法）、`-p`（引入阶段）、`-d`（发布时间）必填；字段取值不确定时先用 `issue options <字段>` 查询。

#### 工作项管理（issue）

`issue` 命令组子命令较多，单独成节介绍，见下方 [工作项管理（issue 命令组）](#工作项管理issue-命令组)。

#### 项目成员（user）

```bash
# 查询成员详情与角色（支持用户名、数字 ID、昵称，可一次查多个）
codearts user detail 王晓会 2513

# 查询当前配置用户，机器解析输出
codearts user detail my --json
```

#### Story 拆解

```bash
# 为没有拆解的 Story 创建 Task
codearts story all "版本1"

# 交互式选择 Story 和处理人后创建子 Task
codearts story single "版本1"

# 查询工作项详情，可选评论，自动下载内容中的图片
codearts story detail <id1> <id2> -c
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

## 工作项管理（issue 命令组）

`issue` 命令组提供工作项的查询与维护能力，面向 Agent/脚本调用设计。推荐流程：

1. 先用 `issue options <字段>` 查询字段可用取值（状态/迭代/模块/领域/自定义字段等），再调用 list/create/update，避免传错值静默返回空结果
2. 机器解析输出加 `--json`（输出纯 JSON，无 loading 等附加文案）；只要 ID 用 `-q`；只要条数用 `--count`
3. 描述与评论内容均支持 HTML：`issue upload-img` 返回的图片片段可直接拼入 `--description` 或评论内容

### 子命令一览

| 子命令 | 说明 |
| --- | --- |
| `issue options [field]` | 查询字段可用取值（状态/迭代/模块/领域/自定义字段等），不带字段时列出全部可查询字段 |
| `issue list` | 按条件筛选工作项列表，支持类型/状态/处理人/迭代/优先级/重要程度/领域/模块/自定义字段/时间区间等条件 |
| `issue detail <ids...>` | 查询工作项详情，支持多个 ID，可选评论（`-c`），自动下载内容中的图片/附件（`--no-download` 跳过） |
| `issue create` | 创建工作项，字段用法与 update 一致 |
| `issue update <id>` | 更新系统字段与自定义字段（`-f 名称=值` 可重复传入） |
| `issue delete <ids...>` | 删除工作项（删除后详情接口不可见），删除前需确认，`-y` 跳过确认 |
| `issue list-comment <id>` | 查询工作项评论，按时间正序输出（兼容别名 `comments`，`-n` 只看最近 N 条） |
| `issue add-comment <id> <notes>` | 为工作项添加评论，内容支持 HTML（兼容别名 `addNote`） |
| `issue update-comment <id> <note-id> <notes>` | 修改指定评论 |
| `issue delete-comment <id> <note-id>` | 删除指定评论 |
| `issue workhour <id> <hours>` | 登记工时，日期缺省为当天，跨多天（`--start`/`--end`）按天均摊 |
| `issue upload-img <files...>` | 上传图片，默认输出可直接嵌入描述/评论的 HTML 片段（`--json` 输出图片 ID 与 URI） |
| `issue upload-attachment <id> <files...>` | 为工作项上传附件，支持多个文件 |
| `issue delete-attachment <id> <targets...>` | 删除附件，入参支持附件 ID 或精确文件名 |

### 使用示例

```bash
# 查询字段可用取值
codearts issue options status
codearts issue options 产品模块

# 按条件筛选列表（my 表示当前用户，--json 便于机器解析）
codearts issue list -t task -i 2608,2609 -a my -l 状态,迭代 --json

# 只要 ID / 只要条数，便于管道组合
codearts issue list -t bug -i 2609 -q
codearts issue list -k "登录" --count

# 查询详情（--no-download 跳过图片/附件下载）
codearts issue detail <id>
codearts issue detail <id1> <id2> -c --no-download

# 创建/更新工作项（自定义字段用 -f 名称=值，多选值逗号分隔）
codearts issue create -t bug -n "Bug 标题" --priority 高 -f 终端类型=手机端
codearts issue update <id> --status 已解决 -f 产品模块=APP

# 评论的增查改删
codearts issue add-comment <id> "评论内容"
codearts issue list-comment <id> -n 5
codearts issue update-comment <id> <note-id> "修改后的内容"
codearts issue delete-comment <id> <note-id>

# 登记工时
codearts issue workhour <id> 8 -t 后端开发
codearts issue workhour <id> 4 --start 2026-09-18 --end 2026-09-19

# 图片/附件
codearts issue add-comment <id> "$(codearts issue upload-img ./screenshot.png) 复现截图"
codearts issue upload-attachment <id> ./report.pdf
codearts issue delete-attachment <id> report.pdf

# 删除工作项（脚本/Agent 调用加 -y 跳过确认）
codearts issue delete <id> -y
```

### 注意事项

- `-a`（处理人）、`--creator`（创建人）、`-d`（开发人员）均支持昵称、用户名、成员数字 ID，`my` 表示当前配置用户；迭代支持名称模糊匹配
- 多选自定义字段（`issue options` 中标注"多选"）的值用逗号分隔或重复 `-f` 传入，同字段自动合并
- 自定义字段过滤传错值不会报错，只会返回空结果，取值务必先通过 `issue options` 确认

---

## 本地开发与调试

### 环境要求

- Node.js >= 20.19.0（`>=20.19 <21` 或 `>=22.13`）
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

| 配置项                      | 说明                                     | 必填 |
| --------------------------- | ---------------------------------------- | ---- |
| `HUAWEI_CLOUD_IAM_ENDPOINT` | IAM 认证端点                             | 是   |
| `HUAWEI_CLOUD_REGION`       | 华为云区域                               | 是   |
| `CODEARTS_BASE_URL`         | CodeArts API 地址                        | 是   |
| `HUAWEI_CLOUD_DOMAIN`       | 华为云账号名                             | 是   |
| `HUAWEI_CLOUD_USERNAME`     | IAM 用户名                               | 是   |
| `HUAWEI_CLOUD_PASSWORD`     | IAM 密码                                 | 是   |
| `PROJECT_ID`                | 项目 ID                                  | 是   |
| `ROLE_ID`                   | 角色配置（支持逗号分隔，如: 1,2,3）      | 是   |
| `DEVELOPMENT_END`           | 开发端配置（当前用户所属端）             | 是   |
| `TERMINAL_TYPE`             | 终端类型配置                             | 是   |

---

## License

ISC
