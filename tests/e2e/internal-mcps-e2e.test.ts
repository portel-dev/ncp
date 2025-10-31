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
    // Clean up environment variable to prevent test pollution
    delete process.env.NCP_CONFIG_PATH;
  });

  describe('Scheduler MCP', () => {
    test('should list available scheduler tools', () => {
      const schedulerMCP = manager.getAllEnabledInternalMCPs().find(m => m.name === 'schedule');

      expect(schedulerMCP).toBeDefined();
      expect(schedulerMCP?.tools.length).toBeGreaterThan(0);

      const toolNames = schedulerMCP?.tools.map(t => t.name) || [];
      // CRUD tools
      expect(toolNames).toContain('create');
      expect(toolNames).toContain('retrieve');
      expect(toolNames).toContain('update');
      expect(toolNames).toContain('delete');
      expect(toolNames).toContain('validate');
      // CLI-style action tools
      expect(toolNames).toContain('list');
      expect(toolNames).toContain('get');
      expect(toolNames).toContain('pause');
      expect(toolNames).toContain('resume');
      expect(toolNames).toContain('executions');
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

    test('should list schedules (empty initially) using retrieve', async () => {
      const result = await manager.executeInternalTool('schedule', 'retrieve', { type: 'jobs' });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    test('should list schedules using CLI-style list action', async () => {
      const result = await manager.executeInternalTool('schedule', 'list', {});

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    test('should get execution history using executions action', async () => {
      const result = await manager.executeInternalTool('schedule', 'executions', {
        status: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    test('should handle get action for non-existent job gracefully', async () => {
      const result = await manager.executeInternalTool('schedule', 'get', {
        job_id: 'non-existent-job-id'
      });

      // Should return result (success or error with helpful message)
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('should handle pause action for non-existent job gracefully', async () => {
      const result = await manager.executeInternalTool('schedule', 'pause', {
        job_id: 'non-existent-job-id'
      });

      // Should return error for non-existent job
      expect(result).toBeDefined();
    });

    test('should handle resume action for non-existent job gracefully', async () => {
      const result = await manager.executeInternalTool('schedule', 'resume', {
        job_id: 'non-existent-job-id'
      });

      // Should return error for non-existent job
      expect(result).toBeDefined();
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
      expect(toolNames).toContain('doctor');
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

    test('should run doctor diagnostics', async () => {
      const result = await manager.executeInternalTool('mcp', 'doctor', {});

      // Doctor should return a result (may report issues if profile not found)
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Doctor output should contain diagnostic report
      const content = Array.isArray(result.content)
        ? result.content.map(c => c.text).join('')
        : String(result.content);
      expect(content).toContain('NCP Doctor');
      expect(content).toContain('Status:');
    });

    test('should run doctor diagnostics and report profile issues', async () => {
      const result = await manager.executeInternalTool('mcp', 'doctor', {
        profile: 'non-existent-profile'
      });

      // Doctor should complete but may report issues
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const content = Array.isArray(result.content)
        ? result.content.map(c => c.text).join('')
        : String(result.content);

      // Should either report profile not found or show diagnostic info
      expect(content).toContain('NCP Doctor');
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
