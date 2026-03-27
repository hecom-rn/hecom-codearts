import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

const BUCKETS = ['未关闭', '≤1天', '2-3天', '4-7天', '8-14天', '>14天'] as const;

function getDurationBucket(created: string, closed: string): string {
  if (!closed) return '未关闭';
  const days = Math.ceil(
    (new Date(closed).getTime() - new Date(created).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 1) return '≤1天';
  if (days <= 3) return '2-3天';
  if (days <= 7) return '4-7天';
  if (days <= 14) return '8-14天';
  return '>14天';
}

export const bugByFixDurationChart: ChartModule = {
  title: '修复周期分布',
  buildOption(bugs: IssueItem[]): object {
    const countMap = new Map<string, number>(BUCKETS.map((b) => [b, 0]));

    bugs.forEach((bug) => {
      const bucket = getDurationBucket(bug.created_time, bug.closed_time);
      countMap.set(bucket, (countMap.get(bucket) ?? 0) + 1);
    });

    const values = BUCKETS.map((b) => countMap.get(b) ?? 0);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: [...BUCKETS],
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: values,
          label: { show: true, position: 'top' },
          itemStyle: { color: '#fac858' },
        },
      ],
    };
  },
};
