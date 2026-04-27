import { IssueDetail } from '../../../types';

/**
 * 需求 Bug 分布柱状图（纵向）
 * 按 parent_issue.name 聚合
 */
export function buildRequirementBugBarOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.parent_issue?.name ?? '未填写';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => v);

  return {
    backgroundColor: 'transparent',
    title: {
      text: '需求 Bug 分布',
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { rotate: 30, interval: 0, overflow: 'truncate', width: 120 },
    },
    yAxis: {
      type: 'value',
      name: 'Bug 数量',
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: values,
        label: { show: true, position: 'top', fontWeight: 600 },
        itemStyle: { borderRadius: 6 },
        barCategoryGap: '40%',
      },
    ],
  };
}
