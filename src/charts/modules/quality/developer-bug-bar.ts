import { IssueDetail } from '../../../types';

/**
 * 研发人员 Bug 数量横向柱状图
 * 按 developer.nick_name 聚合，降序排列
 */
export function buildDeveloperBugBarOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const name = bug.developer?.nick_name ?? '未分配';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => v);

  return {
    backgroundColor: 'transparent',
    title: {
      text: '研发人员 Bug 数量',
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '15%', right: '10%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Bug 数量',
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: categories.reverse(),
      inverse: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { width: 100, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: values.reverse(),
        label: { show: true, position: 'right', fontWeight: 600 },
        itemStyle: { borderRadius: 6 },
        barCategoryGap: '40%',
      },
    ],
  };
}
