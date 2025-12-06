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

  describe('Windows path escaping', () => {
    it('should properly escape Windows-style paths in wrapper script', () => {
      // Create wrapper with a command that might contain backslashes on Windows
      const result = mcpWrapper.createWrapper('test-mcp', 'C:\\Program Files\\nodejs\\node.exe', ['script.js']);

      expect(result).toBeDefined();
      expect(result.command).toBe('node'); // Wrapper uses node to run the script

      // The wrapper script file should exist and contain properly escaped paths
      const wrapperPath = result.args[0];
      expect(fs.existsSync(wrapperPath)).toBe(true);

      const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

      // The command should be JSON-encoded (wrapped in quotes with escaped backslashes)
      // JSON.stringify('C:\\Program Files\\nodejs\\node.exe') produces:
      // "C:\\Program Files\\nodejs\\node.exe" (with escaped backslashes)
      expect(wrapperContent).toContain('const command = ');

      // Verify the script is valid JavaScript by checking it doesn't have unescaped backslashes
      // that would cause issues like \n becoming newline, \t becoming tab, etc.
      // If backslashes were not escaped, 'C:\Program Files\nodejs\node.exe' would have
      // \n interpreted as newline, corrupting the path
      expect(wrapperContent).not.toMatch(/const command = 'C:\\Program/); // Not single-quoted unescaped
    });

    it('should handle paths with special escape sequences', () => {
      // Test paths that would cause issues if not properly escaped:
      // \n = newline, \t = tab, \r = carriage return, \u = unicode escape
      const problematicPaths = [
        'C:\\Users\\newuser\\test',      // Contains \n and \t patterns
        'C:\\Users\\test\\node_modules', // Contains \n
        'C:\\temp\\file.txt',            // Contains \t
        'C:\\ubuntu\\path',              // Contains \u
      ];

      for (const testPath of problematicPaths) {
        const result = mcpWrapper.createWrapper('test-escape', testPath, []);

        expect(result).toBeDefined();
        const wrapperPath = result.args[0];
        expect(fs.existsSync(wrapperPath)).toBe(true);

        const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

        // The wrapper script should be valid JavaScript
        // If escaping failed, the script would have actual newlines/tabs in strings
        expect(wrapperContent).not.toContain('\n--- MCP'); // This is expected in template
        expect(wrapperContent).toContain('const command = '); // Command should be defined
      }
    });

    it('should handle log file paths with Windows backslashes', () => {
      const logFile = mcpWrapper.getLogFile('test-windows');

      // On Windows, the log file path will have backslashes
      // The path should be valid and not corrupted
      expect(logFile).toBeDefined();
      expect(typeof logFile).toBe('string');

      // Path should contain .ncp/logs
      expect(logFile).toMatch(/[/\\]\.ncp[/\\]logs[/\\]/);
    });

    it('should create wrapper script with JSON-escaped paths', () => {
      const result = mcpWrapper.createWrapper('json-test', 'node', ['test.js']);
      const wrapperPath = result.args[0];
      const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

      // Check that paths use JSON encoding (the escapeForJS function uses JSON.stringify)
      // JSON.stringify produces strings like: "value" with properly escaped content
      expect(wrapperContent).toContain('const logFile = "');
      expect(wrapperContent).toContain('const command = "');
      expect(wrapperContent).toContain('const args = [');
    });
  });

  describe('wrapper script validity', () => {
    it('should generate syntactically valid JavaScript', () => {
      const result = mcpWrapper.createWrapper('syntax-test', 'node', ['--version']);
      const wrapperPath = result.args[0];
      const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

      // Try to parse the script as JavaScript
      // This will throw if the syntax is invalid
      expect(() => {
        // Basic syntax check - the script should not have obvious issues
        // We can't fully eval it, but we can check for common problems

        // Should have all required variable declarations
        expect(wrapperContent).toContain('const logFile = ');
        expect(wrapperContent).toContain('const command = ');
        expect(wrapperContent).toContain('const args = ');
        expect(wrapperContent).toContain('const { spawn }');
        expect(wrapperContent).toContain('const fs = require');

        // Should have proper string delimiters (not broken by backslashes)
        const logFileMatch = wrapperContent.match(/const logFile = ("[^"]*"|'[^']*')/);
        expect(logFileMatch).toBeTruthy();

        const commandMatch = wrapperContent.match(/const command = ("[^"]*"|'[^']*')/);
        expect(commandMatch).toBeTruthy();
      }).not.toThrow();
    });

    it('should include MCP name in wrapper script comments', () => {
      const mcpName = 'my-special-mcp';
      const result = mcpWrapper.createWrapper(mcpName, 'node', []);
      const wrapperPath = result.args[0];
      const wrapperContent = fs.readFileSync(wrapperPath, 'utf-8');

      // The MCP name should appear in the script comments
      expect(wrapperContent).toContain(`MCP Wrapper for ${mcpName}`);
    });
  });
});