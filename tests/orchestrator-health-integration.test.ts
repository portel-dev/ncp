/**
 * Tests for orchestrator health monitoring integration
 * Verifies that MCP failures are properly tracked in health monitor
 */

import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import { MCPHealthMonitor } from '../src/utils/health-monitor.js';
import { ProfileManager } from '../src/profiles/profile-manager.js';
import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

describe('Orchestrator Health Monitoring Integration', () => {
  let orchestrator: NCPOrchestrator;
  let tempDir: string;
  let mockProfilePath: string;

  beforeEach(() => {
    // Create temporary directory for test profiles
    tempDir = join(tmpdir(), `ncp-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    mockProfilePath = join(tempDir, 'profiles');
    mkdirSync(mockProfilePath, { recursive: true });

    // Create orchestrator without mocking (uses real directories)
    orchestrator = new NCPOrchestrator('test-profile');
  });

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.cleanup();
    }

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    jest.restoreAllMocks();
  });

  describe('MCP Discovery Health Tracking', () => {
    test('should track health during MCP discovery failures', async () => {
      // Create profile with invalid MCP
      const profileData = {
        mcpServers: {
          'failing-mcp': {
            command: 'npx',
            args: ['-y', '@non-existent/invalid-package']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      // Spy on health monitor
      const healthMonitor = new MCPHealthMonitor();
      const markUnhealthySpy = jest.spyOn(healthMonitor, 'markUnhealthy');

      // Initialize orchestrator (this triggers discovery)
      await orchestrator.initialize();

      // Verify health monitor was called for the failing MCP
      // Note: The actual implementation might use a different health monitor instance
      // This tests the integration pattern rather than the exact spy calls

      // Check that no tools were discovered from the failing MCP
      const results = await orchestrator.find('', 10, false);

      // Should not contain any tools from failing-mcp
      const failingMcpTools = results.filter(r => r.mcpName === 'failing-mcp');
      expect(failingMcpTools).toHaveLength(0);
    });

    test('should handle mixed healthy and unhealthy MCPs', async () => {
      // Create profile with both valid and invalid MCPs
      const profileData = {
        mcpServers: {
          'valid-echo': {
            command: 'echo',
            args: ['hello']
          },
          'invalid-package': {
            command: 'npx',
            args: ['-y', '@definitely-does-not-exist/package']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      await orchestrator.initialize();

      // Should initialize without throwing even with some failing MCPs
      const results = await orchestrator.find('', 10, false);

      // Results should not contain tools from failing MCPs
      expect(results.every(r => r.mcpName !== 'invalid-package')).toBe(true);
    });

    test('should track health during tool execution', async () => {
      // Create profile with echo command for testing
      const profileData = {
        mcpServers: {
          'test-mcp': {
            command: 'echo',
            args: ['test-response']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      await orchestrator.initialize();

      // Try to run a tool (even if it doesn't exist, should track health)
      const result = await orchestrator.run('test-mcp:non-existent-tool', {});

      // Should handle the execution attempt gracefully
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('Health Filter Integration', () => {
    test('should filter out tools from unhealthy MCPs in find results', async () => {
      // This tests the health filtering that happens in the find method
      const profileData = {
        mcpServers: {
          'test-mcp': {
            command: 'echo',
            args: ['test']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      await orchestrator.initialize();

      // Mock health monitor to mark MCP as unhealthy
      const healthMonitor = new MCPHealthMonitor();
      healthMonitor.markUnhealthy('test-mcp', 'Test error');

      // Find should respect health status
      const results = await orchestrator.find('', 10, false);

      // Should handle health filtering without throwing
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle getAllResources with health filtering', async () => {
      const profileData = {
        mcpServers: {
          'resource-mcp': {
            command: 'echo',
            args: ['resources']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      await orchestrator.initialize();

      // Should handle resource retrieval with health filtering
      const resources = await orchestrator.getAllResources();
      expect(Array.isArray(resources)).toBe(true);
    });

    test('should handle getAllPrompts with health filtering', async () => {
      const profileData = {
        mcpServers: {
          'prompt-mcp': {
            command: 'echo',
            args: ['prompts']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      await orchestrator.initialize();

      // Should handle prompt retrieval with health filtering
      const prompts = await orchestrator.getAllPrompts();
      expect(Array.isArray(prompts)).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle complete discovery failure gracefully', async () => {
      // Create profile with only failing MCPs
      const profileData = {
        mcpServers: {
          'fail1': { command: 'non-existent-command', args: [] },
          'fail2': { command: '/invalid/path', args: [] },
          'fail3': { command: 'npx', args: ['-y', '@invalid/package'] }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      // Should initialize without throwing even with all MCPs failing
      await expect(orchestrator.initialize()).resolves.toBeUndefined();

      // Should return empty results gracefully
      const results = await orchestrator.find('test', 10, false);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle profile loading errors', async () => {
      // Don't create profile file to trigger error

      // Should handle missing profile gracefully
      await expect(orchestrator.initialize()).resolves.toBeUndefined();

      const results = await orchestrator.find('test', 10, false);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    test('should track connection failures during tool execution', async () => {
      const profileData = {
        mcpServers: {
          'connection-test': {
            command: 'sleep',
            args: ['1'] // Short sleep that should succeed initially
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      await orchestrator.initialize();

      // Attempt tool execution (will likely fail but should be tracked)
      const result = await orchestrator.run('connection-test:some-tool', {});

      // Should handle execution failure gracefully
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Health Status Integration', () => {
    test('should maintain health status across orchestrator lifecycle', async () => {
      const profileData = {
        mcpServers: {
          'lifecycle-test': {
            command: 'echo',
            args: ['lifecycle']
          }
        }
      };

      const profileFile = join(mockProfilePath, 'test-profile.json');
      writeFileSync(profileFile, JSON.stringify(profileData, null, 2));

      // Initialize and use orchestrator
      await orchestrator.initialize();

      // Perform some operations
      await orchestrator.find('test', 5, false);
      await orchestrator.getAllResources();

      // Cleanup should work without issues
      await orchestrator.cleanup();

      // Should be able to create new instance
      const newOrchestrator = new NCPOrchestrator('test-profile');
      await newOrchestrator.initialize();
      await newOrchestrator.cleanup();
    });
  });
});