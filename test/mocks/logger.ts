import { jest } from '@jest/globals';

export const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  json: jest.fn(),
  table: jest.fn(),
  isSilent: jest.fn().mockReturnValue(false),
  setOutputFormat: jest.fn(),
};

export default logger;
