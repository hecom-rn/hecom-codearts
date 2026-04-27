import { jest } from '@jest/globals';
import { ConfigKey } from '../../src/types';

// Mock dependencies
jest.mock('@inquirer/prompts', () => ({
  input: jest.fn(),
  confirm: jest.fn(),
  password: jest.fn(),
  select: jest.fn(),
  checkbox: jest.fn(),
}));

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
jest.mock('../../src/utils/logger'); // Ensure logger is mocked

const prompts = require('@inquirer/prompts');
const { BusinessService } = require('../../src/services/business.service');
const configLoader = require('../../src/utils/config-loader');
const { logger } = require('../../src/utils/logger');
const {
  configCommand,
  showConfigCommand,
  updateProjectConfigCommand,
} = require('../../src/commands/config.command');

describe('Config Command', () => {
  let mockBusinessServiceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup BusinessService mock
    mockBusinessServiceInstance = {
      validateCredentials: jest.fn().mockReturnValue(Promise.resolve({ success: true })),
      getProjects: jest.fn().mockReturnValue(
        Promise.resolve([
          { project_id: 'p1', project_name: 'Project 1' },
          { project_id: 'p2', project_name: 'Project 2' },
        ])
      ),
      getProjectRoles: jest.fn().mockReturnValue(
        Promise.resolve([
          { role_id: 1, role_name: 'Dev' },
          { role_id: 2, role_name: 'Tester' },
        ])
      ),
    };
    BusinessService.mockImplementation(() => mockBusinessServiceInstance);

    // Setup default prompt responses
    prompts.input.mockResolvedValue('test-value');
    prompts.password.mockResolvedValue('test-password');
    prompts.confirm.mockResolvedValue(true);
    prompts.select.mockResolvedValue('p1');
    prompts.checkbox.mockResolvedValue(['1']);

    // Setup configLoader mocks
    configLoader.getConfigPath.mockReturnValue('/mock/path/config.env');
    configLoader.configExists.mockReturnValue(false);
    configLoader.readConfig.mockReturnValue({});
    configLoader.getConfig.mockReturnValue({
      [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]: 'https://iam.example.com',
      [ConfigKey.PROJECT_ID]: 'p1',
    });

    // Spy on process.exit
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      if (code === 0) return undefined;
      throw new Error(`Process exited with code ${code}`);
    }) as any);
  });

  describe('showConfigCommand', () => {
    it('should display configuration', async () => {
      await showConfigCommand();
      expect(logger.info).toHaveBeenCalled();
      // Verify keys are displayed
      expect(configLoader.getConfig).toHaveBeenCalled();
    });
  });

  describe('configCommand', () => {
    it('should run full configuration flow', async () => {
      // Step 1: IAM Config
      prompts.input
        .mockResolvedValueOnce('https://iam.test') // Endpoint
        .mockResolvedValueOnce('cn-test') // Region
        .mockResolvedValueOnce('test-domain') // Domain
        .mockResolvedValueOnce('test-user'); // Username

      prompts.password.mockResolvedValueOnce('test-pass'); // Password

      // Step 2: Project Selection
      // BusinessService.getProjects mocked above
      prompts.select.mockResolvedValueOnce('p1');

      // Step 3: Role Configuration
      // BusinessService.getProjectRoles mocked above
      prompts.checkbox.mockResolvedValueOnce(['1', '2']);

      await configCommand();

      // Verify BusinessService creation
      expect(BusinessService).toHaveBeenCalledWith(
        expect.objectContaining({
          iamEndpoint: 'https://iam.test',
          username: 'test-user',
        })
      );

      // Verify validation
      expect(mockBusinessServiceInstance.validateCredentials).toHaveBeenCalled();

      // Verify config write
      expect(configLoader.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]: 'https://iam.test',
          [ConfigKey.PROJECT_ID]: 'p1',
          [ConfigKey.ROLE_ID]: '1,2',
        })
      );
    });

    it('should handle existing config and overwrite confirmation', async () => {
      configLoader.configExists.mockReturnValue(true);
      prompts.confirm.mockResolvedValueOnce(false); // Do not overwrite

      await configCommand();

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('已取消'));
      expect(configLoader.writeConfig).not.toHaveBeenCalled();
    });

    it('should retry on credential validation failure', async () => {
      mockBusinessServiceInstance.validateCredentials
        .mockResolvedValueOnce({ success: false, error: 'Auth failed' })
        .mockResolvedValueOnce({ success: true });

      prompts.confirm
        .mockResolvedValueOnce(true) // Retry
        .mockResolvedValueOnce(false); // Use existing password (skipped logic) -> actually reuse password logic is complicated, let's just make it pass second time
      // The flow: confirm overwrite -> (loop) input -> validate -> fail -> confirm retry -> input -> validate -> success

      // Overwrite existing? (configExists is false in beforeEach, so this prompt won't show unless I change it)
      // Inputs for first attempt
      prompts.input.mockResolvedValue('val');
      prompts.password.mockResolvedValue('pass');

      // Inputs for second attempt
      // Since mocks are consumed, we need enough values or use default 'val'

      await configCommand();

      expect(mockBusinessServiceInstance.validateCredentials).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateProjectConfigCommand', () => {
    it('should update specific config key', async () => {
      configLoader.configExists.mockReturnValue(true);
      configLoader.readConfig.mockReturnValue({
        [ConfigKey.HUAWEI_CLOUD_IAM_ENDPOINT]: 'https://iam.test',
        [ConfigKey.PROJECT_ID]: 'p1',
        [ConfigKey.ROLE_ID]: '1',
      });

      // Role selection prompt
      prompts.checkbox.mockResolvedValueOnce(['2']);

      await updateProjectConfigCommand(ConfigKey.ROLE_ID);

      expect(configLoader.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          [ConfigKey.ROLE_ID]: '2',
        })
      );
    });

    it('should exit if config does not exist', async () => {
      configLoader.configExists.mockReturnValue(false);

      await expect(updateProjectConfigCommand(ConfigKey.ROLE_ID)).rejects.toThrow(
        'Process exited with code 1'
      );

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('不存在'));
    });
  });
});
