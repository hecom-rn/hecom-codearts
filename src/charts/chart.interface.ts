import { IssueDetail } from '../types';

export interface ChartModule {
  title: string;
  buildOption(bugs: IssueDetail[]): object;
}
