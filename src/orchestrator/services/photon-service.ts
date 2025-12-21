/**
 * Photon Service
 *
 * Manages Photon lifecycle (TypeScript-based MCPs):
 * - Dynamic photon loading and unloading
 * - Atomic updates with state rollback
 * - Tool registry management
 */

import { logger } from '../../utils/logger.js';
import type { OrchestratorContext } from '../interfaces/orchestrator-context.js';
import type { OrchestratorService } from '../interfaces/service-container.js';
import type { ToolInfo } from '../types/discovery.js';

/**
 * Internal MCP Manager interface (external dependency)
 */
export interface InternalMCPManager {
  loadPhotons(): Promise<void>;
}

/**
 * State snapshot for atomic operations
 */
interface PhotonStateSnapshot {
  allTools: ToolInfo[];
  toolToMCP: Map<string, string>;
}

/**
 * Photon Service implementation
 */
export class PhotonService implements OrchestratorService {
  private context: OrchestratorContext;
  private internalMCPManager: InternalMCPManager | null = null;
  private initialized: boolean = false;

  // State for atomic operations
  private stateBackup: PhotonStateSnapshot | null = null;

  // Locking for concurrent modification prevention
  private lockedPhotons: Set<string> = new Set();
  private lockQueues: Map<string, Array<() => void>> = new Map();

  constructor(context: OrchestratorContext) {
    this.context = context;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    logger.debug('PhotonService initialized');
  }

  /**
   * Set the internal MCP manager (injected from orchestrator)
   */
  setInternalMCPManager(manager: InternalMCPManager): void {
    this.internalMCPManager = manager;
  }

  /**
   * Add a new photon dynamically
   */
  async addPhoton(photonName: string, _photonPath: string): Promise<void> {
    await this.acquireLock(photonName);

    try {
      this.saveState();

      if (!this.internalMCPManager) {
        logger.warn('InternalMCPManager not available');
        this.restoreState();
        return;
      }

      // Reload all photons to pick up the new one
      await this.internalMCPManager.loadPhotons();

      this.clearStateBackup();
      logger.info(`✨ Dynamically added photon: ${photonName}`);
    } catch (error: any) {
      this.restoreState();
      logger.error(`❌ Failed to add photon ${photonName}: ${error.message}`);
    } finally {
      this.releaseLock(photonName);
    }
  }

  /**
   * Remove a photon dynamically
   */
  async removePhoton(photonName: string): Promise<void> {
    await this.acquireLock(photonName);

    try {
      this.saveState();

      // Remove photon tools from state
      this.removePhotonFromState(photonName);

      this.clearStateBackup();
      logger.info(`✨ Dynamically removed photon: ${photonName}`);
    } catch (error: any) {
      this.restoreState();
      logger.error(`❌ Failed to remove photon ${photonName}: ${error.message}`);
    } finally {
      this.releaseLock(photonName);
    }
  }

  /**
   * Update a photon dynamically
   */
  async updatePhoton(photonName: string, _photonPath: string): Promise<void> {
    await this.acquireLock(photonName);

    try {
      this.saveState();

      // Remove old version
      this.removePhotonFromState(photonName);

      // Reload all photons to pick up changes
      if (this.internalMCPManager) {
        await this.internalMCPManager.loadPhotons();
      }

      this.clearStateBackup();
      logger.info(`🔄 Updated photon: ${photonName}`);
    } catch (error: any) {
      this.restoreState();
      logger.error(`❌ Failed to update photon ${photonName}: ${error.message}`);
    } finally {
      this.releaseLock(photonName);
    }
  }

  /**
   * Get photon tools by name
   */
  getPhotonTools(photonName: string): ToolInfo[] {
    return this.context.state.allTools.filter(t => t.mcpName === photonName);
  }

  // ========== Private Methods ==========

  /**
   * Remove photon tools from state
   */
  private removePhotonFromState(photonName: string): void {
    const state = this.getMutableState();

    // Find and remove all tools belonging to this photon
    const photonTools = state.allTools.filter(t => t.mcpName === photonName);

    for (const tool of photonTools) {
      const idx = state.allTools.indexOf(tool);
      if (idx > -1) {
        state.allTools.splice(idx, 1);
      }
      state.toolToMCP.delete(tool.name);
    }
  }

  /**
   * Get mutable state (for modifications)
   */
  private getMutableState(): {
    allTools: ToolInfo[];
    toolToMCP: Map<string, string>;
  } {
    return this.context.state as any;
  }

  /**
   * Save current state for atomic operations
   */
  private saveState(): void {
    const state = this.context.state;
    this.stateBackup = {
      allTools: [...state.allTools],
      toolToMCP: new Map(state.toolToMCP),
    };
  }

  /**
   * Restore previous state after failure
   */
  private restoreState(): void {
    if (!this.stateBackup) {
      logger.warn('No state backup available for rollback');
      return;
    }

    const state = this.getMutableState();
    state.allTools.length = 0;
    state.allTools.push(...this.stateBackup.allTools);
    state.toolToMCP.clear();
    for (const [k, v] of this.stateBackup.toolToMCP) {
      state.toolToMCP.set(k, v);
    }
    this.stateBackup = null;

    logger.info('🔄 State restored - previous version recovered from backup');
  }

  /**
   * Clear state backup after success
   */
  private clearStateBackup(): void {
    this.stateBackup = null;
  }

  /**
   * Acquire lock for a photon
   */
  private async acquireLock(photonName: string): Promise<void> {
    if (this.lockedPhotons.has(photonName)) {
      logger.debug(`⏳ Photon ${photonName} is locked, queuing operation...`);

      return new Promise((resolve) => {
        const queue = this.lockQueues.get(photonName) || [];
        queue.push(resolve);
        this.lockQueues.set(photonName, queue);
      });
    }

    this.lockedPhotons.add(photonName);
  }

  /**
   * Release lock for a photon
   */
  private releaseLock(photonName: string): void {
    this.lockedPhotons.delete(photonName);

    // Process next queued operation if any
    const queue = this.lockQueues.get(photonName);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      this.lockedPhotons.add(photonName);
      next();
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.lockedPhotons.clear();
    this.lockQueues.clear();
    this.stateBackup = null;
    logger.debug('PhotonService cleaned up');
  }
}

/**
 * Create a photon service instance
 */
export function createPhotonService(
  context: OrchestratorContext
): PhotonService {
  return new PhotonService(context);
}
