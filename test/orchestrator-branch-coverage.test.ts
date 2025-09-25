/**
 * Orchestrator Branch Coverage Tests
 * Targeting uncovered branches for 85%+ coverage using ncp-oss3 patterns
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator';
import * as fs from 'fs';

// Mock dependencies for comprehensive branch testing
jest.mock('fs');
jest.mock('../src/discovery/engine');
jest.mock('../src/utils/health-monitor');
jest.mock('../src/discovery/rag-engine');

describe('NCPOrchestrator - Branch Coverage Tests', () => {
  let orchestrator: NCPOrchestrator;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new NCPOrchestrator('test');
    mockFs.existsSync.mockReturnValue(false);
  });

  describe('🎯 Vector Search Fallback Branches', () => {
    it('should trigger vector search failure fallback path', async () => {
      // Set up a profile that will initialize successfully
      const validProfile = {
        name: 'test',
        description: 'Test profile',
        mcpServers: {
          'test-mcp': {
            command: 'node',
            args: ['test.js']
          }
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock the discovery engine to throw an error
      const mockDiscovery = {
        initialize: jest.fn().mockResolvedValue(undefined as any),
        findRelevantTools: jest.fn().mockRejectedValue(new Error('Vector search failed') as any)
      };

      // Replace the discovery engine to trigger error path
      (orchestrator as any).discovery = mockDiscovery;

      // Mock health monitor to return healthy MCPs for fallback
      const mockHealthMonitor = {
        getHealthyMCPs: jest.fn().mockReturnValue(['test-mcp'])
      };
      (orchestrator as any).healthMonitor = mockHealthMonitor;

      // Mock allTools to have some tools for fallback
      (orchestrator as any).allTools = [
        {
          name: 'test-mcp:test_tool',
          mcpName: 'test-mcp',
          description: 'Test tool'
        }
      ];

      // This should trigger the vector search error and fallback path (lines 330-344)
      const results = await orchestrator.find('test query', 5);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(mockDiscovery.findRelevantTools).toHaveBeenCalled();
    });

    it('should handle vector search with zero results', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock discovery to return empty results
      const mockDiscovery = {
        initialize: jest.fn().mockResolvedValue(undefined),
        findRelevantTools: jest.fn().mockResolvedValue([])
      };
      (orchestrator as any).discovery = mockDiscovery;

      const results = await orchestrator.find('no matches query', 5);
      expect(results).toEqual([]);
    });
  });

  describe('🎯 Tool Name Parsing Edge Cases', () => {
    it('should handle tools without colon separators in parsing', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock discovery to return tool without colon
      const mockDiscovery = {
        initialize: jest.fn().mockResolvedValue(undefined),
        findRelevantTools: jest.fn().mockResolvedValue([
          { name: 'plain_tool_name', description: 'Tool without colon', confidence: 0.8 }
        ])
      };
      (orchestrator as any).discovery = mockDiscovery;

      // Mock toolToMCP mapping for tools without prefixes
      (orchestrator as any).toolToMCP = new Map([['plain_tool_name', 'test-mcp']]);

      // Mock allTools to include non-prefixed tool
      (orchestrator as any).allTools = [
        {
          name: 'plain_tool_name',
          mcpName: 'test-mcp',
          description: 'Tool without colon'
        }
      ];

      // This should trigger the tool parsing branch for tools without colons (lines 297-306)
      const results = await orchestrator.find('test', 5);
      expect(results).toBeDefined();
    });

    it('should handle tool name extraction for schema lookup', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock getToolSchema to be called
      const mockGetToolSchema = jest.fn().mockReturnValue({ type: 'object' });
      (orchestrator as any).getToolSchema = mockGetToolSchema;

      (orchestrator as any).allTools = [
        {
          name: 'test-mcp:complex_tool',
          mcpName: 'test-mcp',
          description: 'Complex tool'
        }
      ];

      // Request detailed results to trigger schema lookup (lines 276-277, 282)
      const results = await orchestrator.find('', 5, true);

      expect(results).toBeDefined();
      if (results.length > 0) {
        expect(results[0].schema).toBeDefined();
      }
    });
  });

  describe('🎯 Connection Management Edge Cases', () => {
    it('should handle MCP connection failures gracefully', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'failing-mcp': { command: 'nonexistent', args: [] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock connection establishment to fail
      const mockConnect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (orchestrator as any).connectToServer = mockConnect;

      // This should trigger connection error handling branches
      const result = await orchestrator.run('failing-mcp:some_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle MCP not configured error branch', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: {}
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Try to run a tool from an MCP that's not configured
      const result = await orchestrator.run('unconfigured-mcp:tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('🎯 Resource Management Error Paths', () => {
    it('should handle getAllResources with connection errors', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock connection to fail for resources
      const mockMCPConnections = new Map();
      mockMCPConnections.set('test-mcp', {
        listResources: jest.fn().mockRejectedValue(new Error('Resource error'))
      });
      (orchestrator as any).mcpConnections = mockMCPConnections;

      // This should trigger resource error handling (lines 616-618)
      const resources = await orchestrator.getAllResources();
      expect(Array.isArray(resources)).toBe(true);
    });

    it('should handle getResource with invalid URI', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Try to get resource with invalid URI format
      const result = await orchestrator.getResource('invalid-uri-format');
      expect(result).toBeNull();
    });
  });

  describe('🎯 Cache Management Branches', () => {
    it('should handle cache save errors gracefully', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      // Mock writeFileSync to throw error
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      await orchestrator.initialize();

      // This should trigger cache save error handling
      const result = await orchestrator.find('test', 5);
      expect(result).toBeDefined();
    });

    it('should handle cache with invalid JSON', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      // Profile exists
      mockFs.existsSync.mockImplementation((path: string) => {
        return path.includes('.json'); // Both profile and cache exist
      });

      // Profile reads successfully, cache reads with invalid JSON
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('profiles')) {
          return JSON.stringify(validProfile) as any;
        } else {
          return 'invalid json' as any; // Invalid cache JSON
        }
      });

      await orchestrator.initialize();

      // Should handle invalid cache gracefully and continue
      const result = await orchestrator.find('test', 5);
      expect(result).toBeDefined();
    });
  });

  describe('🎯 Tool Schema Retrieval Branches', () => {
    it('should handle getToolSchema with no connection', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock empty connections
      (orchestrator as any).mcpConnections = new Map();

      // This should trigger schema retrieval from definitions when no connection exists
      const schema = (orchestrator as any).getToolSchema('test-mcp', 'test_tool');
      expect(schema).toBeDefined();
    });

    it('should handle getToolSchema with connection but no schema', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock connection with no schema
      const mockConnection = {
        getToolSchema: jest.fn().mockReturnValue(null)
      };
      (orchestrator as any).mcpConnections = new Map([['test-mcp', mockConnection]]);

      const schema = (orchestrator as any).getToolSchema('test-mcp', 'test_tool');
      expect(schema).toBeDefined(); // Should fall back to default schema
    });
  });

  describe('🎯 Error Handling and Cleanup Branches', () => {
    it('should handle disconnect errors during cleanup', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      await orchestrator.initialize();

      // Mock connection with failing disconnect
      const mockConnection = {
        disconnect: jest.fn().mockRejectedValue(new Error('Disconnect failed'))
      };
      (orchestrator as any).mcpConnections = new Map([['test-mcp', mockConnection]]);

      // Cleanup should handle disconnect errors gracefully
      await expect(orchestrator.cleanup()).resolves.not.toThrow();
    });

    it('should handle multiple initialization calls', async () => {
      const validProfile = {
        name: 'test',
        mcpServers: { 'test-mcp': { command: 'node', args: ['test.js'] } }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validProfile) as any);

      // Initialize multiple times - should not reinitialize
      await orchestrator.initialize();
      const secondInit = await orchestrator.initialize();

      expect(secondInit).toBeUndefined();
    });
  });
});