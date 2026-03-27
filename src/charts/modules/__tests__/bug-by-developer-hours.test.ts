import { bugByDeveloperHoursChart } from '../bug-by-developer-hours';
import { IssueItem } from '../../../types';

function makeIssue(nickName: string, hours: number): Partial<IssueItem> {
  return {
    developer: {
      id: 1,
      name: '',
      nick_name: nickName,
      user_id: '',
      user_num_id: 1,
      first_name: '',
    },
    actual_work_hours: hours,
    new_custom_fields: [],
    deleted: false,
  } as Partial<IssueItem>;
}

describe('bugByDeveloperHoursChart', () => {
  it('标题应为"开发人员工时消耗"', () => {
    expect(bugByDeveloperHoursChart.title).toBe('开发人员工时消耗');
  });

  it('按开发人员汇总工时并降序排列', () => {
    const bugs = [makeIssue('张三', 3), makeIssue('李四', 5), makeIssue('张三', 1)] as IssueItem[];
    const option = bugByDeveloperHoursChart.buildOption(bugs) as any;
    const names: string[] = option.yAxis.data;
    const values: number[] = option.series[0].data;
    expect(names[0]).toBe('李四');
    expect(values[0]).toBe(5);
    expect(names[1]).toBe('张三');
    expect(values[1]).toBe(4);
  });

  it('过滤掉 nick_name 为空的条目', () => {
    const bugs = [makeIssue('', 4), makeIssue('王五', 2)] as IssueItem[];
    const option = bugByDeveloperHoursChart.buildOption(bugs) as any;
    const names: string[] = option.yAxis.data;
    expect(names).not.toContain('');
    expect(names).toContain('王五');
  });

  it('过滤掉 developer 未设置的条目', () => {
    const bugs = [
      { ...makeIssue('赵六', 3), developer: null } as unknown as IssueItem,
      makeIssue('赵六', 1),
    ] as IssueItem[];
    const option = bugByDeveloperHoursChart.buildOption(bugs) as any;
    const values: number[] = option.series[0].data;
    expect(values[0]).toBe(1);
  });

  it('空数组时返回空图表', () => {
    const option = bugByDeveloperHoursChart.buildOption([]) as any;
    expect(option.yAxis.data).toHaveLength(0);
    expect(option.series[0].data).toHaveLength(0);
  });
});
