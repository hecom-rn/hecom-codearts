import { ChartModule } from './chart.interface';
import { bugByAssigneeChart } from './modules/bug-by-assignee';
import { bugByDefectAnalysisChart } from './modules/bug-by-defect-analysis';
import { bugByModuleChart } from './modules/bug-by-module';
import { bugByFixDurationChart } from './modules/bug-by-fix-duration';
import { bugByDeveloperHoursChart } from './modules/bug-by-developer-hours';
import { bugOpenPriorityHeatmapChart } from './modules/bug-open-priority-heatmap';
import { bugByTagPieChart } from './modules/bug-by-tag-pie';
import { bugByTagTrendChart } from './modules/bug-by-tag-trend';
import { bugByTagModuleHeatmapChart } from './modules/bug-by-tag-module-heatmap';
import { bugByTagWordcloudChart } from './modules/bug-by-tag-wordcloud';
import { bugByTagDeveloperSankeyChart } from './modules/bug-by-tag-developer-sankey';

export const allCharts: ChartModule[] = [
  bugByModuleChart,
  bugByDefectAnalysisChart,
  bugByFixDurationChart,
  bugOpenPriorityHeatmapChart,
  bugByAssigneeChart,
  bugByDeveloperHoursChart,
  bugByTagPieChart,
  bugByTagTrendChart,
  bugByTagModuleHeatmapChart,
  bugByTagWordcloudChart,
  bugByTagDeveloperSankeyChart,
];
