import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByModuleChart: ChartModule = {
  title: '模块 Bug 分布',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.module?.name || '未分配模块';
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });

    const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, value]) => value);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      // grid: { left: '4%', right: '4%', bottom: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: { rotate: 30, overflow: 'truncate', width: 90 },
        axisLine: { show: false },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: {} } },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'top' },
          itemStyle: { borderRadius: 6 },
          barWidth: '48%',
        },
      ],
    };
  },
};
