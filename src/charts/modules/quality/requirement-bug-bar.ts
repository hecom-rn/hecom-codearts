import { IssueDetail } from '../../../types';

/**
 * 需求 Bug 分布柱状图（纵向）
 * 按 parent_issue.name 聚合
 */
export function buildRequirementBugBarOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '无父工作项';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => v);

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: 30, interval: 0, overflow: 'truncate', width: 120 },
    },
    yAxis: { type: 'value', name: 'Bug 数量' },
    series: [{ type: 'bar', data: values, label: { show: true, position: 'top' } }],
  };
}
