# Fix 命令设计规范

**日期**: 2026-03-26  
**功能**: 交互式修复当前用户的 bug，填写缺陷分析信息  
**优先级**: 高

## 1. 概述

### 功能描述

`codearts fix` 命令提供交互式界面，让用户能够快速修复 bug 并填写缺陷技术分析信息。命令会引导用户通过以下步骤：

1. 查询当前用户的所有 bug 列表
2. 选择要修复的 bug
3. 填写缺陷技术分析（必填）及其他可选信息
4. 对于客户反馈类 bug，填写引入阶段和发布时间（必填）

## 2. 交互流程

### 阶段 1：数据准备

```
启动 fix 命令
  ↓
显示加载提示 (spinner)
  ↓
获取当前用户信息
  ↓
查询当前用户的所有 bug 列表（分页）
  ↓
动态获取缺陷技术分析和引入阶段的选项
  ↓
检查每个 bug 是否为客户反馈类型
  ↓
阶段 2：bug 选择
```

### 阶段 2：Bug 选择

```
展示 bug 列表给用户（支持搜索过滤）
  - 格式：[#BUG_ID] 标题 - 状态 - 迭代（如果有）
  ↓
用户选择一个 bug
  ↓
显示选中 bug 的基本信息（确认）
  ↓
阶段 3：填写缺陷分析
```

### 阶段 3：填写缺陷分析信息

#### 必填字段

1. **缺陷技术分析** (custom_field32)
   - 类型：单选下拉框
   - 数据源：动态获取自定义字段选项
   - 必须选择一个选项
   - 选项示例：功能实现问题、需求变更问题、代码逻辑问题等

#### 可选字段

1. **问题原因** (custom_field39)
   - 类型：文本输入（多行）
   - 最大长度：无限制（由 CodeArts API 决定）
   - 当用户输入时保存

2. **影响范围** (custom_field40)
   - 类型：文本输入
   - 最大长度：无限制（由 CodeArts API 决定）
   - 当用户输入时保存

### 阶段 4：客户反馈特殊处理

当 bug 的缺陷类型字段（custom_field36）值为"客户反馈"时，系统会进入客户反馈流程：

#### 额外必填字段

1. **引入阶段** (custom_field29)
   - 类型：单选下拉框
   - 数据源：动态获取自定义字段选项
   - 必须选择一个选项
   - 选项示例：研发、测试、生产等

2. **发布时间** (custom_field18)
   - 类型：日期选择器
   - 格式：YYYY-MM-DD
   - 必须输入有效日期

### 阶段 5：确认与保存

```
显示所有填写信息的总结
  ↓
用户确认提交 (Y/N)
  ↓
调用 fixBug() API 更新缺陷
  ↓
显示成功或失败信息
```

## 3. 技术实现细节

### 数据流

```
getCurrentUserBugs()
  ↓
[IssueItem[]]: 当前用户的 bug 列表

getCustomFieldOptions([custom_field32, custom_field29])
  ↓
{
  custom_field32: [选项1, 选项2, ...],
  custom_field29: [选项1, 选项2, ...]
}

fixBug(projectId, issue, bugFixData)
  ↓
更新缺陷工作项
```

### 关键函数接口

#### fixCommand(cliOptions?: CliOptions): Promise<void>

- 命令入口函数
- 参数：CLI 选项（role 等）
- 返回：无
- 错误处理：try-catch，显示错误信息后退出

#### 内部辅助函数

1. `fetchBugList()`: 获取当前用户的 bug 列表
2. `selectBug()`: 展示列表让用户选择
3. `promptDefectAnalysis()`: 提示用户选择缺陷技术分析
4. `promptOptionalFields()`: 提示用户填写可选字段
5. `checkIsCustomerFeedback()`: 检查是否为客户反馈
6. `promptCustomerFeedbackFields()`: 提示用户填写客户反馈字段
7. `confirmAndSubmit()`: 确认并提交更新

