/**
 * Migration Utility - Convert from jobs.json (V1) to schedule.json (V2)
 * Migrates from one-job-per-schedule to timing-groups architecture
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { getSchedulerDirectory } from '../../utils/ncp-paths.js';
import { ScheduledJob, JobsStorage, ScheduledTask, TimingGroup, SchedulerStorage } from '../../types/scheduler.js';
import { cronToTimingId, cronToTimingName, normalizeCronExpression } from './cron-expression-utils.js';
import { logger } from '../../utils/logger.js';

export interface MigrationResult {
  success: boolean;
  jobsCount: number;
  tasksCount: number;
  timingsCount: number;
  backupPath?: string;
  error?: string;
}

export class SchedulerMigration {
  private schedulerDir: string;
  private oldJobsFile: string;
  private newScheduleFile: string;

  constructor() {
    this.schedulerDir = getSchedulerDirectory();
    this.oldJobsFile = join(this.schedulerDir, 'jobs.json');
    this.newScheduleFile = join(this.schedulerDir, 'schedule.json');
  }

  /**
   * Check if migration is needed
   */
  needsMigration(): boolean {
    // Migration needed if:
    // 1. Old jobs.json exists
    // 2. New schedule.json doesn't exist OR is older than jobs.json
    if (!existsSync(this.oldJobsFile)) {
      return false;
    }

    if (!existsSync(this.newScheduleFile)) {
      return true;
    }

    // If both exist, check which is newer
    const oldStats = require('fs').statSync(this.oldJobsFile);
    const newStats = require('fs').statSync(this.newScheduleFile);

    // If jobs.json is newer, migration may be needed
    return oldStats.mtime > newStats.mtime;
  }

  /**
   * Perform migration from V1 (jobs) to V2 (tasks + timings)
   */
  migrate(): MigrationResult {
    try {
      logger.info('[Migration] Starting migration from jobs.json to schedule.json');

      // Load old jobs
      const oldStorage = this.loadOldJobs();
      if (!oldStorage || Object.keys(oldStorage.jobs).length === 0) {
        logger.info('[Migration] No jobs to migrate');
        return {
          success: true,
          jobsCount: 0,
          tasksCount: 0,
          timingsCount: 0
        };
      }

      const jobs = Object.values(oldStorage.jobs);
      logger.info(`[Migration] Found ${jobs.length} jobs to migrate`);

      // Group jobs by cron expression
      const jobsByTiming = this.groupJobsByTiming(jobs);
      logger.info(`[Migration] Grouped into ${jobsByTiming.size} unique timings`);

      // Create new storage structure
      const newStorage: SchedulerStorage = {
        version: '2.0.0',
        tasks: {},
        timings: {}
      };

      // Convert each timing group
      for (const [cronExpression, jobsInTiming] of jobsByTiming) {
        const timingId = cronToTimingId(cronExpression);
        const timingName = cronToTimingName(cronExpression);

        // Create timing group
        const timing: TimingGroup = {
          id: timingId,
          name: timingName,
          cronExpression,
          timezone: jobsInTiming[0].timezone, // Use timezone from first job
          taskIds: [],
          createdAt: new Date().toISOString()
        };

        // Convert each job in this timing to a task
        for (const job of jobsInTiming) {
          const task: ScheduledTask = {
            id: job.id, // Keep same ID for continuity
            name: job.name,
            description: job.description,
            timingId,
            tool: job.tool,
            parameters: job.parameters,
            fireOnce: job.fireOnce,
            maxExecutions: job.maxExecutions,
            endDate: job.endDate,
            createdAt: job.createdAt,
            status: job.status,
            errorMessage: job.errorMessage,
            workingDirectory: job.workingDirectory,
            executionCount: job.executionCount,
            lastExecutionId: job.lastExecutionId,
            lastExecutionAt: job.lastExecutionAt
          };

          newStorage.tasks[task.id] = task;
          timing.taskIds.push(task.id);
        }

        newStorage.timings[timingId] = timing;
      }

      // Backup old jobs.json
      const backupPath = this.backupOldJobs();

      // Write new schedule.json
      this.writeNewSchedule(newStorage);

      logger.info(`[Migration] Migration successful:`);
      logger.info(`  - Jobs migrated: ${jobs.length}`);
      logger.info(`  - Tasks created: ${Object.keys(newStorage.tasks).length}`);
      logger.info(`  - Timings created: ${Object.keys(newStorage.timings).length}`);
      logger.info(`  - Backup created: ${backupPath}`);

      return {
        success: true,
        jobsCount: jobs.length,
        tasksCount: Object.keys(newStorage.tasks).length,
        timingsCount: Object.keys(newStorage.timings).length,
        backupPath
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Migration] Migration failed: ${errorMessage}`);
      return {
        success: false,
        jobsCount: 0,
        tasksCount: 0,
        timingsCount: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Load jobs from old jobs.json
   */
  private loadOldJobs(): JobsStorage | null {
    if (!existsSync(this.oldJobsFile)) {
      return null;
    }

    try {
      const content = readFileSync(this.oldJobsFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`[Migration] Failed to load jobs.json: ${error}`);
      return null;
    }
  }

  /**
   * Group jobs by cron expression (normalized)
   */
  private groupJobsByTiming(jobs: ScheduledJob[]): Map<string, ScheduledJob[]> {
    const groups = new Map<string, ScheduledJob[]>();

    for (const job of jobs) {
      const normalized = normalizeCronExpression(job.cronExpression);

      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }

      groups.get(normalized)!.push(job);
    }

    return groups;
  }

  /**
   * Backup old jobs.json
   */
  private backupOldJobs(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(this.schedulerDir, `jobs.json.backup-${timestamp}`);

    try {
      renameSync(this.oldJobsFile, backupPath);
      logger.info(`[Migration] Backed up jobs.json to ${backupPath}`);
      return backupPath;
    } catch (error) {
      logger.warn(`[Migration] Failed to backup jobs.json: ${error}`);
      // Don't fail migration if backup fails
      return '';
    }
  }

  /**
   * Write new schedule.json
   */
  private writeNewSchedule(storage: SchedulerStorage): void {
    try {
      const content = JSON.stringify(storage, null, 2);
      writeFileSync(this.newScheduleFile, content, 'utf-8');
      logger.info(`[Migration] Wrote schedule.json with ${Object.keys(storage.tasks).length} tasks`);
    } catch (error) {
      throw new Error(`Failed to write schedule.json: ${error}`);
    }
  }

  /**
   * Get migration summary for display
   */
  getMigrationSummary(): string {
    if (!this.needsMigration()) {
      return 'No migration needed - already using V2 format';
    }

    const oldStorage = this.loadOldJobs();
    if (!oldStorage) {
      return 'No jobs.json found';
    }

    const jobCount = Object.keys(oldStorage.jobs).length;
    const jobs = Object.values(oldStorage.jobs);
    const timingGroups = this.groupJobsByTiming(jobs);

    return `Migration available:\n` +
           `  Jobs to migrate: ${jobCount}\n` +
           `  Will create ${timingGroups.size} timing groups\n` +
           `  OS scheduler entries will reduce from ${jobCount} to ${timingGroups.size}`;
  }
}

/**
 * Auto-migrate if needed (called on scheduler initialization)
 */
export async function autoMigrate(): Promise<void> {
  const migration = new SchedulerMigration();

  if (!migration.needsMigration()) {
    logger.debug('[Migration] No migration needed');
    return;
  }

  logger.info('[Migration] Auto-migration triggered');
  logger.info('[Migration] ' + migration.getMigrationSummary());

  const result = migration.migrate();

  if (result.success) {
    logger.info('[Migration] Auto-migration completed successfully');
    logger.info(`[Migration] Note: OS scheduler entries need to be updated manually or via sync command`);
  } else {
    logger.error(`[Migration] Auto-migration failed: ${result.error}`);
    logger.error('[Migration] Falling back to old jobs.json format');
  }
}
