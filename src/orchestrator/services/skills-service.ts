/**
 * Skills Service
 *
 * Manages Anthropic Agent Skills lifecycle:
 * - Dynamic skill loading and unloading
 * - Atomic updates with state rollback
 * - Discovery engine indexing
 * - Tool registry management
 */

import * as path from 'path';
import { logger } from '../../utils/logger.js';
import type { OrchestratorContext } from '../interfaces/orchestrator-context.js';
import type { OrchestratorService } from '../interfaces/service-container.js';
import type { ToolInfo } from '../types/discovery.js';

/**
 * Skill metadata structure
 */
export interface SkillMetadata {
  name: string;
  description?: string;
  version?: string;
  author?: string;
}

/**
 * Loaded skill structure
 */
export interface LoadedSkill {
  metadata: SkillMetadata;
  prompt?: string;
  tools?: any[];
}

/**
 * Skills manager interface (external dependency)
 */
export interface SkillsManager {
  loadSkill(skillDirName: string): Promise<LoadedSkill | null>;
  getSkillsDirectory(): string;
}

/**
 * Discovery engine interface for skill indexing
 */
export interface DiscoveryEngine {
  indexMCPTools(mcpName: string, tools: Array<{ id: string; name: string; description: string }>): Promise<void>;
}

/**
 * State snapshot for atomic operations
 */
interface SkillsStateSnapshot {
  skillPrompts: Map<string, LoadedSkill>;
  allTools: ToolInfo[];
  toolToMCP: Map<string, string>;
}

/**
 * Skills Service implementation
 */
export class SkillsService implements OrchestratorService {
  private context: OrchestratorContext;
  private skillsManager: SkillsManager | null = null;
  private discovery: DiscoveryEngine | null = null;
  private initialized: boolean = false;

  // State for atomic operations
  private stateBackup: SkillsStateSnapshot | null = null;

  // Locking for concurrent modification prevention
  private lockedSkills: Set<string> = new Set();
  private lockQueues: Map<string, Array<() => void>> = new Map();

  constructor(context: OrchestratorContext) {
    this.context = context;
  }

  /**
   * Initialize the service with dependencies
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    logger.debug('SkillsService initialized');
  }

  /**
   * Set the skills manager (injected from orchestrator)
   */
  setSkillsManager(manager: SkillsManager): void {
    this.skillsManager = manager;
  }

  /**
   * Set the discovery engine (injected from orchestrator)
   */
  setDiscoveryEngine(engine: DiscoveryEngine): void {
    this.discovery = engine;
  }

  /**
   * Add a new skill dynamically
   */
  async addSkill(skillName: string, skillPath: string): Promise<void> {
    await this.acquireLock(skillName);

    try {
      this.saveState();

      if (!this.skillsManager) {
        logger.warn('SkillsManager not available');
        this.restoreState();
        return;
      }

      // Load the skill
      const skill = await this.skillsManager.loadSkill(
        path.basename(path.dirname(skillPath))
      );

      if (!skill) {
        logger.warn(`Failed to load skill: ${skillName}`);
        this.restoreState();
        return;
      }

      // Update state
      this.addSkillToState(skill);

      // Index in discovery
      await this.indexSkill(skill);

      this.clearStateBackup();
      logger.info(`✨ Dynamically added skill: ${skill.metadata.name}`);
    } catch (error: any) {
      this.restoreState();
      logger.error(`❌ Failed to add skill ${skillName}: ${error.message}`);
    } finally {
      this.releaseLock(skillName);
    }
  }

  /**
   * Remove a skill dynamically
   */
  async removeSkill(skillName: string): Promise<void> {
    await this.acquireLock(skillName);

    try {
      this.saveState();

      // Remove from state
      this.removeSkillFromState(skillName);

      this.clearStateBackup();
      logger.info(`✨ Dynamically removed skill: ${skillName}`);
    } catch (error: any) {
      this.restoreState();
      logger.error(`❌ Failed to remove skill ${skillName}: ${error.message}`);
    } finally {
      this.releaseLock(skillName);
    }
  }

  /**
   * Update a skill dynamically
   */
  async updateSkill(skillName: string, skillPath: string): Promise<void> {
    await this.acquireLock(skillName);

    try {
      this.saveState();

      // Remove old version
      this.removeSkillFromState(skillName);

      // Load new version
      if (!this.skillsManager) {
        logger.warn('SkillsManager not available');
        this.restoreState();
        return;
      }

      const skill = await this.skillsManager.loadSkill(
        path.basename(path.dirname(skillPath))
      );

      if (!skill) {
        logger.warn(`Failed to load updated skill: ${skillName}`);
        this.restoreState();
        return;
      }

      // Add new version to state
      this.addSkillToState(skill);

      // Index in discovery
      await this.indexSkill(skill);

      this.clearStateBackup();
      logger.info(`🔄 Updated skill: ${skillName}`);
    } catch (error: any) {
      this.restoreState();
      logger.error(`❌ Failed to update skill ${skillName}: ${error.message}`);
    } finally {
      this.releaseLock(skillName);
    }
  }

