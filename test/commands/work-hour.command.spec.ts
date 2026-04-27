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
jest.mock('../../src/config/holidays', () => ({
  calculateExpectedWorkdays: jest.fn().mockReturnValue(250),
}));

const { BusinessService } = require('../../src/services/business.service');
const configLoader = require('../../src/utils/config-loader');
const { logger } = require('../../src/utils/logger');
const csvWriter = require('../../src/utils/csv-writer');
const { workHourCommand } = require('../../src/commands/work-hour.command');

describe('Work Hour Command', () => {
  let mockBusinessServiceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup BusinessService mock
    mockBusinessServiceInstance = {
      getMembers: jest.fn().mockReturnValue(
        Promise.resolve([
          { user_id: 'u1', role_name: 'Dev', role_id: 1 },
          { user_id: 'u2', role_name: 'Tester', role_id: 2 },
        ])
      ),
      getAllWorkHourStats: jest.fn().mockReturnValue(
        Promise.resolve({
          userStats: [
            {
              userId: 'u1',
              userName: 'Alice',
              totalHours: 100,
              domainStats: [
                { type: 'Task', totalHours: 80 },
                { type: 'Bug', totalHours: 20 },
              ],
            },
            {
              userId: 'u2',
              userName: 'Bob',
              totalHours: 50,
              domainStats: [{ type: 'Bug', totalHours: 50 }],
            },
          ],
        })
      ),
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

  it('should run work hour report for current year (default)', async () => {
    await workHourCommand();

    expect(mockBusinessServiceInstance.getMembers).toHaveBeenCalled();
    expect(mockBusinessServiceInstance.getAllWorkHourStats).toHaveBeenCalled();
    // Default output is console table
    expect(logger.table).toHaveBeenCalled();
  });

  it('should run work hour report for specific year', async () => {
    const year = '2022';
    await workHourCommand(year);

    expect(mockBusinessServiceInstance.getAllWorkHourStats).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      '2022-01-01',
      '2022-12-31'
    );
  });

  it('should output CSV when configured', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'csv',
      config: {},
    });

    await workHourCommand('2023');

    expect(csvWriter.writeCsvFile).toHaveBeenCalled();
    expect(logger.table).not.toHaveBeenCalled();
  });

  it('should output JSON when configured', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'json',
      config: {},
    });

    await workHourCommand('2023');

    expect(logger.json).toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    mockBusinessServiceInstance.getMembers.mockRejectedValue(new Error('API Error'));

    await expect(workHourCommand()).rejects.toThrow('API Error');
  });
});
