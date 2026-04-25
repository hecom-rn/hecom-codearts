import { IssueDetail } from '../../../types';

const BUCKETS = ['≤1天', '2-3天', '4-7天', '8-14天', '>14天'];

function toBucket(days: number): string {
  if (days <= 1) return '≤1天';
  if (days <= 3) return '2-3天';
  if (days <= 7) return '4-7天';
  if (days <= 14) return '8-14天';
  return '>14天';
}

/**
 * 修复周期分布柱状图
 * 只统计有 closed_time 的 Bug，按创建到关闭天数分桶
 */
export function buildFixDurationBarOption(bugs: IssueDetail[]): object {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const bug of bugs) {
    if (!bug.closed_time) continue;
    const days = Math.ceil(
      (new Date(bug.closed_time).getTime() - new Date(bug.created_time).getTime()) / 86400000
    );
    if (days < 0) continue; // 数据异常保护
    counts[toBucket(days)]++;
  }

  const values = BUCKETS.map((b) => counts[b]);

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
    xAxis: { type: 'category', data: BUCKETS },
    yAxis: { type: 'value', name: 'Bug 数量' },
    series: [{ type: 'bar', data: values, label: { show: true, position: 'top' } }],
  };
}
