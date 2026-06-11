// Centralized mocks for tests
import { jest } from '@jest/globals';

jest.mock('ora', () => () => ({ start: () => ({ stop: () => {} }) }));

jest.mock('@inquirer/prompts', () => ({
  checkbox: async () => [],
  confirm: async () => true,
  input: async () => '',
  password: async () => '',
  select: async () => '',
}));

jest.mock('inquirerjs-checkbox-search', () => ({
  __esModule: true,
  default: async () => [],
  Separator: class {},
}));

jest.mock('picocolors', () => ({
  cyan: (s: any) => s,
  cyanBright: (s: any) => s,
  red: (s: any) => s,
  bgCyan: (s: any) => s,
  bgRed: (s: any) => s,
  bgGreen: (s: any) => s,
}));

// use manual logger mock
jest.mock('../src/utils/logger', () => require('./mocks/logger'));

// BusinessService mocked per-test when needed
jest.mock('../src/services/business.service');
