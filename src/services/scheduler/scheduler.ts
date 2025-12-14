/**
 * Scheduler Service - Main orchestrator for scheduled tasks with timing groups
 * Uses timing groups to reduce OS scheduler entries and enable parallel execution
 */

import { TaskManager } from './task-manager.js';
import { ExecutionRecorder } from './execution-recorder.js';
import { CronManager } from './cron-manager.js';
import { LaunchdManager } from './launchd-manager.js';
import { TaskSchedulerManager } from './task-scheduler-manager.js';
import { TimingExecutor } from './timing-executor.js';
import { NaturalLanguageParser } from './natural-language-parser.js';
import { ToolValidator } from './tool-validator.js';
import { SettingsManager } from './settings-manager.js';
import { ScheduledTask, TaskExecutionSummary, SchedulerConfig, TimingGroup } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { platform } from 'os';
import { normalizeCronExpression } from './cron-expression-utils.js';

export interface CreateTaskOptions {
  name: string;
  schedule: string; // Natural language, cron expression, or RFC 3339 datetime
  timezone?: string; // IANA timezone (e.g., "America/New_York"), defaults to system timezone
  tool: string; // Format: "mcp_name:tool_name"
  parameters: Record<string, any>;
  description?: string;
  fireOnce?: boolean;
  maxExecutions?: number;
  endDate?: string; // ISO date string
  catchupMissed?: boolean; // If true, run this task even if its scheduled time was missed (default: false)
  skipValidation?: boolean; // Skip parameter validation (not recommended)
  testRun?: boolean; // Run tool once to test before scheduling
}

// Backward compatibility alias
export type CreateJobOptions = CreateTaskOptions;

export class Scheduler {
  private taskManager: TaskManager;
  public executionRecorder: ExecutionRecorder; // Public for access from SchedulerMCP
  private scheduleManager?: CronManager | LaunchdManager | TaskSchedulerManager;
  private timingExecutor: TimingExecutor;
  private toolValidator: ToolValidator;
  private settingsManager: SettingsManager;
  private cleanupTimingId?: string; // ID of the automatic cleanup timing

