import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByAssigneeChart: ChartModule = {
  title: '处理人 Bug 数量',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.assigned_user?.nick_name || '未分配';
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });

    const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, value]) => value);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: names, inverse: true },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'right' },
          itemStyle: { color: '#5470c6' },
        },
      ],
    };
  },
};
