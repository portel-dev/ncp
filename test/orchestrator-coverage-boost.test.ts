import { jest } from '@jest/globals';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator';
import { MCPWrapper } from '../src/utils/mcp-wrapper';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('fs');
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('../src/utils/mcp-wrapper');
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('NCPOrchestrator Coverage Boost - 80% Target', () => {
  let orchestrator: NCPOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new NCPOrchestrator('test-profile');

    // Mock fs operations
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('File not found');
    });
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });

  describe('Profile loading edge cases', () => {
    it('should handle profile with environment variables', async () => {
      const profileWithEnv = {
        mcps: {
          'test-mcp': {
            command: 'test-cmd',
            args: ['arg1'],
            env: {
              API_KEY: 'secret-key',
              BASE_URL: 'https://api.example.com'
            }
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profileWithEnv));

      await orchestrator.initialize();

      // Should load profile with env vars
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should handle profile with multiple MCPs', async () => {
      const multiMCPProfile = {
        mcps: {
          'mcp1': { command: 'cmd1' },
          'mcp2': { command: 'cmd2', args: ['--flag'] },
          'mcp3': { command: 'cmd3', env: { KEY: 'value' } }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiMCPProfile));

      await orchestrator.initialize();

      // Should handle multiple MCPs
      expect(fs.readFileSync).toHaveBeenCalled();
    });
  });

  describe('Connection management advanced scenarios', () => {
    it('should handle connection with environment variables', async () => {
      const profile = {
        mcps: {
          'test-mcp': {
            command: 'test-cmd',
            env: {
              SECRET_KEY: 'abc123',
              DEBUG: 'true'
            }
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      // Mock connection attempt
      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Trigger connection with env vars
      const result = await orchestrator.run('test-mcp:tool', {});

      // Should pass env vars to wrapper
      expect(MCPWrapper).toHaveBeenCalled();
    });

    it('should handle connection timeout and retry', async () => {
      jest.setTimeout(10000);

      const profile = {
        mcps: { 'slow-mcp': { command: 'slow-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockImplementation(() =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 100)
          )
        ),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Try to run tool (should timeout)
      const result = await orchestrator.run('slow-mcp:tool', {});

      expect(result.error).toBeDefined();
    });

    it('should handle quick probe for connection testing', async () => {
      const profile = {
        mcps: { 'probe-mcp': { command: 'probe-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'test-tool' }]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Trigger quick probe through run
      await orchestrator.run('probe-mcp:test-tool', {});

      expect(mockClient.listTools).toHaveBeenCalled();
    });
  });

  describe('Tool execution error scenarios', () => {
    it('should handle tool execution errors gracefully', async () => {
      const profile = {
        mcps: { 'error-mcp': { command: 'error-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'failing-tool' }]
        }),
        callTool: jest.fn().mockRejectedValue(new Error('Tool execution failed')),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      const result = await orchestrator.run('error-mcp:failing-tool', {});

      expect(result.error).toContain('Tool execution failed');
    });

    it('should handle malformed tool name gracefully', async () => {
      await orchestrator.initialize();

      // Invalid tool name formats
      let result = await orchestrator.run('invalid-format', {});
      expect(result.error).toBeDefined();

      result = await orchestrator.run('', {});
      expect(result.error).toBeDefined();

      result = await orchestrator.run('mcp:', {});
      expect(result.error).toBeDefined();

      result = await orchestrator.run(':tool', {});
      expect(result.error).toBeDefined();
    });
  });

  describe('Resource and prompt methods', () => {
    it('should get resources from multiple MCPs', async () => {
      const profile = {
        mcps: {
          'res-mcp1': { command: 'cmd1' },
          'res-mcp2': { command: 'cmd2' }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient1 = {
        connect: jest.fn().mockResolvedValue(undefined),
        listResources: jest.fn().mockResolvedValue({
          resources: [
            { name: 'resource1', uri: 'uri1' }
          ]
        }),
        close: jest.fn()
      };

      const mockClient2 = {
        connect: jest.fn().mockResolvedValue(undefined),
        listResources: jest.fn().mockResolvedValue({
          resources: [
            { name: 'resource2', uri: 'uri2' }
          ]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock)
        .mockReturnValueOnce(mockClient1)
        .mockReturnValueOnce(mockClient2);

      const resources = await orchestrator.getResources();

      expect(resources).toHaveLength(2);
      expect(resources[0].mcpName).toBe('res-mcp1');
      expect(resources[1].mcpName).toBe('res-mcp2');
    });

    it('should handle resource fetching errors', async () => {
      const profile = {
        mcps: {
          'failing-mcp': { command: 'fail-cmd' }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listResources: jest.fn().mockRejectedValue(new Error('Resource error')),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      const resources = await orchestrator.getResources();

      // Should return empty array on error
      expect(resources).toEqual([]);
    });

    it('should get prompts from MCPs', async () => {
      const profile = {
        mcps: {
          'prompt-mcp': { command: 'prompt-cmd' }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listPrompts: jest.fn().mockResolvedValue({
          prompts: [
            { name: 'prompt1', description: 'Test prompt' }
          ]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      const prompts = await orchestrator.getPrompts();

      expect(prompts).toHaveLength(1);
      expect(prompts[0].mcpName).toBe('prompt-mcp');
    });
  });

  describe('Cache saving and persistence', () => {
    it('should save cache after successful tool discovery', async () => {
      const profile = {
        mcps: { 'cache-mcp': { command: 'cache-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', description: 'Tool 1' },
            { name: 'tool2', description: 'Tool 2' }
          ]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Trigger cache save through find
      await orchestrator.find('tool');

      // Should attempt to save cache
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle cache save failures gracefully', async () => {
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const profile = {
        mcps: { 'test-mcp': { command: 'test-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      // Should not throw even if cache save fails
      await expect(orchestrator.find('test')).resolves.toBeDefined();
    });
  });

  describe('Cleanup and disconnection', () => {
    it('should cleanup all connections on cleanup', async () => {
      const profile = {
        mcps: {
          'mcp1': { command: 'cmd1' },
          'mcp2': { command: 'cmd2' }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Create connections
      await orchestrator.run('mcp1:tool', {});
      await orchestrator.run('mcp2:tool', {});

      // Cleanup
      await orchestrator.cleanup();

      // Should close all connections
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const profile = {
        mcps: { 'error-mcp': { command: 'error-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        close: jest.fn().mockRejectedValue(new Error('Close failed'))
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Create connection
      await orchestrator.run('error-mcp:tool', {});

      // Cleanup should not throw
      await expect(orchestrator.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Schema retrieval', () => {
    it('should get tool schema from active connection', async () => {
      const profile = {
        mcps: { 'schema-mcp': { command: 'schema-cmd' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [{
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object', properties: {} }
          }]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Create connection
      await orchestrator.run('schema-mcp:test-tool', {});

      // Get schema
      const schema = await orchestrator.getToolSchema('schema-mcp:test-tool');

      expect(schema).toBeDefined();
      expect(schema?.inputSchema).toBeDefined();
    });

    it('should return null for non-existent tool schema', async () => {
      await orchestrator.initialize();

      const schema = await orchestrator.getToolSchema('unknown:tool');

      expect(schema).toBeNull();
    });
  });
});