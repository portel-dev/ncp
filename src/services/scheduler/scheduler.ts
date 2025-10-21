/**
 * Scheduler Service - Main orchestrator for scheduled jobs
 * Combines job management, cron manipulation, and execution recording
 */

import { JobManager } from './job-manager.js';
import { ExecutionRecorder } from './execution-recorder.js';
import { CronManager } from './cron-manager.js';
import { JobExecutor } from './job-executor.js';
import { NaturalLanguageParser } from './natural-language-parser.js';
import { ToolValidator } from './tool-validator.js';
import { ScheduledJob, ExecutionSummary } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { platform } from 'os';

export interface CreateJobOptions {
  name: string;
  schedule: string; // Natural language or cron expression
  tool: string; // Format: "mcp_name:tool_name"
  parameters: Record<string, any>;
  description?: string;
  fireOnce?: boolean;
  maxExecutions?: number;
  endDate?: string; // ISO date string
  skipValidation?: boolean; // Skip parameter validation (not recommended)
  testRun?: boolean; // Run tool once to test before scheduling
}

export class Scheduler {
  private jobManager: JobManager;
  public executionRecorder: ExecutionRecorder; // Public for access from SchedulerMCP
  private cronManager?: CronManager;
  private jobExecutor: JobExecutor;
  private toolValidator: ToolValidator;

