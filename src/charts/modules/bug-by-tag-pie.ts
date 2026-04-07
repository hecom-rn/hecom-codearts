import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagPieChart: ChartModule = {
  title: '标签分布',
  buildOption(bugs: IssueDetail[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) {
        countMap.set('未打标签', (countMap.get('未打标签') || 0) + 1);
      } else {
        bug.tag_list.forEach((tag) => {
          countMap.set(tag, (countMap.get(tag) || 0) + 1);
        });
      }
    });

    const data = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
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
