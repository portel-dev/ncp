/**
 * Execution Recorder - Track job execution results
 * Uses CSV for summary (fast queries) + JSON for detailed results
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getSchedulerExecutionsDirectory, getSchedulerResultsDirectory } from '../../utils/ncp-paths.js';
import { JobExecution, ExecutionSummary } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';

export class ExecutionRecorder {
  private summaryFile: string | null = null;
  private resultsDir: string | null = null;
  private initialized: boolean = false;
  private static CSV_HEADERS = 'executionId,jobId,jobName,tool,startedAt,duration,status,errorMessage\n';

  constructor() {
    // Lazy initialization - don't traverse directories during construction
  }

  /**
   * Initialize paths and directories on first use
   */
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    const executionsDir = getSchedulerExecutionsDirectory();
    this.resultsDir = getSchedulerResultsDirectory();
    this.summaryFile = join(executionsDir, 'summary.csv');

    // Ensure directories exist
    if (!existsSync(executionsDir)) {
      mkdirSync(executionsDir, { recursive: true });
      logger.info(`[ExecutionRecorder] Created executions directory: ${executionsDir}`);
    }
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
      logger.info(`[ExecutionRecorder] Created results directory: ${this.resultsDir}`);
    }

    // Create CSV file with headers if it doesn't exist
    if (!existsSync(this.summaryFile)) {
      writeFileSync(this.summaryFile, ExecutionRecorder.CSV_HEADERS, 'utf-8');
      logger.info(`[ExecutionRecorder] Created summary CSV file`);
    }

    this.initialized = true;
  }

  /**
   * Start recording an execution (creates initial record)
   */
  startExecution(execution: Omit<JobExecution, 'completedAt' | 'duration' | 'result' | 'error'>): void {
    this.ensureInitialized();
    const fullExecution: JobExecution = {
      ...execution,
      status: 'running'
    };

    // Write detailed JSON result
    const resultFile = join(this.resultsDir!, `${execution.executionId}.json`);
    writeFileSync(resultFile, JSON.stringify(fullExecution, null, 2), 'utf-8');

    logger.info(`[ExecutionRecorder] Started execution: ${execution.executionId} for job ${execution.jobName}`);
  }

  /**
   * Complete an execution with results
   */
  completeExecution(
    executionId: string,
    status: 'success' | 'failure' | 'timeout',
    result?: any,
    error?: { message: string; code?: number; data?: any }
  ): void {
    this.ensureInitialized();
    const resultFile = join(this.resultsDir!, `${executionId}.json`);

    if (!existsSync(resultFile)) {
      logger.error(`[ExecutionRecorder] Cannot complete execution: ${executionId} not found`);
      return;
    }

    try {
      // Load existing execution
      const content = readFileSync(resultFile, 'utf-8');
      const execution: JobExecution = JSON.parse(content);

      // Update with completion data
      execution.completedAt = new Date().toISOString();
      execution.duration = new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime();
      execution.status = status;
      if (result) {
        execution.result = result;
      }
      if (error) {
        execution.error = error;
      }

      // Save updated JSON
      writeFileSync(resultFile, JSON.stringify(execution, null, 2), 'utf-8');

      // Append to CSV summary
      this.appendToCSV(execution);

      logger.info(`[ExecutionRecorder] Completed execution: ${executionId} with status ${status}`);
    } catch (err) {
      logger.error(`[ExecutionRecorder] Failed to complete execution ${executionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Append execution summary to CSV
   */
  private appendToCSV(execution: JobExecution): void {
    this.ensureInitialized();
    const row = this.executionToCSVRow(execution);
    appendFileSync(this.summaryFile!, row, 'utf-8');
  }

  /**
   * Convert execution to CSV row
   */
  private executionToCSVRow(execution: JobExecution): string {
    const errorMessage = execution.error?.message || '';
    const escapedErrorMessage = this.escapeCSV(errorMessage);
    const escapedJobName = this.escapeCSV(execution.jobName);
    const escapedTool = this.escapeCSV(execution.tool);

    return `${execution.executionId},${execution.jobId},${escapedJobName},${escapedTool},${execution.startedAt},${execution.duration || ''},${execution.status},${escapedErrorMessage}\n`;
  }

  /**
   * Escape CSV values (handle commas, quotes, newlines)
   */
  private escapeCSV(value: string): string {
    if (!value) return '';

    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): JobExecution | null {
    this.ensureInitialized();
    const resultFile = join(this.resultsDir!, `${executionId}.json`);

    if (!existsSync(resultFile)) {
      return null;
    }

    try {
      const content = readFileSync(resultFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`[ExecutionRecorder] Failed to read execution ${executionId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Get all executions for a job
   */
  getExecutionsForJob(jobId: string): ExecutionSummary[] {
    return this.queryExecutions({ jobId });
  }

  /**
   * Query executions from CSV summary
   */
  queryExecutions(filters?: {
    jobId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): ExecutionSummary[] {
    this.ensureInitialized();
    if (!existsSync(this.summaryFile!)) {
      return [];
    }

    try {
      const content = readFileSync(this.summaryFile!, 'utf-8');
      const lines = content.split('\n').slice(1); // Skip header

      const executions: ExecutionSummary[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const parsed = this.parseCSVLine(line);
        if (!parsed) continue;

        // Apply filters
        if (filters?.jobId && parsed.jobId !== filters.jobId) continue;
        if (filters?.status && parsed.status !== filters.status) continue;
        if (filters?.startDate && parsed.startedAt < filters.startDate) continue;
        if (filters?.endDate && parsed.startedAt > filters.endDate) continue;

        executions.push(parsed);
      }

      return executions;
    } catch (error) {
      logger.error(`[ExecutionRecorder] Failed to query executions: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Parse CSV line into ExecutionSummary
   */
  private parseCSVLine(line: string): ExecutionSummary | null {
    try {
      // Simple CSV parser (handles quoted fields)
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i++;
          } else {
            // Toggle quotes
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Field separator
          fields.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current); // Last field

      if (fields.length < 8) {
        return null;
      }

      return {
        executionId: fields[0],
        jobId: fields[1],
        jobName: fields[2],
        tool: fields[3],
        startedAt: fields[4],
        duration: fields[5] ? parseInt(fields[5]) : null,
        status: fields[6] as 'success' | 'failure' | 'timeout' | 'running',
        errorMessage: fields[7] || ''
      };
    } catch (error) {
      logger.error(`[ExecutionRecorder] Failed to parse CSV line: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Clean up old executions (retention policy)
   */
  cleanupOldExecutions(maxAgeDays: number, maxExecutionsPerJob?: number): {
    deletedCount: number;
    errors: string[];
  } {
    this.ensureInitialized();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffISO = cutoffDate.toISOString();

    const allExecutions = this.queryExecutions();
    const errors: string[] = [];
    let deletedCount = 0;

    // Group by job ID
    const executionsByJob = new Map<string, ExecutionSummary[]>();
    for (const exec of allExecutions) {
      if (!executionsByJob.has(exec.jobId)) {
        executionsByJob.set(exec.jobId, []);
      }
      executionsByJob.get(exec.jobId)!.push(exec);
    }

    // For each job, delete old executions
    for (const [jobId, executions] of executionsByJob) {
      // Sort by date (newest first)
      executions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      for (let i = 0; i < executions.length; i++) {
        const exec = executions[i];
        const shouldDelete =
          exec.startedAt < cutoffISO ||
          (maxExecutionsPerJob && i >= maxExecutionsPerJob);

        if (shouldDelete) {
          try {
            const resultFile = join(this.resultsDir!, `${exec.executionId}.json`);
            if (existsSync(resultFile)) {
              unlinkSync(resultFile);
              deletedCount++;
            }
          } catch (error) {
            errors.push(`Failed to delete ${exec.executionId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    // Rebuild CSV without deleted executions
    if (deletedCount > 0) {
      this.rebuildCSV();
    }

    logger.info(`[ExecutionRecorder] Cleanup complete: deleted ${deletedCount} old executions`);

    return { deletedCount, errors };
  }

  /**
   * Rebuild CSV from existing JSON files
   */
  private rebuildCSV(): void {
    this.ensureInitialized();
    try {
      // Get all existing result files
      const files = readdirSync(this.resultsDir!).filter(f => f.endsWith('.json'));

      // Start fresh CSV
      writeFileSync(this.summaryFile!, ExecutionRecorder.CSV_HEADERS, 'utf-8');

      // Read each JSON and append to CSV
      for (const file of files) {
        try {
          const content = readFileSync(join(this.resultsDir!, file), 'utf-8');
          const execution: JobExecution = JSON.parse(content);

          // Only add completed executions to CSV
          if (execution.status !== 'running' && execution.completedAt) {
            this.appendToCSV(execution);
          }
        } catch (error) {
          logger.warn(`[ExecutionRecorder] Failed to rebuild CSV entry for ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      logger.info(`[ExecutionRecorder] Rebuilt CSV with ${files.length} executions`);
    } catch (error) {
      logger.error(`[ExecutionRecorder] Failed to rebuild CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get execution statistics
   */
  getStatistics(jobId?: string): {
    total: number;
    success: number;
    failure: number;
    timeout: number;
    avgDuration: number | null;
  } {
    const executions = jobId ? this.getExecutionsForJob(jobId) : this.queryExecutions();

    const total = executions.length;
    const success = executions.filter(e => e.status === 'success').length;
    const failure = executions.filter(e => e.status === 'failure').length;
    const timeout = executions.filter(e => e.status === 'timeout').length;

    const durations = executions.filter(e => e.duration !== null).map(e => e.duration!);
    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : null;

    return {
      total,
      success,
      failure,
      timeout,
      avgDuration
    };
  }
}
