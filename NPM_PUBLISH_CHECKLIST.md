# NPM 发布检查清单

## ✅ 已完成的准备工作

### 1. package.json 配置

- [x] 添加 `README.md` 到 files 数组
- [x] 更新 keywords（增加 huawei-cloud, codearts, work-hour, daily-report 等）
- [x] 添加 repository 字段
- [x] 添加 homepage 字段
- [x] 添加 bugs 字段
- [x] 添加 engines 字段（Node.js >= 16.0.0, npm >= 7.0.0）
- [x] 配置 prepublishOnly 钩子（自动构建）

### 2. .npmignore 配置

- [x] 创建 .npmignore 文件
- [x] 排除源代码目录（src/, **tests**/）
- [x] 排除配置文件（tsconfig.json, jest.config.js, eslint, prettier）
- [x] 排除开发工具目录（.vscode/, .idea/, .github/, .git/）
- [x] 排除测试覆盖率（coverage/）
- [x] 排除环境变量文件（.env, .env.\*）但保留 .env.example
- [x] 排除日志和临时文件
- [x] 排除 AGENTS.md（AI 开发文档）

### 3. 打包验证

- [x] 运行 `npm pack --dry-run` 验证
- [x] 确认打包文件列表正确（32 个文件）
- [x] 包大小：25.5 kB（gzip 压缩），102.1 kB（解压后）
- [x] 确认包含必要文件：
  - ✅ dist/ 目录（所有编译后的 JS 和 .d.ts 文件）
  - ✅ bin/hecom-codearts（CLI 可执行文件）
  - ✅ .env.example（配置模板）
  - ✅ README.md（文档）
  - ✅ package.json（包信息）

### 4. 排除的文件（验证正确）

- ✅ src/ 源代码目录（已编译到 dist/）
- ✅ .env 环境变量文件（敏感信息）
- ✅ tsconfig.json, jest.config.js 等配置文件
- ✅ .eslintrc.js, .prettierrc 代码风格配置
- ✅ .vscode/, .idea/ IDE 配置
- ✅ .github/ GitHub 配置
- ✅ .git/ Git 仓库
- ✅ coverage/ 测试覆盖率
- ✅ AGENTS.md AI 开发文档
- ✅ node_modules/ 依赖（npm 自动排除）

## 📋 发布前最终检查

### 代码质量

- [ ] 运行 `npm run build` 确保编译成功
- [ ] 检查 dist/ 目录内容完整
- [ ] 验证 CLI 命令可用：`./bin/hecom-codearts --help`
- [ ] 验证 CLI 版本显示：`./bin/hecom-codearts --version`

### 文档完整性

- [ ] README.md 包含安装说明
- [ ] README.md 包含使用示例
- [ ] README.md 包含配置说明
- [ ] .env.example 包含所有必需的环境变量

### 版本管理

- [ ] 确认当前版本号（0.1.0）
- [ ] 确认 CHANGELOG（如果有）已更新
- [ ] Git 工作区干净（所有更改已提交）

### NPM 账号

- [ ] 登录 NPM：`npm login`
- [ ] 验证登录状态：`npm whoami`
- [ ] 确认包名未被占用：`npm view hecom-codearts`（应返回 404）

## 🚀 发布命令

```bash
# 1. 确保代码已提交
git status

# 2. 最后一次构建
npm run build

# 3. 最后一次打包验证
npm pack --dry-run

# 4. 登录 NPM（如果未登录）
npm login

# 5. 发布到 NPM
npm publish

# 6. 验证发布成功
npm view hecom-codearts

# 7. 测试全局安装
npm install -g hecom-codearts
hecom-codearts --version
hecom-codearts --help

# 8. 打标签并推送
git tag v0.1.0
git push origin main --tags
```

## 📊 包信息摘要

```
包名: hecom-codearts
版本: 0.1.0
大小: 25.5 kB (压缩), 102.1 kB (解压)
文件数: 32
Node.js: >= 16.0.0
npm: >= 7.0.0
仓库: https://github.com/summer88123/hecom-codearts
```

## ⚠️ 注意事项

1. **不可撤销**：npm publish 一旦发布，无法删除，只能弃用（deprecate）
2. **版本号规则**：遵循 semver 规范，每次发布必须递增版本号
3. **敏感信息**：确保 .env 文件不在发布列表中
4. **测试安装**：发布后建议在空目录测试 `npm install -g hecom-codearts`
5. **备份**：发布前建议打 git tag 做版本备份

## 📝 发布后任务

- [ ] 在 GitHub 创建 Release（v0.1.0）
- [ ] 更新 README 添加 npm 徽章
- [ ] 通知团队成员新版本发布
- [ ] 监控 npm 下载量和 GitHub issues
- [ ] 规划下一个版本的功能
