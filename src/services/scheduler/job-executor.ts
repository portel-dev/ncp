/**
 * Job Executor - Execute scheduled jobs
 * Lightweight execution context for cron-triggered jobs
 */

import { JobManager } from './job-manager.js';
import { ExecutionRecorder } from './execution-recorder.js';
import { CronManager } from './cron-manager.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'failure' | 'timeout';
  result?: any;
  error?: string;
  duration: number;
}

export class JobExecutor {
  private jobManager: JobManager;
  private executionRecorder: ExecutionRecorder;
  private cronManager?: CronManager;
  private defaultTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.jobManager = new JobManager();
    this.executionRecorder = new ExecutionRecorder();

    // Only initialize cron manager on non-Windows platforms
    if (process.platform !== 'win32') {
      try {
        this.cronManager = new CronManager();
      } catch (error) {
        logger.warn(`[JobExecutor] Cron manager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logger.warn('[JobExecutor] Cron manager not available on Windows');
    }
  }

  /**
   * Execute a scheduled job by ID
   */
  async executeJob(jobId: string, timeout?: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();
    const executionTimeout = timeout || this.defaultTimeout;

    console.log('[DEBUG] executeJob called with jobId:', jobId);
    logger.info(`[JobExecutor] Starting execution ${executionId} for job ${jobId}`);

    // Load job
    const job = this.jobManager.getJob(jobId);
    if (!job) {
      const error = `Job ${jobId} not found`;
      logger.error(`[JobExecutor] ${error}`);
      return {
        executionId,
        status: 'failure',
        error,
        duration: Date.now() - startTime
      };
    }

    // Check if job is active
    if (job.status !== 'active') {
      const error = `Job ${job.name} is not active (status: ${job.status})`;
      logger.warn(`[JobExecutor] ${error}`);
      return {
        executionId,
        status: 'failure',
        error,
        duration: Date.now() - startTime
      };
    }

    // Start execution recording
    this.executionRecorder.startExecution({
      executionId,
      jobId: job.id,
      jobName: job.name,
      tool: job.tool,
      parameters: job.parameters,
      startedAt: new Date().toISOString(),
      status: 'running'
    });

    try {
      logger.info(`[JobExecutor] Executing ${job.tool} with parameters: ${JSON.stringify(job.parameters)}`);

      // Create orchestrator (same as 'ncp run' command)
      const { NCPOrchestrator } = await import('../../orchestrator/ncp-orchestrator.js');
      const orchestrator = new NCPOrchestrator('all', true); // Silent mode

      // Initialize and wait for background init to complete
      await orchestrator.initialize();
      await orchestrator.waitForInitialization();

      // Execute tool with timeout
      const execResult = await this.executeWithTimeout<any>(
        () => orchestrator.run(job.tool, job.parameters),
        executionTimeout
      );

      // Cleanup orchestrator
      await orchestrator.cleanup();

      if (!execResult.success) {
        throw new Error(execResult.error || 'Tool execution failed');
      }

      const result = execResult.content;

      // Record successful execution
      const duration = Date.now() - startTime;
      this.executionRecorder.completeExecution(executionId, 'success', result);

      // Update job metadata
      this.jobManager.recordExecution(jobId, executionId, new Date().toISOString());

      // Check if job should be removed from cron (fireOnce, maxExecutions, endDate)
      const updatedJob = this.jobManager.getJob(jobId);
      if (updatedJob && updatedJob.status === 'completed' && this.cronManager) {
        logger.info(`[JobExecutor] Job ${job.name} completed, removing from cron`);
        this.cronManager.removeJob(jobId);
      }

      logger.info(`[JobExecutor] Execution ${executionId} completed successfully in ${duration}ms`);

      return {
        executionId,
        status: 'success',
        result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      const status = isTimeout ? 'timeout' : 'failure';
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`[JobExecutor] Execution ${executionId} failed: ${errorMessage}`);

      // Record failed execution
      this.executionRecorder.completeExecution(
        executionId,
        status,
        undefined,
        { message: errorMessage }
      );

      // Mark job as errored if it's not a timeout
      if (!isTimeout) {
        this.jobManager.markJobAsErrored(jobId, errorMessage);
      }

      return {
        executionId,
        status,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Clean up old executions based on retention policy
   */
  async cleanupOldExecutions(maxAgeDays: number = 30, maxExecutionsPerJob: number = 100): Promise<void> {
    logger.info(`[JobExecutor] Starting cleanup: maxAge=${maxAgeDays} days, maxPerJob=${maxExecutionsPerJob}`);

    const result = this.executionRecorder.cleanupOldExecutions(maxAgeDays, maxExecutionsPerJob);

    if (result.errors.length > 0) {
      logger.warn(`[JobExecutor] Cleanup completed with ${result.errors.length} errors`);
      result.errors.forEach(err => logger.warn(`  - ${err}`));
    } else {
      logger.info(`[JobExecutor] Cleanup completed successfully: deleted ${result.deletedCount} executions`);
    }
  }
}
