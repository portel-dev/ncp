/**
 * Cache Optimization Tests
 * Tests the new incremental cache patching system
 */

import { CachePatcher } from '../src/cache/cache-patcher.js';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Custom CachePatcher for testing that uses a temp directory
class TestCachePatcher extends CachePatcher {
  constructor(private testCacheDir: string) {
    super();
    // Override cache directory paths
    this['cacheDir'] = testCacheDir;
    this['toolMetadataCachePath'] = join(testCacheDir, 'all-tools.json');
    this['embeddingsCachePath'] = join(testCacheDir, 'embeddings.json');
    this['embeddingsMetadataCachePath'] = join(testCacheDir, 'embeddings-metadata.json');

    // Ensure cache directory exists
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
  }
}

describe('Cache Optimization', () => {
  let tempCacheDir: string;
  let cachePatcher: TestCachePatcher;

  beforeEach(() => {
    // Create a temporary cache directory for testing
    tempCacheDir = join(tmpdir(), 'ncp-cache-test-' + Date.now());
    mkdirSync(tempCacheDir, { recursive: true });
    cachePatcher = new TestCachePatcher(tempCacheDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempCacheDir)) {
      rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  describe('Profile Hash Generation', () => {
    test('should generate consistent hashes for same profile', () => {
      const profile1 = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem', '/tmp']
          }
        }
      };

      const profile2 = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem', '/tmp']
          }
        }
      };

      const hash1 = cachePatcher.generateProfileHash(profile1);
      const hash2 = cachePatcher.generateProfileHash(profile2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    test('should generate different hashes for different profiles', () => {
      const profile1 = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem', '/tmp']
          }
        }
      };

      const profile2 = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem', '/home']
          }
        }
      };

      const hash1 = cachePatcher.generateProfileHash(profile1);
      const hash2 = cachePatcher.generateProfileHash(profile2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Cache Patching Operations', () => {
    test('should add MCP to tool metadata cache', async () => {
      const config = {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp']
      };

      const tools = [
        {
          name: 'read_file',
          description: 'Read a file from the filesystem',
          inputSchema: { type: 'object' }
        },
        {
          name: 'write_file',
          description: 'Write a file to the filesystem',
          inputSchema: { type: 'object' }
        }
      ];

      const serverInfo = {
        name: 'filesystem',
        version: '1.0.0',
        description: 'File system operations'
      };

      await cachePatcher.patchAddMCP('filesystem', config, tools, serverInfo);

      const cache = await cachePatcher.loadToolMetadataCache();
      expect(cache.mcps.filesystem).toBeDefined();
      expect(cache.mcps.filesystem.tools).toHaveLength(2);
      expect(cache.mcps.filesystem.tools[0].name).toBe('read_file');
      expect(cache.mcps.filesystem.serverInfo.name).toBe('filesystem');
    });

    test('should remove MCP from tool metadata cache', async () => {
      // First add an MCP
      const config = {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp']
      };

      const tools = [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: {}
        }
      ];

      await cachePatcher.patchAddMCP('filesystem', config, tools, {});

      // Verify it was added
      let cache = await cachePatcher.loadToolMetadataCache();
      expect(cache.mcps.filesystem).toBeDefined();

      // Remove it
      await cachePatcher.patchRemoveMCP('filesystem');

      // Verify it was removed
      cache = await cachePatcher.loadToolMetadataCache();
      expect(cache.mcps.filesystem).toBeUndefined();
    });
  });

  describe('Cache Validation', () => {
    test('should validate cache with matching profile hash', async () => {
      const profileHash = 'test-hash-12345';
      await cachePatcher.updateProfileHash(profileHash);

      const isValid = await cachePatcher.validateCacheWithProfile(profileHash);
      expect(isValid).toBe(true);
    });

    test('should invalidate cache with mismatched profile hash', async () => {
      const profileHash1 = 'test-hash-12345';
      const profileHash2 = 'test-hash-67890';

      await cachePatcher.updateProfileHash(profileHash1);

      const isValid = await cachePatcher.validateCacheWithProfile(profileHash2);
      expect(isValid).toBe(false);
    });

    test('should handle missing cache gracefully', async () => {
      const profileHash = 'test-hash-12345';
      const isValid = await cachePatcher.validateCacheWithProfile(profileHash);
      expect(isValid).toBe(false);
    });
  });

  describe('Cache Statistics', () => {
    test('should return accurate cache statistics', async () => {
      // Start with empty cache
      let stats = await cachePatcher.getCacheStats();
      expect(stats.toolMetadataExists).toBe(false);
      expect(stats.mcpCount).toBe(0);
      expect(stats.toolCount).toBe(0);

      // Add some data
      const config = {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp']
      };

      const tools = [
        { name: 'read_file', description: 'Read file', inputSchema: {} },
        { name: 'write_file', description: 'Write file', inputSchema: {} }
      ];

      await cachePatcher.patchAddMCP('filesystem', config, tools, {});

      // Check updated stats
      stats = await cachePatcher.getCacheStats();
      expect(stats.toolMetadataExists).toBe(true);
      expect(stats.mcpCount).toBe(1);
      expect(stats.toolCount).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupt cache files gracefully', async () => {
      const integrity = await cachePatcher.validateAndRepairCache();
      expect(integrity.valid).toBe(false);
      expect(integrity.repaired).toBe(false);
    });
  });
});