# 安装指南

本文档面向本地开发环境中的 agent，指导安装与验证 @hecom/codearts。

## 环境要求

- 必须安装 Node.js，版本 **大于 23**。
- 如果运行环境报错或提示 Node 不存在，请先安装/修复 Node.js 环境。

## 安装 Node.js（Windows）

使用系统包管理器安装（推荐 winget）：

```bash
winget install OpenJS.NodeJS
```

安装完成后重新打开终端，确认 `node -v` 版本大于 23。

## 安装 Node.js（macOS）

使用 Homebrew 安装：

```bash
brew install node
```

安装完成后重新打开终端，确认 `node -v` 版本大于 23。

## 安装 Node.js（Linux）

使用发行版包管理器安装（任选其一）：

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y nodejs

# RHEL/CentOS/Fedora
sudo dnf install -y nodejs

# Arch
sudo pacman -S nodejs
```

安装完成后重新打开终端，确认 `node -v` 版本大于 23。

## 验证安装

执行以下命令：

```bash
npx @hecom/codearts -V
```

如果输出版本号，表示安装成功。

## 常见问题

- 如果提示命令不存在，请确认 Node.js 已安装且 PATH 生效，必要时重启终端。
