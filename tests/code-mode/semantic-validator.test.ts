/**
 * Tests for SemanticValidator - Rules-based intent analysis
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  SemanticValidator,
  createSemanticValidator,
} from '../../src/code-mode/validation/semantic-validator.js';
import { CodeAnalyzer, createCodeAnalyzer } from '../../src/code-mode/validation/code-analyzer.js';

describe('SemanticValidator', () => {
  let validator: SemanticValidator;
  let analyzer: CodeAnalyzer;

  beforeEach(() => {
    validator = createSemanticValidator();
    analyzer = createCodeAnalyzer();
  });

  describe('intent detection', () => {
    it('should detect read operations', () => {
      const code = `
        const data = await api.get_data({ id: 123 });
        const items = await db.list_items({});
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['api', 'db'],
      });

      expect(result.approved).toBe(true);
      expect(result.riskLevel).toBe('low');
      expect(result.detectedIntents.some((i) => i.type === 'data_read')).toBe(true);
    });

    it('should detect write operations', () => {
      const code = `
        await github.create_issue({ title: "Bug", body: "Fix it" });
        await db.update_record({ id: 1, value: "new" });
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['github', 'db'],
      });

      expect(result.approved).toBe(true);
      expect(result.riskLevel).toBe('medium');
      expect(result.detectedIntents.some((i) => i.type === 'data_write')).toBe(true);
    });

    it('should detect delete operations as high risk', () => {
      const code = `
        await db.delete_all({ table: "users" });
        await github.remove_label({ issue: 123, label: "bug" });
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['db', 'github'],
      });

      expect(result.riskLevel).toBe('high');
      expect(result.detectedIntents.some((i) => i.type === 'data_delete')).toBe(true);
    });

    it('should detect scheduling operations', () => {
      const code = `
        await schedule.create({
          tool: "email:send",
          schedule: "every day at 9am"
        });
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['schedule'],
      });

      expect(result.approved).toBe(true);
      expect(result.riskLevel).toBe('medium');
      expect(result.detectedIntents.some((i) => i.type === 'scheduling')).toBe(true);
    });

    it('should detect network requests', () => {
      const code = `
        const response = await fetch("https://api.example.com");
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: [],
      });

      expect(result.detectedIntents.some((i) => i.type === 'network_request')).toBe(
        true
      );
    });
  });

  describe('MCP scope validation', () => {
    it('should reject calls to unavailable MCPs', () => {
      const code = `await stripe.create_payment({ amount: 1000 });`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['github', 'gmail'], // stripe not available
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain("stripe");
      expect(result.reason).toContain('not available');
    });

    it('should allow calls to available MCPs', () => {
      const code = `await github.create_issue({ title: "Test" });`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['github'],
      });

      expect(result.approved).toBe(true);
    });

    it('should allow built-in MCPs (ncp, schedule, etc.)', () => {
      const code = `
        await ncp.find({ description: "email" });
        await schedule.list({});
        await analytics.overview({});
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: [], // No external MCPs
      });

      expect(result.approved).toBe(true);
    });
  });

  describe('blocked MCPs', () => {
    it('should block calls to blocked MCPs', () => {
      const validatorWithBlocks = createSemanticValidator({
        blockedMCPs: ['shell', 'terminal'],
      });

      const code = `await shell.exec({ command: "ls" });`;
      const analysis = analyzer.analyze(code);
      const result = validatorWithBlocks.validate(code, analysis, {
        availableMCPs: ['shell'],
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('blocked');
    });
  });

  describe('allowed MCPs restriction', () => {
    it('should only allow specified MCPs when configured', () => {
      const restrictedValidator = createSemanticValidator({
        allowedMCPs: ['github', 'gmail'],
      });

      const code = `await stripe.create_payment({});`;
      const analysis = analyzer.analyze(code);
      const result = restrictedValidator.validate(code, analysis, {
        availableMCPs: ['github', 'gmail', 'stripe'],
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('not in allowed list');
    });
  });

  describe('risk level assessment', () => {
    it('should assess low risk for read-only operations', () => {
      const code = `
        const users = await db.list_users({});
        const repos = await github.get_repos({});
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['db', 'github'],
      });

      expect(result.riskLevel).toBe('low');
    });

    it('should assess medium risk for write operations', () => {
      const code = `await db.insert({ data: {} });`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['db'],
      });

      expect(result.riskLevel).toBe('medium');
    });

    it('should assess high risk for delete operations', () => {
      const code = `await db.drop_table({ name: "users" });`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['db'],
      });

      expect(result.riskLevel).toBe('high');
    });

    it('should assess critical risk for system commands', () => {
      const code = `await shell.exec({ command: "rm -rf /" });`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['shell'],
      });

      expect(result.riskLevel).toBe('critical');
    });

    it('should assess high risk for high-risk namespaces', () => {
      const code = `await shell.list_files({});`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['shell'],
      });

      expect(result.riskLevel).toBe('high');
    });
  });

  describe('max risk level configuration', () => {
    it('should block operations above max risk level', () => {
      const lowRiskValidator = createSemanticValidator({
        maxRiskLevel: 'low',
      });

      const code = `await db.update({ id: 1, data: {} });`;
      const analysis = analyzer.analyze(code);
      const result = lowRiskValidator.validate(code, analysis, {
        availableMCPs: ['db'],
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
    });

    it('should allow operations at or below max risk level', () => {
      const mediumRiskValidator = createSemanticValidator({
        maxRiskLevel: 'medium',
      });

      const code = `await db.update({ id: 1, data: {} });`;
      const analysis = analyzer.analyze(code);
      const result = mediumRiskValidator.validate(code, analysis, {
        availableMCPs: ['db'],
      });

      expect(result.approved).toBe(true);
    });
  });

  describe('feature toggles', () => {
    it('should block scheduling when disabled', () => {
      const noSchedulingValidator = createSemanticValidator({
        allowScheduling: false,
      });

      const code = `await schedule.create({ tool: "test" });`;
      const analysis = analyzer.analyze(code);
      const result = noSchedulingValidator.validate(code, analysis, {
        availableMCPs: [],
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Scheduling');
    });

    it('should block network requests when disabled', () => {
      const noNetworkValidator = createSemanticValidator({
        allowNetworkRequests: false,
      });

      const code = `await fetch("https://example.com");`;
      const analysis = analyzer.analyze(code);
      const result = noNetworkValidator.validate(code, analysis, {
        availableMCPs: [],
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Network');
    });
  });

  describe('recommendations', () => {
    it('should provide recommendations for high-risk operations', () => {
      const lowRiskValidator = createSemanticValidator({
        maxRiskLevel: 'low',
      });

      const code = `await db.delete({ id: 1 });`;
      const analysis = analyzer.analyze(code);
      const result = lowRiskValidator.validate(code, analysis, {
        availableMCPs: ['db'],
      });

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should warn about multiple write operations', () => {
      const code = `
        await db.insert({ data: 1 });
        await db.insert({ data: 2 });
        await db.insert({ data: 3 });
        await db.insert({ data: 4 });
      `;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['db'],
      });

      expect(
        result.recommendations.some((r) => r.includes('batching'))
      ).toBe(true);
    });
  });

  describe('unknown operations', () => {
    it('should classify unknown methods as mcp_call', () => {
      const code = `await custom.unknown_operation({});`;
      const analysis = analyzer.analyze(code);
      const result = validator.validate(code, analysis, {
        availableMCPs: ['custom'],
      });

      expect(result.detectedIntents.some((i) => i.type === 'mcp_call')).toBe(true);
    });
  });
});
