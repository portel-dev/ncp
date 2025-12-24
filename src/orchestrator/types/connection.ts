/**
 * Connection-related types for the orchestrator
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthConfig } from '../../auth/oauth-device-flow.js';

/**
 * Transport type for remote MCP connections
 * - 'sse': Legacy HTTP+SSE transport (deprecated but widely supported)
 * - 'streamableHttp': New Streamable HTTP transport (MCP 2025-03-26+)
 */
export type RemoteTransportType = 'sse' | 'streamableHttp';

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
 * OAuth 2.1 configuration for MCP connections
 * Follows MCP 2025-03-26 authorization specification
 */
export interface MCPOAuth21Config {
  /** Pre-registered client ID (optional - uses dynamic registration if not provided) */
  clientId?: string;
  /** Pre-registered client secret (optional - for confidential clients) */
  clientSecret?: string;
  /** Requested OAuth scopes */
  scopes?: string[];
  /** Local callback port for authorization (default: 9876) */
  callbackPort?: number;
}

/**
 * Authentication configuration for MCP connections
 */
export interface MCPAuthConfig {
  /**
   * Authentication type:
   * - 'oauth': OAuth 2.1 with PKCE (MCP 2025-03-26 spec)
   * - 'bearer': Static bearer token
   * - 'apiKey': API key header
   * - 'basic': HTTP Basic auth
   */
  type: 'oauth' | 'bearer' | 'apiKey' | 'basic';
  /** Legacy OAuth device flow config (deprecated, use oauth21 instead) */
  oauth?: OAuthConfig;
  /** OAuth 2.1 configuration for MCP spec compliance */
  oauth21?: MCPOAuth21Config;
  /** Static bearer token */
  token?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
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
  /**
   * Transport type for remote connections (url-based).
   * - 'streamableHttp': Modern Streamable HTTP transport (recommended)
   * - 'sse': Legacy HTTP+SSE transport (deprecated but widely supported)
   *
   * Default: 'streamableHttp' for new connections
   */
  transport?: RemoteTransportType;
  /**
   * Session ID for Streamable HTTP transport.
   * Used to resume sessions after disconnection.
   */
  sessionId?: string;
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
 * Union type for all supported transports
 */
export type MCPTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

/**
 * An active connection to an MCP server
 */
export interface MCPConnection {
  client: Client;
  transport: MCPTransport;
  tools: ToolDefinition[];
  serverInfo?: MCPServerInfo;
  lastUsed: number;
  connectTime: number;
  executionCount: number;
  /** Session ID for Streamable HTTP connections */
  sessionId?: string;
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
