import { jest } from '@jest/globals';
import { PersistentRAGEngine } from '../src/discovery/rag-engine';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import * as fs from 'fs';

// Mock dependencies
jest.mock('fs');
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue({
    __call: jest.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] })
  })
}));

describe('Final 80% Coverage Push - Focus on Uncovered Lines', () => {

  describe('RAG Engine - Processing Queue and Persistence', () => {
    let ragEngine: PersistentRAGEngine;

    beforeEach(() => {
      jest.clearAllMocks();
      ragEngine = new PersistentRAGEngine('/tmp/test');
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    });

    it('should process indexing queue after initialization', async () => {
      // Queue tools before initialization
      await ragEngine.indexMCPTools('mcp1', [
        { name: 'tool1', description: 'First tool' }
      ]);
      await ragEngine.indexMCPTools('mcp2', [
        { name: 'tool2', description: 'Second tool' }
      ]);

      // Verify queue is not processed yet
      expect(ragEngine.getStats().totalTools).toBe(0);

      // Initialize
      await ragEngine.initialize();

      // Wait for async queue processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if tools were indexed
      const stats = ragEngine.getStats();
      expect(stats.totalTools).toBeGreaterThan(0);
    });

    it('should handle persistence errors during save', async () => {
      await ragEngine.initialize();

      // Mock write error
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      // Should not throw when saving fails
      await ragEngine.indexTool('mcp', { name: 'tool', description: 'test' });

      // Verify error was caught
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should load embeddings from cache when valid', async () => {
      const validCache = {
        version: '1.0.0',
        configHash: require('crypto').createHash('sha256').update(JSON.stringify({
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384
        })).digest('hex'),
        createdAt: Date.now() - 1000, // Recent
        lastUpdated: Date.now(),
        totalTools: 5
      };

      const embeddings = {
        'tool1': {
          mcpName: 'mcp1',
          name: 'tool1',
          description: 'Test tool',
          embedding: [0.1, 0.2],
          confidence: 0.9
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('metadata.json')) {
          return JSON.stringify(validCache);
        }
        if (path.includes('embeddings.db')) {
          return JSON.stringify(embeddings);
        }
        return '{}';
      });

      await ragEngine.initialize();

      // Should have loaded embeddings
      const stats = ragEngine.getStats();
      expect(stats.totalTools).toBe(1);
    });

    it('should handle model download progress callbacks', async () => {
      const { pipeline } = require('@xenova/transformers');

      let progressCalled = false;
      (pipeline as jest.Mock).mockImplementation(async (type, model, options) => {
        if (options?.progress_callback) {
          progressCalled = true;
          options.progress_callback({ status: 'downloading', progress: 10 });
          options.progress_callback({ status: 'downloading', progress: 50 });
          options.progress_callback({ status: 'downloading', progress: 100 });
        }
        return { __call: jest.fn().mockResolvedValue({ data: [[0.1]] }) };
      });

      await ragEngine.initialize();

      expect(progressCalled).toBe(true);
    });
  });

  describe('Orchestrator - Uncovered Branches', () => {
    let orchestrator: NCPOrchestrator;

    beforeEach(() => {
      jest.clearAllMocks();
      orchestrator = new NCPOrchestrator();
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.readFileSync as jest.Mock).mockImplementation(() => '{}');
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    });

    it('should handle MCP with args array', async () => {
      const profile = {
        mcps: {
          'args-mcp': {
            command: 'test-cmd',
            args: ['--port', '3000', '--verbose']
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'test-tool', description: 'Test' }]
        }),
        callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      const result = await orchestrator.run('args-mcp:test-tool', { param: 'value' });

      expect(result.result).toBe('result');
    });

    it('should handle tool execution with various result formats', async () => {
      const profile = {
        mcps: { 'test-mcp': { command: 'test' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1' }]
        }),
        callTool: jest.fn(),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Test different response formats

      // Array of content
      mockClient.callTool.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'part1' },
          { type: 'text', text: 'part2' }
        ]
      });
      let result = await orchestrator.run('test-mcp:tool1', {});
      expect(result.result).toBe('part1\npart2');

      // Empty content
      mockClient.callTool.mockResolvedValueOnce({ content: [] });
      result = await orchestrator.run('test-mcp:tool1', {});
      expect(result.result).toBe('');

      // Non-text content
      mockClient.callTool.mockResolvedValueOnce({
        content: [{ type: 'image', data: 'base64data' }]
      });
      result = await orchestrator.run('test-mcp:tool1', {});
      expect(result.result).toContain('type');
    });

    it('should disconnect specific MCP connection', async () => {
      const profile = {
        mcps: {
          'mcp1': { command: 'cmd1' },
          'mcp2': { command: 'cmd2' }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient1 = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        close: jest.fn()
      };

      const mockClient2 = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock)
        .mockReturnValueOnce(mockClient1)
        .mockReturnValueOnce(mockClient2);

      // Connect both
      await orchestrator.run('mcp1:tool', {});
      await orchestrator.run('mcp2:tool', {});

      // Disconnect one
      await orchestrator['disconnectMCP']('mcp1');

      expect(mockClient1.close).toHaveBeenCalled();
      expect(mockClient2.close).not.toHaveBeenCalled();
    });

    it('should handle connection pool cleanup', async () => {
      const profile = {
        mcps: { 'test-mcp': { command: 'test' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool' }]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Create connection
      await orchestrator.run('test-mcp:tool', {});

      // Wait for idle timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger cleanup
      orchestrator['cleanupIdleConnections']();

      // Connection should remain if recently used
      expect(mockClient.close).not.toHaveBeenCalled();
    });

    it('should save cache after tool discovery', async () => {
      const profile = {
        mcps: { 'cache-test': { command: 'test' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', description: 'First tool' },
            { name: 'tool2', description: 'Second tool' }
          ]
        }),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      // Trigger discovery
      await orchestrator.find('tool');

      // Should save cache
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('cache.json'),
        expect.any(String)
      );
    });
  });

  describe('Edge cases for complete coverage', () => {
    it('should handle undefined tool descriptions in orchestrator', async () => {
      const orchestrator = new NCPOrchestrator();

      const cacheData = {
        mcps: {
          'test-mcp': {
            tools: {
              'tool1': { name: 'tool1' }, // No description
              'tool2': { name: 'tool2', description: null }, // Null description
              'tool3': { name: 'tool3', description: 'Valid' }
            }
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(cacheData));

      await orchestrator.initialize();

      const results = await orchestrator.find('tool');

      // Should handle missing descriptions
      expect(results.tools).toBeDefined();
    });

    it('should handle getPrompts error gracefully', async () => {
      const orchestrator = new NCPOrchestrator();

      const profile = {
        mcps: { 'prompt-mcp': { command: 'test' } }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(profile));

      await orchestrator.initialize();

      const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        listPrompts: jest.fn().mockRejectedValue(new Error('Prompts error')),
        close: jest.fn()
      };

      (Client as unknown as jest.Mock).mockReturnValue(mockClient);

      const prompts = await orchestrator.getPrompts();

      // Should return empty array on error
      expect(prompts).toEqual([]);
    });

    it('should handle missing tool in schema retrieval', async () => {
      const orchestrator = new NCPOrchestrator();
      await orchestrator.initialize();

      const schema = await orchestrator.getToolSchema('nonexistent:tool');

      expect(schema).toBeNull();
    });
  });
});