  /**
   * Get all loaded skills
   */
  getLoadedSkills(): Map<string, LoadedSkill> {
    return this.context.state.skillPrompts as Map<string, LoadedSkill>;
  }

  /**
   * Check if a skill is loaded
   */
  hasSkill(skillName: string): boolean {
    return this.context.state.skillPrompts.has(skillName);
  }

  /**
   * Get a specific skill
   */
  getSkill(skillName: string): LoadedSkill | undefined {
    return this.context.state.skillPrompts.get(skillName) as LoadedSkill | undefined;
  }

  // ========== Private Methods ==========

  /**
   * Add skill to orchestrator state
   */
  private addSkillToState(skill: LoadedSkill): void {
    const state = this.getMutableState();
    const skillToolName = `skill:${skill.metadata.name}`;

    // Add to skillPrompts
    state.skillPrompts.set(skill.metadata.name, skill);

    // Add to allTools
    state.allTools.push({
      name: skillToolName,
      description: skill.metadata.description || 'Anthropic Agent Skill',
      mcpName: '__skills__',
    });

    // Add to toolToMCP mappings
    state.toolToMCP.set(skillToolName, '__skills__');
    state.toolToMCP.set(`skill.${skill.metadata.name}`, '__skills__');
    state.toolToMCP.set(skill.metadata.name, '__skills__');
  }

  /**
   * Remove skill from orchestrator state
   */
  private removeSkillFromState(skillName: string): void {
    const state = this.getMutableState();
    const skillToolName = `skill:${skillName}`;

    // Remove from skillPrompts
    state.skillPrompts.delete(skillName);

    // Remove from allTools
    const index = state.allTools.findIndex((t) => t.name === skillToolName);
    if (index >= 0) {
      state.allTools.splice(index, 1);
    }

    // Remove from toolToMCP
    state.toolToMCP.delete(skillToolName);
    state.toolToMCP.delete(`skill.${skillName}`);
    state.toolToMCP.delete(skillName);
  }

  /**
   * Index skill in discovery engine
   */
  private async indexSkill(skill: LoadedSkill): Promise<void> {
    if (!this.discovery) return;

    await this.discovery.indexMCPTools('skill', [
      {
        id: `skill:${skill.metadata.name}`,
        name: skill.metadata.name,
        description: skill.metadata.description || 'Anthropic Agent Skill',
      },
    ]);
  }

  /**
   * Get mutable state (for modifications)
   */
  private getMutableState(): {
    skillPrompts: Map<string, any>;
    allTools: ToolInfo[];
    toolToMCP: Map<string, string>;
  } {
    // Cast to mutable - service has permission to modify
    return this.context.state as any;
  }

  /**
   * Save current state for atomic operations
   */
  private saveState(): void {
    const state = this.context.state;
    this.stateBackup = {
      skillPrompts: new Map(state.skillPrompts as Map<string, LoadedSkill>),
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
    state.skillPrompts.clear();
    for (const [k, v] of this.stateBackup.skillPrompts) {
      state.skillPrompts.set(k, v);
    }
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
   * Acquire lock for a skill
   */
  private async acquireLock(skillName: string): Promise<void> {
    if (this.lockedSkills.has(skillName)) {
      logger.debug(`⏳ Skill ${skillName} is locked, queuing operation...`);

      return new Promise((resolve) => {
        const queue = this.lockQueues.get(skillName) || [];
        queue.push(resolve);
        this.lockQueues.set(skillName, queue);
      });
    }

    this.lockedSkills.add(skillName);
  }

  /**
   * Release lock for a skill
   */
  private releaseLock(skillName: string): void {
    this.lockedSkills.delete(skillName);

    // Process next queued operation if any
    const queue = this.lockQueues.get(skillName);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      this.lockedSkills.add(skillName);
      next();
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.lockedSkills.clear();
    this.lockQueues.clear();
    this.stateBackup = null;
    logger.debug('SkillsService cleaned up');
  }
}

/**
 * Create a skills service instance
 */
export function createSkillsService(
  context: OrchestratorContext
): SkillsService {
  return new SkillsService(context);
}
