/**
 * End-to-End Tests for Internal MCPs (Scheduler + MCP Management)
 *
 * Tests the actual functionality of internal MCPs without requiring user interaction.
 * Can be run in CI/CD pipelines.
 */

import { InternalMCPManager } from '../../src/internal-mcps/internal-mcp-manager.js';
import ProfileManager from '../../src/profiles/profile-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Internal MCPs - E2E Tests', () => {
  let manager: InternalMCPManager;
  let profileManager: ProfileManager;
  let testConfigPath: string;

  beforeEach(() => {
    // Create isolated test environment
    testConfigPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ncp-e2e-test-'));

    // ProfileManager uses env vars for config path, set it before instantiation
    process.env.NCP_CONFIG_PATH = testConfigPath;
    profileManager = new ProfileManager();
    manager = new InternalMCPManager();
    manager.initialize(profileManager);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testConfigPath)) {
      fs.rmSync(testConfigPath, { recursive: true, force: true });
    }
  });

  describe('Scheduler MCP', () => {
    test('should list available scheduler tools', () => {
      const schedulerMCP = manager.getAllEnabledInternalMCPs().find(m => m.name === 'schedule');

      expect(schedulerMCP).toBeDefined();
      expect(schedulerMCP?.tools.length).toBeGreaterThan(0);

      const toolNames = schedulerMCP?.tools.map(t => t.name) || [];
      expect(toolNames).toContain('create');
      expect(toolNames).toContain('retrieve');
      expect(toolNames).toContain('update');
      expect(toolNames).toContain('delete');
      expect(toolNames).toContain('validate');
    });

    test('should validate tool parameters', async () => {
      const result = await manager.executeInternalTool('schedule', 'validate', {
        tool: 'create',
        arguments: {
          name: 'test-job',
          schedule: 'every 5 minutes',
          tool: 'example:tool',
          parameters: {}
        }
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    test('should handle invalid schedule expression', async () => {
      const result = await manager.executeInternalTool('schedule', 'validate', {
        tool: 'create',
        arguments: {
          name: 'invalid-job',
          schedule: 'invalid schedule expression',
          tool: 'example:tool',
          parameters: {}
        }
      });

      // Should either fail validation or provide helpful error
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    test('should list schedules (empty initially)', async () => {
      const result = await manager.executeInternalTool('schedule', 'retrieve', { type: 'jobs' });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe('MCP Management MCP', () => {
    test('should list available mcp management tools', () => {
      const mcpMCP = manager.getAllEnabledInternalMCPs().find(m => m.name === 'mcp');

      expect(mcpMCP).toBeDefined();
      expect(mcpMCP?.tools.length).toBeGreaterThan(0);

      const toolNames = mcpMCP?.tools.map(t => t.name) || [];
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('remove');
      expect(toolNames).toContain('list');
    });

    test('should list MCPs in profile', async () => {
      const result = await manager.executeInternalTool('mcp', 'list', {
        profile: 'default'
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    test('should list MCPs from specific profile', async () => {
      const result = await manager.executeInternalTool('mcp', 'list', {
        profile: 'default'
      });

      // List should work even if no MCPs are configured
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe('Internal MCP Integration', () => {
    test('should get capabilities for scheduler', () => {
      const capabilities = manager.getInternalMCPCapabilities('schedule');

      expect(capabilities).toBeDefined();
    });

    test('should check for validation capability', () => {
      const hasValidation = manager.hasCapability('schedule', 'experimental.toolValidation.supported');

      expect(typeof hasValidation).toBe('boolean');
    });

    test('should handle unknown MCP gracefully', async () => {
      const result = await manager.executeInternalTool('unknown-mcp', 'some-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should handle unknown tool gracefully', async () => {
      const result = await manager.executeInternalTool('schedule', 'unknown-tool', {});

      expect(result.success).toBe(false);
      expect(result.content).toBeDefined();
    });
  });

  describe('Disable/Enable Functionality', () => {
    test('should disable an internal MCP', async () => {
      await manager.disableInternalMCP('schedule');

      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);

      const enabledMCPs = manager.getAllEnabledInternalMCPs();
      expect(enabledMCPs.find(m => m.name === 'schedule')).toBeUndefined();
    });

    test('should re-enable a disabled MCP', async () => {
      await manager.disableInternalMCP('schedule');
      await manager.enableInternalMCP('schedule');

      expect(manager.isInternalMCPDisabled('schedule')).toBe(false);

      const enabledMCPs = manager.getAllEnabledInternalMCPs();
      expect(enabledMCPs.find(m => m.name === 'schedule')).toBeDefined();
    });

    test('should list disabled MCPs', async () => {
      await manager.disableInternalMCP('schedule');

      const disabled = manager.getDisabledInternalMCPs();
      expect(disabled).toContain('schedule');
    });
  });
});
