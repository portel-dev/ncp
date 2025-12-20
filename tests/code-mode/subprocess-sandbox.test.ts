/**
 * Tests for SubprocessSandbox - True process isolation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  SubprocessSandbox,
  createSubprocessSandbox,
} from '../../src/code-mode/sandbox/subprocess-sandbox.js';

describe('SubprocessSandbox', () => {
  let sandbox: SubprocessSandbox;

  beforeEach(() => {
    sandbox = createSubprocessSandbox({
      timeout: 10000, // 10 seconds for tests
      memoryLimit: 64, // 64MB for tests
    });
  });

  afterEach(() => {
    sandbox.terminate();
  });

  describe('basic execution', () => {
    it('should execute simple code and return result', async () => {
      const result = await sandbox.execute(
        'return 1 + 2 * 3;',
        [],
        async () => null
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBe(7);
    });

    it('should execute async code', async () => {
      const result = await sandbox.execute(
        `
          const delay = (ms) => new Promise(r => setTimeout(r, ms));
          await delay(100);
          return "done";
        `,
        [],
        async () => null
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBe('done');
    });

    it('should capture console logs', async () => {
      const result = await sandbox.execute(
        `
          console.log("Hello");
          console.warn("Warning");
          console.error("Error");
          return "logged";
        `,
        [],
        async () => null
      );

      expect(result.error).toBeUndefined();
      expect(result.logs.some((l) => l.includes('Hello'))).toBe(true);
      expect(result.logs.some((l) => l.includes('Warning'))).toBe(true);
      expect(result.logs.some((l) => l.includes('Error'))).toBe(true);
    });

    it('should handle undefined return', async () => {
      const result = await sandbox.execute(
        'const x = 1;',
        [],
        async () => null
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBeUndefined();
    });
  });

  describe('tool execution', () => {
    it('should execute tool calls via IPC', async () => {
      const tools = [
        { name: 'test:add', description: 'Add two numbers' },
      ];

      const toolExecutor = async (name: string, params: unknown) => {
        if (name === 'test:add') {
          const p = params as { a: number; b: number };
          return p.a + p.b;
        }
        return null;
      };

      const result = await sandbox.execute(
        'return await test.add({ a: 5, b: 3 });',
        tools,
        toolExecutor
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBe(8);
    });

    it('should handle multiple tool calls', async () => {
      const tools = [
        { name: 'math:double', description: 'Double a number' },
        { name: 'math:square', description: 'Square a number' },
      ];

      const toolExecutor = async (name: string, params: unknown) => {
        const p = params as { n: number };
        if (name === 'math:double') return p.n * 2;
        if (name === 'math:square') return p.n * p.n;
        return 0;
      };

      const result = await sandbox.execute(
        `
          const doubled = await math.double({ n: 5 });
          const squared = await math.square({ n: doubled });
          return squared;
        `,
        tools,
        toolExecutor
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toBe(100); // (5*2)^2 = 100
    });

    it('should handle tool execution errors', async () => {
      const tools = [
        { name: 'failing:tool', description: 'Always fails' },
      ];

      const toolExecutor = async () => {
        throw new Error('Tool failed intentionally');
      };

      const result = await sandbox.execute(
        `
          try {
            await failing.tool({});
            return "should not reach";
          } catch (e) {
            return e.message;
          }
        `,
        tools,
        toolExecutor
      );

      expect(result.error).toBeUndefined();
      expect(result.result).toContain('failed');
    });
  });

  describe('error handling', () => {
    it('should catch synchronous errors', async () => {
      const result = await sandbox.execute(
        'throw new Error("Test error");',
        [],
        async () => null
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Test error');
    });

    it('should catch async errors', async () => {
      const result = await sandbox.execute(
        `
          await Promise.reject(new Error("Async error"));
        `,
        [],
        async () => null
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Async error');
    });

    it('should catch reference errors', async () => {
      const result = await sandbox.execute(
        'undefinedVariable.method();',
        [],
        async () => null
      );

      expect(result.error).toBeDefined();
    });
  });

  describe('security', () => {
    it('should not have access to require', async () => {
      const result = await sandbox.execute(
        `
          try {
            const fs = require("fs");
            return "BAD: require worked";
          } catch (e) {
            return "GOOD: require blocked";
          }
        `,
        [],
        async () => null
      );

      expect(result.result).toContain('GOOD');
    });

    it('should not have access to process.env', async () => {
      // Note: process is available in the worker but with limited access
      const result = await sandbox.execute(
        `
          try {
            // process is available for IPC but env should be minimal
            const secret = process.env.HOME;
            if (secret) return "BAD: env accessible";
            return "GOOD: env not accessible";
          } catch (e) {
            return "GOOD: process blocked";
          }
        `,
        [],
        async () => null
      );

      // With minimalEnv, HOME should not be set
      expect(result.result).toContain('GOOD');
    });

    it('should have frozen prototypes', async () => {
      const result = await sandbox.execute(
        `
          try {
            Object.prototype.polluted = "bad";
            return "BAD: prototype polluted";
          } catch (e) {
            return "GOOD: prototype frozen";
          }
        `,
        [],
        async () => null
      );

      expect(result.result).toContain('GOOD');
    });

    it('should not allow modifying Array.prototype', async () => {
      const result = await sandbox.execute(
        `
          try {
            Array.prototype.evil = function() { return "evil"; };
            return "BAD: array prototype modified";
          } catch (e) {
            return "GOOD: array prototype frozen";
          }
        `,
        [],
        async () => null
      );

      expect(result.result).toContain('GOOD');
    });
  });

  describe('timeout', () => {
    it('should terminate on timeout', async () => {
      const fastSandbox = createSubprocessSandbox({
        timeout: 500, // 500ms timeout
      });

      const result = await fastSandbox.execute(
        `
          while(true) { }
          return "never";
        `,
        [],
        async () => null
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain('terminated');
      fastSandbox.terminate();
    }, 10000);
  });

  describe('lifecycle', () => {
    it('should report running status', async () => {
      expect(sandbox.isRunning()).toBe(false);

      const promise = sandbox.execute(
        `
          await new Promise(r => setTimeout(r, 500));
          return "done";
        `,
        [],
        async () => null
      );

      // Give it time to start
      await new Promise((r) => setTimeout(r, 100));

      expect(sandbox.isRunning()).toBe(true);

      await promise;

      expect(sandbox.isRunning()).toBe(false);
    });

    it('should be terminable', async () => {
      const promise = sandbox.execute(
        `
          await new Promise(r => setTimeout(r, 10000));
          return "done";
        `,
        [],
        async () => null
      );

      await new Promise((r) => setTimeout(r, 100));
      sandbox.terminate();

      const result = await promise;
      expect(result.error).toBeDefined();
    });
  });

  describe('duration tracking', () => {
    it('should track execution duration', async () => {
      const result = await sandbox.execute(
        `
          await new Promise(r => setTimeout(r, 200));
          return "done";
        `,
        [],
        async () => null
      );

      expect(result.duration).toBeGreaterThanOrEqual(200);
      expect(result.duration).toBeLessThan(5000); // Reasonable upper bound
    });
  });
});
