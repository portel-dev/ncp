/**
 * CodeMCP Unit Tests
 *
 * Tests the CodeMCP internal MCP to ensure:
 * 1. Orchestrator injection works correctly
 * 2. Code execution functions properly
 * 3. Error handling is robust
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CodeMCP } from '../../src/internal-mcps/code.js';

describe('CodeMCP', () => {
  let codeMCP: CodeMCP;

  beforeEach(() => {
    codeMCP = new CodeMCP();
  });

  describe('initialization', () => {
    test('should have correct name', () => {
      expect(codeMCP.name).toBe('code');
    });

    test('should have description', () => {
      expect(codeMCP.description).toBeTruthy();
      expect(codeMCP.description).toContain('TypeScript');
    });

    test('should have run tool defined', () => {
      expect(codeMCP.tools).toHaveLength(1);
      expect(codeMCP.tools[0].name).toBe('run');
    });

    test('run tool should have correct input schema', () => {
      const runTool = codeMCP.tools[0];
      expect(runTool.inputSchema).toBeDefined();
      expect(runTool.inputSchema.properties).toHaveProperty('code');
      expect(runTool.inputSchema.properties).toHaveProperty('timeout');
      expect(runTool.inputSchema.required).toContain('code');
    });
  });

  describe('orchestrator injection', () => {
    test('should fail when orchestrator not set', async () => {
      const result = await codeMCP.executeTool('run', { code: 'return 1' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet initialized');
    });

    test('should accept orchestrator via setOrchestrator', () => {
      const mockExecuteCode = jest.fn<() => Promise<{ result: number; logs: string[] }>>();
      mockExecuteCode.mockResolvedValue({ result: 42, logs: [] });
      const mockOrchestrator = { executeCode: mockExecuteCode };

      // Should not throw
      expect(() => {
        codeMCP.setOrchestrator(mockOrchestrator as any);
      }).not.toThrow();
    });

    test('should execute code when orchestrator is set', async () => {
      const mockExecuteCode = jest.fn<(code: string, timeout: number) => Promise<{ result: number; logs: string[] }>>();
      mockExecuteCode.mockResolvedValue({ result: 42, logs: ['test log'] });
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      const result = await codeMCP.executeTool('run', { code: 'return 42' });

      expect(result.success).toBe(true);
      expect(mockExecuteCode).toHaveBeenCalledWith('return 42', 30000);
    });

    test('should pass custom timeout to orchestrator', async () => {
      const mockExecuteCode = jest.fn<(code: string, timeout: number) => Promise<{ result: string; logs: string[] }>>();
      mockExecuteCode.mockResolvedValue({ result: 'done', logs: [] });
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      await codeMCP.executeTool('run', { code: 'return "done"', timeout: 60000 });

      expect(mockExecuteCode).toHaveBeenCalledWith('return "done"', 60000);
    });
  });

  describe('error handling', () => {
    test('should return error for unknown tool', async () => {
      const result = await codeMCP.executeTool('unknown', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    test('should validate code parameter is provided', async () => {
      const mockExecuteCode = jest.fn<() => Promise<{ result: any; logs: string[] }>>();
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      const result = await codeMCP.executeTool('run', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('code parameter is required');
    });

    test('should validate code parameter is string', async () => {
      const mockExecuteCode = jest.fn<() => Promise<{ result: any; logs: string[] }>>();
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      const result = await codeMCP.executeTool('run', { code: 123 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('should handle orchestrator execution errors', async () => {
      const mockExecuteCode = jest.fn<() => Promise<{ result?: any; error?: string; logs: string[] }>>();
      mockExecuteCode.mockResolvedValue({
        error: 'Execution failed',
        logs: ['error log']
      });
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      const result = await codeMCP.executeTool('run', { code: 'throw new Error()' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    test('should handle orchestrator exceptions', async () => {
      const mockExecuteCode = jest.fn<() => Promise<{ result: any; logs: string[] }>>();
      mockExecuteCode.mockRejectedValue(new Error('Network error'));
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      const result = await codeMCP.executeTool('run', { code: 'return 1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('result formatting', () => {
    test('should format successful result as JSON', async () => {
      const mockExecuteCode = jest.fn<() => Promise<{ result: { foo: string }; logs: string[] }>>();
      mockExecuteCode.mockResolvedValue({
        result: { foo: 'bar' },
        logs: ['log1', 'log2']
      });
      const mockOrchestrator = { executeCode: mockExecuteCode };

      codeMCP.setOrchestrator(mockOrchestrator as any);
      const result = await codeMCP.executeTool('run', { code: 'return {foo: "bar"}' });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();

      // Content can be string or array - handle both cases
      const contentStr = typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);
      const parsed = JSON.parse(contentStr);
      expect(parsed.result).toEqual({ foo: 'bar' });
      expect(parsed.logs).toEqual(['log1', 'log2']);
    });
  });
});
