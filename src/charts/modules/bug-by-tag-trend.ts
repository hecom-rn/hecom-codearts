import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

/**
 * 计算 ISO 8601 周 key，格式 YYYY-Www（如 2026-W14）
 * ISO 8601: 周一为起始日，含 1 月第一个周四的周为第 1 周
 */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 将周日(0)转为7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 调至周四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const bugByTagTrendChart: ChartModule = {
  title: '标签趋势（按周）',
  buildOption(bugs: IssueDetail[]): object {
    // 统计 (tag, weekKey) -> count
    const tagWeekMap = new Map<string, Map<string, number>>();
    const allWeeks = new Set<string>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      const week = getISOWeekKey(new Date(bug.created_time));
      allWeeks.add(week);
      bug.tag_list.forEach((tag) => {
        if (!tagWeekMap.has(tag.name)) tagWeekMap.set(tag.name, new Map());
        const weekMap = tagWeekMap.get(tag.name)!;
        weekMap.set(week, (weekMap.get(week) || 0) + 1);
      });
    });

    // 按总频率取 Top 10 标签
    const tagTotals = Array.from(tagWeekMap.entries()).map(([tag, wm]) => ({
      tag,
      total: Array.from(wm.values()).reduce((a, b) => a + b, 0),
    }));
    const top10Tags = tagTotals
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((t) => t.tag);

    const sortedWeeks = Array.from(allWeeks).sort();

    const series = top10Tags.map((tag) => {
      const weekMap = tagWeekMap.get(tag)!;
      return {
        name: tag,
        type: 'line',
        smooth: true,
        data: sortedWeeks.map((w) => weekMap.get(w) || 0),
      };
    });

    return {
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll', bottom: 0 },
      xAxis: { type: 'category', data: sortedWeeks, axisLabel: { rotate: 30 } },
      yAxis: { type: 'value', minInterval: 1 },
      series,
    };
  },
};
