import { ChartModule } from './chart.interface';
import { bugByAssigneeChart } from './modules/bug-by-assignee';
import { bugByDefectAnalysisChart } from './modules/bug-by-defect-analysis';
import { bugByModuleChart } from './modules/bug-by-module';
import { bugByFixDurationChart } from './modules/bug-by-fix-duration';
import { bugByDeveloperHoursChart } from './modules/bug-by-developer-hours';
import { bugOpenPriorityHeatmapChart } from './modules/bug-open-priority-heatmap';

export const allCharts: ChartModule[] = [
  bugByDefectAnalysisChart,
  bugByAssigneeChart,
  bugByModuleChart,
  bugByFixDurationChart,
  bugByDeveloperHoursChart,
  bugOpenPriorityHeatmapChart,
];
