import { ChartModule } from './chart.interface';
import { bugByAssigneeChart } from './modules/bug-by-assignee';
import { bugByDefectAnalysisChart } from './modules/bug-by-defect-analysis';
import { bugByModuleChart } from './modules/bug-by-module';

export const allCharts: ChartModule[] = [
  bugByDefectAnalysisChart,
  bugByAssigneeChart,
  bugByModuleChart,
];
