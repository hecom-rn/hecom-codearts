/**
 * Inquirer prompts 的全局 theme 配置
 * 用于统一所有交互式提示的视觉样式
 */

/**
 * 中文操作提示映射表
 */
const actionMap: Record<string, string> = {
  navigate: '上下移动',
  select: '选择/取消',
  all: '全选',
  invert: '反选',
  submit: '提交',
};

/**
 * 全局 theme 配置
 * 适用于 checkbox 和 select 等交互式组件
 */
export const globalTheme = {
  style: {
    keysHelpTip: (keys: [key: string, action: string][]) => {
      const tips = keys.map(
        ([key, action]) => `${key} \x1b[90m${actionMap[action] || action}\x1b[0m`
      );
      return tips.join(' • ');
    },
  },
};
