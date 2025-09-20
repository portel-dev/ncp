/**
 * Unit Tests - Logger
 * Tests logging functionality, MCP mode detection, and output control
 * Adapted from commercial NCP security-logger patterns
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Logger', () => {
  let logger: any;
  let mockConsole: any;
  let originalConsole: any;

  beforeEach(() => {
    // Store original console methods
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };

    // Create fresh mocks for this test
    mockConsole = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    };

    // Replace console methods with our mocks
    Object.assign(console, mockConsole);

    // Clear module cache and re-import logger to get fresh instance
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original console methods
    Object.assign(console, originalConsole);
    jest.clearAllMocks();
  });

  describe('MCP mode detection', () => {
    it('should detect MCP mode from environment variables', async () => {
      const originalEnv = process.env.NCP_MODE;
      process.env.NCP_MODE = 'mcp';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      testLogger.info('Test message');

      // In MCP mode, should suppress output
      expect(mockConsole.error).not.toHaveBeenCalled();

      // Restore environment
      if (originalEnv) {
        process.env.NCP_MODE = originalEnv;
      } else {
        delete process.env.NCP_MODE;
      }
    });

    it('should enable logging in non-MCP mode', async () => {
      delete process.env.NCP_MODE;
      process.env.NCP_DEBUG = 'true';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      testLogger.info('Test message');

      // Should output in non-MCP mode
      expect(mockConsole.error).toHaveBeenCalled();

      delete process.env.NCP_DEBUG;
    });
  });

  describe('Log level functionality', () => {
    beforeEach(async () => {
      // Ensure we're not in MCP mode for these tests
      delete process.env.NCP_MODE;
      process.env.NCP_DEBUG = 'true';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
    });

    it('should log info messages with proper prefix', () => {
      logger.info('Test info message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP] Test info message');
    });

    it('should log error messages with error prefix', () => {
      logger.error('Test error message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Test error message');
    });

    it('should log warning messages with warn prefix', () => {
      logger.warn('Test warning message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP WARN] Test warning message');
    });

    it('should log debug messages with debug prefix', () => {
      logger.debug('Test debug message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP DEBUG] Test debug message');
    });
  });

  describe('Error object handling', () => {
    beforeEach(async () => {
      delete process.env.NCP_MODE;
      process.env.NCP_DEBUG = 'true';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
    });

    it('should handle error objects correctly', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Error occurred');
      expect(mockConsole.error).toHaveBeenCalledWith(error);
    });

    it('should handle missing error object gracefully', () => {
      logger.error('Simple error message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Simple error message');
    });
  });

  describe('Edge cases', () => {
    beforeEach(async () => {
      delete process.env.NCP_MODE;
      process.env.NCP_DEBUG = 'true';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
    });

    it('should handle empty messages', () => {
      logger.info('');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP] ');
    });

    it('should handle undefined messages', () => {
      logger.info(undefined);
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP] undefined');
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(1000);
      logger.info(longMessage);
      expect(mockConsole.error).toHaveBeenCalledWith(`[NCP] ${longMessage}`);
    });
  });

  describe('MCP mode management', () => {
    beforeEach(async () => {
      delete process.env.NCP_MODE;
      process.env.NCP_DEBUG = 'true';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
    });

    it('should check if in MCP mode', () => {
      const isInMCP = logger.isInMCPMode();
      expect(typeof isInMCP).toBe('boolean');
    });

    it('should allow setting MCP mode', () => {
      const originalMode = logger.isInMCPMode();

      logger.setMCPMode(true);
      expect(logger.isInMCPMode()).toBe(true);

      logger.setMCPMode(false);
      expect(logger.isInMCPMode()).toBe(false);

      // Restore original mode
      logger.setMCPMode(originalMode);
    });

    it('should handle progress messages in non-MCP mode', () => {
      logger.setMCPMode(false);
      logger.progress('test progress message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP] test progress message');
    });

    it('should not output progress messages in MCP mode', () => {
      jest.clearAllMocks();
      logger.setMCPMode(true);
      logger.setDebugMode(false); // Ensure debug mode is off
      logger.progress('test progress message');
      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe('Additional coverage tests', () => {
    it('should handle mcpInfo method in non-MCP mode', () => {
      // Test lines 47-48: mcpInfo in non-MCP mode
      logger.setMCPMode(false);
      jest.clearAllMocks();

      logger.mcpInfo('Test MCP info message');

      expect(mockConsole.error).toHaveBeenCalledWith('[NCP] Test MCP info message');
    });

    it('should handle critical errors in MCP mode', () => {
      // Test line 71: critical error logging in MCP mode
      logger.setMCPMode(true);
      jest.clearAllMocks();

      // Test critical error
      const criticalError = { critical: true, message: 'Critical failure' };
      logger.error('Critical system failure', criticalError);

      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Critical system failure');
    });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.NCP_DEBUG;
  });
});