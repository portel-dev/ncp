/**
 * Internal MCP Manager - Index Management Tests
 *
 * Tests for disable/enable functionality and smart re-indexing integration
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { InternalMCPManager } from '../../src/internal-mcps/internal-mcp-manager.js';

describe('InternalMCPManager - Index Management', () => {
  let manager: InternalMCPManager;
  let mockRAGEngine: any;

  beforeEach(() => {
    manager = new InternalMCPManager();

    // Create mock RAG engine
    mockRAGEngine = {
      setMCPDisabled: jest.fn(),
      setMCPEnabled: jest.fn(),
      triggerBackgroundReindex: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void)
    };

    manager.setRAGEngine(mockRAGEngine);
  });

  describe('disableInternalMCP', () => {
    test('should disable an internal MCP', async () => {
      await manager.disableInternalMCP('schedule');

      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);
    });

    test('should mark MCP as disabled in RAG engine', async () => {
      await manager.disableInternalMCP('schedule');

      expect(mockRAGEngine.setMCPDisabled).toHaveBeenCalledWith('schedule');
    });

    test('should trigger background re-indexing', async () => {
      await manager.disableInternalMCP('schedule');

      expect(mockRAGEngine.triggerBackgroundReindex).toHaveBeenCalled();
    });

    test('should throw error for unknown MCP', async () => {
      await expect(
        manager.disableInternalMCP('unknown-mcp')
      ).rejects.toThrow('Internal MCP not found: unknown-mcp');
    });

    test('should warn if MCP already disabled', async () => {
      await manager.disableInternalMCP('schedule');

      // Disabling again should not throw but warn
      await manager.disableInternalMCP('schedule');

      // Should only trigger re-index once
      expect(mockRAGEngine.triggerBackgroundReindex).toHaveBeenCalledTimes(1);
    });

    test('should handle multiple MCPs being disabled', async () => {
      await manager.disableInternalMCP('schedule');
      await manager.disableInternalMCP('mcp');

      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);
      expect(manager.isInternalMCPDisabled('mcp')).toBe(true);

      const disabledList = manager.getDisabledInternalMCPs();
      expect(disabledList).toContain('schedule');
      expect(disabledList).toContain('mcp');
    });
  });

  describe('enableInternalMCP', () => {
    test('should enable a disabled MCP', async () => {
      // First disable it
      await manager.disableInternalMCP('schedule');
      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);

      // Then enable it
      await manager.enableInternalMCP('schedule');
      expect(manager.isInternalMCPDisabled('schedule')).toBe(false);
    });

    test('should mark MCP as enabled in RAG engine', async () => {
      await manager.disableInternalMCP('schedule');
      jest.clearAllMocks();

      await manager.enableInternalMCP('schedule');

      expect(mockRAGEngine.setMCPEnabled).toHaveBeenCalledWith('schedule');
    });

    test('should trigger background re-indexing', async () => {
      await manager.disableInternalMCP('schedule');
      jest.clearAllMocks();

      await manager.enableInternalMCP('schedule');

      expect(mockRAGEngine.triggerBackgroundReindex).toHaveBeenCalled();
    });

    test('should throw error for unknown MCP', async () => {
      await expect(
        manager.enableInternalMCP('unknown-mcp')
      ).rejects.toThrow('Internal MCP not found: unknown-mcp');
    });

    test('should warn if MCP already enabled', async () => {
      // Enable without disabling first
      await manager.enableInternalMCP('schedule');

      // Should not trigger re-index for already enabled MCP
      expect(mockRAGEngine.triggerBackgroundReindex).not.toHaveBeenCalled();
    });
  });

  describe('getDisabledInternalMCPs', () => {
    test('should return empty array when no MCPs disabled', () => {
      const disabled = manager.getDisabledInternalMCPs();
      expect(disabled).toEqual([]);
    });

    test('should return list of disabled MCPs', async () => {
      await manager.disableInternalMCP('schedule');
      await manager.disableInternalMCP('mcp');

      const disabled = manager.getDisabledInternalMCPs();
      expect(disabled).toHaveLength(2);
      expect(disabled).toContain('schedule');
      expect(disabled).toContain('mcp');
    });

    test('should update after enabling MCP', async () => {
      await manager.disableInternalMCP('schedule');
      await manager.disableInternalMCP('mcp');

      await manager.enableInternalMCP('schedule');

      const disabled = manager.getDisabledInternalMCPs();
      expect(disabled).toHaveLength(1);
      expect(disabled).toContain('mcp');
      expect(disabled).not.toContain('schedule');
    });
  });

  describe('getAllEnabledInternalMCPs', () => {
    test('should return all internal MCPs when none disabled', () => {
      const enabled = manager.getAllEnabledInternalMCPs();

      // Should have 2 internal MCPs by default (mcp, schedule)
      expect(enabled.length).toBeGreaterThanOrEqual(2);

      const names = enabled.map(m => m.name);
      expect(names).toContain('mcp');
      expect(names).toContain('schedule');
    });

    test('should exclude disabled MCPs', async () => {
      await manager.disableInternalMCP('schedule');

      const enabled = manager.getAllEnabledInternalMCPs();
      const names = enabled.map(m => m.name);

      expect(names).toContain('mcp');
      expect(names).not.toContain('schedule');
    });

    test('should update when MCP is re-enabled', async () => {
      await manager.disableInternalMCP('schedule');
      await manager.enableInternalMCP('schedule');

      const enabled = manager.getAllEnabledInternalMCPs();
      const names = enabled.map(m => m.name);

      expect(names).toContain('schedule');
    });
  });

  describe('isInternalMCPDisabled', () => {
    test('should return false for enabled MCP', () => {
      expect(manager.isInternalMCPDisabled('schedule')).toBe(false);
    });

    test('should return true for disabled MCP', async () => {
      await manager.disableInternalMCP('schedule');
      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);
    });

    test('should return false for unknown MCP', () => {
      expect(manager.isInternalMCPDisabled('unknown')).toBe(false);
    });
  });

  describe('RAG engine integration', () => {
    test('should work without RAG engine set', async () => {
      const managerNoRAG = new InternalMCPManager();

      // Should not throw, just skip RAG operations
      await managerNoRAG.disableInternalMCP('schedule');

      expect(managerNoRAG.isInternalMCPDisabled('schedule')).toBe(true);
    });

    test('should trigger re-indexing in correct order', async () => {
      const callOrder: string[] = [];

      mockRAGEngine.setMCPDisabled.mockImplementation(() => {
        callOrder.push('setDisabled');
      });
      mockRAGEngine.triggerBackgroundReindex.mockImplementation(() => {
        callOrder.push('reindex');
        return Promise.resolve();
      });

      await manager.disableInternalMCP('schedule');

      expect(callOrder).toEqual(['setDisabled', 'reindex']);
    });
  });

  describe('disable/enable scenarios', () => {
    test('should handle toggle sequence', async () => {
      // Disable
      await manager.disableInternalMCP('schedule');
      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);
      expect(mockRAGEngine.triggerBackgroundReindex).toHaveBeenCalledTimes(1);

      // Enable
      await manager.enableInternalMCP('schedule');
      expect(manager.isInternalMCPDisabled('schedule')).toBe(false);
      expect(mockRAGEngine.triggerBackgroundReindex).toHaveBeenCalledTimes(2);

      // Disable again
      await manager.disableInternalMCP('schedule');
      expect(manager.isInternalMCPDisabled('schedule')).toBe(true);
      expect(mockRAGEngine.triggerBackgroundReindex).toHaveBeenCalledTimes(3);
    });

    test('should maintain state across multiple operations', async () => {
      await manager.disableInternalMCP('schedule');
      await manager.disableInternalMCP('mcp');

      expect(manager.getDisabledInternalMCPs()).toHaveLength(2);

      await manager.enableInternalMCP('schedule');

      expect(manager.getDisabledInternalMCPs()).toHaveLength(1);
      expect(manager.getDisabledInternalMCPs()).toContain('mcp');
    });
  });
});
