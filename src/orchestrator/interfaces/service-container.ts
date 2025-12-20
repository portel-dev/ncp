/**
 * Service Container - Dependency Injection for Orchestrator Services
 *
 * Manages service lifecycle, dependencies, and provides a clean way
 * for services to access each other without tight coupling.
 */

import { logger } from '../../utils/logger.js';
import { version } from '../../utils/version.js';
import type { MCPDefinition } from '../types/connection.js';
import type { ToolInfo } from '../types/discovery.js';
import {
  TypedEventEmitter,
  type OrchestratorContext,
  type OrchestratorState,
  type MutableOrchestratorState,
  type ServiceName,
} from './orchestrator-context.js';

/**
 * Base interface for all services
 */
export interface OrchestratorService {
  /**
   * Initialize the service (async setup)
   */
  initialize?(): Promise<void>;

  /**
   * Cleanup the service (shutdown)
   */
  cleanup?(): Promise<void>;
}

/**
 * Service factory function type
 */
export type ServiceFactory<T extends OrchestratorService> = (
  context: OrchestratorContext
) => T;

/**
 * Service Container implementation
 *
 * Manages all orchestrator services with lazy initialization
 * and proper dependency injection.
 */
export class ServiceContainer implements OrchestratorContext {
  private services: Map<ServiceName, OrchestratorService> = new Map();
  private factories: Map<ServiceName, ServiceFactory<OrchestratorService>> = new Map();
  private initialized: Set<ServiceName> = new Set();

  public readonly events: TypedEventEmitter;
  public readonly profileName: string;
  public readonly clientInfo: { name: string; version: string };

  private _state: MutableOrchestratorState;

  constructor(profileName: string = 'all') {
    this.profileName = profileName;
    this.events = new TypedEventEmitter();
    this.clientInfo = { name: 'ncp-oss', version: version };

    // Initialize mutable state
    this._state = {
      definitions: new Map(),
      connections: new Map(),
      toolToMCP: new Map(),
      allTools: [],
      skillPrompts: new Map(),
    };
  }

  /**
   * Read-only view of state for services
   */
  get state(): OrchestratorState {
    return this._state as OrchestratorState;
  }

  /**
   * Get mutable state (only for StateManager)
   * @internal
   */
  getMutableState(): MutableOrchestratorState {
    return this._state;
  }

  /**
   * Register a service factory
   */
  register<T extends OrchestratorService>(
    name: ServiceName,
    factory: ServiceFactory<T>
  ): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }
    this.factories.set(name, factory as ServiceFactory<OrchestratorService>);
  }

  /**
   * Register a service instance directly (for pre-created services)
   */
  registerInstance<T extends OrchestratorService>(
    name: ServiceName,
    instance: T
  ): void {
    if (this.services.has(name) || this.factories.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }
    this.services.set(name, instance);
  }

  /**
   * Get a service by name
   * Creates the service lazily if a factory is registered
   */
  getService<T>(name: ServiceName): T {
    let service = this.services.get(name);

    if (!service) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new Error(`Service '${name}' is not registered`);
      }

      // Create service instance
      service = factory(this);
      this.services.set(name, service);
    }

    return service as T;
  }

  /**
   * Check if a service is registered
   */
  hasService(name: ServiceName): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Initialize all registered services
   */
  async initializeAll(): Promise<void> {
    for (const name of this.services.keys()) {
      await this.initializeService(name);
    }

    // Also initialize any services with factories that haven't been created yet
    for (const name of this.factories.keys()) {
      if (!this.services.has(name)) {
        this.getService(name); // Creates the service
        await this.initializeService(name);
      }
    }
  }

  /**
   * Initialize a specific service
   */
  private async initializeService(name: ServiceName): Promise<void> {
    if (this.initialized.has(name)) {
      return;
    }

    const service = this.services.get(name);
    if (service?.initialize) {
      logger.debug(`Initializing service: ${name}`);
      await service.initialize();
    }

    this.initialized.add(name);
  }

  /**
   * Cleanup all services in reverse order
   */
  async cleanup(): Promise<void> {
    const serviceNames = Array.from(this.services.keys()).reverse();

    for (const name of serviceNames) {
      const service = this.services.get(name);
      if (service?.cleanup) {
        try {
          logger.debug(`Cleaning up service: ${name}`);
          await service.cleanup();
        } catch (error) {
          logger.error(`Error cleaning up service ${name}: ${error}`);
        }
      }
    }

    this.services.clear();
    this.factories.clear();
    this.initialized.clear();
  }

  /**
   * Update state - convenience methods for StateManager
   * These should only be called by StateManager
   * @internal
   */
  setDefinition(name: string, definition: MCPDefinition): void {
    this._state.definitions.set(name, definition);
  }

  removeDefinition(name: string): void {
    this._state.definitions.delete(name);
  }

  addToolMapping(toolName: string, mcpName: string): void {
    this._state.toolToMCP.set(toolName, mcpName);
  }

  removeToolMapping(toolName: string): void {
    this._state.toolToMCP.delete(toolName);
  }

  addTool(tool: ToolInfo): void {
    this._state.allTools.push(tool);
  }

  removeTool(toolName: string, mcpName: string): void {
    const index = this._state.allTools.findIndex(
      (t) => t.name === toolName && t.mcpName === mcpName
    );
    if (index !== -1) {
      this._state.allTools.splice(index, 1);
    }
  }

  setAllTools(tools: ToolInfo[]): void {
    this._state.allTools = tools;
  }

  setSkillPrompt(name: string, prompt: unknown): void {
    this._state.skillPrompts.set(name, prompt);
  }

  removeSkillPrompt(name: string): void {
    this._state.skillPrompts.delete(name);
  }
}
