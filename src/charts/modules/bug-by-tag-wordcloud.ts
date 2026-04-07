import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagWordcloudChart: ChartModule = {
  title: '标签词云',
  buildOption(bugs: IssueDetail[]): object {
    const countMap = new Map<string, number>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      bug.tag_list.forEach((tag) => {
        countMap.set(tag, (countMap.get(tag) || 0) + 1);
      });
    });

    const data = Array.from(countMap.entries()).map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      series: [
        {
          type: 'wordCloud',
          sizeRange: [14, 60],
          rotationRange: [0, 0],
          shape: 'circle',
          width: '100%',
          height: '100%',
          data,
          textStyle: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
        },
      ],
    };
  },
};
