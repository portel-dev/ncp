/**
 * Internal MCP Manager
 *
 * Manages MCPs that are implemented internally by NCP
 * These appear in tool discovery like external MCPs but are handled internally
 */

import { InternalMCP, InternalToolResult, ElicitationCapable } from './types.js';
import { NCPManagementMCP } from './ncp-management.js';
import { SchedulerMCP } from './scheduler.js';
import ProfileManager from '../profiles/profile-manager.js';
import { logger } from '../utils/logger.js';

export class InternalMCPManager {
  private internalMCPs: Map<string, InternalMCP> = new Map();
  private disabledInternalMCPs: Set<string> = new Set();
  private ragEngine: any = null; // PersistentRAGEngine instance (set via setRAGEngine)

  constructor() {
    // Register internal MCPs
    this.registerInternalMCP(new NCPManagementMCP());
    this.registerInternalMCP(new SchedulerMCP());
  }

  /**
   * Register an internal MCP
   */
  private registerInternalMCP(mcp: InternalMCP): void {
    this.internalMCPs.set(mcp.name, mcp);
    logger.debug(`Registered internal MCP: ${mcp.name}`);
  }

  /**
   * Initialize internal MCPs with ProfileManager
   */
  initialize(profileManager: ProfileManager): void {
    for (const mcp of this.internalMCPs.values()) {
      if ('setProfileManager' in mcp && typeof mcp.setProfileManager === 'function') {
        mcp.setProfileManager(profileManager);
      }
    }
  }

  /**
   * Set elicitation server for internal MCPs that support user interaction
   */
  setElicitationServer(server: ElicitationCapable): void {
    for (const mcp of this.internalMCPs.values()) {
      if (mcp.setElicitationServer) {
        mcp.setElicitationServer(server);
        logger.debug(`Set elicitation server for internal MCP: ${mcp.name}`);
      }
    }
  }

  /**
   * Get all internal MCPs for tool discovery
   */
  getAllInternalMCPs(): InternalMCP[] {
    return Array.from(this.internalMCPs.values());
  }

  /**
   * Execute a tool from an internal MCP
   * @param mcpName The internal MCP name (e.g., "mcp")
   * @param toolName The tool name (e.g., "add")
   * @param parameters Tool parameters
   */
  async executeInternalTool(
    mcpName: string,
    toolName: string,
    parameters: any
  ): Promise<InternalToolResult> {
    const mcp = this.internalMCPs.get(mcpName);

    if (!mcp) {
      return {
        success: false,
        error: `Internal MCP not found: ${mcpName}`
      };
    }

    try {
      return await mcp.executeTool(toolName, parameters);
    } catch (error: any) {
      logger.error(`Internal tool execution failed: ${mcpName}:${toolName} - ${error.message}`);
      return {
        success: false,
        error: error.message || 'Internal tool execution failed'
      };
    }
  }

  /**
   * Check if an MCP is internal
   */
  isInternalMCP(mcpName: string): boolean {
    return this.internalMCPs.has(mcpName);
  }

  /**
   * Get tool names for a specific internal MCP
   */
  getInternalMCPTools(mcpName: string): string[] {
    const mcp = this.internalMCPs.get(mcpName);
    return mcp ? mcp.tools.map(t => t.name) : [];
  }

  /**
   * Get capabilities for a specific internal MCP
   */
  getInternalMCPCapabilities(mcpName: string) {
    const mcp = this.internalMCPs.get(mcpName);
    return mcp?.capabilities || {};
  }

  /**
   * Check if an internal MCP has a specific capability
   * @param mcpName The MCP name (e.g., "scheduler")
   * @param capabilityPath Dot-notation path (e.g., "experimental.toolValidation.supported")
   */
  hasCapability(mcpName: string, capabilityPath: string): boolean {
    const mcp = this.internalMCPs.get(mcpName);
    if (!mcp || !mcp.capabilities) {
      return false;
    }

    // Navigate the capability path
    const parts = capabilityPath.split('.');
    let current: any = mcp.capabilities;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return false;
      }
    }

    return current === true;
  }

  /**
   * Set the RAG engine instance for managing disabled MCPs
   */
  setRAGEngine(ragEngine: any): void {
    this.ragEngine = ragEngine;
    logger.debug('RAG engine connected to InternalMCPManager');
  }

  /**
   * Disable an internal MCP (removes from discovery, triggers re-indexing)
   */
  async disableInternalMCP(mcpName: string): Promise<void> {
    if (!this.internalMCPs.has(mcpName)) {
      throw new Error(`Internal MCP not found: ${mcpName}`);
    }

    if (this.disabledInternalMCPs.has(mcpName)) {
      logger.warn(`Internal MCP ${mcpName} is already disabled`);
      return;
    }

    this.disabledInternalMCPs.add(mcpName);
    logger.info(`🚫 Disabled internal MCP: ${mcpName}`);

    // Mark as disabled in RAG engine for live filtering
    if (this.ragEngine) {
      this.ragEngine.setMCPDisabled(mcpName);

      // Trigger background re-indexing to rebuild index without disabled MCP
      await this.ragEngine.triggerBackgroundReindex();
    }
  }

  /**
   * Enable an internal MCP (adds to discovery, triggers re-indexing)
   */
  async enableInternalMCP(mcpName: string): Promise<void> {
    if (!this.internalMCPs.has(mcpName)) {
      throw new Error(`Internal MCP not found: ${mcpName}`);
    }

    if (!this.disabledInternalMCPs.has(mcpName)) {
      logger.warn(`Internal MCP ${mcpName} is already enabled`);
      return;
    }

    this.disabledInternalMCPs.delete(mcpName);
    logger.info(`✅ Enabled internal MCP: ${mcpName}`);

    // Mark as enabled in RAG engine
    if (this.ragEngine) {
      this.ragEngine.setMCPEnabled(mcpName);

      // Trigger background re-indexing to rebuild index with newly enabled MCP
      // Note: This assumes the MCP tools will be re-indexed when the orchestrator re-indexes
      await this.ragEngine.triggerBackgroundReindex();
    }
  }

  /**
   * Check if an internal MCP is disabled
   */
  isInternalMCPDisabled(mcpName: string): boolean {
    return this.disabledInternalMCPs.has(mcpName);
  }

  /**
   * Get list of disabled internal MCPs
   */
  getDisabledInternalMCPs(): string[] {
    return Array.from(this.disabledInternalMCPs);
  }

  /**
   * Get all internal MCPs for tool discovery (excludes disabled MCPs)
   */
  getAllEnabledInternalMCPs(): InternalMCP[] {
    return Array.from(this.internalMCPs.values()).filter(
      mcp => !this.disabledInternalMCPs.has(mcp.name)
    );
  }
}
