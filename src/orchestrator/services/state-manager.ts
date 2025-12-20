/**
 * State Manager Service
 *
 * Handles atomic state operations with backup/restore capability
 * and resource locking to prevent race conditions between
 * CLI operations and FileWatcher updates.
 */

import { logger } from '../../utils/logger.js';
import type { ToolInfo } from '../types/discovery.js';
import type { OrchestratorContext } from '../interfaces/orchestrator-context.js';
import type { OrchestratorService, ServiceContainer } from '../interfaces/service-container.js';

/**
 * State backup for atomic operations
 */
interface StateBackup {
  skillPrompts: Map<string, unknown>;
  allTools: ToolInfo[];
  toolToMCP: Map<string, string>;
  timestamp: number;
}

/**
 * Resource types that can be locked
 */
export type ResourceType = 'skill' | 'photon' | 'mcp';

/**
 * State Manager Service
 *
 * Provides:
 * - Atomic state operations with backup/restore
 * - Resource locking to prevent race conditions
 * - State snapshot and restoration
 */
export class StateManager implements OrchestratorService {
  private context: OrchestratorContext;
  private container: ServiceContainer;

  // State backup for rollback
  private stateBackup: StateBackup | null = null;

  // Locking mechanism
  private lockedResources: Set<string> = new Set();
  private resourceLockQueues: Map<string, Array<() => Promise<void>>> = new Map();

  constructor(context: OrchestratorContext, container: ServiceContainer) {
    this.context = context;
    this.container = container;
  }

  /**
   * Save current state for atomic operations
   * Used to enable rollback if an operation fails
   */
  saveState(): void {
    const state = this.container.getMutableState();

    this.stateBackup = {
      skillPrompts: new Map(state.skillPrompts),
      allTools: [...state.allTools],
      toolToMCP: new Map(state.toolToMCP),
      timestamp: Date.now(),
    };

    this.context.events.emit('state:saved', { timestamp: this.stateBackup.timestamp });
    logger.debug('State backup created');
  }

  /**
   * Restore previous state after a failed operation
   * Ensures consistency if skill/photon update fails
   */
  restoreState(): void {
    if (!this.stateBackup) {
      logger.warn('No state backup available for rollback');
      return;
    }

    const state = this.container.getMutableState();

    // Restore state
    state.skillPrompts = this.stateBackup.skillPrompts;
    state.allTools = this.stateBackup.allTools;
    state.toolToMCP = this.stateBackup.toolToMCP;

    const timestamp = this.stateBackup.timestamp;
    this.stateBackup = null;

    this.context.events.emit('state:restored', { timestamp });
    logger.info('State restored - previous version recovered from backup');
  }

  /**
   * Clear the state backup after successful operation
   */
  clearStateBackup(): void {
    this.stateBackup = null;
  }

  /**
   * Check if there's a pending state backup
   */
  hasStateBackup(): boolean {
    return this.stateBackup !== null;
  }

  /**
   * Get the timestamp of the current backup (if any)
   */
  getBackupTimestamp(): number | null {
    return this.stateBackup?.timestamp ?? null;
  }

  /**
   * Acquire lock for a resource to prevent conflicts
   *
   * Returns immediately if resource is not locked.
   * Queues operation if resource is currently locked.
   *
   * @param resourceType - Type of resource (skill, photon, mcp)
   * @param resourceName - Name of the specific resource
   */
  async acquireLock(resourceType: ResourceType, resourceName: string): Promise<void> {
    const lockKey = `${resourceType}:${resourceName}`;

    if (this.lockedResources.has(lockKey)) {
      // Resource is locked, queue this operation
      logger.debug(`Conflict detected: ${lockKey} is being modified, queuing operation...`);

      return new Promise((resolve) => {
        const queue = this.resourceLockQueues.get(lockKey) || [];
        queue.push(async () => {
          // Wait for lock to be released
          while (this.lockedResources.has(lockKey)) {
            await new Promise((r) => setTimeout(r, 50));
          }
          resolve();
        });
        this.resourceLockQueues.set(lockKey, queue);
      });
    } else {
      // Acquire the lock
      this.lockedResources.add(lockKey);
      logger.debug(`Lock acquired: ${lockKey}`);
    }
  }

  /**
   * Release lock for a resource and process any queued operations
   *
   * @param resourceType - Type of resource (skill, photon, mcp)
   * @param resourceName - Name of the specific resource
   */
  releaseLock(resourceType: ResourceType, resourceName: string): void {
    const lockKey = `${resourceType}:${resourceName}`;

    if (this.lockedResources.has(lockKey)) {
      this.lockedResources.delete(lockKey);
      logger.debug(`Released lock: ${lockKey}`);

      // Process queued operations
      const queue = this.resourceLockQueues.get(lockKey);
      if (queue && queue.length > 0) {
        logger.debug(`Processing ${queue.length} queued operation(s) for ${lockKey}`);
        const nextOp = queue.shift();
        if (nextOp) {
          nextOp().catch((error) => {
            logger.error(`Queued operation failed: ${error.message}`);
          });
        }
      }
    }
  }

  /**
   * Check if a resource is currently locked
   */
  isLocked(resourceType: ResourceType, resourceName: string): boolean {
    const lockKey = `${resourceType}:${resourceName}`;
    return this.lockedResources.has(lockKey);
  }

  /**
   * Get count of queued operations for a resource
   */
  getQueuedOperationsCount(resourceType: ResourceType, resourceName: string): number {
    const lockKey = `${resourceType}:${resourceName}`;
    const queue = this.resourceLockQueues.get(lockKey);
    return queue?.length ?? 0;
  }

  /**
   * Execute an operation atomically with automatic rollback on failure
   *
   * @param resourceType - Type of resource being modified
   * @param resourceName - Name of the specific resource
   * @param operation - Async operation to execute
   * @returns Result of the operation
   */
  async executeAtomic<T>(
    resourceType: ResourceType,
    resourceName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    await this.acquireLock(resourceType, resourceName);

    try {
      this.saveState();

      const result = await operation();

      this.clearStateBackup();
      return result;
    } catch (error) {
      this.restoreState();
      throw error;
    } finally {
      this.releaseLock(resourceType, resourceName);
    }
  }

  /**
   * Cleanup - release all locks and clear queues
   */
  async cleanup(): Promise<void> {
    // Clear all locks
    this.lockedResources.clear();

    // Clear all queues
    this.resourceLockQueues.clear();

    // Clear backup
    this.stateBackup = null;

    logger.debug('StateManager cleaned up');
  }
}

/**
 * Factory function for creating StateManager
 */
export function createStateManager(
  context: OrchestratorContext,
  container: ServiceContainer
): StateManager {
  return new StateManager(context, container);
}
