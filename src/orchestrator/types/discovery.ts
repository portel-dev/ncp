/**
 * Discovery-related types for the orchestrator
 */

/**
 * Result of a tool discovery/search operation
 */
export interface DiscoveryResult {
  toolName: string;
  mcpName: string;
  confidence: number;
  description?: string;
  schema?: Record<string, unknown>;
}

/**
 * A tool with its MCP association
 */
export interface ToolInfo {
  name: string;
  description: string;
  mcpName: string;
}

/**
 * Options for the find operation
 */
export interface FindOptions {
  limit?: number;
  page?: number;
  confidenceThreshold?: number;
  depth?: number;
  detailed?: boolean;
}

/**
 * Options for tool search via ToolDiscoveryService
 */
export interface ToolSearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Include description and schema in results */
  detailed?: boolean;
  /** Minimum confidence threshold */
  confidenceThreshold?: number;
}

/**
 * Progress information for indexing operations
 */
export interface IndexingProgress {
  current: number;
  total: number;
  currentMCP: string;
  estimatedTimeRemaining?: number;
}

/**
 * Health status of an MCP
 */
export interface MCPHealthStatus {
  mcpName: string;
  healthy: boolean;
  lastCheck: number;
  latency?: number;
  errorCount: number;
  successCount: number;
}
