/**
 * Integration tests for Find → Add workflow
 * Tests the enhanced zero-results UX and tools list return
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NCPManagementMCP } from '../src/internal-mcps/ncp-management.js';
import { ProfileManager } from '../src/profiles/profile-manager.js';
import type { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Mock the provider registry
const mockRegistryMCPs = [
  {
    name: 'filesystem',
    displayName: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    status: 'active',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    envVars: []
  },
  {
    name: 'github',
    displayName: 'GitHub',
    description: 'Interact with GitHub repositories and APIs',
    status: 'active',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envVars: ['GITHUB_PERSONAL_ACCESS_TOKEN']
  },
  {
    name: 'postgres',
    displayName: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    status: 'active',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envVars: ['POSTGRES_CONNECTION_STRING']
  }
];

jest.mock('../src/registry/provider-registry.js', () => ({
  ProviderRegistry: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    searchMCPs: jest.fn().mockImplementation((query: string) => {
      // Simple mock search
      const lowerQuery = query.toLowerCase();
      return mockRegistryMCPs.filter(mcp =>
        mcp.name.toLowerCase().includes(lowerQuery) ||
        mcp.description.toLowerCase().includes(lowerQuery)
      );
    }),
    getMCP: jest.fn().mockImplementation((name: string) => {
      return mockRegistryMCPs.find(mcp => mcp.name === name);
    }),
    getAllMCPs: jest.fn().mockReturnValue(mockRegistryMCPs)
  }))
}));

// Mock logger
jest.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Find → Add Integration', () => {
  let managementTool: NCPManagementMCP;
  let profileManager: ProfileManager;
  let testProfilesDir: string;
  let mockOrchestrator: NCPOrchestrator;

  beforeEach(async () => {
    // Create temporary profiles directory
    testProfilesDir = path.join(tmpdir(), `ncp-test-profiles-${Date.now()}`);
    await fs.mkdir(testProfilesDir, { recursive: true });

    // Create ProfileManager
    profileManager = new ProfileManager();
    (profileManager as any).profilesDir = testProfilesDir;
    await profileManager.initialize(true);

    // Create mock orchestrator
    mockOrchestrator = {
      refreshMCPCache: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      listLocalTools: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
      searchLocalTools: jest.fn<(query: string) => Promise<any[]>>().mockResolvedValue([])
    } as any;

    managementTool = new NCPManagementMCP(profileManager, mockOrchestrator);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await fs.rm(testProfilesDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    jest.clearAllMocks();
  });

  describe('find tool zero-results', () => {
    it('should show registry MCPs when no local tools match', async () => {
      // Mock empty local tools
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const result = await managementTool.handleFind({
        description: 'file operations'
      });

      expect(result).toBeDefined();
      expect(result).toContain('filesystem'); // Should suggest filesystem MCP
      expect(result).toContain('add'); // Should mention add tool
      expect(result).toContain('Next step'); // Should have explicit next step
    });

    it('should limit registry suggestions to top 3', async () => {
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const result = await managementTool.handleFind({
        description: 'database or file or github'
      });

      // Should show at most 3 suggestions
      const suggestionCount = (result.match(/\*\*\d+\./g) || []).length;
      expect(suggestionCount).toBeLessThanOrEqual(3);
    });

    it('should include installation instructions', async () => {
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const result = await managementTool.handleFind({
        description: 'github operations'
      });

      expect(result).toContain('add'); // Tool name
      expect(result).toContain('mcp_name'); // Parameter name
      expect(result).toContain('github'); // Suggested MCP name
    });

    it('should indicate required credentials', async () => {
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const result = await managementTool.handleFind({
        description: 'github api'
      });

      // GitHub requires credentials
      expect(result).toContain('credentials') || expect(result).toContain('🔑');
    });
  });

  describe('add tool response with tools list', () => {
    it('should return tools list after successful add', async () => {
      // Mock successful MCP connection that returns tools
      const mockTools = [
        { name: 'read_file', description: 'Read a file from disk' },
        { name: 'write_file', description: 'Write content to a file' },
        { name: 'list_directory', description: 'List files in a directory' }
      ];

      // Mock getToolsFromMCP to return tools
      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockResolvedValue(mockTools);

      const result = await managementTool.handleAdd({
        mcp_name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        profile: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Available tools');
      expect(result.message).toContain('read_file');
      expect(result.message).toContain('write_file');
      expect(result.message).toContain('list_directory');
    });

    it('should limit tools list to 10 items', async () => {
      // Mock MCP with many tools
      const manyTools = Array.from({ length: 20 }, (_, i) => ({
        name: `tool_${i}`,
        description: `Tool ${i} description`
      }));

      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockResolvedValue(manyTools);

      const result = await managementTool.handleAdd({
        mcp_name: 'many-tools-mcp',
        command: 'node',
        args: ['server.js'],
        profile: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Available tools');
      expect(result.message).toContain('20 total'); // Total count
      expect(result.message).toContain('and 10 more'); // Indicates truncation
    });

    it('should handle add without tools list on connection failure', async () => {
      // Mock getToolsFromMCP to throw error
      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockRejectedValue(
        new Error('Connection timeout')
      );

      const result = await managementTool.handleAdd({
        mcp_name: 'flaky-mcp',
        command: 'node',
        args: ['server.js'],
        profile: 'all'
      });

      expect(result.success).toBe(true);
      // Should still succeed, just without tools list
      expect(result.message).not.toContain('Available tools');
      expect(result.message).toContain('Added MCP'); // Basic success message
    });

    it('should handle empty tools list gracefully', async () => {
      // Mock MCP that returns no tools
      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockResolvedValue([]);

      const result = await managementTool.handleAdd({
        mcp_name: 'no-tools-mcp',
        command: 'node',
        args: ['server.js'],
        profile: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.message).not.toContain('Available tools');
    });
  });

  describe('end-to-end workflow', () => {
    it('should complete find → add → use workflow', async () => {
      // Step 1: Find returns zero results with suggestions
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const findResult = await managementTool.handleFind({
        description: 'file operations'
      });

      expect(findResult).toContain('filesystem');
      expect(findResult).toContain('add');

      // Step 2: User adds the suggested MCP
      const mockTools = [
        { name: 'read_file', description: 'Read a file' },
        { name: 'write_file', description: 'Write a file' }
      ];

      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockResolvedValue(mockTools);

      const addResult = await managementTool.handleAdd({
        mcp_name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        profile: 'all'
      });

      expect(addResult.success).toBe(true);
      expect(addResult.message).toContain('read_file');
      expect(addResult.message).toContain('write_file');

      // Step 3: Verify MCP was added to profile
      const profile = await profileManager.getProfile('all');
      expect(profile).toBeDefined();
      expect(profile!.mcpServers['filesystem']).toBeDefined();
      expect(profile!.mcpServers['filesystem'].command).toBe('npx');

      // Step 4: Find should now return the installed tool
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([
        {
          name: 'read_file',
          description: 'Read a file',
          mcpName: 'filesystem'
        }
      ]);

      const findAfterAdd = await managementTool.handleFind({
        description: 'read file'
      });

      expect(findAfterAdd).toContain('read_file');
    });

    it('should handle HTTP MCPs in workflow', async () => {
      // Find suggests HTTP MCP
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const findResult = await managementTool.handleFind({
        description: 'weather api'
      });

      // Add HTTP MCP
      const mockTools = [
        { name: 'get_weather', description: 'Get current weather' },
        { name: 'get_forecast', description: 'Get weather forecast' }
      ];

      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockResolvedValue(mockTools);

      const addResult = await managementTool.handleAdd({
        mcp_name: 'weather-api',
        url: 'https://api.weather.com/mcp',
        auth: {
          type: 'bearer',
          token: 'test_token'
        },
        profile: 'all'
      });

      expect(addResult.success).toBe(true);
      expect(addResult.message).toContain('get_weather');
      expect(addResult.message).toContain('get_forecast');

      // Verify HTTP config was saved
      const profile = await profileManager.getProfile('all');
      expect(profile!.mcpServers['weather-api']).toBeDefined();
      expect(profile!.mcpServers['weather-api'].url).toBe('https://api.weather.com/mcp');
      expect(profile!.mcpServers['weather-api'].auth?.type).toBe('bearer');
    });
  });

  describe('error handling in workflow', () => {
    it('should show helpful message when registry is empty', async () => {
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      // Mock empty registry
      jest.mock('../src/registry/provider-registry.js', () => ({
        ProviderRegistry: jest.fn().mockImplementation(() => ({
          initialize: jest.fn(),
          searchMCPs: jest.fn().mockReturnValue([]),
          getAllMCPs: jest.fn().mockReturnValue([])
        }))
      }));

      const result = await managementTool.handleFind({
        description: 'nonexistent tool'
      });

      // Should still provide helpful guidance
      expect(result).toBeDefined();
    });

    it('should handle add failure gracefully', async () => {
      const result = await managementTool.handleAdd({
        mcp_name: 'invalid-mcp',
        command: '', // Invalid command
        args: [],
        profile: 'all'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle tools list timeout', async () => {
      // Mock slow tools retrieval
      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve([]), 10000); // 10 second delay
        });
      });

      const result = await managementTool.handleAdd({
        mcp_name: 'slow-mcp',
        command: 'node',
        args: ['server.js'],
        profile: 'all'
      });

      // Should succeed even if tools list times out
      expect(result.success).toBe(true);
    });
  });

  describe('user guidance', () => {
    it('should provide clear next steps in find result', async () => {
      (mockOrchestrator.searchLocalTools as jest.Mock).mockResolvedValue([]);

      const result = await managementTool.handleFind({
        description: 'file operations'
      });

      // Should have explicit next step section
      expect(result).toContain('Next step');
      expect(result).toContain('Call the');
      expect(result).toContain('tool');

      // Should have example usage
      expect(result).toContain('Example:');
      expect(result).toContain('mcp_name');
    });

    it('should include tool descriptions in add response', async () => {
      const mockTools = [
        { name: 'read_file', description: 'Read file contents from disk' },
        { name: 'write_file', description: 'Write content to a file' }
      ];

      jest.spyOn(managementTool as any, 'getToolsFromMCP').mockResolvedValue(mockTools);

      const result = await managementTool.handleAdd({
        mcp_name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        profile: 'all'
      });

      expect(result.message).toContain('Read file contents');
      expect(result.message).toContain('Write content to');
    });
  });
});
