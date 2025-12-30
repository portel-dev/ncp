/**
 * MCP Client Factory for NCP
 *
 * Implements the MCPTransport and MCPClientFactory interfaces from photon-core
 * to enable Photons to call external MCPs via the orchestrator.
 */

import {
  MCPClient,
  MCPTransport,
  MCPClientFactory,
  MCPToolInfo,
  MCPToolResult,
} from '@portel/photon-core';
import { logger } from '../utils/logger.js';

/**
 * Interface for orchestrator - kept minimal to avoid circular dependencies
 */
export interface OrchestratorInterface {
  run(toolName: string, parameters: any, meta?: Record<string, any>): Promise<{
    success: boolean;
    content?: any;
    error?: string;
  }>;
  getConnectionNames(): string[];
  isConnected(mcpName: string): boolean;
  getToolsForMCP(mcpName: string): Array<{ name: string; description?: string; inputSchema?: any }>;
}

/**
 * MCP Transport implementation that uses NCP orchestrator
 */
export class NCPMCPTransport implements MCPTransport {
  constructor(private orchestrator: OrchestratorInterface) {}

  async callTool(
    mcpName: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<MCPToolResult> {
    // Format tool name as "mcp:tool"
    const fullToolName = `${mcpName}:${toolName}`;

    logger.debug(`[MCPTransport] Calling ${fullToolName}`);

    const result = await this.orchestrator.run(fullToolName, parameters);

    if (!result.success) {
      return {
        content: [{ type: 'text', text: result.error || 'Unknown error' }],
        isError: true,
      };
    }

    // Convert orchestrator result to MCP format
    const content = result.content;

    if (typeof content === 'string') {
      return {
        content: [{ type: 'text', text: content }],
        isError: false,
      };
    } else if (content && typeof content === 'object') {
      return {
        content: [{ type: 'text', text: JSON.stringify(content) }],
        isError: false,
      };
    } else {
      return {
        content: [{ type: 'text', text: String(content ?? '') }],
        isError: false,
      };
    }
  }

  async listTools(mcpName: string): Promise<MCPToolInfo[]> {
    const tools = this.orchestrator.getToolsForMCP(mcpName);

    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async isConnected(mcpName: string): Promise<boolean> {
    return this.orchestrator.isConnected(mcpName);
  }
}

/**
 * MCP Client Factory implementation for NCP
 * Creates MCPClient instances that use the orchestrator for MCP communication
 */
export class NCPMCPClientFactory implements MCPClientFactory {
  private transport: NCPMCPTransport;
  private clients: Map<string, MCPClient> = new Map();

  constructor(private orchestrator: OrchestratorInterface) {
    this.transport = new NCPMCPTransport(orchestrator);
  }

  /**
   * Create an MCP client for a specific server
   */
  create(mcpName: string): MCPClient {
    // Return cached client if available
    let client = this.clients.get(mcpName);
    if (client) {
      return client;
    }

    // Create new client
    client = new MCPClient(mcpName, this.transport);
    this.clients.set(mcpName, client);

    logger.debug(`[MCPClientFactory] Created client for MCP: ${mcpName}`);

    return client;
  }

  /**
   * List all available MCP servers
   */
  async listServers(): Promise<string[]> {
    return this.orchestrator.getConnectionNames();
  }

  /**
   * Clear cached clients (useful when connections change)
   */
  clearCache(): void {
    this.clients.clear();
  }
}

/**
 * Create an MCP client factory from an orchestrator
 * This is the main entry point for setting up MCP access in Photons
 */
export function createMCPClientFactory(orchestrator: OrchestratorInterface): MCPClientFactory {
  return new NCPMCPClientFactory(orchestrator);
}
