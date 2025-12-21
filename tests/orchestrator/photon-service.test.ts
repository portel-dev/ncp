/**
 * Tests for PhotonService
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  PhotonService,
  createPhotonService,
} from '../../src/orchestrator/services/photon-service.js';
import type { OrchestratorContext } from '../../src/orchestrator/interfaces/orchestrator-context.js';
import type { ToolInfo } from '../../src/orchestrator/types/discovery.js';

// Mock InternalMCPManager
const createMockInternalMCPManager = () => ({
  loadPhotons: jest.fn<() => Promise<void>>(),
});

const createMockContext = (
  allTools: ToolInfo[],
  toolToMCP: Map<string, string>
): OrchestratorContext => ({
  state: {
    definitions: new Map(),
    connections: new Map(),
    toolToMCP,
    allTools,
    skillPrompts: new Map(),
  },
  events: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
  } as any,
  getService: <T>(_name: string): T => ({} as T),
  profileName: 'test',
  clientInfo: { name: 'test', version: '1.0.0' },
});

describe('PhotonService', () => {
  let photonService: PhotonService;
  let mockInternalMCPManager: ReturnType<typeof createMockInternalMCPManager>;
  let allTools: ToolInfo[];
  let toolToMCP: Map<string, string>;
  let mockContext: OrchestratorContext;

  beforeEach(() => {
    // Initialize with sample photon tools
    allTools = [
      { name: 'myPhoton:action1', description: 'Action 1', mcpName: 'myPhoton' },
      { name: 'myPhoton:action2', description: 'Action 2', mcpName: 'myPhoton' },
      { name: 'otherMCP:tool1', description: 'Other tool', mcpName: 'otherMCP' },
    ];
    toolToMCP = new Map([
      ['myPhoton:action1', 'myPhoton'],
      ['myPhoton:action2', 'myPhoton'],
      ['otherMCP:tool1', 'otherMCP'],
    ]);

    mockContext = createMockContext(allTools, toolToMCP);
    mockInternalMCPManager = createMockInternalMCPManager();

    photonService = createPhotonService(mockContext);
    photonService.setInternalMCPManager(mockInternalMCPManager);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await photonService.initialize();
      // Should not throw
    });

    it('should be idempotent', async () => {
      await photonService.initialize();
      await photonService.initialize();
      // Should not throw
    });
  });

  describe('addPhoton', () => {
    it('should call internalMCPManager.loadPhotons', async () => {
      mockInternalMCPManager.loadPhotons.mockResolvedValue(undefined);

      await photonService.addPhoton('newPhoton', '/path/to/photon');

      expect(mockInternalMCPManager.loadPhotons).toHaveBeenCalled();
    });

    it('should handle missing internalMCPManager gracefully', async () => {
      const service = createPhotonService(mockContext);
      // Don't set internalMCPManager

      // Should not throw
      await service.addPhoton('newPhoton', '/path/to/photon');
    });

    it('should handle loadPhotons errors with state rollback', async () => {
      mockInternalMCPManager.loadPhotons.mockRejectedValue(new Error('Load failed'));

      const originalToolCount = allTools.length;

      await photonService.addPhoton('newPhoton', '/path/to/photon');

      // State should be preserved (no changes)
      expect(allTools.length).toBe(originalToolCount);
    });
  });

  describe('removePhoton', () => {
    it('should remove photon tools from state', async () => {
      const originalLength = allTools.length;

      await photonService.removePhoton('myPhoton');

      // myPhoton tools should be removed
      expect(allTools.length).toBe(originalLength - 2);
      expect(allTools.find(t => t.mcpName === 'myPhoton')).toBeUndefined();
    });

    it('should remove photon from toolToMCP mappings', async () => {
      await photonService.removePhoton('myPhoton');

      expect(toolToMCP.has('myPhoton:action1')).toBe(false);
      expect(toolToMCP.has('myPhoton:action2')).toBe(false);
    });

    it('should not affect other MCPs', async () => {
      await photonService.removePhoton('myPhoton');

      // otherMCP should still exist
      expect(allTools.find(t => t.mcpName === 'otherMCP')).toBeDefined();
      expect(toolToMCP.has('otherMCP:tool1')).toBe(true);
    });

    it('should handle removing non-existent photon gracefully', async () => {
      const originalLength = allTools.length;

      await photonService.removePhoton('nonExistent');

      // No changes
      expect(allTools.length).toBe(originalLength);
    });
  });

  describe('updatePhoton', () => {
    it('should remove old and reload photons', async () => {
      mockInternalMCPManager.loadPhotons.mockResolvedValue(undefined);

      const originalLength = allTools.length;

      await photonService.updatePhoton('myPhoton', '/path/to/photon');

      // Old tools removed, loadPhotons called
      expect(mockInternalMCPManager.loadPhotons).toHaveBeenCalled();
      // myPhoton tools were removed (loadPhotons would add new ones in real scenario)
      expect(allTools.filter(t => t.mcpName === 'myPhoton').length).toBe(0);
    });

    it('should handle errors with state rollback', async () => {
      mockInternalMCPManager.loadPhotons.mockRejectedValue(new Error('Update failed'));

      const originalTools = [...allTools];

      await photonService.updatePhoton('myPhoton', '/path/to/photon');

      // State should be restored
      expect(allTools.length).toBe(originalTools.length);
    });
  });

  describe('getPhotonTools', () => {
    it('should return tools for a specific photon', () => {
      const tools = photonService.getPhotonTools('myPhoton');

      expect(tools.length).toBe(2);
      expect(tools.every(t => t.mcpName === 'myPhoton')).toBe(true);
    });

    it('should return empty array for unknown photon', () => {
      const tools = photonService.getPhotonTools('unknown');

      expect(tools.length).toBe(0);
    });
  });

  describe('locking', () => {
    it('should serialize concurrent operations on same photon', async () => {
      mockInternalMCPManager.loadPhotons.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const operations: number[] = [];

      const op1 = photonService.addPhoton('testPhoton', '/path1').then(() => operations.push(1));
      const op2 = photonService.addPhoton('testPhoton', '/path2').then(() => operations.push(2));

      await Promise.all([op1, op2]);

      // Operations should complete in order (serialized)
      expect(operations).toEqual([1, 2]);
    });

    it('should allow concurrent operations on different photons', async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockInternalMCPManager.loadPhotons.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise(resolve => setTimeout(resolve, 30));
        concurrentCalls--;
      });

      await Promise.all([
        photonService.addPhoton('photon1', '/path1'),
        photonService.addPhoton('photon2', '/path2'),
      ]);

      // Both should run concurrently
      expect(maxConcurrent).toBe(2);
    });
  });

  describe('state backup and restore', () => {
    it('should restore state on error during addPhoton', async () => {
      mockInternalMCPManager.loadPhotons.mockRejectedValue(new Error('Failed'));

      const originalToolCount = allTools.length;
      const originalMappingCount = toolToMCP.size;

      await photonService.addPhoton('newPhoton', '/path');

      expect(allTools.length).toBe(originalToolCount);
      expect(toolToMCP.size).toBe(originalMappingCount);
    });

    it('should restore state on error during removePhoton', async () => {
      // Simulate error by modifying the mock context to throw
      const errorContext = createMockContext(allTools, toolToMCP);
      const errorService = createPhotonService(errorContext);

      // Mock the state to cause an error
      Object.defineProperty(errorContext.state, 'allTools', {
        get: () => { throw new Error('Access denied'); },
      });

      // This should handle the error gracefully
      try {
        await errorService.removePhoton('myPhoton');
      } catch {
        // Error expected
      }
    });
  });

  describe('cleanup', () => {
    it('should cleanup without error', async () => {
      await photonService.cleanup();
      // Should not throw
    });

    it('should clear locks and queues', async () => {
      // Start an operation that will queue
      mockInternalMCPManager.loadPhotons.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const op = photonService.addPhoton('test', '/path');

      // Cleanup while operation is pending
      await photonService.cleanup();

      // Wait for operation to complete
      await op;
    });
  });

  describe('factory function', () => {
    it('should create PhotonService instance', () => {
      const service = createPhotonService(mockContext);

      expect(service).toBeInstanceOf(PhotonService);
    });
  });
});
