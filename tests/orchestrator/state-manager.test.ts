/**
 * Tests for StateManager - Atomic state operations and locking
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StateManager } from '../../src/orchestrator/services/state-manager.js';
import { ServiceContainer } from '../../src/orchestrator/interfaces/service-container.js';

describe('StateManager', () => {
  let container: ServiceContainer;
  let stateManager: StateManager;

  beforeEach(() => {
    container = new ServiceContainer('test-profile');
    stateManager = new StateManager(container, container);
  });

  afterEach(async () => {
    await stateManager.cleanup();
  });

  describe('state backup and restore', () => {
    it('should create a state backup', () => {
      expect(stateManager.hasStateBackup()).toBe(false);

      stateManager.saveState();

      expect(stateManager.hasStateBackup()).toBe(true);
      expect(stateManager.getBackupTimestamp()).not.toBeNull();
    });

    it('should restore state from backup', () => {
      // Add some state
      container.addTool({ name: 'test-tool', description: 'Test', mcpName: 'test-mcp' });
      container.addToolMapping('test-tool', 'test-mcp');

      // Save state
      stateManager.saveState();

      // Modify state
      container.addTool({ name: 'another-tool', description: 'Another', mcpName: 'another-mcp' });

      // Verify modification
      expect(container.state.allTools.length).toBe(2);

      // Restore state
      stateManager.restoreState();

      // Verify restoration
      expect(container.state.allTools.length).toBe(1);
      expect(container.state.allTools[0].name).toBe('test-tool');
    });

    it('should clear state backup', () => {
      stateManager.saveState();
      expect(stateManager.hasStateBackup()).toBe(true);

      stateManager.clearStateBackup();
      expect(stateManager.hasStateBackup()).toBe(false);
    });

    it('should handle restore without backup gracefully', () => {
      // Should not throw
      stateManager.restoreState();
      expect(stateManager.hasStateBackup()).toBe(false);
    });

    it('should emit events on save and restore', () => {
      const savedEvents: number[] = [];
      const restoredEvents: number[] = [];

      container.events.on('state:saved', (data) => savedEvents.push(data.timestamp));
      container.events.on('state:restored', (data) => restoredEvents.push(data.timestamp));

      stateManager.saveState();
      expect(savedEvents.length).toBe(1);

      stateManager.restoreState();
      expect(restoredEvents.length).toBe(1);
    });
  });

  describe('resource locking', () => {
    it('should acquire lock for a resource', async () => {
      expect(stateManager.isLocked('skill', 'test-skill')).toBe(false);

      await stateManager.acquireLock('skill', 'test-skill');

      expect(stateManager.isLocked('skill', 'test-skill')).toBe(true);
    });

    it('should release lock for a resource', async () => {
      await stateManager.acquireLock('skill', 'test-skill');
      expect(stateManager.isLocked('skill', 'test-skill')).toBe(true);

      stateManager.releaseLock('skill', 'test-skill');
      expect(stateManager.isLocked('skill', 'test-skill')).toBe(false);
    });

    it('should queue operations when resource is locked', async () => {
      await stateManager.acquireLock('skill', 'test-skill');

      const operationOrder: number[] = [];

      // Start a second acquire that will be queued
      const secondAcquire = stateManager.acquireLock('skill', 'test-skill').then(() => {
        operationOrder.push(2);
      });

      // First operation completes
      operationOrder.push(1);

      // Release the lock
      stateManager.releaseLock('skill', 'test-skill');

      // Wait for queued operation
      await secondAcquire;

      expect(operationOrder).toEqual([1, 2]);
    });

    it('should handle different resource types independently', async () => {
      await stateManager.acquireLock('skill', 'test');
      await stateManager.acquireLock('photon', 'test');

      expect(stateManager.isLocked('skill', 'test')).toBe(true);
      expect(stateManager.isLocked('photon', 'test')).toBe(true);

      stateManager.releaseLock('skill', 'test');

      expect(stateManager.isLocked('skill', 'test')).toBe(false);
      expect(stateManager.isLocked('photon', 'test')).toBe(true);
    });

    it('should track queued operations count', async () => {
      await stateManager.acquireLock('skill', 'test');

      expect(stateManager.getQueuedOperationsCount('skill', 'test')).toBe(0);

      // Queue an operation
      const queuedOp = stateManager.acquireLock('skill', 'test');

      // Give it a moment to queue
      await new Promise((r) => setTimeout(r, 10));

      expect(stateManager.getQueuedOperationsCount('skill', 'test')).toBe(1);

      stateManager.releaseLock('skill', 'test');
      await queuedOp;
    });
  });

  describe('atomic execution', () => {
    it('should execute operation atomically', async () => {
      const result = await stateManager.executeAtomic('skill', 'test', async () => {
        container.addTool({ name: 'atomic-tool', description: 'Test', mcpName: 'test' });
        return 'success';
      });

      expect(result).toBe('success');
      expect(container.state.allTools.length).toBe(1);
      expect(stateManager.hasStateBackup()).toBe(false);
    });

    it('should rollback on failure', async () => {
      container.addTool({ name: 'original-tool', description: 'Original', mcpName: 'test' });

      try {
        await stateManager.executeAtomic('skill', 'test', async () => {
          container.addTool({ name: 'failing-tool', description: 'Will fail', mcpName: 'test' });
          throw new Error('Operation failed');
        });
      } catch (error) {
        // Expected
      }

      // State should be rolled back
      expect(container.state.allTools.length).toBe(1);
      expect(container.state.allTools[0].name).toBe('original-tool');
    });

    it('should release lock after atomic operation', async () => {
      await stateManager.executeAtomic('skill', 'test', async () => {
        return 'done';
      });

      expect(stateManager.isLocked('skill', 'test')).toBe(false);
    });

    it('should release lock even on failure', async () => {
      try {
        await stateManager.executeAtomic('skill', 'test', async () => {
          throw new Error('Failure');
        });
      } catch {
        // Expected
      }

      expect(stateManager.isLocked('skill', 'test')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clear all locks on cleanup', async () => {
      await stateManager.acquireLock('skill', 'skill1');
      await stateManager.acquireLock('photon', 'photon1');

      await stateManager.cleanup();

      expect(stateManager.isLocked('skill', 'skill1')).toBe(false);
      expect(stateManager.isLocked('photon', 'photon1')).toBe(false);
    });

    it('should clear state backup on cleanup', async () => {
      stateManager.saveState();
      expect(stateManager.hasStateBackup()).toBe(true);

      await stateManager.cleanup();

      expect(stateManager.hasStateBackup()).toBe(false);
    });
  });
});
