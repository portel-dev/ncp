/**
 * Tests for CodeAnalyzer - AST-based security analysis
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CodeAnalyzer, createCodeAnalyzer } from '../../src/code-mode/validation/code-analyzer.js';

describe('CodeAnalyzer', () => {
  let analyzer: CodeAnalyzer;

  beforeEach(() => {
    analyzer = createCodeAnalyzer();
  });

  describe('safe code', () => {
    it('should approve simple arithmetic', () => {
      const code = `const result = 1 + 2 * 3;`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should approve MCP namespace calls', () => {
      const code = `
        const repos = await github.list_repos({ org: "anthropic" });
        const emails = await gmail.list_messages({ query: "is:unread" });
      `;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.detectedPatterns.mcpCalls).toHaveLength(2);
    });

    it('should approve async/await patterns', () => {
      const code = `
        async function getData() {
          const data = await api.fetch({ url: "/data" });
          return data.items.map(item => item.name);
        }
      `;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(true);
    });

    it('should approve object property access', () => {
      const code = `
        const obj = { foo: 1, bar: { baz: 2 } };
        const value = obj.bar.baz;
      `;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(true);
    });

    it('should approve Array.prototype methods', () => {
      const code = `
        const arr = [1, 2, 3];
        const doubled = arr.map(x => x * 2);
        const sum = arr.reduce((a, b) => a + b, 0);
      `;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(true);
    });
  });

  describe('prototype pollution detection', () => {
    it('should detect __proto__ property access', () => {
      const code = `const x = obj.__proto__;`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('prototype_pollution');
    });

    it('should detect __proto__ bracket notation', () => {
      const code = `const x = obj["__proto__"];`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'prototype_pollution')).toBe(true);
    });

    it('should detect prototype property access', () => {
      const code = `const x = obj.prototype;`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations[0].type).toBe('prototype_pollution');
    });

    it('should detect prototype bracket notation', () => {
      const code = `const x = obj["prototype"];`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
    });

    it('should detect template literal __proto__ access', () => {
      const code = 'const x = obj[`__proto__`];';
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
    });
  });

  describe('constructor access detection', () => {
    it('should detect constructor() call', () => {
      const code = `const x = obj.constructor();`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations[0].type).toBe('constructor_access');
    });

    it('should detect chained constructor call', () => {
      const code = `const x = "".constructor.constructor("return this")();`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'constructor_access')).toBe(true);
    });

    it('should allow constructor property read without call', () => {
      // Just reading constructor without calling is suspicious but not critical
      const code = `const Ctor = obj.constructor;`;
      const result = analyzer.analyze(code);
      // This is allowed because it's not called
      expect(result.violations.filter(v => v.type === 'constructor_access')).toHaveLength(0);
    });
  });

  describe('eval detection', () => {
    it('should detect direct eval call', () => {
      const code = `eval("alert(1)");`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'eval_usage')).toBe(true);
    });

    it('should detect Function constructor', () => {
      const code = `const fn = Function("return 1");`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'eval_usage')).toBe(true);
    });

    it('should detect new Function()', () => {
      const code = `const fn = new Function("a", "b", "return a + b");`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
    });

    it('should detect eval as standalone identifier', () => {
      const code = `const e = eval; e("1+1");`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
    });
  });

  describe('require/import detection', () => {
    it('should detect require() call', () => {
      const code = `const fs = require("fs");`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'require_import')).toBe(true);
    });

    it('should detect dynamic import()', () => {
      const code = `const module = await import("fs");`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'require_import')).toBe(true);
    });

    it('should detect static import of fs', () => {
      const code = `import fs from "fs";`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'fs_access')).toBe(true);
    });

    it('should detect static import of child_process', () => {
      const code = `import { exec } from "child_process";`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'child_process')).toBe(true);
    });

    it('should detect node: prefixed imports', () => {
      const code = `import fs from "node:fs";`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
    });
  });

  describe('process/global detection', () => {
    it('should detect process access', () => {
      const code = `const env = process.env.SECRET;`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'process_access')).toBe(true);
    });

    it('should detect global access', () => {
      const code = `const win = global.window;`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'global_access')).toBe(true);
    });

    it('should detect globalThis access', () => {
      const code = `const g = globalThis;`;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.type === 'global_access')).toBe(true);
    });
  });

  describe('MCP call detection', () => {
    it('should detect simple namespace.method() calls', () => {
      const code = `await github.create_issue({ title: "Test" });`;
      const result = analyzer.analyze(code);
      expect(result.detectedPatterns.mcpCalls).toHaveLength(1);
      expect(result.detectedPatterns.mcpCalls[0].namespace).toBe('github');
      expect(result.detectedPatterns.mcpCalls[0].method).toBe('create_issue');
    });

    it('should detect multiple MCP calls', () => {
      const code = `
        const data = await analytics.overview({});
        await mail.send({ to: "test@example.com" });
        const jobs = await schedule.list({});
      `;
      const result = analyzer.analyze(code);
      expect(result.detectedPatterns.mcpCalls).toHaveLength(3);
    });

    it('should capture call location', () => {
      const code = `await ncp.find({ description: "test" });`;
      const result = analyzer.analyze(code);
      expect(result.detectedPatterns.mcpCalls[0].location.line).toBe(1);
    });
  });

  describe('network request detection', () => {
    it('should detect fetch() calls', () => {
      const code = `const response = await fetch("https://api.example.com/data");`;
      const result = analyzer.analyze(code);
      expect(result.detectedPatterns.networkRequests).toHaveLength(1);
      expect(result.warnings.some(w => w.type === 'network_request')).toBe(true);
    });
  });

  describe('parse errors', () => {
    it('should handle invalid syntax gracefully', () => {
      const code = `const x = {{{`;
      const result = analyzer.analyze(code);
      // TypeScript parser is lenient, so this may not fail parsing
      // but the analysis should still complete
      expect(result).toBeDefined();
    });
  });

  describe('combined attacks', () => {
    it('should detect multiple violations', () => {
      const code = `
        const x = obj.__proto__;
        eval("1+1");
        const fs = require("fs");
      `;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect obfuscated eval via constructor chain', () => {
      const code = `
        const getFunction = [].constructor.constructor;
        const malicious = getFunction("return process")();
      `;
      const result = analyzer.analyze(code);
      expect(result.valid).toBe(false);
    });
  });
});