### 错误处理策略

| 错误情况               | 处理方式                     |
| ---------------------- | ---------------------------- |
| Bug 列表为空           | 显示提示信息，退出           |
| 自定义字段选项获取失败 | 显示错误信息，退出           |
| Bug 状态不可处理       | 显示警告，但允许用户继续     |
| 缺陷技术分析未填写     | 提示必填，重新输入           |
| 客户反馈缺少必填字段   | 提示必填，重新输入           |
| API 调用失败           | 显示错误信息，允许重试或退出 |

## 4. 文件结构

### 新建文件

```
src/commands/fix.command.ts
```

### 修改文件

```
src/bin/cli.ts              - 添加 fix 命令注册
src/commands/index.ts       - 导出 fixCommand
```

### 无需修改

```
src/services/business.service.ts  - 已有 getCurrentUserBugs、getCustomFieldOptions、fixBug
src/types/index.ts               - 已有 BugFixData 等类型定义
```

## 5. 用户体验考虑

### 交互组件

- **Spinner**: 数据加载时显示加载状态
- **Select/Checkbox**: 使用 inquirer 的 select 和 checkbox 进行选择
- **Input**: 文本输入字段
- **Confirm**: 最终确认提交

### 样式一致性

- 使用项目现有的 `globalTheme`（来自 inquirer-theme.ts）
- 所有日志输出使用 `logger` 工具，禁止 `console.log`
- Bug 链接使用 `issueLink()` 函数格式化

### 信息展示

- 加载阶段显示 spinner 提示
- 选择阶段显示 bug 的关键信息（ID、标题、状态）
- 确认阶段显示所有填写的信息总结
- 完成后显示成功消息和 bug 链接

## 6. 成功标准

- [ ] 命令能够查询当前用户的 bug 列表
- [ ] 用户能够交互式选择一个 bug
- [ ] 系统能够动态获取缺陷技术分析选项
- [ ] 用户能够填写必填和可选字段
- [ ] 系统能够检测客户反馈 bug 并要求填写额外字段
- [ ] 所有字段验证正确（必填字段不能为空）
- [ ] 最终能够成功调用 API 更新 bug 信息
- [ ] 错误信息清晰，用户可以理解失败原因

## 7. 测试场景

### 测试用例 1：正常流程（非客户反馈 bug）

1. 执行 `codearts fix`
2. 选择一个非客户反馈的 bug
3. 选择缺陷技术分析选项
4. 填写可选字段（或跳过）
5. 确认提交
6. 验证 bug 信息已更新

### 测试用例 2：客户反馈 bug 流程

1. 执行 `codearts fix`
2. 选择一个客户反馈的 bug
3. 选择缺陷技术分析选项
4. 填写可选字段
5. 填写引入阶段和发布时间（必填）
6. 确认提交
7. 验证所有信息已更新

### 测试用例 3：错误处理

1. 无 bug 列表时的处理
2. 自定义字段获取失败时的处理
3. API 更新失败时的处理

## 8. 依赖项

### 现有 API 和工具

- `BusinessService.getCurrentUserBugs()`: 获取当前用户 bug 列表
- `BusinessService.getCustomFieldOptions()`: 获取自定义字段选项
- `BusinessService.fixBug()`: 更新缺陷工作项
- `ApiService.showCurUserInfo()`: 获取当前用户信息
- `logger`: 日志工具
- `inquirer`: 交互式输入
- `ora`: 加载提示
- `globalTheme`: UI 主题

### 新增依赖

无（所有依赖已存在）

## 9. 备注

- 缺陷类型检测基于自定义字段 `custom_field36` 的值"客户反馈"
- 发布时间字段使用毫秒时间戳存储（由 `parseDateToTimestamp()` 处理）
- 所有自定义字段 ID 来自 `CustomFieldId` 枚举
- 状态更新：缺陷状态会自动设置为 "已解决"（IssueStatusId.RESOLVED）
