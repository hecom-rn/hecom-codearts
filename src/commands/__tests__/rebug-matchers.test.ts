import { matchIterations, matchTerminalTypes } from '../rebug.command';
import { IterationInfo, IterationStatus } from '../../types';

const makeIteration = (id: number, name: string): IterationInfo => ({
  id,
  name,
  begin_time: '2025-01-01',
  end_time: '2025-01-14',
  description: '',
  deleted: false,
  status: IterationStatus.IN_PROGRESS,
  updated_time: 0,
});

describe('matchIterations', () => {
  const iterations = [
    makeIteration(1, 'Sprint 2025.01'),
    makeIteration(2, 'Sprint 2025.02'),
    makeIteration(3, 'Sprint 2025.03'),
    makeIteration(4, 'Bugfix 2025.01'),
  ];

  it('按子字符串模糊匹配', () => {
    expect(matchIterations(iterations, '2025.01').map((i) => i.id)).toEqual([1, 4]);
  });

  it('不区分大小写', () => {
    expect(matchIterations(iterations, 'sprint').map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it('多关键字取并集', () => {
    expect(matchIterations(iterations, '2025.02,2025.03').map((i) => i.id)).toEqual([2, 3]);
  });

  it('空字符串关键字返回空数组', () => {
    expect(matchIterations(iterations, '')).toEqual([]);
    expect(matchIterations(iterations, '  ')).toEqual([]);
    expect(matchIterations(iterations, ',,')).toEqual([]);
  });

  it('无匹配返回空数组', () => {
    expect(matchIterations(iterations, 'nonexistent')).toEqual([]);
  });

  it('重复关键字结果去重', () => {
    expect(matchIterations(iterations, '2025.01,2025.01').map((i) => i.id)).toEqual([1, 4]);
  });

  it('保持原列表顺序', () => {
    const result = matchIterations(iterations, '2025.03,2025.01');
    expect(result.map((i) => i.id)).toEqual([1, 3, 4]);
  });

  it('正则元字符作为字面量匹配', () => {
    expect(matchIterations(iterations, '2025.01').length).toBeGreaterThan(0);
  });
});

describe('matchTerminalTypes', () => {
  const types = ['iOS', 'Android', 'Web', 'iOS Pad'];

  it('按子字符串模糊匹配', () => {
    expect(matchTerminalTypes(types, 'iOS')).toEqual(['iOS', 'iOS Pad']);
  });

  it('不区分大小写', () => {
    expect(matchTerminalTypes(types, 'ios')).toEqual(['iOS', 'iOS Pad']);
    expect(matchTerminalTypes(types, 'IOS')).toEqual(['iOS', 'iOS Pad']);
  });

  it('多关键字取并集', () => {
    expect(matchTerminalTypes(types, 'iOS,Android')).toEqual(['iOS', 'Android', 'iOS Pad']);
  });

  it('空字符串关键字返回空数组', () => {
    expect(matchTerminalTypes(types, '')).toEqual([]);
    expect(matchTerminalTypes(types, ' ')).toEqual([]);
  });

  it('无匹配返回空数组', () => {
    expect(matchTerminalTypes(types, 'Desktop')).toEqual([]);
  });

  it('重复关键字结果去重', () => {
    expect(matchTerminalTypes(types, 'iOS,iOS')).toEqual(['iOS', 'iOS Pad']);
  });

  it('保持原列表顺序', () => {
    expect(matchTerminalTypes(types, 'Web,iOS')).toEqual(['iOS', 'Web', 'iOS Pad']);
  });
});
