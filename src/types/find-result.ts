/**
 * Structured types for ncp:find results
 * Used in Code-Mode for programmatic access
 */

export interface ToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export interface ToolResult {
  /** Full tool identifier (mcp_name:tool_name) */
  name: string;

  /** MCP namespace */
  mcp: string;

  /** Tool name within MCP */
  tool: string;

  /** Tool description */
  description: string;

  /** Confidence score (0-1) for search results */
  confidence: number;

  /** Tool parameters */
  parameters: ToolParameter[];

  /** Full JSON schema */
  schema?: any;

  /** Health status */
  healthy: boolean;
}

export interface MCPHealth {
  name: string;
  healthy: boolean;
}

export interface HealthStatus {
  total: number;
  healthy: number;
  unhealthy: number;
  mcps: MCPHealth[];
}

export interface IndexingProgress {
  current: number;
  total: number;
  currentMCP?: string;
  estimatedTimeRemaining?: number;
}

export interface PaginationInfo {
  page: number;
  totalPages: number;
  totalResults: number;
  resultsInPage: number;
}

export interface FindResultStructured {
  /** Array of tool results */
  tools: ToolResult[];

  /** Pagination information */
  pagination: PaginationInfo;

  /** Health status of MCPs */
  health: HealthStatus;

  /** Indexing progress (if still indexing) */
  indexing?: IndexingProgress;

  /** MCP filter applied (if any) */
  mcpFilter?: string;

  /** Search query used */
  query?: string;

  /** Whether this is a listing (no query) or search */
  isListing: boolean;
}

export interface MultiQueryResult {
  /** Array of queries and their results */
  queries: Array<{
    query: string;
    tools: ToolResult[];
  }>;

  /** Total tools found across all queries */
  totalTools: number;

  /** Health status of MCPs */
  health: HealthStatus;

  /** Indexing progress (if still indexing) */
  indexing?: IndexingProgress;
}