  constructor(orchestrator?: any) { // NCPOrchestrator - using any to avoid circular dependency
    this.jobManager = new JobManager();
    this.executionRecorder = new ExecutionRecorder();
    this.jobExecutor = new JobExecutor();
    this.toolValidator = new ToolValidator(orchestrator);

    // Only initialize cron manager on supported platforms
    if (platform() !== 'win32') {
      try {
        this.cronManager = new CronManager();
      } catch (error) {
        logger.warn(`[Scheduler] Cron manager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logger.warn('[Scheduler] Windows platform detected - cron scheduling not available');
    }
  }

  /**
   * Check if scheduler is available on this platform
   */
  isAvailable(): boolean {
    return this.cronManager !== undefined;
  }

  /**
   * Get the path to ncp executable
   */
  private getNCPExecutablePath(): string {
    try {
      // Use 'which ncp' to find the ncp executable
      const ncpPath = execSync('which ncp', { encoding: 'utf-8' }).trim();
      return ncpPath;
    } catch {
      // Fallback to npx if ncp is not in PATH
      return 'npx ncp';
    }
  }

  /**
   * Create a new scheduled job
   */
  async createJob(options: CreateJobOptions): Promise<ScheduledJob> {
    if (!this.cronManager) {
      throw new Error('Scheduler not available on this platform');
    }

    logger.info(`[Scheduler] Creating job: ${options.name}`);

    // Parse schedule (natural language or cron expression)
    let cronExpression: string;
    let fireOnce = options.fireOnce || false;

    // Check if it's already a valid cron expression
    if (this.isCronExpression(options.schedule)) {
      cronExpression = options.schedule;
    } else {
      // Parse as natural language
      const parseResult = NaturalLanguageParser.parseSchedule(options.schedule);
      if (!parseResult.success) {
        throw new Error(`Failed to parse schedule: ${parseResult.error}`);
      }
      cronExpression = parseResult.cronExpression!;

      // If parser determined it's a one-time execution, set fireOnce
      if (parseResult.fireOnce) {
        fireOnce = true;
      }
    }

    // Validate cron expression
    const cronValidation = CronManager.validateCronExpression(cronExpression);
    if (!cronValidation.valid) {
      throw new Error(`Invalid cron expression: ${cronValidation.error}`);
    }

    // Validate tool and parameters (unless explicitly skipped)
    if (!options.skipValidation) {
      logger.info(`[Scheduler] Validating tool and parameters for ${options.tool}`);

      const toolValidation = await this.toolValidator.validateTool(
        options.tool,
        options.parameters,
        {
          testRun: options.testRun,
          timeout: 30000 // 30 second timeout for test runs
        }
      );

      if (!toolValidation.valid) {
        const errorMsg = `Tool validation failed:\n${toolValidation.errors.join('\n')}`;
        logger.error(`[Scheduler] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Log warnings if any
      if (toolValidation.warnings.length > 0) {
        logger.warn(`[Scheduler] Validation warnings:\n${toolValidation.warnings.join('\n')}`);
      }

      // Log test execution result if performed
      if (toolValidation.testExecutionResult) {
        if (toolValidation.testExecutionResult.success) {
          logger.info(`[Scheduler] Test execution succeeded (${toolValidation.testExecutionResult.duration}ms)`);
        } else {
          logger.warn(`[Scheduler] Test execution failed: ${toolValidation.testExecutionResult.error}`);
        }
      }
    } else {
      logger.warn(`[Scheduler] Skipping tool validation (skipValidation=true)`);
    }

    // Create job object
    const jobId = uuidv4();
    const job: ScheduledJob = {
      id: jobId,
      name: options.name,
      description: options.description,
      cronExpression,
      tool: options.tool,
      parameters: options.parameters,
      fireOnce,
      maxExecutions: options.maxExecutions,
      endDate: options.endDate,
      createdAt: new Date().toISOString(),
      status: 'active',
      executionCount: 0
    };

    // Save job to storage
    this.jobManager.createJob(job);

    // Add to crontab
    const ncpPath = this.getNCPExecutablePath();
    const command = `${ncpPath} execute-scheduled ${jobId}`;
    this.cronManager.addJob(jobId, cronExpression, command);

    logger.info(`[Scheduler] Job created successfully: ${job.name} (${jobId})`);
    logger.info(`[Scheduler] Schedule: ${cronExpression}`);
    logger.info(`[Scheduler] Command: ${command}`);

    return job;
  }

  /**
   * Check if string is a valid cron expression
   */
  private isCronExpression(schedule: string): boolean {
    const parts = schedule.trim().split(/\s+/);
    return parts.length === 5 && CronManager.validateCronExpression(schedule).valid;
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): ScheduledJob | null {
    return this.jobManager.getJob(jobId);
  }

  /**
   * Get a job by name
   */
  getJobByName(name: string): ScheduledJob | null {
    return this.jobManager.getJobByName(name);
  }

  /**
   * List all jobs
   */
  listJobs(statusFilter?: ScheduledJob['status']): ScheduledJob[] {
    if (statusFilter) {
      return this.jobManager.getJobsByStatus(statusFilter);
    }
    return this.jobManager.getAllJobs();
  }

  /**
   * Update a job
   */
  async updateJob(jobId: string, updates: Partial<CreateJobOptions>): Promise<ScheduledJob> {
    if (!this.cronManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const job = this.jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Build update object
    const jobUpdates: Partial<ScheduledJob> = {};

    if (updates.name !== undefined) {
      jobUpdates.name = updates.name;
    }
    if (updates.description !== undefined) {
      jobUpdates.description = updates.description;
    }
    if (updates.tool !== undefined) {
      jobUpdates.tool = updates.tool;
    }
    if (updates.parameters !== undefined) {
      jobUpdates.parameters = updates.parameters;
    }
    if (updates.fireOnce !== undefined) {
      jobUpdates.fireOnce = updates.fireOnce;
    }
    if (updates.maxExecutions !== undefined) {
      jobUpdates.maxExecutions = updates.maxExecutions;
    }
    if (updates.endDate !== undefined) {
      jobUpdates.endDate = updates.endDate;
    }

    // Handle schedule update
    if (updates.schedule !== undefined) {
      let cronExpression: string;
      if (this.isCronExpression(updates.schedule)) {
        cronExpression = updates.schedule;
      } else {
        const parseResult = NaturalLanguageParser.parseSchedule(updates.schedule);
        if (!parseResult.success) {
          throw new Error(`Failed to parse schedule: ${parseResult.error}`);
        }
        cronExpression = parseResult.cronExpression!;
      }

      const validation = CronManager.validateCronExpression(cronExpression);
      if (!validation.valid) {
        throw new Error(`Invalid cron expression: ${validation.error}`);
      }

      jobUpdates.cronExpression = cronExpression;

      // Update crontab
      const ncpPath = this.getNCPExecutablePath();
      const command = `${ncpPath} execute-scheduled ${jobId}`;
      this.cronManager.addJob(jobId, cronExpression, command);
    }

    // Update job in storage
    this.jobManager.updateJob(jobId, jobUpdates);

    const updatedJob = this.jobManager.getJob(jobId)!;
    logger.info(`[Scheduler] Job updated: ${updatedJob.name} (${jobId})`);

    return updatedJob;
  }

  /**
   * Pause a job
   */
  pauseJob(jobId: string): void {
    if (!this.cronManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const job = this.jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Remove from crontab
    this.cronManager.removeJob(jobId);

    // Update status
    this.jobManager.updateJob(jobId, { status: 'paused' });

    logger.info(`[Scheduler] Job paused: ${job.name} (${jobId})`);
  }

  /**
   * Resume a paused job
   */
  resumeJob(jobId: string): void {
    if (!this.cronManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const job = this.jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'paused') {
      throw new Error(`Job is not paused (current status: ${job.status})`);
    }

    // Add back to crontab
    const ncpPath = this.getNCPExecutablePath();
    const command = `${ncpPath} execute-scheduled ${jobId}`;
    this.cronManager.addJob(jobId, job.cronExpression, command);

    // Update status
    this.jobManager.updateJob(jobId, { status: 'active' });

    logger.info(`[Scheduler] Job resumed: ${job.name} (${jobId})`);
  }

  /**
   * Delete a job
   */
  deleteJob(jobId: string): void {
    if (!this.cronManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const job = this.jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Remove from crontab
    this.cronManager.removeJob(jobId);

    // Delete from storage
    this.jobManager.deleteJob(jobId);

    logger.info(`[Scheduler] Job deleted: ${job.name} (${jobId})`);
  }

  /**
   * Get executions for a job
   */
  getExecutions(jobId: string): ExecutionSummary[] {
    return this.executionRecorder.getExecutionsForJob(jobId);
  }

  /**
   * Query executions
   */
  queryExecutions(filters?: {
    jobId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): ExecutionSummary[] {
    return this.executionRecorder.queryExecutions(filters);
  }

  /**
   * Get execution statistics
   */
  getExecutionStatistics(jobId?: string) {
    return this.executionRecorder.getStatistics(jobId);
  }

  /**
   * Get job statistics
   */
  getJobStatistics() {
    return this.jobManager.getStatistics();
  }

  /**
   * Clean up old executions
   */
  async cleanupOldExecutions(maxAgeDays: number = 30, maxExecutionsPerJob: number = 100): Promise<void> {
    await this.jobExecutor.cleanupOldExecutions(maxAgeDays, maxExecutionsPerJob);
  }

  /**
   * Sync jobs with crontab (repair/reconcile)
   */
  syncWithCrontab(): { added: number; removed: number; errors: string[] } {
    if (!this.cronManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const errors: string[] = [];
    let added = 0;
    let removed = 0;

    // Get all active jobs from storage
    const activeJobs = this.jobManager.getJobsByStatus('active');

    // Get all jobs from crontab
    const cronJobs = this.cronManager.getJobs();
    const cronJobIds = new Set(cronJobs.map(j => j.id));

    // Add missing jobs to crontab
    for (const job of activeJobs) {
      if (!cronJobIds.has(job.id)) {
        try {
          const ncpPath = this.getNCPExecutablePath();
          const command = `${ncpPath} execute-scheduled ${job.id}`;
          this.cronManager.addJob(job.id, job.cronExpression, command);
          added++;
          logger.info(`[Scheduler] Added missing job to crontab: ${job.name}`);
        } catch (error) {
          errors.push(`Failed to add ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Remove orphaned jobs from crontab
    const activeJobIds = new Set(activeJobs.map(j => j.id));
    for (const cronJob of cronJobs) {
      if (!activeJobIds.has(cronJob.id)) {
        try {
          this.cronManager.removeJob(cronJob.id);
          removed++;
          logger.info(`[Scheduler] Removed orphaned job from crontab: ${cronJob.id}`);
        } catch (error) {
          errors.push(`Failed to remove ${cronJob.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    logger.info(`[Scheduler] Sync complete: added ${added}, removed ${removed}, errors ${errors.length}`);

    return { added, removed, errors };
  }
}
