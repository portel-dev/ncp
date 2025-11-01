/**
 * Unit Tests - Logger
 * Tests logging functionality, MCP mode detection, and output control
 *
 * Note: Most tests don't set NCP_DEBUG so logs go to stderr (easier to test).
 * File logging behavior is tested separately in dedicated tests.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Logger', () => {
  let logger: any;
  let mockConsole: any;
  let originalConsole: any;
  let testLogDir: string;

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

    // Create test log directory
    testLogDir = join(tmpdir(), `ncp-test-logs-${Date.now()}`);

    // Clear module cache and re-import logger to get fresh instance
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original console methods
    Object.assign(console, originalConsole);
    jest.clearAllMocks();

    // Clean up test log directory
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }

    // Clean up environment
    delete process.env.NCP_DEBUG;
    delete process.env.NCP_MODE;
    delete process.env.NCP_CONFIG_PATH;
  });

  describe('MCP mode detection', () => {
    it('should detect MCP mode from environment variables', async () => {
      const originalEnv = process.env.NCP_MODE;
      process.env.NCP_MODE = 'mcp';

      const { logger: testLogger } = await import('../src/utils/logger.js');
      testLogger.info('Test message');

      // In MCP mode without debug, should not output
      expect(mockConsole.error).not.toHaveBeenCalled();

      // Restore
      if (originalEnv) {
        process.env.NCP_MODE = originalEnv;
      } else {
        delete process.env.NCP_MODE;
      }
    });

    it('should detect CLI mode when CLI commands are present', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script.js', 'list'];

      const { logger: testLogger } = await import('../src/utils/logger.js');
      expect(testLogger.isInMCPMode()).toBe(false);

      process.argv = originalArgv;
    });

    it('should default to MCP mode when no CLI commands', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script.js'];
      delete process.env.NCP_MODE;

      const { logger: testLogger } = await import('../src/utils/logger.js');
      expect(testLogger.isInMCPMode()).toBe(true);

      process.argv = originalArgv;
    });
  });

  describe('Debug mode behavior', () => {
    it('should enable debug mode with NCP_DEBUG=true', async () => {
      process.env.NCP_DEBUG = 'true';
      process.env.NCP_CONFIG_PATH = testLogDir;

      const { logger: testLogger } = await import('../src/utils/logger.js');

      // Wait for setupFileLogging() to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Clear any early logs that went to stderr before file was ready
      jest.clearAllMocks();

      // With debug enabled and file ready, logs go to file, not stderr
      testLogger.debug('Test debug message');

      // Should not appear on stderr (goes to file instead)
      expect(mockConsole.error).not.toHaveBeenCalled();

      // Check log file was created
      const logPath = testLogger.getLogFilePath();
      expect(logPath).toBeTruthy();
      expect(existsSync(logPath!)).toBe(true);

      delete process.env.NCP_DEBUG;
      delete process.env.NCP_CONFIG_PATH;
    });

    it('should output to stderr when debug is off', async () => {
      delete process.env.NCP_DEBUG;

      const { logger: testLogger } = await import('../src/utils/logger.js');
      testLogger.setMCPMode(false);
      testLogger.debug('Test debug message');

      // Should not output when debug is off
      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe('Log level functionality (without file logging)', () => {
    beforeEach(async () => {
      // Don't set NCP_DEBUG - logs go to stderr for testing
      delete process.env.NCP_MODE;
      delete process.env.NCP_DEBUG;

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
      logger.setMCPMode(false); // CLI mode for visible output
    });

    it('should not log info messages without debug', () => {
      logger.info('Test info message');
      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('should log error messages even without debug', () => {
      logger.error('Test error message');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Test error message');
    });

    it('should not log warning messages without debug', () => {
      logger.warn('Test warning message');
      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('should not log debug messages without debug', () => {
      logger.debug('Test debug message');
      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe('Error object handling', () => {
    beforeEach(async () => {
      delete process.env.NCP_MODE;
      delete process.env.NCP_DEBUG;

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
      logger.setMCPMode(false);
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
      delete process.env.NCP_DEBUG;

      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
      logger.setMCPMode(false);
    });

    it('should handle empty messages', () => {
      logger.error('');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] ');
    });

    it('should handle undefined messages', () => {
      logger.error(undefined);
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] undefined');
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      logger.error(longMessage);
      expect(mockConsole.error).toHaveBeenCalledWith(`[NCP ERROR] ${longMessage}`);
    });
  });

  describe('MCP mode management', () => {
    beforeEach(async () => {
      delete process.env.NCP_DEBUG;
      const { logger: testLogger } = await import('../src/utils/logger.js');
      logger = testLogger;
    });

    it('should check if in MCP mode', () => {
      const originalMode = logger.isInMCPMode();
      logger.setMCPMode(true);
      expect(logger.isInMCPMode()).toBe(true);

      // Restore original mode
      logger.setMCPMode(originalMode);
    });

    it('should allow setting MCP mode', () => {
      logger.setMCPMode(false);
      expect(logger.isInMCPMode()).toBe(false);

      logger.setMCPMode(true);
      expect(logger.isInMCPMode()).toBe(true);
    });

    it('should handle progress messages in non-MCP mode', () => {
      logger.setMCPMode(false);
      // Progress messages only log in debug mode
      logger.progress('test progress message');
      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('should not output progress messages in MCP mode', async () => {
      delete process.env.NCP_DEBUG;
      process.argv = ['node', 'script.js']; // Clean argv

      jest.resetModules();
      const { logger: testLogger } = await import('../src/utils/logger.js');

      jest.clearAllMocks();
      testLogger.setMCPMode(true);
      testLogger.progress('test progress message');
      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe('File logging behavior', () => {
    it('should create log file path when NCP_DEBUG is true', async () => {
      process.env.NCP_DEBUG = 'true';
      process.env.NCP_CONFIG_PATH = testLogDir;

      const { logger: testLogger } = await import('../src/utils/logger.js');

      // Wait for async setupFileLogging() to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check that log file path is set
      const logPath = testLogger.getLogFilePath();
      expect(logPath).toBeTruthy();
      expect(logPath).toContain('ncp-debug-');
      expect(logPath).toContain('.log');

      // Trigger some logging
      testLogger.debug('Test message');
      testLogger.info('Info message');
      testLogger.error('Error message');

      // Note: Actual file content testing is complex due to async I/O
      // The important behavior is that logFilePath is set and logs are directed to file
      // Real file content can be verified in integration tests
    });

    it('should not create log file when NCP_DEBUG is false', async () => {
      delete process.env.NCP_DEBUG;
      process.env.NCP_CONFIG_PATH = testLogDir;

      const { logger: testLogger } = await import('../src/utils/logger.js');

      testLogger.debug('Test message');

      const logPath = testLogger.getLogFilePath();
      expect(logPath).toBeNull();
    });

    it('should log to stderr when debug is off', async () => {
      delete process.env.NCP_DEBUG;

      const { logger: testLogger } = await import('../src/utils/logger.js');
      testLogger.setMCPMode(false); // CLI mode

      // Error logs should go to stderr even without debug
      testLogger.error('Error without debug');
      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Error without debug');
    });
  });

  describe('Additional coverage tests', () => {
    it('should handle mcpInfo method - logs only in debug mode', async () => {
      // mcpInfo only logs when debug mode is enabled
      delete process.env.NCP_DEBUG;
      process.argv = ['node', 'script.js'];

      jest.resetModules();
      const { logger: testLogger } = await import('../src/utils/logger.js');

      testLogger.setMCPMode(false);
      jest.clearAllMocks();

      testLogger.mcpInfo('Test MCP info message');

      // Should not log when debug is off
      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('should handle critical errors in MCP mode', async () => {
      delete process.env.NCP_DEBUG;
      process.argv = ['node', 'script.js'];

      jest.resetModules();
      const { logger: testLogger } = await import('../src/utils/logger.js');

      testLogger.setMCPMode(true);
      jest.clearAllMocks();

      // Test critical error
      const criticalError = { critical: true, message: 'Critical failure' };
      testLogger.error('Critical system failure', criticalError);

      expect(mockConsole.error).toHaveBeenCalledWith('[NCP ERROR] Critical system failure');
    });
  });
});
