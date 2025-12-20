/**
 * Connection-related types for the orchestrator
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { OAuthConfig } from '../../auth/oauth-device-flow.js';

/**
 * Server info returned by MCP servers
 */
export interface MCPServerInfo {
  name: string;
  title?: string;
  version: string;
  description?: string;
  websiteUrl?: string;
}

/**
 * Authentication configuration for MCP connections
 */
export interface MCPAuthConfig {
  type: 'oauth' | 'bearer' | 'apiKey' | 'basic';
  oauth?: OAuthConfig;
  token?: string;
  username?: string;
  password?: string;
}

/**
 * Configuration for a single MCP server
 */
export interface MCPConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  auth?: MCPAuthConfig;
}

/**
 * A profile containing MCP server configurations
 */
export interface Profile {
  name: string;
  description: string;
  mcpServers: Record<string, Omit<MCPConfig, 'name'>>;
  metadata?: Record<string, unknown>;
}

/**
 * Tool definition from an MCP server
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * An active connection to an MCP server
 */
export interface MCPConnection {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: ToolDefinition[];
  serverInfo?: MCPServerInfo;
  lastUsed: number;
  connectTime: number;
  executionCount: number;
}

/**
 * Definition of an MCP server with its discovered tools
 */
export interface MCPDefinition {
  name: string;
  config: MCPConfig;
  tools: ToolDefinition[];
  serverInfo?: MCPServerInfo;
}

/**
 * Configuration for the connection pool
 */
export interface ConnectionPoolConfig {
  maxConnections: number;
  idleTimeout: number;
  cleanupInterval: number;
  maxExecutionsPerConnection: number;
  connectionTimeout: number;
  quickProbeTimeout: number;
  slowProbeTimeout: number;
}

/**
 * Default connection pool configuration
 */
export const DEFAULT_CONNECTION_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnections: 50,
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000, // 1 minute
  maxExecutionsPerConnection: 1000,
  connectionTimeout: 10000, // 10 seconds
  quickProbeTimeout: 8000, // 8 seconds
  slowProbeTimeout: 30000, // 30 seconds
};
