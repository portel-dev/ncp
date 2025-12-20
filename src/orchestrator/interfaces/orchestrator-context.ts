/**
 * Orchestrator Context - Shared state and service access for all services
 *
 * This interface provides a clean abstraction for services to access
 * shared state without tight coupling to the orchestrator.
 */

import { EventEmitter } from 'events';
import type { MCPDefinition, ToolDefinition } from '../types/connection.js';
import type { ToolInfo } from '../types/discovery.js';

/**
 * Events emitted by the orchestrator for cross-service communication
 */
export interface OrchestratorEvents {
  'mcp:indexed': { mcpName: string; tools: ToolDefinition[] };
  'mcp:failed': { mcpName: string; error: Error };
  'mcp:connected': { mcpName: string };
  'mcp:disconnected': { mcpName: string };
  'skill:added': { skillName: string };
  'skill:removed': { skillName: string };
  'skill:updated': { skillName: string };
  'photon:loaded': { photonName: string };
  'photon:removed': { photonName: string };
  'photon:updated': { photonName: string };
  'tools:changed': { added: string[]; removed: string[] };
  'state:saved': { timestamp: number };
  'state:restored': { timestamp: number };
}

/**
 * Type-safe event emitter for orchestrator events
 */
export class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof OrchestratorEvents>(
    event: K,
    data: OrchestratorEvents[K]
  ): boolean {
    return super.emit(event, data);
  }

  on<K extends keyof OrchestratorEvents>(
    event: K,
    listener: (data: OrchestratorEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof OrchestratorEvents>(
    event: K,
    listener: (data: OrchestratorEvents[K]) => void
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof OrchestratorEvents>(
    event: K,
    listener: (data: OrchestratorEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }
}

/**
 * Service names for the service container
 */
export type ServiceName =
  | 'stateManager'
  | 'connectionPool'
  | 'toolDiscovery'
  | 'toolExecution'
  | 'skills'
  | 'photons'
  | 'cache'
  | 'indexing'
  | 'resourcePrompts';

/**
 * Read-only view of orchestrator state for services
 *
 * Services should NOT mutate this state directly - they should use
 * the appropriate service methods and events instead.
 */
export interface OrchestratorState {
  readonly definitions: Map<string, MCPDefinition>;
  readonly toolToMCP: Map<string, string>;
  readonly allTools: ToolInfo[];
  readonly skillPrompts: Map<string, unknown>;
}

/**
 * Mutable state that can be updated by the StateManager
 * Only StateManager should have access to this interface
 */
export interface MutableOrchestratorState {
  definitions: Map<string, MCPDefinition>;
  toolToMCP: Map<string, string>;
  allTools: ToolInfo[];
  skillPrompts: Map<string, unknown>;
}

/**
 * Orchestrator context passed to all services
 *
 * Provides access to:
 * - Read-only state views
 * - Event emitter for cross-service communication
 * - Service locator for accessing other services
 */
export interface OrchestratorContext {
  /**
   * Read-only view of the current state
   */
  readonly state: OrchestratorState;

  /**
   * Event emitter for cross-service communication
   */
  readonly events: TypedEventEmitter;

  /**
   * Get a service by name
   */
  getService<T>(name: ServiceName): T;

  /**
   * Profile name being used
   */
  readonly profileName: string;

  /**
   * Client info for MCP connections
   */
  readonly clientInfo: { name: string; version: string };
}

/**
 * Interface for services that need to update shared state
 * Only StateManager implements this fully
 */
export interface StateUpdater {
  /**
   * Update definitions map
   */
  setDefinition(name: string, definition: MCPDefinition): void;

  /**
   * Remove a definition
   */
  removeDefinition(name: string): void;

  /**
   * Add a tool mapping
   */
  addToolMapping(toolName: string, mcpName: string): void;

  /**
   * Remove a tool mapping
   */
  removeToolMapping(toolName: string): void;

  /**
   * Add a tool to allTools
   */
  addTool(tool: ToolInfo): void;

  /**
   * Remove a tool from allTools
   */
  removeTool(toolName: string, mcpName: string): void;

  /**
   * Set a skill prompt
   */
  setSkillPrompt(name: string, prompt: unknown): void;

  /**
   * Remove a skill prompt
   */
  removeSkillPrompt(name: string): void;
}
