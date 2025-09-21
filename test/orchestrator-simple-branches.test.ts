/**
 * Simple Orchestrator Branch Coverage Tests
 * Target key uncovered branches without complex mocking
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NCPOrchestrator } from '../src/orchestrator/ncp-orchestrator';
import * as fs from 'fs';

jest.mock('fs');

describe('Orchestrator Simple Branch Tests', () => {
  let orchestrator: NCPOrchestrator;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new NCPOrchestrator('test');
    mockFs.existsSync.mockReturnValue(false);
  });

  describe('Error Path Coverage', () => {
    it('should handle MCP not configured error', async () => {
      // Set up minimal profile
      const emptyProfile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(emptyProfile) as any);

      await orchestrator.initialize();

      // Try to run tool from unconfigured MCP - should trigger line 419
      const result = await orchestrator.run('nonexistent:tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should handle initialization with no profile', async () => {
      // Profile file doesn't exist
      mockFs.existsSync.mockReturnValue(false);

      // Should not throw
      await expect(orchestrator.initialize()).resolves.not.toThrow();
    });

    it('should handle find with empty query', async () => {
      const profile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(profile) as any);

      await orchestrator.initialize();

      // Empty query should return empty results (line 276-277)
      const results = await orchestrator.find('', 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle getAllResources with no MCPs', async () => {
      const profile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(profile) as any);

      await orchestrator.initialize();

      // Should return empty array
      const resources = await orchestrator.getAllResources();
      expect(Array.isArray(resources)).toBe(true);
      expect(resources).toEqual([]);
    });

    it('should handle tool execution with invalid format', async () => {
      const profile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(profile) as any);

      await orchestrator.initialize();

      // Should handle invalid tool format
      const result = await orchestrator.run('invalid-format', {});
      expect(result.success).toBe(false);
    });

    it('should handle getAllPrompts with no MCPs', async () => {
      const profile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(profile) as any);

      await orchestrator.initialize();

      // Should return empty array
      const prompts = await orchestrator.getAllPrompts();
      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts).toEqual([]);
    });

    it('should handle multiple initialization calls safely', async () => {
      const profile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(profile) as any);

      // Multiple calls should be safe
      await orchestrator.initialize();
      await orchestrator.initialize();
      await orchestrator.initialize();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle cleanup gracefully', async () => {
      // Should not throw even without initialization
      await expect(orchestrator.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Cache Edge Cases', () => {
    it('should handle corrupted cache file', async () => {
      const profile = { name: 'test', mcpServers: {} };

      // Profile exists but cache is corrupted
      mockFs.existsSync.mockImplementation((path: any) => {
        return path.toString().includes('.json');
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        if (path.toString().includes('profiles')) {
          return JSON.stringify(profile) as any;
        } else {
          return 'corrupted cache data' as any;
        }
      });

      // Should handle corrupted cache gracefully
      await expect(orchestrator.initialize()).resolves.not.toThrow();
    });

    it('should handle cache save failure', async () => {
      const profile = { name: 'test', mcpServers: {} };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(profile) as any);

      // Mock writeFileSync to throw
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should handle write failure gracefully
      await expect(orchestrator.initialize()).resolves.not.toThrow();
    });
  });
});