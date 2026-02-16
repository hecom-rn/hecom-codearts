import { jest } from '@jest/globals';
import { ConfigKey } from '../../src/types';

// Mock dependencies
jest.mock('ora', () => {
  return jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  });
});

jest.mock('../../src/services/business.service');
jest.mock('../../src/utils/config-loader');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/csv-writer');

const { BusinessService } = require('../../src/services/business.service');
const configLoader = require('../../src/utils/config-loader');
const { logger } = require('../../src/utils/logger');
const csvWriter = require('../../src/utils/csv-writer');
const { dailyCommand } = require('../../src/commands/daily.command');

describe('Daily Command', () => {
  let mockBusinessServiceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup BusinessService mock
    mockBusinessServiceInstance = {
      getMembersByRoleIds: jest.fn().mockReturnValue(
        Promise.resolve([
          { user_id: 'u1', user_num_id: 1, role_name: 'Dev' },
          { user_id: 'u2', user_num_id: 2, role_name: 'Tester' },
        ])
      ),
      getDailyWorkHourStats: jest.fn().mockReturnValue(
        Promise.resolve({
          totalHours: 12,
          userStats: [
            {
              userId: 'u1',
              userName: 'Alice',
              totalHours: 8,
              workHours: [
                {
                  issue_id: 101,
                  subject: 'Task 1',
                  summary: 'Did something',
                  issue_type: '任务',
                  nick_name: 'Alice',
                  work_hours_type_name: '正常',
                  work_hours_num: '8',
                },
              ],
            },
            {
              userId: 'u2',
              userName: 'Bob',
              totalHours: 4,
              workHours: [
                {
                  issue_id: 102,
                  subject: 'Bug 1',
                  summary: 'Fixed bug',
                  issue_type: '缺陷',
                  nick_name: 'Bob',
                  work_hours_type_name: '正常',
                  work_hours_num: '4',
                },
              ],
            },
          ],
        })
      ),
      getActiveIterationsOnDate: jest.fn().mockReturnValue(Promise.resolve([])),
      getWorkloadByIterationsAndUsers: jest.fn().mockReturnValue(Promise.resolve([])),
      calculateWorkProgress: jest.fn().mockReturnValue({ overallCompletionRate: 0 }),
    };
    BusinessService.mockImplementation(() => mockBusinessServiceInstance);

    // Setup configLoader mocks
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1, 2],
      outputFormat: 'console',
      config: {},
    });
  });

  it('should run daily report for today (default)', async () => {
    await dailyCommand();

    expect(mockBusinessServiceInstance.getMembersByRoleIds).toHaveBeenCalled();
    expect(mockBusinessServiceInstance.getDailyWorkHourStats).toHaveBeenCalled();
    // Default output is console
    expect(logger.info).toHaveBeenCalled();
  });

  it('should run daily report for specific date', async () => {
    const date = '2023-01-01';
    await dailyCommand(date);

    expect(mockBusinessServiceInstance.getDailyWorkHourStats).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      date
    );
  });

  it('should output CSV when configured', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'csv',
      config: {},
    });

    await dailyCommand('2023-01-01');

    expect(csvWriter.writeCsvFile).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Alice')); // Console output skipped
  });

  it('should output JSON when configured', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'json',
      config: {},
    });

    await dailyCommand('2023-01-01');

    expect(logger.json).toHaveBeenCalled();
  });

  it('should generate summary report when --report flag is used', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'console', // Report is only for console
      config: {},
    });

    // Mock report related data
    mockBusinessServiceInstance.getActiveIterationsOnDate.mockReturnValue(
      Promise.resolve([{ id: 100, name: 'Iteration 1' }])
    );
    mockBusinessServiceInstance.getWorkloadByIterationsAndUsers.mockReturnValue(
      Promise.resolve([
        {
          id: 102, // matches bug above
          name: 'Bug 1',
          iteration: { id: 100 },
          actual_work_hours: 4,
          expected_work_hours: 8,
          done_ratio: 50,
          assigned_user: { nick_name: 'Bob' },
        },
      ])
    );
    mockBusinessServiceInstance.calculateWorkProgress.mockReturnValue({
      overallCompletionRate: 50,
    });

    await dailyCommand('2023-01-01', { report: true });

    expect(mockBusinessServiceInstance.getActiveIterationsOnDate).toHaveBeenCalled();
    expect(mockBusinessServiceInstance.getWorkloadByIterationsAndUsers).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('总结报告'));
  });

  it('should handle API errors', async () => {
    mockBusinessServiceInstance.getMembersByRoleIds.mockRejectedValue(new Error('API Error'));

    await expect(dailyCommand()).rejects.toThrow('API Error');
  });
});
