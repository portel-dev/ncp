/**
 * Execution-related types for the orchestrator
 */

/**
 * Result of a tool execution
 */
export interface ExecutionResult {
  success: boolean;
  content?: unknown;
  error?: string;
}

/**
 * Metadata passed to tool execution
 */
export interface ExecutionMeta {
  source?: string;
  requestId?: string;
  timeout?: number;
  [key: string]: unknown;
}

/**
 * Validated tool parameters
 */
export interface ValidatedParameters {
  valid: boolean;
  error?: string;
  sanitized?: Record<string, unknown>;
}
