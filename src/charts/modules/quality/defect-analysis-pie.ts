import { IssueDetail, CustomFieldId } from '../../../types';

/**
 * 缺陷技术分析饼图（环形）
 * 按 custom_field32 (DEFECT_TECHNICAL_ANALYSIS) 聚合
 */
export function buildDefectAnalysisPieOption(bugs: IssueDetail[]): object {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    const value =
      (bug.new_custom_fields || []).find(
        (f) => f.custom_field === CustomFieldId.DEFECT_TECHNICAL_ANALYSIS
      )?.value ?? '未填写';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const data = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        label: { show: true, formatter: '{b}\n{d}%' },
        data,
      },
    ],
  };
}
