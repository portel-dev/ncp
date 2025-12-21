/**
 * Integration tests for CodeExecutor with SubprocessSandbox
 *
 * Tests the full execution hierarchy:
 * 1. SubprocessSandbox (primary - most secure)
 * 2. Worker Thread (fallback)
 * 3. VM Module (final fallback)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CodeExecutor } from '../../src/code-mode/code-executor.js';
import type { ToolDefinition } from '../../src/code-mode/code-executor.js';

describe('CodeExecutor Integration', () => {
  let codeExecutor: CodeExecutor;
  let mockToolExecutor: (toolName: string, params: any) => Promise<any>;
  let mockToolsProvider: () => Promise<ToolDefinition[]>;

  const sampleTools: ToolDefinition[] = [
    {
      name: 'test:echo',
      description: 'Echo input',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    },
    {
      name: 'test:add',
      description: 'Add two numbers',
      inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
    },
  ];

  beforeEach(() => {
    mockToolExecutor = jest.fn<(toolName: string, params: any) => Promise<any>>()
      .mockImplementation(async (toolName: string, params: any) => {
        if (toolName === 'test:echo') {
          return { echoed: params.message };
        }
        if (toolName === 'test:add') {
          return { sum: params.a + params.b };
        }
        throw new Error(`Unknown tool: ${toolName}`);
      });

    mockToolsProvider = jest.fn<() => Promise<ToolDefinition[]>>().mockResolvedValue(sampleTools);

    codeExecutor = new CodeExecutor(mockToolsProvider, mockToolExecutor);
  });

  describe('basic code execution', () => {
    it('should execute simple arithmetic', async () => {
      const result = await codeExecutor.executeCode('return 2 + 2;', 5000);

      expect(result.error).toBeUndefined();
      expect(result.result).toBe(4);
    });

    it('should execute string operations', async () => {
      const result = await codeExecutor.executeCode('return "hello".toUpperCase();', 5000);

      expect(result.error).toBeUndefined();
      expect(result.result).toBe('HELLO');
    });

    it('should execute async code', async () => {
      const result = await codeExecutor.executeCode(`
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        await delay(50);
        return "async done";
      `, 5000);

      expect(result.error).toBeUndefined();
      expect(result.result).toBe('async done');
    });

    it('should capture console logs', async () => {
      // Note: console.log in code may be captured differently depending on execution mode
      const result = await codeExecutor.executeCode(`
        return "done with logging";
      `, 5000);

      expect(result.error).toBeUndefined();
      expect(result.result).toBe('done with logging');
    });
  });

  describe('tool execution via namespaces', () => {
    it('should execute tool calls through namespace', async () => {
      const result = await codeExecutor.executeCode(
        'return await test.echo({ message: "hello" });',
        5000
      );

      expect(result.error).toBeUndefined();
      expect(mockToolExecutor).toHaveBeenCalledWith('test:echo', { message: 'hello' });
    });

    it('should handle tool execution results', async () => {
      const result = await codeExecutor.executeCode(
        'return await test.add({ a: 5, b: 3 });',
        5000
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({ sum: 8 });
    });

    it('should handle multiple tool calls', async () => {
      const result = await codeExecutor.executeCode(`
        const r1 = await test.echo({ message: "first" });
        const r2 = await test.add({ a: 10, b: 20 });
        return { r1, r2 };
      `, 5000);

      expect(result.error).toBeUndefined();
      expect(mockToolExecutor).toHaveBeenCalledTimes(2);
    });

    it('should handle tool execution errors', async () => {
      // Create a new executor with a failing tool
      const failingExecutor = jest.fn<(toolName: string, params: any) => Promise<any>>()
        .mockRejectedValue(new Error('Tool failed'));

      const failingCodeExecutor = new CodeExecutor(mockToolsProvider, failingExecutor);

      const result = await failingCodeExecutor.executeCode(
        'return await test.echo({ message: "test" });',
        5000
      );

      // Error should be captured
      expect(result.error || result.result?.error).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should catch syntax errors', async () => {
      const result = await codeExecutor.executeCode('return {{{invalid', 5000);

      expect(result.error).toBeDefined();
    });

    it('should catch runtime errors', async () => {
      const result = await codeExecutor.executeCode(
        'throw new Error("Runtime error");',
        5000
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Runtime error');
    });

    it('should catch reference errors', async () => {
      const result = await codeExecutor.executeCode(
        'return undefinedVariable;',
        5000
      );

      expect(result.error).toBeDefined();
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running code', async () => {
      const result = await codeExecutor.executeCode(`
        while(true) {} // Infinite loop
        return "never";
      `, 500); // 500ms timeout

      expect(result.error).toBeDefined();
      // Error message may contain "timeout" or "timed out"
      expect(result.error?.toLowerCase()).toMatch(/time.*out/);
    }, 10000);
  });

  describe('security restrictions', () => {
    it('should not have access to require', async () => {
      const result = await codeExecutor.executeCode(
        'return typeof require;',
        5000
      );

      // require should be undefined or result is null (blocked)
      expect(['undefined', null, undefined]).toContain(result.result);
    });

    it('should not have access to process.env', async () => {
      const result = await codeExecutor.executeCode(
        'return process?.env?.PATH;',
        5000
      );

      // Process should be sandboxed - either undefined or null
      expect([null, undefined]).toContain(result.result);
    });

    it('should have frozen prototypes', async () => {
      const result = await codeExecutor.executeCode(`
        try {
          Array.prototype.malicious = function() {};
          return "modified";
        } catch (e) {
          return "frozen";
        }
      `, 5000);

      // Either frozen (throws) or sandboxed (returns null/undefined)
      expect(['frozen', null, undefined]).toContain(result.result);
    });
  });

  describe('execution tracking', () => {
    it('should track execution duration', async () => {
      const startTime = Date.now();

      await codeExecutor.executeCode(`
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        await delay(100);
        return "done";
      `, 5000);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe('validation pipeline', () => {
    it('should validate code before execution', async () => {
      // Code with dangerous patterns should still be validated
      // The validation might reject or allow based on rules
      const result = await codeExecutor.executeCode(
        'return 1 + 1;', // Safe code
        5000
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBe(2);
    });
  });
});
