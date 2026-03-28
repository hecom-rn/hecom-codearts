import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByAssigneeChart: ChartModule = {
  title: '修复人 Bug 数量',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.developer?.nick_name || '未设置';
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });

    const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, value]) => value);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f0f3f7' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'right', color: '#111827', fontWeight: 600 },
          itemStyle: { color: '#4A6CF7', borderRadius: 6 },
          barCategoryGap: '40%',
        },
      ],
    };
  },
};
