/**
 * Scheduler Type Definitions
 * Lightweight JSON-based scheduling system with native OS cron integration
 */

// =============================================================================
// NEW ARCHITECTURE: Timing Groups (multiple tasks per OS schedule)
// =============================================================================

/**
 * Timing Group - Represents a specific cron schedule with multiple tasks
 * One OS schedule is created per timing group, executing all active tasks in parallel
 */
export interface TimingGroup {
  id: string; // Descriptive ID (e.g., "daily-9am", "every-5min")
  name: string; // Human-readable name (e.g., "Daily at 9:00 AM")
  cronExpression: string; // Cron expression for this timing
  timezone?: string; // IANA timezone (e.g., "America/New_York", "UTC")

  // Tasks
  taskIds: string[]; // Task IDs using this timing

  // Metadata
  createdAt: string; // ISO date string
  lastExecutionAt?: string; // ISO date string
  nextExecutionAt?: string; // ISO date string (calculated)
}

/**
 * Scheduled Task - Individual task to execute at a specific timing
 * Multiple tasks can share the same timing group
 */
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;

  // Timing reference
  timingId: string; // Reference to TimingGroup

  // Backward compatibility fields (denormalized from TimingGroup)
  cronExpression?: string; // Populated from timing group for backward compat
  timezone?: string; // Populated from timing group for backward compat

  // MCP tool to execute
  tool: string; // Format: "mcp_name:tool_name"
  parameters: Record<string, any>;

  // Execution constraints (per-task)
  fireOnce: boolean; // If true, task fires only once then completes
  maxExecutions?: number; // Maximum number of times to execute
  endDate?: string; // ISO date string - stop executing after this date
  catchupMissed?: boolean; // If true, run this task even if its scheduled time was missed (default: false)

  // Metadata
  createdAt: string; // ISO date string
  status: 'active' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  workingDirectory?: string; // Working directory when task was created

  // Statistics
  executionCount: number;
  lastExecutionId?: string;
  lastExecutionAt?: string; // ISO date string
}

/**
 * Task Execution - Result of executing a single task
 */
export interface TaskExecution {
  executionId: string;
  taskId: string;
  taskName: string;
  timingId: string; // Which timing triggered this execution
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

/**
 * New storage format with timing groups (stored in schedule.json)
 */
export interface SchedulerStorage {
  version: string; // Schema version (e.g., "2.0.0")
  tasks: Record<string, ScheduledTask>; // Keyed by task ID
  timings: Record<string, TimingGroup>; // Keyed by timing ID
}

// =============================================================================
// LEGACY ARCHITECTURE: One job per OS schedule (kept for migration)
// @deprecated Use ScheduledTask + TimingGroup instead
// =============================================================================

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;

  // Schedule configuration
  cronExpression: string;
  timezone?: string; // IANA timezone (e.g., "America/New_York", "UTC"), defaults to system timezone

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
  workingDirectory?: string; // Working directory when job was created

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

/**
 * Task Execution Summary - For displaying task execution history
 */
export interface TaskExecutionSummary {
  executionId: string;
  taskId: string;
  taskName: string;
  timingId: string;
  tool: string;
  startedAt: string;
  duration: number | null;
  status: 'success' | 'failure' | 'timeout' | 'running';
  errorMessage: string;

  // Backward compatibility aliases
  jobId?: string; // Alias for taskId
  jobName?: string; // Alias for taskName
}

export interface SchedulerConfig {
  // Retention policies (hybrid: time AND count based)
  maxExecutionsPerJob?: number; // Keep last N executions per job (default: 100)
  maxExecutionAgeDays?: number; // Delete executions older than N days (default: 14)
  cleanupSchedule?: string; // Cron expression for automatic cleanup (default: "0 0 * * *" - daily at midnight)
  enableAutoCleanup?: boolean; // Enable/disable automatic cleanup (default: true)

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
