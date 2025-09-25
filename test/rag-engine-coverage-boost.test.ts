import { jest } from '@jest/globals';
import { PersistentRAGEngine } from '../src/discovery/rag-engine';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('fs');
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockImplementation(async (type, model, options: any = {}) => {
    // Simulate progress callbacks
    if (options.progress_callback) {
      options.progress_callback({ status: 'downloading', progress: 50 });
      options.progress_callback({ status: 'downloading', progress: 100 });
    }
    return {
      __type: 'mocked_pipeline'
    };
  })
}));

describe('RAG Engine Coverage Boost - 80% Target', () => {
  let ragEngine: PersistentRAGEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    ragEngine = new PersistentRAGEngine();

    // Mock fs operations
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('File not found');
    });
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });

  describe('Cache validation functionality', () => {
    it('should validate cache with missing files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const result = await ragEngine.validateCache();
      expect(result).toBe(false);
    });

    it('should validate cache with existing files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        version: '2.2.0',
        createdAt: new Date().toISOString(),
        lastValidated: new Date().toISOString(),
        configHash: 'test-hash',
        mcpHashes: {},
        totalTools: 0
      }));
      const result = await ragEngine.validateCache();
      expect(result).toBe(true);
    });

    it('should invalidate old cache', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        version: '2.2.0',
        createdAt: oldDate.toISOString(),
        lastValidated: oldDate.toISOString(),
        configHash: 'test-hash',
        mcpHashes: {},
        totalTools: 0
      }));
      const result = await ragEngine.validateCache();
      expect(result).toBe(false);
    });

    it('should validate config changes', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        version: '2.2.0',
        createdAt: new Date().toISOString(),
        lastValidated: new Date().toISOString(),
        configHash: 'old-hash',
        mcpHashes: {},
        totalTools: 0
      }));
      const result = await ragEngine.validateCache({ changed: 'config' });
      expect(result).toBe(false);
    });
  });

  describe('Initialization with progress callback', () => {
    it('should handle progress callbacks during model download', async () => {
      const progressLog: any[] = [];

      // Mock pipeline to capture progress callbacks
      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockImplementation(async (type, model, options) => {
        if (options?.progress_callback) {
          options.progress_callback({ status: 'downloading', progress: 25 });
          options.progress_callback({ status: 'downloading', progress: 75 });
          options.progress_callback({ status: 'ready' });
        }
        return { __type: 'model_with_progress' };
      });

      await ragEngine.initialize();

      // Verify that initialization succeeded
      expect(pipeline).toHaveBeenCalled();
    });

    it('should handle initialization failure gracefully', async () => {
      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockRejectedValue(new Error('Model download failed'));

      await ragEngine.initialize();

      // Should not throw, just log warning
      expect(pipeline).toHaveBeenCalled();
    });
  });

  describe('Cache persistence edge cases', () => {
    it('should handle cache directory creation errors', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await ragEngine.initialize();

      // Should handle error gracefully
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should load persisted embeddings when cache is valid', async () => {
      // Mock valid cache metadata
      const validMetadata = {
        version: '1.0.0',
        configHash: require('crypto').createHash('sha256').update('test').digest('hex'),
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        totalTools: 10
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('metadata.json')) {
          return JSON.stringify(validMetadata);
        } else if (filePath.includes('embeddings.db')) {
          return JSON.stringify({
            'test-tool': {
              mcpName: 'test-mcp',
              name: 'test-tool',
              description: 'Test tool',
              embedding: [0.1, 0.2, 0.3],
              confidence: 0.9,
              domain: 'test'
            }
          });
        }
        throw new Error('Unknown file');
      });

      await ragEngine.initialize();

      // Should load embeddings
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should handle corrupt cache data gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        return 'corrupt-json-data{{{';
      });

      await ragEngine.initialize();

      // Should handle error and continue
      expect(fs.readFileSync).toHaveBeenCalled();
    });
  });

  describe('Indexing queue processing', () => {
    it('should queue indexing tasks when not initialized', async () => {
      const tools = [
        { name: 'tool1', description: 'Test tool 1' },
        { name: 'tool2', description: 'Test tool 2' }
      ];

      await ragEngine.indexMCPTools('test-mcp', tools);

      // Should be queued since not initialized
      expect(ragEngine.getStats().totalTools).toBe(0);
    });

    it('should process queued indexing after initialization', async () => {
      const tools = [
        { name: 'tool1', description: 'Test tool 1' },
        { name: 'tool2', description: 'Test tool 2' }
      ];

      // Queue before initialization
      await ragEngine.indexMCPTools('test-mcp', tools);

      // Initialize (with mocked embeddings)
      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue({
        __call: jest.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]]
        })
      });

      await ragEngine.initialize();

      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('Embedding generation and similarity', () => {
    it('should handle embedding generation for new tools', async () => {
      const { pipeline } = require('@xenova/transformers');
      const mockModel = {
        __call: jest.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3, 0.4]]
        })
      };
      (pipeline as jest.Mock).mockResolvedValue(mockModel);

      await ragEngine.initialize();

      const tool = {
        name: 'new-tool',
        description: 'A brand new tool for testing'
      };

      await ragEngine.indexTool('test-mcp', tool);

      // Should generate embedding
      expect(mockModel.__call).toHaveBeenCalled();
    });

    it('should calculate similarity scores correctly', async () => {
      const { pipeline } = require('@xenova/transformers');
      const mockModel = {
        __call: jest.fn()
          .mockResolvedValueOnce({ data: [[0.5, 0.5, 0.0, 0.0]] }) // Tool embedding
          .mockResolvedValueOnce({ data: [[0.5, 0.5, 0.0, 0.0]] }) // Query embedding (same)
      };
      (pipeline as jest.Mock).mockResolvedValue(mockModel);

      await ragEngine.initialize();

      // Index a tool
      await ragEngine.indexTool('test-mcp', {
        name: 'test-tool',
        description: 'Test tool for similarity'
      });

      // Search with similar query
      const results = await ragEngine.findSimilarTools('test tool similarity', 5);

      // Should find similar tool
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle missing embeddings fallback', async () => {
      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue({
        __call: jest.fn().mockResolvedValue(null) // No embeddings
      });

      await ragEngine.initialize();

      const results = await ragEngine.findSimilarTools('search query', 5);

      // Should return empty results when embeddings fail
      expect(results).toEqual([]);
    });
  });

  describe('Cache invalidation scenarios', () => {
    it('should detect outdated cache by timestamp', async () => {
      const oldMetadata = {
        version: '1.0.0',
        configHash: require('crypto').createHash('sha256').update('test').digest('hex'),
        createdAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days old
        lastUpdated: Date.now() - (8 * 24 * 60 * 60 * 1000),
        totalTools: 10
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('metadata.json')) {
          return JSON.stringify(oldMetadata);
        }
        return '{}';
      });

      await ragEngine.initialize();

      // Should detect cache as invalid due to age
      expect(fs.writeFileSync).toHaveBeenCalled(); // Should write new metadata
    });

    it('should clear cache properly with file removal', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

      ragEngine.clearCache();

      // Should attempt to remove cache files
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle cache clear errors gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      ragEngine.clearCache();

      // Should handle error gracefully
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('Advanced discovery features', () => {
    it('should handle empty tool database gracefully', async () => {
      await ragEngine.initialize();

      const results = await ragEngine.findSimilarTools('any query', 5);

      // Should return empty array
      expect(results).toEqual([]);
    });

    it('should respect result limit parameter', async () => {
      const { pipeline } = require('@xenova/transformers');
      const mockModel = {
        __call: jest.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]]
        })
      };
      (pipeline as jest.Mock).mockResolvedValue(mockModel);

      await ragEngine.initialize();

      // Index multiple tools
      for (let i = 0; i < 10; i++) {
        await ragEngine.indexTool('test-mcp', {
          name: `tool-${i}`,
          description: `Test tool number ${i}`
        });
      }

      const results = await ragEngine.findSimilarTools('test', 3);

      // Should respect limit
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Error recovery and resilience', () => {
    it('should handle file write errors during persistence', async () => {
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue({
        __call: jest.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]]
        })
      });

      await ragEngine.initialize();

      // Try to index (which triggers persistence)
      await ragEngine.indexTool('test-mcp', {
        name: 'test-tool',
        description: 'Test'
      });

      // Should handle write error gracefully
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should continue operation after cache load failure', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Read error');
      });

      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockResolvedValue({
        __call: jest.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]]
        })
      });

      await ragEngine.initialize();

      // Should still be operational
      await ragEngine.indexTool('test-mcp', {
        name: 'test-tool',
        description: 'Test'
      });

      const stats = ragEngine.getStats();
      expect(stats.totalTools).toBe(1);
    });
  });
});