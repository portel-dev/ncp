/**
 * Scheduler Type Definitions
 * Lightweight JSON-based scheduling system with native OS cron integration
 */

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;

  // Schedule configuration
  cronExpression: string;

  // MCP tool to execute
  tool: string; // Format: "mcp_name:tool_name"
  parameters: Record<string, any>;

  // Execution constraints
  fireOnce: boolean; // If true, job fires only once then stops
  maxExecutions?: number; // Maximum number of times to execute
  endDate?: string; // ISO date string - stop executing after this date

  // Metadata
  createdAt: string; // ISO date string
  status: 'active' | 'paused' | 'completed' | 'error';
  errorMessage?: string;

  // Statistics
  executionCount: number;
  lastExecutionId?: string;
  lastExecutionAt?: string; // ISO date string
  nextExecutionAt?: string; // ISO date string (calculated)
}

export interface JobExecution {
  executionId: string;
  jobId: string;
  jobName: string;
  tool: string;
  parameters: Record<string, any>;

  // Timing
  startedAt: string; // ISO date string
  completedAt?: string; // ISO date string
  duration?: number; // milliseconds

  // Result
  status: 'success' | 'failure' | 'timeout' | 'running';
  result?: {
    content?: any[];
    [key: string]: any;
  };
  error?: {
    message: string;
    code?: number;
    data?: any;
  };
}

export interface JobsStorage {
  version: string;
  jobs: Record<string, ScheduledJob>; // Keyed by job ID
}

export interface ExecutionSummary {
  executionId: string;
  jobId: string;
  jobName: string;
  tool: string;
  startedAt: string;
  duration: number | null;
  status: 'success' | 'failure' | 'timeout' | 'running';
  errorMessage: string;
}

export interface SchedulerConfig {
  // Retention policies
  maxExecutionsPerJob?: number; // Keep last N executions per job (default: 100)
  maxExecutionAgeDays?: number; // Delete executions older than N days (default: 30)

  // Execution settings
  defaultTimeout?: number; // Default timeout in milliseconds (default: 5 minutes)
}

export interface NaturalLanguageParseResult {
  success: boolean;
  cronExpression?: string;
  explanation?: string;
  error?: string;
  fireOnce?: boolean; // Indicates if it's a one-time schedule
}
