import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagModuleHeatmapChart: ChartModule = {
  title: '标签-模块热力图',
  buildOption(bugs: IssueDetail[]): object {
    const heatMap = new Map<string, number>();
    const allTags = new Set<string>();
    const allModules = new Set<string>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      const moduleName = bug.module?.name?.trim() || '未设置模块';
      allModules.add(moduleName);
      bug.tag_list.forEach((tag) => {
        allTags.add(tag);
        const key = `${tag}|${moduleName}`;
        heatMap.set(key, (heatMap.get(key) || 0) + 1);
      });
    });

    const tags = Array.from(allTags);
    const modules = Array.from(allModules);

    const data: number[][] = [];
    tags.forEach((tag, xi) => {
      modules.forEach((mod, yi) => {
        const v = heatMap.get(`${tag}|${mod}`) || 0;
        data.push([xi, yi, v]);
      });
    });

    const maxValue = data.reduce((max, d) => Math.max(max, d[2]), 0);

    return {
      tooltip: {
        position: 'top',
        formatter: (params: { data: number[] }) =>
          `${tags[params.data[0]]} / ${modules[params.data[1]]}: ${params.data[2]} 个`,
      },
      xAxis: { type: 'category', data: tags, axisLabel: { rotate: 30 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: modules, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max: Math.max(1, maxValue),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
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
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        },
      ],
    };
  },
};
