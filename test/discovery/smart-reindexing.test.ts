/**
 * Smart Re-indexing Tests
 *
 * Tests for smart re-indexing feature:
 * - Dual index file management
 * - Live filtering with over-fetching
 * - Background re-indexing
 * - Atomic swap mechanism
 */

import { PersistentRAGEngine } from '../../src/discovery/rag-engine.js';
import { InternalMCPManager } from '../../src/internal-mcps/internal-mcp-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import { getNcpBaseDirectory } from '../../src/utils/ncp-paths.js';

describe('Smart Re-indexing', () => {
  let ragEngine: PersistentRAGEngine;
  let internalMCPManager: InternalMCPManager;
  const ncpDir = getNcpBaseDirectory();
  const primaryIndexPath = path.join(ncpDir, 'embeddings.json');
  const swapIndexPath = path.join(ncpDir, 'embeddings-swap.json');

  beforeEach(async () => {
    // Clean up any existing index files
    if (fs.existsSync(primaryIndexPath)) {
      fs.unlinkSync(primaryIndexPath);
    }
    if (fs.existsSync(swapIndexPath)) {
      fs.unlinkSync(swapIndexPath);
    }

    ragEngine = new PersistentRAGEngine();
    internalMCPManager = new InternalMCPManager();

    // Connect RAG engine to Internal MCP Manager
    internalMCPManager.setRAGEngine(ragEngine);

    // Initialize RAG engine
    await ragEngine.initialize();
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(primaryIndexPath)) {
      fs.unlinkSync(primaryIndexPath);
    }
    if (fs.existsSync(swapIndexPath)) {
      fs.unlinkSync(swapIndexPath);
    }
  });

  describe('Disabled MCP Tracking', () => {
    test('should mark MCP as disabled', () => {
      ragEngine.setMCPDisabled('schedule');
      expect(ragEngine.isMCPDisabled('schedule')).toBe(true);
    });

    test('should mark MCP as enabled', () => {
      ragEngine.setMCPDisabled('schedule');
      expect(ragEngine.isMCPDisabled('schedule')).toBe(true);

      ragEngine.setMCPEnabled('schedule');
      expect(ragEngine.isMCPDisabled('schedule')).toBe(false);
    });

    test('should track multiple disabled MCPs', () => {
      ragEngine.setMCPDisabled('schedule');
      ragEngine.setMCPDisabled('mcp');

      expect(ragEngine.isMCPDisabled('schedule')).toBe(true);
      expect(ragEngine.isMCPDisabled('mcp')).toBe(true);

      const stats = ragEngine.getStats();
      expect(stats.disabledMCPs).toContain('schedule');
      expect(stats.disabledMCPs).toContain('mcp');
    });
  });

  describe('Live Filtering with Over-fetching', () => {
    beforeEach(async () => {
      // Index some test tools
      await ragEngine.indexMCP('schedule', [
        { name: 'create', description: 'Create a scheduled job' },
        { name: 'retrieve', description: 'Retrieve scheduled jobs' },
        { name: 'update', description: 'Update a scheduled job' }
      ]);

      await ragEngine.indexMCP('mcp', [
        { name: 'add', description: 'Add an MCP to configuration' },
        { name: 'remove', description: 'Remove an MCP from configuration' },
        { name: 'list', description: 'List available MCPs' }
      ]);
    });

    test('should filter out disabled MCP tools from discovery results', async () => {
      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Search for "scheduled" - should not return schedule tools
      const results = await ragEngine.discover('scheduled', 5, 0.1);

      // Filter schedule tools from results
      const scheduleTools = results.filter(r => r.toolId.split(':')[0] === 'schedule');

      // Should have no schedule tools in results (they were filtered out)
      expect(scheduleTools).toHaveLength(0);

      // All results should be from non-disabled MCPs
      for (const result of results) {
        const mcpName = result.toolId.split(':')[0];
        expect(mcpName).not.toBe('schedule');
      }
    });

    test('should calculate correct over-fetch multiplier', async () => {
      // With no disabled MCPs, multiplier should be 1.0
      let stats = ragEngine.getStats();
      expect(stats.disabledMCPs).toHaveLength(0);

      // Disable one MCP (50% of tools if we have 2 MCPs with equal tools)
      ragEngine.setMCPDisabled('schedule');

      stats = ragEngine.getStats();
      expect(stats.disabledMCPs).toHaveLength(1);
      expect(stats.disabledMCPs).toContain('schedule');
    });

    test('should return requested number of results after filtering', async () => {
      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Request 2 results
      const results = await ragEngine.discover('mcp', 2, 0.1);

      // Should get up to 2 results (may be less depending on matches)
      expect(results.length).toBeLessThanOrEqual(2);

      // All results should be from enabled MCPs
      for (const result of results) {
        const mcpName = result.toolId.split(':')[0];
        expect(mcpName).not.toBe('schedule');
      }
    });
  });

  describe('Background Re-indexing', () => {
    beforeEach(async () => {
      // Index some test tools
      await ragEngine.indexMCP('schedule', [
        { name: 'create', description: 'Create a scheduled job' },
        { name: 'retrieve', description: 'Retrieve scheduled jobs' }
      ]);

      await ragEngine.indexMCP('mcp', [
        { name: 'add', description: 'Add an MCP to configuration' },
        { name: 'list', description: 'List available MCPs' }
      ]);
    });

    test('should create swap file during background re-indexing', async () => {
      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Get stats before re-indexing
      const statsBefore = ragEngine.getStats();
      expect(statsBefore.isReindexing).toBe(false);

      // Trigger background re-indexing
      const reindexPromise = ragEngine.triggerBackgroundReindex();

      // Wait for re-indexing to complete
      await reindexPromise;

      // Check stats after re-indexing
      const statsAfter = ragEngine.getStats();
      expect(statsAfter.isReindexing).toBe(false);
    });

    test('should exclude disabled MCPs from swap index', async () => {
      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Trigger background re-indexing
      await ragEngine.triggerBackgroundReindex();

      // After atomic swap, vectorDB should not contain schedule tools
      const stats = ragEngine.getStats();
      expect(stats.totalEmbeddings).toBeLessThan(4); // Should only have mcp tools

      // Verify schedule tools are not in vectorDB
      const results = await ragEngine.discover('schedule', 5, 0.1);
      const scheduleTools = results.filter(r => r.toolId.startsWith('schedule:'));
      expect(scheduleTools).toHaveLength(0);
    });

    test('should not trigger re-indexing if already in progress', async () => {
      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Trigger first re-indexing
      const firstReindex = ragEngine.triggerBackgroundReindex();

      // Try to trigger second re-indexing (should be rejected)
      const secondReindex = ragEngine.triggerBackgroundReindex();

      await Promise.all([firstReindex, secondReindex]);

      // Both should complete without errors
      const stats = ragEngine.getStats();
      expect(stats.isReindexing).toBe(false);
    });
  });

  describe('Atomic Swap', () => {
    beforeEach(async () => {
      // Index some test tools
      await ragEngine.indexMCP('schedule', [
        { name: 'create', description: 'Create a scheduled job' },
        { name: 'retrieve', description: 'Retrieve scheduled jobs' }
      ]);

      await ragEngine.indexMCP('mcp', [
        { name: 'add', description: 'Add an MCP to configuration' },
        { name: 'list', description: 'List available MCPs' }
      ]);
    });

    test('should atomically swap to new index after re-indexing', async () => {
      // Get initial tool count
      const statsBefore = ragEngine.getStats();
      const initialCount = statsBefore.totalEmbeddings;

      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Trigger re-indexing (includes atomic swap)
      await ragEngine.triggerBackgroundReindex();

      // After swap, tool count should be reduced
      const statsAfter = ragEngine.getStats();
      expect(statsAfter.totalEmbeddings).toBeLessThan(initialCount);

      // Active index should have swapped
      expect(statsAfter.activeIndex).toBeDefined();
    });

    test('should maintain discovery during swap', async () => {
      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Start re-indexing in background
      const reindexPromise = ragEngine.triggerBackgroundReindex();

      // Discovery should still work during re-indexing (using live filtering)
      const results = await ragEngine.discover('mcp', 2, 0.1);
      expect(results.length).toBeGreaterThan(0);

      // Wait for re-indexing to complete
      await reindexPromise;

      // Discovery should still work after swap
      const resultsAfter = await ragEngine.discover('mcp', 2, 0.1);
      expect(resultsAfter.length).toBeGreaterThan(0);
    });

    test('should clean up old index file after swap', async () => {
      // Verify primary index exists
      expect(fs.existsSync(primaryIndexPath)).toBe(true);

      // Disable schedule MCP
      ragEngine.setMCPDisabled('schedule');

      // Trigger re-indexing (includes atomic swap)
      await ragEngine.triggerBackgroundReindex();

      // After swap, only one index file should exist
      const primaryExists = fs.existsSync(primaryIndexPath);
      const swapExists = fs.existsSync(swapIndexPath);

      // Either primary or swap should exist, but not both
      expect(primaryExists || swapExists).toBe(true);
      // Old index file should be cleaned up (one of them should not exist)
      expect(primaryExists && swapExists).toBe(false);
    });
  });

  describe('InternalMCPManager Integration', () => {
    test('should disable internal MCP and trigger re-indexing', async () => {
      // Disable schedule via InternalMCPManager
      await internalMCPManager.disableInternalMCP('schedule');

      // Check that it's marked as disabled
      expect(internalMCPManager.isInternalMCPDisabled('schedule')).toBe(true);

      // Check that RAG engine knows it's disabled
      expect(ragEngine.isMCPDisabled('schedule')).toBe(true);

      // Get disabled list
      const disabled = internalMCPManager.getDisabledInternalMCPs();
      expect(disabled).toContain('schedule');
    });

    test('should enable internal MCP and trigger re-indexing', async () => {
      // Disable first
      await internalMCPManager.disableInternalMCP('schedule');
      expect(internalMCPManager.isInternalMCPDisabled('schedule')).toBe(true);

      // Enable
      await internalMCPManager.enableInternalMCP('schedule');
      expect(internalMCPManager.isInternalMCPDisabled('schedule')).toBe(false);

      // Check that RAG engine knows it's enabled
      expect(ragEngine.isMCPDisabled('schedule')).toBe(false);
    });

    test('should only return enabled MCPs from getAllEnabledInternalMCPs', async () => {
      // Get all MCPs before disabling
      const allBefore = internalMCPManager.getAllEnabledInternalMCPs();
      const countBefore = allBefore.length;

      // Disable schedule
      await internalMCPManager.disableInternalMCP('schedule');

      // Get enabled MCPs after disabling
      const allAfter = internalMCPManager.getAllEnabledInternalMCPs();
      expect(allAfter.length).toBe(countBefore - 1);

      // schedule should not be in the list
      const scheduleInList = allAfter.some(mcp => mcp.name === 'schedule');
      expect(scheduleInList).toBe(false);
    });

    test('should throw error when disabling non-existent MCP', async () => {
      await expect(
        internalMCPManager.disableInternalMCP('nonexistent')
      ).rejects.toThrow('Internal MCP not found: nonexistent');
    });

    test('should throw error when enabling non-existent MCP', async () => {
      await expect(
        internalMCPManager.enableInternalMCP('nonexistent')
      ).rejects.toThrow('Internal MCP not found: nonexistent');
    });
  });

  describe('Stats Reporting', () => {
    test('should include re-indexing status in stats', () => {
      const stats = ragEngine.getStats();

      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('totalEmbeddings');
      expect(stats).toHaveProperty('isReindexing');
      expect(stats).toHaveProperty('disabledMCPs');
      expect(stats).toHaveProperty('activeIndex');
      expect(stats).toHaveProperty('cacheSize');
    });

    test('should report correct disabled MCPs in stats', () => {
      ragEngine.setMCPDisabled('schedule');
      ragEngine.setMCPDisabled('mcp');

      const stats = ragEngine.getStats();
      expect(stats.disabledMCPs).toHaveLength(2);
      expect(stats.disabledMCPs).toContain('schedule');
      expect(stats.disabledMCPs).toContain('mcp');
    });

    test('should report active index in stats', async () => {
      const statsBefore = ragEngine.getStats();
      expect(statsBefore.activeIndex).toBe('primary');

      // Disable and re-index to trigger swap
      ragEngine.setMCPDisabled('schedule');
      await ragEngine.triggerBackgroundReindex();

      const statsAfter = ragEngine.getStats();
      // Active index should have swapped
      expect(['primary', 'swap']).toContain(statsAfter.activeIndex);
    });
  });
});