  constructor(orchestrator?: any) { // NCPOrchestrator - using any to avoid circular dependency
    this.taskManager = new TaskManager();
    this.executionRecorder = new ExecutionRecorder();
    this.timingExecutor = new TimingExecutor();
    this.toolValidator = new ToolValidator(orchestrator);
    this.settingsManager = new SettingsManager();

    // Initialize platform-specific scheduler
    const currentPlatform = platform();
    if (currentPlatform === 'darwin') {
      try {
        this.scheduleManager = new LaunchdManager();
        logger.info('[Scheduler] Using launchd for macOS scheduling');
      } catch (error) {
        logger.warn(`[Scheduler] Launchd manager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (currentPlatform === 'win32') {
      try {
        this.scheduleManager = new TaskSchedulerManager();
        logger.info('[Scheduler] Using Task Scheduler for Windows scheduling');
      } catch (error) {
        logger.warn(`[Scheduler] Task Scheduler manager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      try {
        this.scheduleManager = new CronManager();
        logger.info('[Scheduler] Using cron for Linux/Unix scheduling');
      } catch (error) {
        logger.warn(`[Scheduler] Cron manager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Check if scheduler is available on this platform
   */
  isAvailable(): boolean {
    return this.scheduleManager !== undefined;
  }

  /**
   * Set up automatic cleanup timing (internal system timing)
   */
  private setupAutomaticCleanup(): void {
    if (!this.scheduleManager) {
      return;
    }

    const config = this.settingsManager.getConfig();

    if (!config.enableAutoCleanup) {
      logger.debug('[Scheduler] Automatic cleanup is disabled');
      return;
    }

    // Skip if no tasks exist
    const allTasks = this.taskManager.getAllTasks();
    if (allTasks.length === 0) {
      logger.debug('[Scheduler] Skipping cleanup setup - no scheduled tasks exist');
      return;
    }

    try {
      const existingTimings = this.scheduleManager.getJobs();
      const cleanupTimingId = '__ncp_automatic_cleanup__';
      const cleanupExists = existingTimings.some(t => t.id === cleanupTimingId);

      if (cleanupExists) {
        logger.debug('[Scheduler] Automatic cleanup timing already exists');
        this.cleanupTimingId = cleanupTimingId;
        return;
      }

      const ncpPath = this.getNCPExecutablePath();
      const cleanupSchedule = config.cleanupSchedule || '0 0 * * *';

      this.cleanupTimingId = cleanupTimingId;

      const command = `${ncpPath} cleanup-runs --max-age ${config.maxExecutionAgeDays || 14} --max-count ${config.maxExecutionsPerJob || 100}`;

      this.scheduleManager.addJob(this.cleanupTimingId, cleanupSchedule, command);

      logger.info(`[Scheduler] Automatic cleanup enabled: ${cleanupSchedule}`);
    } catch (error) {
      logger.error(`[Scheduler] Failed to setup automatic cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the path to ncp executable
   */
  private getNCPExecutablePath(): string {
    try {
      const ncpPath = execSync('which ncp', { encoding: 'utf-8' }).trim();
      return ncpPath;
    } catch {
      return 'npx ncp';
    }
  }

  /**
   * Create a new scheduled task
   */
  async createTask(options: CreateTaskOptions): Promise<ScheduledTask> {
    if (!this.scheduleManager) {
      throw new Error('Scheduler not available on this platform');
    }

    logger.info(`[Scheduler] Creating task: ${options.name}`);

    // Default timezone to system timezone if not provided
    const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse schedule (RFC 3339 datetime, cron expression, or natural language)
    let cronExpression: string;
    let fireOnce = options.fireOnce || false;

    // Check if it's RFC 3339 datetime (one-time execution)
    if (this.isRFC3339DateTime(options.schedule)) {
      const scheduledDate = new Date(options.schedule);
      if (isNaN(scheduledDate.getTime())) {
        throw new Error(`Invalid RFC 3339 datetime: ${options.schedule}`);
      }

      const minute = scheduledDate.getMinutes();
      const hour = scheduledDate.getHours();
      const day = scheduledDate.getDate();
      const month = scheduledDate.getMonth() + 1;
      cronExpression = `${minute} ${hour} ${day} ${month} *`;
      fireOnce = true;

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

      if (parseResult.fireOnce) {
        fireOnce = true;
      }
    }

    // Validate cron expression
    const cronValidation = this.scheduleManager instanceof TaskSchedulerManager
      ? TaskSchedulerManager.validateCronExpression(cronExpression)
      : CronManager.validateCronExpression(cronExpression);
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
          timeout: 30000
        }
      );

      if (!toolValidation.valid) {
        const errorMsg = `Tool validation failed:\n${toolValidation.errors.join('\n')}`;
        logger.error(`[Scheduler] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      if (toolValidation.warnings.length > 0) {
        logger.warn(`[Scheduler] Validation warnings:\n${toolValidation.warnings.join('\n')}`);
      }

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

    // Get or create timing group
    const timingId = this.taskManager.getOrCreateTimingGroup(cronExpression, timezone);
    const timing = this.taskManager.getTimingGroup(timingId)!;

    // Check if we need to create OS schedule for this timing
    const existingOSTimings = this.scheduleManager.getJobs();
    const osTimingExists = existingOSTimings.some(t => t.id === timingId);

    if (!osTimingExists) {
      // Create OS schedule for this timing group
      const ncpPath = this.getNCPExecutablePath();
      const command = `${ncpPath} _timing-run ${timingId}`;
      this.scheduleManager.addJob(timingId, cronExpression, command);
      logger.info(`[Scheduler] Created OS schedule for timing: ${timing.name} (${timingId})`);
    }

    // Create task object
    const taskId = uuidv4();
    const task: ScheduledTask = {
      id: taskId,
      name: options.name,
      description: options.description,
      timingId,
      cronExpression, // Backward compat - denormalized from timing
      timezone, // Backward compat - denormalized from timing
      tool: options.tool,
      parameters: options.parameters,
      fireOnce,
      maxExecutions: options.maxExecutions,
      endDate: options.endDate,
      catchupMissed: options.catchupMissed || false,
      createdAt: new Date().toISOString(),
      status: 'active',
      executionCount: 0,
      workingDirectory: process.cwd()
    };

    // Save task to storage
    this.taskManager.createTask(task);

    // Set up automatic cleanup
    this.setupAutomaticCleanup();

    logger.info(`[Scheduler] Task created successfully: ${task.name} (${taskId})`);
    logger.info(`[Scheduler] Timing: ${timing.name} (${timingId})`);
    logger.info(`[Scheduler] Schedule: ${cronExpression}`);

    return task;
  }

  /**
   * Create a new scheduled job (backward compatibility wrapper for createTask)
   * @deprecated Use createTask() instead
   */
  async createJob(options: CreateJobOptions): Promise<ScheduledTask> {
    return this.createTask(options);
  }

  /**
   * Check if string is a valid cron expression
   */
  private isCronExpression(schedule: string): boolean {
    const parts = schedule.trim().split(/\s+/);
    return parts.length === 5 && CronManager.validateCronExpression(schedule).valid;
  }

  /**
   * Check if string is an RFC 3339 datetime
   */
  private isRFC3339DateTime(schedule: string): boolean {
    const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    return rfc3339Pattern.test(schedule.trim());
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): ScheduledTask | null {
    return this.taskManager.getTask(taskId);
  }

  /**
   * Get a task by name
   */
  getTaskByName(name: string): ScheduledTask | null {
    return this.taskManager.getTaskByName(name);
  }

  /**
   * List all tasks
   */
  listTasks(statusFilter?: ScheduledTask['status']): ScheduledTask[] {
    if (statusFilter) {
      return this.taskManager.getTasksByStatus(statusFilter);
    }
    return this.taskManager.getAllTasks();
  }

  /**
   * List all timing groups
   */
  listTimingGroups(): TimingGroup[] {
    return this.taskManager.getAllTimingGroups();
  }

  /**
   * Get tasks for a timing group
   */
  getTasksForTiming(timingId: string): ScheduledTask[] {
    return this.taskManager.getTasksForTiming(timingId);
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: Partial<CreateTaskOptions>): Promise<ScheduledTask> {
    if (!this.scheduleManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const task = this.taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Build update object
    const taskUpdates: Partial<ScheduledTask> = {};

    if (updates.name !== undefined) {
      taskUpdates.name = updates.name;
    }
    if (updates.description !== undefined) {
      taskUpdates.description = updates.description;
    }
    if (updates.tool !== undefined) {
      taskUpdates.tool = updates.tool;
    }
    if (updates.parameters !== undefined) {
      taskUpdates.parameters = updates.parameters;
    }
    if (updates.fireOnce !== undefined) {
      taskUpdates.fireOnce = updates.fireOnce;
    }
    if (updates.maxExecutions !== undefined) {
      taskUpdates.maxExecutions = updates.maxExecutions;
    }
    if (updates.endDate !== undefined) {
      taskUpdates.endDate = updates.endDate;
    }

    // Handle schedule update (requires moving to different timing group)
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

      // Get or create new timing group
      const newTimingId = this.taskManager.getOrCreateTimingGroup(cronExpression, updates.timezone);

      // If timing changed, need to move task to new timing group
      if (newTimingId !== task.timingId) {
        // Remove from old timing (may delete timing if it was the last task)
        const shouldRemoveOldTiming = this.taskManager.removeTaskFromTiming(task.id, task.timingId);
        if (shouldRemoveOldTiming) {
          this.scheduleManager.removeJob(task.timingId);
          logger.info(`[Scheduler] Removed empty timing from OS scheduler: ${task.timingId}`);
        }

        // Add to new timing
        this.taskManager.addTaskToTiming(task.id, newTimingId);

        // Create OS schedule if needed
        const existingOSTimings = this.scheduleManager.getJobs();
        const osTimingExists = existingOSTimings.some(t => t.id === newTimingId);
        if (!osTimingExists) {
          const ncpPath = this.getNCPExecutablePath();
          const command = `${ncpPath} _timing-run ${newTimingId}`;
          this.scheduleManager.addJob(newTimingId, cronExpression, command);
          logger.info(`[Scheduler] Created OS schedule for new timing: ${newTimingId}`);
        }

        // Note: we can't directly update timingId in taskUpdates since it's not in the allowed updates
        // We need to manually set it
        const storage = (this.taskManager as any).loadStorage();
        storage.tasks[taskId].timingId = newTimingId;
        (this.taskManager as any).saveStorage(storage);
      }
    }

    // Update task in storage
    this.taskManager.updateTask(taskId, taskUpdates);

    const updatedTask = this.taskManager.getTask(taskId)!;
    logger.info(`[Scheduler] Task updated: ${updatedTask.name} (${taskId})`);

    return updatedTask;
  }

  /**
   * Pause a task (marks it as paused, but timing group remains active if other tasks use it)
   */
  pauseTask(taskId: string): void {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.taskManager.updateTask(taskId, { status: 'paused' });

    logger.info(`[Scheduler] Task paused: ${task.name} (${taskId})`);
    logger.info(`[Scheduler] Note: OS schedule for timing ${task.timingId} remains active (other tasks may use it)`);
  }

  /**
   * Resume a paused task
   */
  resumeTask(taskId: string): void {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'paused') {
      throw new Error(`Task is not paused (current status: ${task.status})`);
    }

    this.taskManager.updateTask(taskId, { status: 'active' });

    logger.info(`[Scheduler] Task resumed: ${task.name} (${taskId})`);
  }

  /**
   * Delete a task (removes from timing group, deletes timing if it was the last task)
   */
  deleteTask(taskId: string): void {
    if (!this.scheduleManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const task = this.taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Delete task (returns true if timing should be removed from OS)
    const shouldRemoveTiming = this.taskManager.deleteTask(taskId);

    // Remove timing from OS scheduler if it was the last task
    if (shouldRemoveTiming) {
      this.scheduleManager.removeJob(task.timingId);
      logger.info(`[Scheduler] Removed timing from OS scheduler: ${task.timingId} (was last task)`);
    }

    logger.info(`[Scheduler] Task deleted: ${task.name} (${taskId})`);
  }

  /**
   * Get executions for a task
   */
  getExecutions(taskId: string): TaskExecutionSummary[] {
    return this.executionRecorder.getExecutionsForJob(taskId) as any;
  }

  /**
   * Query executions
   */
  queryExecutions(filters?: {
    taskId?: string;
    jobId?: string; // Backward compat
    status?: string;
    startDate?: string;
    endDate?: string;
  }): TaskExecutionSummary[] {
    // Support both taskId and jobId (backward compat)
    const taskId = filters?.taskId || filters?.jobId;
    const actualFilters = {
      ...filters,
      jobId: taskId
    };

    const results = this.executionRecorder.queryExecutions(actualFilters as any) as any[];

    // Populate backward compat fields
    return results.map(result => ({
      ...result,
      jobId: result.taskId || result.jobId,
      jobName: result.taskName || result.jobName
    }));
  }

  /**
   * Get execution statistics
   */
  getExecutionStatistics(taskId?: string) {
    return this.executionRecorder.getStatistics(taskId);
  }

  /**
   * Get task statistics
   */
  getTaskStatistics() {
    return this.taskManager.getStatistics();
  }

  /**
   * Clean up old executions
   */
  async cleanupOldExecutions(maxAgeDays: number = 30, maxExecutionsPerTask: number = 100): Promise<void> {
    await this.timingExecutor.cleanupOldExecutions(maxAgeDays, maxExecutionsPerTask);
  }

  /**
   * Sync timings with OS scheduler (repair/reconcile)
   */
  syncWithScheduler(): { added: number; removed: number; errors: string[] } {
    if (!this.scheduleManager) {
      throw new Error('Scheduler not available on this platform');
    }

    const errors: string[] = [];
    let added = 0;
    let removed = 0;

    // Get all timing groups
    const timingGroups = this.taskManager.getAllTimingGroups();

    // Get all OS schedules
    const osSchedules = this.scheduleManager.getJobs();
    const osScheduleIds = new Set(osSchedules.map(s => s.id));

    // Add missing timings to OS scheduler (only if they have active tasks)
    for (const timing of timingGroups) {
      const activeTasks = this.taskManager.getActiveTasksForTiming(timing.id);
      if (activeTasks.length > 0 && !osScheduleIds.has(timing.id)) {
        try {
          const ncpPath = this.getNCPExecutablePath();
          const command = `${ncpPath} _timing-run ${timing.id}`;
          this.scheduleManager.addJob(timing.id, timing.cronExpression, command);
          added++;
          logger.info(`[Scheduler] Added missing timing to OS scheduler: ${timing.name}`);
        } catch (error) {
          errors.push(`Failed to add ${timing.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Remove orphaned OS schedules (timings that no longer exist or have no active tasks)
    const timingIds = new Set(timingGroups.map(t => t.id));
    for (const osSchedule of osSchedules) {
      const timing = this.taskManager.getTimingGroup(osSchedule.id);
      const shouldRemove = !timingIds.has(osSchedule.id) ||
                          (timing && this.taskManager.getActiveTasksForTiming(timing.id).length === 0);

      if (shouldRemove && osSchedule.id !== this.cleanupTimingId) { // Don't remove cleanup timing
        try {
          this.scheduleManager.removeJob(osSchedule.id);
          removed++;
          logger.info(`[Scheduler] Removed orphaned OS schedule: ${osSchedule.id}`);
        } catch (error) {
          errors.push(`Failed to remove ${osSchedule.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    logger.info(`[Scheduler] Sync complete: added ${added}, removed ${removed}, errors ${errors.length}`);

    return { added, removed, errors };
  }

  // =============================================================================
  // BACKWARD COMPATIBILITY METHODS (V1 API)
  // =============================================================================

  /**
   * Get a job by ID (backward compatibility wrapper)
   * @deprecated Use getTask() instead
   */
  getJob(taskId: string): ScheduledTask | null {
    return this.getTask(taskId);
  }

  /**
   * Get a job by name (backward compatibility wrapper)
   * @deprecated Use getTaskByName() instead
   */
  getJobByName(name: string): ScheduledTask | null {
    return this.getTaskByName(name);
  }

  /**
   * List all jobs (backward compatibility wrapper)
   * @deprecated Use listTasks() instead
   */
  listJobs(statusFilter?: ScheduledTask['status']): ScheduledTask[] {
    return this.listTasks(statusFilter);
  }

  /**
   * Update a job (backward compatibility wrapper)
   * @deprecated Use updateTask() instead
   */
  async updateJob(taskId: string, updates: Partial<CreateJobOptions>): Promise<ScheduledTask> {
    return this.updateTask(taskId, updates);
  }

  /**
   * Pause a job (backward compatibility wrapper)
   * @deprecated Use pauseTask() instead
   */
  pauseJob(taskId: string): void {
    return this.pauseTask(taskId);
  }

  /**
   * Resume a job (backward compatibility wrapper)
   * @deprecated Use resumeTask() instead
   */
  resumeJob(taskId: string): void {
    return this.resumeTask(taskId);
  }

  /**
   * Delete a job (backward compatibility wrapper)
   * @deprecated Use deleteTask() instead
   */
  deleteJob(taskId: string): void {
    return this.deleteTask(taskId);
  }

  /**
   * Get job statistics (backward compatibility wrapper)
   * @deprecated Use getTaskStatistics() instead
   */
  getJobStatistics() {
    const stats = this.getTaskStatistics();
    // Map new property names to old names for backward compatibility
    return {
      total: stats.totalTasks,
      active: stats.activeTasks,
      paused: stats.pausedTasks,
      completed: stats.completedTasks,
      error: stats.errorTasks
    };
  }

  /**
   * Sync jobs with OS scheduler (backward compatibility wrapper)
   * @deprecated Use syncWithScheduler() instead
   */
  syncWithCrontab(): { added: number; removed: number; errors: string[] } {
    return this.syncWithScheduler();
  }

  /**
   * Catch up on missed task executions
   * Executes tasks with catchupMissed=true that should have run while system was off
   */
  async catchupMissedExecutions(): Promise<{ executed: number; skipped: number; failed: number; errors: string[] }> {
    logger.info('[Scheduler] Checking for missed task executions...');

    const errors: string[] = [];
    let executed = 0;
    let skipped = 0;
    let failed = 0;

    // Get all active tasks with catchupMissed enabled
    const allTasks = this.taskManager.getAllTasks();
    const catchupTasks = allTasks.filter((task: ScheduledTask) =>
      task.status === 'active' && task.catchupMissed === true
    );

    if (catchupTasks.length === 0) {
      logger.info('[Scheduler] No tasks with catchupMissed enabled');
      return { executed: 0, skipped: 0, failed: 0, errors: [] };
    }

    logger.info(`[Scheduler] Found ${catchupTasks.length} tasks with catchupMissed enabled`);

    const now = new Date();

    for (const task of catchupTasks) {
      try {
        // Determine last execution time or creation time
        const lastRun = task.lastExecutionAt
          ? new Date(task.lastExecutionAt)
          : new Date(task.createdAt);

        // Calculate when the task should have last run based on its cron schedule
        const timing = this.taskManager.getTimingGroup(task.timingId);
        if (!timing) {
          errors.push(`Task ${task.name}: Timing group not found`);
          skipped++;
          continue;
        }

        // Check if task should have run since last execution
        // For simplicity, if more than the cron interval has passed, consider it missed
        const shouldCatchup = this.shouldCatchupTask(task, timing, lastRun, now);

        if (shouldCatchup) {
          logger.info(`[Scheduler] Catching up missed execution for task: ${task.name}`);

          // Execute the task via the timing executor (creates timing with single task)
          try {
            const result = await this.timingExecutor.executeTimingGroup(task.timingId, 300000);

            if (result.successfulTasks > 0) {
              executed++;
              logger.info(`[Scheduler] Successfully caught up task: ${task.name}`);
            } else if (result.failedTasks > 0) {
              failed++;
              const errorMsg = result.results[0]?.error || 'Unknown error';
              errors.push(`Task ${task.name}: ${errorMsg}`);
              logger.error(`[Scheduler] Failed to catch up task ${task.name}: ${errorMsg}`);
            }
          } catch (execError) {
            failed++;
            const errorMsg = execError instanceof Error ? execError.message : String(execError);
            errors.push(`Task ${task.name}: ${errorMsg}`);
            logger.error(`[Scheduler] Error executing task ${task.name}: ${errorMsg}`);
          }
        } else {
          skipped++;
          logger.debug(`[Scheduler] Task ${task.name} does not need catchup`);
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Task ${task.name}: ${errorMsg}`);
        logger.error(`[Scheduler] Error during catchup for ${task.name}: ${errorMsg}`);
      }
    }

    logger.info(`[Scheduler] Catchup complete: ${executed} executed, ${skipped} skipped, ${failed} failed`);
    return { executed, skipped, failed, errors };
  }

  /**
   * Determine if a task should be caught up
   * Returns true if the task should have run at least once since lastRun
   */
  private shouldCatchupTask(task: ScheduledTask, timing: TimingGroup, lastRun: Date, now: Date): boolean {
    // If fireOnce and already executed, skip
    if (task.fireOnce && task.executionCount > 0) {
      return false;
    }

    // If maxExecutions reached, skip
    if (task.maxExecutions && task.executionCount >= task.maxExecutions) {
      return false;
    }

    // If past endDate, skip
    if (task.endDate && new Date(task.endDate) < now) {
      return false;
    }

    // Simple heuristic: if more than 2x the minimum cron interval has passed, consider it missed
    // For example, if task runs every hour and 2+ hours passed, it's missed
    const cronParts = timing.cronExpression.split(/\s+/);
    const minutePart = cronParts[0];

    let intervalMinutes: number;
    if (minutePart.startsWith('*/')) {
      // Every N minutes
      intervalMinutes = parseInt(minutePart.substring(2));
    } else if (minutePart === '*') {
      // Every minute
      intervalMinutes = 1;
    } else {
      // Specific time - check if at least 24 hours passed (daily or less frequent)
      intervalMinutes = 24 * 60;
    }

    const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
    const missed = minutesSinceLastRun > (intervalMinutes * 1.5);

    return missed;
  }
}
