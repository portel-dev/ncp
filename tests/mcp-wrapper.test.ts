/**
 * Unit Tests - MCPWrapper
 * Tests wrapper script generation, log management, and directory handling
 * Adapted from commercial NCP test patterns
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPWrapper } from '../src/utils/mcp-wrapper.js';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

describe('MCPWrapper', () => {
  let mcpWrapper: MCPWrapper;
  let testDir: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a temporary test directory
    testDir = path.join(tmpdir(), `mcp-wrapper-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    mcpWrapper = new MCPWrapper();
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create MCP wrapper successfully', () => {
      expect(mcpWrapper).toBeDefined();
    });
  });

  describe('wrapper creation', () => {
    it('should create wrapper script for MCP server', () => {
      const result = mcpWrapper.createWrapper('test-mcp', 'node', ['script.js']);

      expect(result).toBeDefined();
      expect(result.command).toBeDefined();
      expect(Array.isArray(result.args)).toBe(true);
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
      const logFile = mcpWrapper.getLogFile('test-mcp');
      expect(typeof logFile).toBe('string');
      expect(logFile).toContain('test-mcp');
    });

    it('should list all log files', () => {
      const logFiles = mcpWrapper.listLogFiles();
      expect(Array.isArray(logFiles)).toBe(true);
    });
  });
});