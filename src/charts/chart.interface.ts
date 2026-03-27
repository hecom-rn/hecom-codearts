import { IssueItem } from '../types';

export interface ChartModule {
  title: string;
  buildOption(bugs: IssueItem[]): object;
}
