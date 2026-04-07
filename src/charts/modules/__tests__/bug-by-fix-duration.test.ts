import { bugByFixDurationChart } from '../bug-by-fix-duration';
import { IssueDetail } from '../../../types';

function makeIssue(overrides: Partial<IssueDetail>): IssueDetail {
  return {
    actual_work_hours: 0,
    assigned_cc_user: [],
    assigned_user: {
      id: 1,
      name: '',
      nick_name: '测试人',
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    begin_time: '',
    closed_time: '',
    created_time: '2026-03-01T08:00:00Z',
    creator: { id: 1, name: '', nick_name: '', user_id: '', user_num_id: 1, first_name: '' },
    custom_fields: [],
    developer: {
      id: 1,
      name: '',
      nick_name: '开发人',
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    domain: { id: 1, name: '' },
    done_ratio: 0,
    end_time: '',
    expected_work_hours: 0,
    id: 1,
    iteration: { id: 1, name: '' },
    module: { id: 1, name: '' },
    name: 'test bug',
    new_custom_fields: [],
    parent_issue: { id: 0, name: '' },
    priority: { id: 1, name: '中' },
    project: { project_id: '', project_name: '', project_num_id: 1 },
    severity: { id: 1, name: '重要' },
    status: { id: 5, name: '已关闭' },
    tracker: { id: 3, name: 'Bug' },
    updated_time: '',
    deleted: false,
    tag_list: null,
    ...overrides,
  } as IssueDetail;
}

describe('bugByFixDurationChart', () => {
  it('标题应为"修复周期分布"', () => {
    expect(bugByFixDurationChart.title).toBe('修复周期分布');
  });

  it('closed_time 为空时归入"未关闭"桶', () => {
    const bugs = [makeIssue({ closed_time: '' })];
    const option = bugByFixDurationChart.buildOption(bugs) as any;
    const data: number[] = option.series[0].data;
    const categories: string[] = option.xAxis.data;
    const idx = categories.indexOf('未关闭');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(data[idx]).toBe(1);
  });

  it('1天内关闭归入"≤1天"桶（ceil，间隔0.5天）', () => {
    const created = '2026-03-01T08:00:00Z';
    const closed = '2026-03-01T20:00:00Z'; // 12h → Math.ceil(0.5) = 1
    const bugs = [makeIssue({ created_time: created, closed_time: closed })];
    const option = bugByFixDurationChart.buildOption(bugs) as any;
    const data: number[] = option.series[0].data;
    const categories: string[] = option.xAxis.data;
    const idx = categories.indexOf('≤1天');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(data[idx]).toBe(1);
  });

  it('3天关闭归入"2-3天"桶', () => {
    const created = '2026-03-01T00:00:00Z';
    const closed = '2026-03-04T00:00:00Z'; // 3天整
    const bugs = [makeIssue({ created_time: created, closed_time: closed })];
    const option = bugByFixDurationChart.buildOption(bugs) as any;
    const data: number[] = option.series[0].data;
    const categories: string[] = option.xAxis.data;
    const idx = categories.indexOf('2-3天');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(data[idx]).toBe(1);
  });

  it('空数组时所有桶数量均为0', () => {
    const option = bugByFixDurationChart.buildOption([]) as any;
    const data: number[] = option.series[0].data;
    expect(data.every((v) => v === 0)).toBe(true);
  });
});
