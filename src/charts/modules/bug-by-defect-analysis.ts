import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByDefectAnalysisChart: ChartModule = {
  title: '缺陷技术分析分布',
  buildOption(bugs: IssueDetail[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      const field = bug.new_custom_fields?.find((f) => f.custom_field === 'custom_field32');
      const value = field?.value || '未填写';
      countMap.set(value, (countMap.get(value) || 0) + 1);
    });

    const data = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      // legend: { orient: 'vertical', left: 'left', type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}: {d}%',
          },
          labelLine: { length: 18, length2: 6, lineStyle: { width: 1 } },
          data,
        },
      ],
    };
  },
};
