import { jest } from '@jest/globals';
import { ConfigKey, DefectAnalysisType } from '../../src/types';

// Mock dependencies
jest.mock('ora', () => {
  return jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  });
});

jest.mock('@inquirer/prompts', () => ({
  checkbox: jest.fn(),
}));

jest.mock('../../src/services/business.service');
jest.mock('../../src/utils/config-loader');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/csv-writer');

const prompts = require('@inquirer/prompts');
const { BusinessService } = require('../../src/services/business.service');
const configLoader = require('../../src/utils/config-loader');
const { logger } = require('../../src/utils/logger');
const csvWriter = require('../../src/utils/csv-writer');
const { bugCommand } = require('../../src/commands/bug.command');

describe('Bug Command', () => {
  let mockBusinessServiceInstance: any;
  const iterations = [
    { id: 1, name: 'Iteration 1', begin_time: '2023-01-01', end_time: '2023-01-14' },
    { id: 2, name: 'Iteration 2', begin_time: '2023-01-15', end_time: '2023-01-28' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup BusinessService mock
    mockBusinessServiceInstance = {
      getIterations: jest.fn().mockReturnValue(Promise.resolve(iterations)),
      getMembersByRoleIds: jest
        .fn()
        .mockReturnValue(
          Promise.resolve([{ user_id: 'u1', user_num_id: 1, role_name: 'Dev', role_id: 1 }])
        ),
      getStoriesByIterations: jest.fn().mockReturnValue(
        Promise.resolve([
          {
            id: 101,
            name: 'Story 1',
            iteration: { name: 'Iteration 1' },
            assigned_user: { id: 'u1', nick_name: 'Alice' },
          },
        ])
      ),
      getChildIssues: jest.fn().mockReturnValue(
        Promise.resolve([
          {
            id: 201,
            tracker: { id: 3 }, // Bug
            customValueNew: { custom_field32: DefectAnalysisType.PRODUCT_DESIGN }, // Product bug
          },
          {
            id: 202,
            tracker: { id: 3 }, // Bug
            customValueNew: { custom_field32: 'Other' }, // Not product bug
          },
        ])
      ),
    };
    BusinessService.mockImplementation(() => mockBusinessServiceInstance);

    // Setup configLoader mocks
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'console',
      config: {},
    });

    // Setup prompts
    prompts.checkbox.mockResolvedValue([iterations[0]]);
  });

  it('should run bug report with interactive iteration selection', async () => {
    await bugCommand();

    expect(mockBusinessServiceInstance.getIterations).toHaveBeenCalled();
    expect(prompts.checkbox).toHaveBeenCalled();
    expect(mockBusinessServiceInstance.getStoriesByIterations).toHaveBeenCalledWith(
      expect.any(String),
      [iterations[0]],
      expect.any(Array)
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Alice'));
  });

  it('should throw if no iterations found in project', async () => {
    mockBusinessServiceInstance.getIterations.mockReturnValue(Promise.resolve([]));

    await expect(bugCommand()).rejects.toThrow('未获取到任何迭代信息');
  });

  it('should output CSV when configured', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'csv',
      config: {},
    });

    await bugCommand();

    expect(csvWriter.writeCsvFile).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Alice'));
  });

  it('should output JSON when configured', async () => {
    configLoader.loadConfig.mockReturnValue({
      projectId: 'p1',
      roleIds: [1],
      outputFormat: 'json',
      config: {},
    });

    await bugCommand();

    expect(logger.json).toHaveBeenCalled();
  });
});
