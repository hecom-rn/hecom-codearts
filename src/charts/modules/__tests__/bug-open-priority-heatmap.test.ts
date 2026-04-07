import { bugOpenPriorityHeatmapChart } from '../bug-open-priority-heatmap';
import { IssueDetail } from '../../../types';

function makeIssue(
  assignee: string,
  severityName: string,
  statusName: string,
  deleted = false
): Partial<IssueDetail> {
  return {
    assigned_user: {
      id: 1,
      name: '',
      nick_name: assignee,
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    severity: { id: 1, name: severityName },
    status: { id: 5, name: statusName },
    deleted,
    new_custom_fields: [],
    tag_list: null,
  } as Partial<IssueDetail>;
}

describe('bugOpenPriorityHeatmapChart', () => {
  it('标题应为"未关闭 Bug 优先级分布"', () => {
    expect(bugOpenPriorityHeatmapChart.title).toBe('未关闭 Bug 优先级分布');
  });

  it('过滤掉已关闭的 bug', () => {
    const bugs = [
      makeIssue('张三', '重要', '已关闭'),
      makeIssue('张三', '严重', '进行中'),
    ] as IssueDetail[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const seriesData: number[][] = option.series[0].data;
    const total = seriesData.reduce((sum, d) => sum + d[2], 0);
    expect(total).toBe(1);
  });

  it('过滤掉 deleted=true 的 bug', () => {
    const bugs = [
      makeIssue('张三', '重要', '进行中', true),
      makeIssue('李四', '一般', '新问题', false),
    ] as IssueDetail[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const seriesData: number[][] = option.series[0].data;
    const total = seriesData.reduce((sum, d) => sum + d[2], 0);
    expect(total).toBe(1);
  });

  it('X 轴严重程度按 一般→重要→严重 顺序排列', () => {
    const bugs = [] as IssueDetail[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const xData: string[] = option.xAxis.data;
    expect(xData.indexOf('一般')).toBeLessThan(xData.indexOf('重要'));
    expect(xData.indexOf('重要')).toBeLessThan(xData.indexOf('严重'));
  });

  it('visualMap max 至少为 1（防止空数据时 min===max===0）', () => {
    const option = bugOpenPriorityHeatmapChart.buildOption([]) as any;
    expect(option.visualMap.max).toBeGreaterThanOrEqual(1);
  });

  it('未知 severity 值放 X 轴末尾', () => {
    const bugs = [makeIssue('张三', '未知等级', '进行中')] as IssueDetail[];
    const option = bugOpenPriorityHeatmapChart.buildOption(bugs) as any;
    const xData: string[] = option.xAxis.data;
    expect(xData[xData.length - 1]).toBe('未知等级');
  });
});
