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
import { SettingsManager } from './settings-manager.js';
import { ScheduledJob, ExecutionSummary, SchedulerConfig } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { platform } from 'os';

export interface CreateJobOptions {
  name: string;
  schedule: string; // Natural language, cron expression, or RFC 3339 datetime
  timezone?: string; // IANA timezone (e.g., "America/New_York"), defaults to system timezone
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
  private settingsManager: SettingsManager;
  private cleanupJobId?: string; // ID of the automatic cleanup job

  constructor(orchestrator?: any) { // NCPOrchestrator - using any to avoid circular dependency
    this.jobManager = new JobManager();
    this.executionRecorder = new ExecutionRecorder();
    this.jobExecutor = new JobExecutor();
    this.toolValidator = new ToolValidator(orchestrator);
    this.settingsManager = new SettingsManager();

    // Only initialize cron manager on supported platforms
    if (platform() !== 'win32') {
      try {
        this.cronManager = new CronManager();
        // Note: Automatic cleanup setup is deferred until first job creation
        // to avoid running shell commands during normal NCP operations
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
   * Set up automatic cleanup job (internal system job)
   * Creates a cron job that runs cleanup on configured schedule
   *
   * NOTE: Only sets up if jobs actually exist to avoid unnecessary crontab modifications
   * on every CLI invocation (which triggers macOS admin permission dialogs)
   */
  private setupAutomaticCleanup(): void {
    if (!this.cronManager) {
      return; // No cron manager available
    }

    const config = this.settingsManager.getConfig();

    // Skip if auto-cleanup is disabled
    if (!config.enableAutoCleanup) {
      logger.debug('[Scheduler] Automatic cleanup is disabled');
      return;
    }

    // Skip if no jobs exist - don't modify crontab unnecessarily
    // This prevents permission dialogs on every CLI command
    const allJobs = this.jobManager.getAllJobs();
    if (allJobs.length === 0) {
      logger.debug('[Scheduler] Skipping cleanup setup - no scheduled jobs exist');
      return;
    }

    try {
      // Check if cleanup job already exists in crontab
      const existingJobs = this.cronManager.getJobs();
      const cleanupJobId = '__ncp_automatic_cleanup__';
      const cleanupExists = existingJobs.some(j => j.id === cleanupJobId);

      if (cleanupExists) {
        logger.debug('[Scheduler] Automatic cleanup job already exists');
        this.cleanupJobId = cleanupJobId;
        return; // Already set up, don't modify crontab
      }

      const ncpPath = this.getNCPExecutablePath();
      const cleanupSchedule = config.cleanupSchedule || '0 0 * * *';

      // Create a special internal job ID for cleanup
      this.cleanupJobId = cleanupJobId;

      // Create cron job that calls the cleanup-runs CLI command
      const command = `${ncpPath} cleanup-runs --max-age ${config.maxExecutionAgeDays || 14} --max-count ${config.maxExecutionsPerJob || 100}`;

      this.cronManager.addJob(this.cleanupJobId, cleanupSchedule, command);

      logger.info(`[Scheduler] Automatic cleanup enabled: ${cleanupSchedule}`);
      logger.info(`[Scheduler] Cleanup policy: ${config.maxExecutionAgeDays || 14} days, ${config.maxExecutionsPerJob || 100} runs per job`);
    } catch (error) {
      logger.error(`[Scheduler] Failed to setup automatic cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
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

    // Default timezone to system timezone if not provided
    const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse schedule (RFC 3339 datetime, cron expression, or natural language)
    let cronExpression: string;
    let fireOnce = options.fireOnce || false;

    // Check if it's RFC 3339 datetime (one-time execution with timezone)
    if (this.isRFC3339DateTime(options.schedule)) {
      const scheduledDate = new Date(options.schedule);
      if (isNaN(scheduledDate.getTime())) {
        throw new Error(`Invalid RFC 3339 datetime: ${options.schedule}`);
      }

      // Convert to cron expression for the scheduled time (in system local time)
      const minute = scheduledDate.getMinutes();
      const hour = scheduledDate.getHours();
      const day = scheduledDate.getDate();
      const month = scheduledDate.getMonth() + 1;
      cronExpression = `${minute} ${hour} ${day} ${month} *`;
      fireOnce = true; // RFC 3339 datetime is always one-time

      logger.info(`[Scheduler] Converted RFC 3339 datetime to cron: ${cronExpression}`);
    }
    // Check if it's already a valid cron expression
    else if (this.isCronExpression(options.schedule)) {
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
      timezone, // Store IANA timezone
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

    // Set up automatic cleanup (only runs once, is idempotent)
    this.setupAutomaticCleanup();

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
   * Check if string is an RFC 3339 datetime with timezone
   * Examples: "2025-12-25T15:00:00-05:00", "2025-12-25T20:00:00Z"
   */
  private isRFC3339DateTime(schedule: string): boolean {
    // RFC 3339 format includes date, time, and timezone offset
    // Must have 'T' separator and either 'Z' or timezone offset ('+'/'-')
    const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    return rfc3339Pattern.test(schedule.trim());
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
