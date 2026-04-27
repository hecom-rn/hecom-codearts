import { jest } from '@jest/globals';
import { Command } from 'commander';

// ensure setupMocks runs first
const { logger } = require('../mocks/logger');

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({ version: '1.0.0' })),
  existsSync: jest.fn().mockReturnValue(false),
  readFile: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('../../src/commands/config.command', () => ({
  configCommand: jest.fn(),
  getAvailableProjectConfigs: jest.fn().mockReturnValue([{ key: 'ROLE_ID', label: 'Role ID' }]),
  showConfigCommand: jest.fn(),
  updateProjectConfigCommand: jest.fn(),
}));

jest.mock('../../src/commands/daily.command', () => ({ dailyCommand: jest.fn() }));
jest.mock('../../src/commands/work-hour.command', () => ({ workHourCommand: jest.fn() }));
jest.mock('../../src/commands/bug.command', () => ({ bugCommand: jest.fn() }));
jest.mock('../../src/commands/quality.command', () => ({ qualityCommand: jest.fn() }));
jest.mock('../../src/charts/png-renderer', () => ({}));

describe('CLI Entry Point', () => {
  let dailyCommand: any;
  let workHourCommand: any;
  let bugCommand: any;
  let configCommand: any;
  let showConfigCommand: any;
  let updateProjectConfigCommand: any;
  let originalArgv: string[];

  beforeAll(() => {
    originalArgv = process.argv;
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Get mocked functions
    const dailyCmd = require('../../src/commands/daily.command');
    dailyCommand = dailyCmd.dailyCommand;

    const workHourCmd = require('../../src/commands/work-hour.command');
    workHourCommand = workHourCmd.workHourCommand;

    const bugCmd = require('../../src/commands/bug.command');
    bugCommand = bugCmd.bugCommand;

    const configCmd = require('../../src/commands/config.command');
    configCommand = configCmd.configCommand;
    showConfigCommand = configCmd.showConfigCommand;
    updateProjectConfigCommand = configCmd.updateProjectConfigCommand;

    // Spy on process.exit to prevent test termination
    jest.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
      // Don't throw if code is 0 (success exit)
      if (code === 0) return undefined;
      throw new Error(`Process exited with code ${code}`);
    }) as any);

    // Spy on console.log/error to suppress output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const runCli = async (args: string[]) => {
    process.argv = ['node', 'codearts', ...args];
    // We need to re-require to execute the code again
    jest.isolateModules(() => {
      require('../../src/bin/cli');
    });
    // Add a small delay for async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  };

  it('should register daily command', async () => {
    await runCli(['daily']);
    expect(dailyCommand).toHaveBeenCalled();
  });

  it('should register work-hour command', async () => {
    await runCli(['work-hour']);
    expect(workHourCommand).toHaveBeenCalled();
  });

  it('should register bug-rate command', async () => {
    await runCli(['bug-rate']);
    expect(bugCommand).toHaveBeenCalled();
  });

  it('should register config command', async () => {
    await runCli(['config']);
    expect(configCommand).toHaveBeenCalled();
  });

  it('should register config show command', async () => {
    await runCli(['config', 'show']);
    expect(showConfigCommand).toHaveBeenCalled();
  });

  it('should register config update command (role-id)', async () => {
    await runCli(['config', 'role-id']);
    expect(updateProjectConfigCommand).toHaveBeenCalledWith('ROLE_ID');
  });
});
