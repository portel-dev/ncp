/**
 * Unit Tests - MCPWrapper
 * Tests wrapper script generation, log management, and directory handling
 * Adapted from commercial NCP test patterns
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock filesystem and os modules completely
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  writeFileSync: jest.fn()
}));

jest.mock('os', () => ({
  homedir: jest.fn(),
  tmpdir: jest.fn()
}));

describe('MCPWrapper', () => {
  let mcpWrapper: any;
  let mockFs: any;
  let mockOs: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    // Get fresh mocked modules
    mockFs = await import('fs');
    mockOs = await import('os');

    // Setup default mock implementations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({ mtime: new Date() });
    mockFs.writeFileSync.mockReturnValue(undefined);

    mockOs.homedir.mockReturnValue('/mock/home');
    mockOs.tmpdir.mockReturnValue('/mock/tmp');

    // Import MCPWrapper after mocking
    const { MCPWrapper } = await import('../src/utils/mcp-wrapper.js');
    mcpWrapper = new MCPWrapper();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create MCP wrapper successfully', () => {
      expect(mcpWrapper).toBeDefined();
    });

    it('should ensure directories exist during creation', () => {
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockOs.homedir).toHaveBeenCalled();
      expect(mockOs.tmpdir).toHaveBeenCalled();
    });

    it('should create missing directories', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { MCPWrapper } = await import('../src/utils/mcp-wrapper.js');
      new MCPWrapper();

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('wrapper creation', () => {
    it('should create wrapper script for MCP server', () => {
      const result = mcpWrapper.createWrapper('test-mcp', 'node', ['script.js']);

      expect(result).toBeDefined();
      expect(result.command).toBeDefined();
      expect(Array.isArray(result.args)).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle different command formats', () => {
      const result1 = mcpWrapper.createWrapper('test1', 'node', ['script.js']);
      const result2 = mcpWrapper.createWrapper('test2', 'python', ['-m', 'module']);

      expect(result1.command).toBeDefined();
      expect(result2.command).toBeDefined();
    });

    it('should handle commands without arguments', () => {
      const result = mcpWrapper.createWrapper('test', 'echo');

      expect(result).toBeDefined();
      expect(result.command).toBeDefined();
    });
  });

  describe('log management', () => {
    it('should clean up old logs during initialization', async () => {
      // Mock old files with correct naming pattern (mcp-*.log)
      mockFs.readdirSync.mockReturnValue(['mcp-old-server-2023w01.log', 'mcp-new-server-2024w52.log'] as any);
      mockFs.statSync.mockReturnValueOnce({
        mtime: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days old
      } as any).mockReturnValueOnce({
        mtime: new Date() // New file
      } as any);

      const { MCPWrapper } = await import('../src/utils/mcp-wrapper.js');
      new MCPWrapper();

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle log cleanup errors gracefully', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Read dir failed');
      });

      const { MCPWrapper } = await import('../src/utils/mcp-wrapper.js');
      expect(() => new MCPWrapper()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty MCP name', () => {
      const result = mcpWrapper.createWrapper('', 'echo');
      expect(result).toBeDefined();
    });

    it('should handle special characters in MCP name', () => {
      const result = mcpWrapper.createWrapper('test-mcp_123', 'echo');
      expect(result).toBeDefined();
    });
  });

  describe('log file utilities', () => {
    it('should get log file path for MCP', () => {
      // Test getLogFile method (lines 182-184)
      const logFile = mcpWrapper.getLogFile('test-mcp');
      expect(typeof logFile).toBe('string');
      expect(logFile).toContain('test-mcp');
    });

    it('should list all log files', () => {
      // Test listLogFiles method (lines 189-198)
      mockFs.readdirSync.mockReturnValue(['mcp-server1.log', 'mcp-server2.log', 'other-file.txt'] as any);

      const logFiles = mcpWrapper.listLogFiles();
      expect(Array.isArray(logFiles)).toBe(true);
      expect(logFiles.length).toBe(2); // Should filter only mcp-*.log files
    });

    it('should handle missing log directory', () => {
      // Test lines 191-192: directory doesn't exist
      mockFs.existsSync.mockReturnValue(false);

      const logFiles = mcpWrapper.listLogFiles();
      expect(Array.isArray(logFiles)).toBe(true);
      expect(logFiles.length).toBe(0);
    });

    it('should handle log directory read errors', () => {
      // Test lines 195-196: catch block
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Cannot read directory');
      });

      const logFiles = mcpWrapper.listLogFiles();
      expect(Array.isArray(logFiles)).toBe(true);
      expect(logFiles.length).toBe(0);
    });
  });
});