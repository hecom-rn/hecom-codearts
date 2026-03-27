import { IssueItem } from '../../types';
import { ChartModule } from '../chart.interface';

const SEVERITY_ORDER = ['一般', '重要', '严重'];

export const bugOpenPriorityHeatmapChart: ChartModule = {
  title: '未关闭 Bug 优先级分布',
  buildOption(bugs: IssueItem[]): object {
    const openBugs = bugs.filter((b) => !b.deleted && b.status?.name !== '已关闭');

    const unknownSeverities = [
      ...new Set(
        openBugs.map((b) => b.severity?.name ?? '').filter((s) => s && !SEVERITY_ORDER.includes(s))
      ),
    ];
    const xCategories = [...SEVERITY_ORDER, ...unknownSeverities];

    const assigneeCounts = new Map<string, number>();
    openBugs.forEach((b) => {
      const name = b.assigned_user?.nick_name ?? '未分配';
      assigneeCounts.set(name, (assigneeCounts.get(name) ?? 0) + 1);
    });
    const yCategories = Array.from(assigneeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const heatMap = new Map<string, number>();
    openBugs.forEach((b) => {
      const xKey = b.severity?.name ?? '';
      const yKey = b.assigned_user?.nick_name ?? '未分配';
      const key = `${xKey}|${yKey}`;
      heatMap.set(key, (heatMap.get(key) ?? 0) + 1);
    });

    const data: number[][] = [];
    xCategories.forEach((x, xi) => {
      yCategories.forEach((y, yi) => {
        const v = heatMap.get(`${x}|${y}`) ?? 0;
        data.push([xi, yi, v]);
      });
    });

    const maxValue = data.reduce((max, d) => Math.max(max, d[2]), 0);

    return {
      tooltip: {
        position: 'top',
        formatter: (params: { data: number[] }) =>
          `${yCategories[params.data[1]]} / ${xCategories[params.data[0]]}: ${params.data[2]} 个`,
      },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xCategories,
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: Math.max(1, maxValue),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: { color: ['#ffffff', '#ee6666'] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: {
            show: true,
            formatter: (params: { data: number[] }) =>
              params.data[2] > 0 ? String(params.data[2]) : '',
          },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
        },
      ],
    };
  },
};
