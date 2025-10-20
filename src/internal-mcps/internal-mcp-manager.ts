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
   * @param mcpName The internal MCP name (e.g., "ncp")
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
}
