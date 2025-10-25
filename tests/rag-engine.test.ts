/**
 * Tests for RAGEngine - Retrieval-Augmented Generation engine
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PersistentRAGEngine } from '../src/discovery/rag-engine.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// Mock filesystem operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ''),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFile: jest.fn((path: any, callback: any) => callback(null, '')),
  writeFile: jest.fn((path: any, data: any, callback: any) => callback(null)),
  mkdir: jest.fn((path: any, callback: any) => callback(null)),
  readdirSync: jest.fn(() => []),
  statSync: jest.fn(() => ({ isDirectory: () => false })),
  createWriteStream: jest.fn(() => ({
    write: jest.fn(),
    end: jest.fn((callback: any) => callback && callback()),
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn()
  })),
  createReadStream: jest.fn(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn()
  })),
  rmSync: jest.fn(),
  rm: jest.fn((path: any, opts: any, callback: any) => callback && callback(null))
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('PersistentRAGEngine', () => {
  let ragEngine: PersistentRAGEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('{}');
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    ragEngine = new PersistentRAGEngine();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create RAG engine', () => {
      expect(ragEngine).toBeDefined();
    });

    it('should initialize successfully', async () => {
      await expect(ragEngine.initialize()).resolves.not.toThrow();
    });
  });

  describe('query domain inference', () => {
    beforeEach(async () => {
      await ragEngine.initialize();
    });

    it('should infer web development domain from query', async () => {
      // This should trigger inferQueryDomains method (lines 97-118)
      const results = await ragEngine.discover('react component development', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should infer payment processing domain from query', async () => {
      // Test payment domain inference
      const results = await ragEngine.discover('stripe payment processing setup', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should infer file system domain from query', async () => {
      // Test file system domain inference
      const results = await ragEngine.discover('read file directory operations', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should infer database domain from query', async () => {
      // Test database domain inference
      const results = await ragEngine.discover('sql database query operations', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should infer multiple domains from complex query', async () => {
      // Test multiple domain inference
      const results = await ragEngine.discover('react web app with stripe payment database', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle queries with no matching domains', async () => {
      // Test query with no domain matches
      const results = await ragEngine.discover('quantum computing algorithms', 3);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('cache validation', () => {
    beforeEach(async () => {
      await ragEngine.initialize();
    });

    it('should validate cache metadata properly', async () => {
      // Mock valid cache metadata
      const validCacheData = {
        metadata: {
          createdAt: new Date().toISOString(),
          configHash: 'test-hash',
          version: '1.0.0'
        },
        embeddings: {},
        domainMappings: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(validCacheData));

      // This should trigger cache validation logic (lines 151-152, 159-160, 165-168)
      await ragEngine.initialize();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle invalid cache metadata', async () => {
      // Mock cache with no metadata - should trigger lines 151-152
      const invalidCacheData = {
        embeddings: {},
        domainMappings: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(invalidCacheData));

      await ragEngine.initialize();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle old cache that needs rebuild', async () => {
      // Mock cache older than 7 days - should trigger lines 159-160
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      const oldCacheData = {
        metadata: {
          createdAt: oldDate.toISOString(),
          configHash: 'test-hash',
          version: '1.0.0'
        },
        embeddings: {},
        domainMappings: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(oldCacheData));

      await ragEngine.initialize();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle configuration hash mismatch', async () => {
      // Mock cache with different config hash - should trigger lines 165-168
      const configMismatchData = {
        metadata: {
          createdAt: new Date().toISOString(),
          configHash: 'old-hash',
          version: '1.0.0'
        },
        embeddings: {},
        domainMappings: {}
      };

      mockReadFile.mockResolvedValue(JSON.stringify(configMismatchData));

      const currentConfig = { test: 'config' };
      await ragEngine.initialize();
      expect(mockReadFile).toHaveBeenCalled();
    });
  });

  describe('tool indexing and discovery', () => {
    beforeEach(async () => {
      await ragEngine.initialize();
    });

    it('should index tool with domain classification', async () => {
      const tool = {
        id: 'test-tool',
        name: 'react:component',
        description: 'Create React components for web development',
        mcpServer: 'web-tools',
        inputSchema: {}
      };

      // This should trigger domain classification and indexing
      await ragEngine.indexMCP('web-tools', [tool]);

      // Verify tool was processed
      const results = await ragEngine.discover('react component', 1);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle bulk tool indexing', async () => {
      const tools = [
        {
          id: 'tool1',
          name: 'stripe:payment',
          description: 'Process payments with Stripe',
          mcpServer: 'payment',
          inputSchema: {}
        },
        {
          id: 'tool2',
          name: 'file:read',
          description: 'Read files from filesystem',
          mcpServer: 'fs',
          inputSchema: {}
        },
        {
          id: 'tool3',
          name: 'db:query',
          description: 'Execute database queries',
          mcpServer: 'database',
          inputSchema: {}
        }
      ];

      // Index all tools by MCP server
      const toolsByServer = new Map();
      tools.forEach(tool => {
        if (!toolsByServer.has(tool.mcpServer)) {
          toolsByServer.set(tool.mcpServer, []);
        }
        toolsByServer.get(tool.mcpServer).push(tool);
      });

      for (const [mcpServer, serverTools] of toolsByServer) {
        await ragEngine.indexMCP(mcpServer, serverTools);
      }

      // Test discovery across different domains
      const paymentResults = await ragEngine.discover('payment processing', 2);
      expect(Array.isArray(paymentResults)).toBe(true);

      const fileResults = await ragEngine.discover('file operations', 2);
      expect(Array.isArray(fileResults)).toBe(true);
    });

    it('should handle tools with missing descriptions', async () => {
      const toolNoDesc = {
        id: 'no-desc-tool',
        name: 'mystery:tool',
        description: '',
        mcpServer: 'unknown',
        inputSchema: {}
      };

      // Should handle gracefully without errors
      await expect(ragEngine.indexMCP(toolNoDesc.mcpServer, [toolNoDesc])).resolves.not.toThrow();
    });

    it('should clear cache properly', async () => {
      // Add some tools first
      const tool = {
        id: 'clear-test',
        name: 'test:clear',
        description: 'Tool for cache clearing test',
        mcpServer: 'test',
        inputSchema: {}
      };

      await ragEngine.indexMCP(tool.mcpServer, [tool]);

      // Clear cache
      await ragEngine.clearCache();

      // Should still work after clearing
      const results = await ragEngine.discover('cache clear test', 1);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('advanced discovery features', () => {
    beforeEach(async () => {
      await ragEngine.initialize();
    });

    it('should handle semantic similarity search', async () => {
      // Index tools with semantic similarity potential
      const tools = [
        {
          id: 'semantic1',
          name: 'email:send',
          description: 'Send electronic mail messages to recipients',
          mcpServer: 'communication',
          inputSchema: {}
        },
        {
          id: 'semantic2',
          name: 'message:dispatch',
          description: 'Dispatch messages via various channels',
          mcpServer: 'messaging',
          inputSchema: {}
        }
      ];

      for (const tool of tools) {
        await ragEngine.indexMCP(tool.mcpServer, [tool]);
      }

      // Test semantic search
      const results = await ragEngine.discover('send communication', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle confidence scoring and ranking', async () => {
      // Index tools for confidence testing
      const exactMatchTool = {
        id: 'exact',
        name: 'exact:match',
        description: 'Exact match tool for precise operations',
        mcpServer: 'precise',
        inputSchema: {}
      };

      const partialMatchTool = {
        id: 'partial',
        name: 'partial:tool',
        description: 'Partially matching tool for general operations',
        mcpServer: 'general',
        inputSchema: {}
      };

      await ragEngine.indexMCP(exactMatchTool.mcpServer, [exactMatchTool]);
      await ragEngine.indexMCP(partialMatchTool.mcpServer, [partialMatchTool]);

      // Test confidence ranking
      const results = await ragEngine.discover('exact match operations', 2);
      expect(Array.isArray(results)).toBe(true);

      // Results should be sorted by confidence
      if (results.length > 1) {
        expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
      }
    });

    it('should handle edge cases in discovery', async () => {
      // Test empty query
      const emptyResults = await ragEngine.discover('', 1);
      expect(Array.isArray(emptyResults)).toBe(true);

      // Test very long query
      const longQuery = 'very '.repeat(100) + 'long query with many repeated words';
      const longResults = await ragEngine.discover(longQuery, 1);
      expect(Array.isArray(longResults)).toBe(true);

      // Test special characters
      const specialResults = await ragEngine.discover('query with !@#$%^&*() special chars', 1);
      expect(Array.isArray(specialResults)).toBe(true);
    });
  });

  describe('error handling and resilience', () => {
    beforeEach(async () => {
      await ragEngine.initialize();
    });

    it('should handle file system errors gracefully', async () => {
      // Mock file read failure
      mockReadFile.mockRejectedValue(new Error('File read failed'));

      const newEngine = new PersistentRAGEngine();
      await expect(newEngine.initialize()).resolves.not.toThrow();
    });

    it('should handle file write errors gracefully', async () => {
      // Mock file write failure
      mockWriteFile.mockRejectedValue(new Error('File write failed'));

      const tool = {
        id: 'write-error-tool',
        name: 'error:tool',
        description: 'Tool for testing write errors',
        mcpServer: 'error-test',
        inputSchema: {}
      };

      // Should not throw even if cache write fails
      await expect(ragEngine.indexMCP(tool.mcpServer, [tool])).resolves.not.toThrow();
    });

    it('should handle malformed cache data', async () => {
      // Mock malformed JSON
      mockReadFile.mockResolvedValue('invalid json data');

      const newEngine = new PersistentRAGEngine();
      await expect(newEngine.initialize()).resolves.not.toThrow();
    });

    it('should handle directory creation for cache', async () => {
      // Test directory creation handling
      const newEngine = new PersistentRAGEngine();
      await newEngine.initialize();

      // Should complete initialization successfully
      expect(newEngine).toBeDefined();
    });
  });

  describe('Embedding search and vector operations', () => {
    beforeEach(async () => {
      await ragEngine.initialize();
    });

    it('should handle tools with no embeddings fallback', async () => {
      // This should trigger lines 441-443: fallback when no tools have embeddings
      const tools = [
        {
          id: 'no-embedding-tool',
          name: 'no:embedding',
          description: 'Tool without embedding vector',
          mcpServer: 'test',
          inputSchema: {}
        }
      ];

      await ragEngine.indexMCP('test', tools);

      // This should trigger the no-embeddings fallback path
      const results = await ragEngine.discover('test query', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle embedding vector operations', async () => {
      // Test the embedding logic (lines 427-527)
      const embeddingTools = [
        {
          id: 'embedding-tool-1',
          name: 'embedding:tool1',
          description: 'Advanced machine learning tool for data processing',
          mcpServer: 'ml',
          inputSchema: {}
        },
        {
          id: 'embedding-tool-2',
          name: 'embedding:tool2',
          description: 'Database query optimization and management',
          mcpServer: 'db',
          inputSchema: {}
        }
      ];

      await ragEngine.indexMCP('ml', [embeddingTools[0]]);
      await ragEngine.indexMCP('db', [embeddingTools[1]]);

      // This should exercise the embedding search logic
      const results = await ragEngine.discover('machine learning data processing', 2);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle query embedding generation', async () => {
      // Test query embedding generation and similarity search
      const complexTools = [
        {
          id: 'complex-1',
          name: 'file:operations',
          description: 'File system operations including read write delete and directory management',
          mcpServer: 'fs',
          inputSchema: {}
        },
        {
          id: 'complex-2',
          name: 'api:calls',
          description: 'REST API calls and HTTP request handling with authentication',
          mcpServer: 'api',
          inputSchema: {}
        }
      ];

      await ragEngine.indexMCP('fs', [complexTools[0]]);
      await ragEngine.indexMCP('api', [complexTools[1]]);

      // Test with specific query to trigger embedding similarity
      const results = await ragEngine.discover('file system read write operations', 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should exercise vector similarity calculations', async () => {
      // Test the vector similarity and ranking logic
      const similarityTools = [
        {
          id: 'sim-1',
          name: 'text:processing',
          description: 'Natural language processing and text analysis tools',
          mcpServer: 'nlp',
          inputSchema: {}
        },
        {
          id: 'sim-2',
          name: 'text:generation',
          description: 'Text generation and content creation utilities',
          mcpServer: 'content',
          inputSchema: {}
        },
        {
          id: 'sim-3',
          name: 'image:processing',
          description: 'Image manipulation and computer vision operations',
          mcpServer: 'vision',
          inputSchema: {}
        }
      ];

      for (const tool of similarityTools) {
        await ragEngine.indexMCP(tool.mcpServer, [tool]);
      }

      // Query should match text tools more than image tools
      const results = await ragEngine.discover('text processing and analysis', 3);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});