import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByDeveloperHoursChart: ChartModule = {
  title: '开发人员工时消耗',
  buildOption(bugs: IssueDetail[]): object {
    const hoursMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const name = bug.developer?.nick_name;
      if (!name || name === '未设置') return;
      hoursMap.set(name, (hoursMap.get(name) ?? 0) + (bug.actual_work_hours ?? 0));
    });

    const sorted = Array.from(hoursMap.entries()).sort((a, b) => b[1] - a[1]);
    const names = sorted.map(([name]) => name);
    const values = sorted.map(([, hours]) => hours);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      // grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        name: '小时',
        axisLine: { show: false },
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
          label: {
            show: true,
            position: 'right',
            formatter: '{c}h',
            fontWeight: 600,
          },
          itemStyle: { borderRadius: 6 },
          barCategoryGap: '40%',
        },
      ],
    };
  },
};
