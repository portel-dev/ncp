/**
 * Task Scheduler Manager - Native Windows schtasks manipulation
 * Zero dependencies - uses direct schtasks.exe commands
 * Windows 10/11 only
 */

import { execSync } from 'child_process';
import { platform } from 'os';
import { logger } from '../../utils/logger.js';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

export interface TaskEntry {
  id: string;
  cronExpression: string;
  command: string;
  comment?: string;
}

interface ScheduleInfo {
  scheduleType: 'MINUTE' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONCE';
  modifier?: string; // e.g., "5" for every 5 minutes, "MON,WED,FRI" for specific days
  day?: string; // For MONTHLY schedules - day of month (1-31)
  startTime?: string; // HH:mm format
}

export class TaskSchedulerManager {
  private static readonly TASK_PREFIX = 'NCP_';
  private static readonly METADATA_DIR = join(homedir(), '.ncp', 'scheduler', 'windows-tasks');

  constructor() {
    // Validate platform
    const currentPlatform = platform();
    if (currentPlatform !== 'win32') {
      throw new Error('TaskSchedulerManager only supports Windows. Use CronManager for Linux or LaunchdManager for macOS.');
    }

    // Ensure metadata directory exists
    if (!existsSync(TaskSchedulerManager.METADATA_DIR)) {
      mkdirSync(TaskSchedulerManager.METADATA_DIR, { recursive: true });
    }

    logger.debug('[TaskSchedulerManager] Initialized for Windows');
  }

  /**
   * Check if schtasks command is available
   */
  private isSchTasksAvailable(): boolean {
    try {
      execSync('where schtasks', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get helpful error message when schtasks is not available
   */
  private getSchTasksNotAvailableMessage(): string {
    return `Windows Task Scheduler (schtasks.exe) is not available on this system.

This is required for scheduling jobs on Windows. The schtasks command should be included by default on Windows 10 and later.

Possible solutions:
1. Ensure you're running on Windows 10 or later
2. Check if Task Scheduler service is running:
   - Open Services (services.msc)
   - Find "Task Scheduler" service
   - Ensure it's running and set to Automatic

3. If schtasks.exe is missing, try:
   - Run System File Checker: sfc /scannow
   - Reinstall Windows Management Instrumentation

For more information, visit:
https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks

This error message is also visible to AI assistants to help troubleshoot the issue.`;
  }

  /**
   * Convert cron expression to Windows Task Scheduler schedule
   * This is a simplified conversion - some cron expressions cannot be represented in schtasks
   */
  private cronToSchedule(cronExpression: string): ScheduleInfo {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error('Invalid cron expression - must have 5 fields');
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // MINUTE schedule - e.g., "*/5 * * * *" (every 5 minutes)
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const interval = minute.substring(2);
      return {
        scheduleType: 'MINUTE',
        modifier: interval
      };
    }

    // HOURLY schedule - e.g., "0 * * * *" (every hour) or "30 */2 * * *" (every 2 hours at :30)
    if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const interval = hour.substring(2);
      const startMinute = minute === '*' ? '00' : minute.padStart(2, '0');
      return {
        scheduleType: 'HOURLY',
        modifier: interval,
        startTime: `${startMinute}:00` // schtasks needs a start time for hourly
      };
    }

    if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        scheduleType: 'HOURLY',
        modifier: '1',
        startTime: `${minute.padStart(2, '0')}:00`
      };
    }

    // DAILY schedule - e.g., "0 9 * * *" (every day at 9:00)
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const startHour = hour === '*' ? '00' : hour.padStart(2, '0');
      const startMinute = minute === '*' ? '00' : minute.padStart(2, '0');
      return {
        scheduleType: 'DAILY',
        modifier: '1',
        startTime: `${startHour}:${startMinute}`
      };
    }

    // WEEKLY schedule - e.g., "0 9 * * 1" (every Monday at 9:00)
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const dayMap: Record<string, string> = {
        '0': 'SUN', '1': 'MON', '2': 'TUE', '3': 'WED',
        '4': 'THU', '5': 'FRI', '6': 'SAT', '7': 'SUN'
      };

      let days: string;
      if (dayOfWeek.includes(',')) {
        // Multiple days: "1,3,5" -> "MON,WED,FRI"
        days = dayOfWeek.split(',').map(d => dayMap[d.trim()]).join(',');
      } else {
        days = dayMap[dayOfWeek];
      }

      const startHour = hour === '*' ? '00' : hour.padStart(2, '0');
      const startMinute = minute === '*' ? '00' : minute.padStart(2, '0');

      return {
        scheduleType: 'WEEKLY',
        modifier: days,
        startTime: `${startHour}:${startMinute}`
      };
    }

    // MONTHLY schedule - e.g., "0 9 15 * *" (15th of every month at 9:00)
    if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
      const startHour = hour === '*' ? '00' : hour.padStart(2, '0');
      const startMinute = minute === '*' ? '00' : minute.padStart(2, '0');

      return {
        scheduleType: 'MONTHLY',
        modifier: '1', // Every 1 month
        day: dayOfMonth, // Day of month (1-31)
        startTime: `${startHour}:${startMinute}`
      };
    }

    // If we can't convert, fall back to DAILY
    logger.warn(`[TaskSchedulerManager] Complex cron expression "${cronExpression}" converted to DAILY schedule`);
    const startHour = hour === '*' ? '00' : hour.padStart(2, '0');
    const startMinute = minute === '*' ? '00' : minute.padStart(2, '0');
    return {
      scheduleType: 'DAILY',
      modifier: '1',
      startTime: `${startHour}:${startMinute}`
    };
  }

  /**
   * Get metadata file path for a job
   */
  private getMetadataPath(jobId: string): string {
    return join(TaskSchedulerManager.METADATA_DIR, `${jobId}.json`);
  }

  /**
   * Save task metadata (cron expression and command)
   */
  private saveMetadata(jobId: string, cronExpression: string, command: string): void {
    const metadata = { jobId, cronExpression, command };
    const metadataPath = this.getMetadataPath(jobId);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Load task metadata
   */
  private loadMetadata(jobId: string): { cronExpression: string; command: string } | null {
    const metadataPath = this.getMetadataPath(jobId);
    if (!existsSync(metadataPath)) {
      return null;
    }
    try {
      const data = readFileSync(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Delete task metadata
   */
  private deleteMetadata(jobId: string): void {
    const metadataPath = this.getMetadataPath(jobId);
    if (existsSync(metadataPath)) {
      try {
        const { unlinkSync } = require('fs');
        unlinkSync(metadataPath);
      } catch (error) {
        logger.warn(`[TaskSchedulerManager] Failed to delete metadata for ${jobId}: ${error}`);
      }
    }
  }

  /**
   * Get task name with NCP prefix
   */
  private getTaskName(jobId: string): string {
    return `${TaskSchedulerManager.TASK_PREFIX}${jobId}`;
  }

  /**
   * Add or update a scheduled task
   */
  addJob(jobId: string, cronExpression: string, command: string): void {
    if (!this.isSchTasksAvailable()) {
      throw new Error(this.getSchTasksNotAvailableMessage());
    }

    logger.info(`[TaskSchedulerManager] Adding job: ${jobId} with schedule: ${cronExpression}`);

    // Convert cron to schtasks schedule
    const schedule = this.cronToSchedule(cronExpression);
    const taskName = this.getTaskName(jobId);

    // Delete existing task if present
    try {
      execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: 'pipe' });
      logger.debug(`[TaskSchedulerManager] Deleted existing task: ${taskName}`);
    } catch {
      // Task doesn't exist, that's fine
    }

    // Build schtasks command
    let schTasksCmd = `schtasks /Create /TN "${taskName}" /TR "${command}" /SC ${schedule.scheduleType}`;

    if (schedule.modifier) {
      if (schedule.scheduleType === 'WEEKLY') {
        schTasksCmd += ` /D ${schedule.modifier}`;
      } else {
        schTasksCmd += ` /MO ${schedule.modifier}`;
      }
    }

    // Add day parameter for MONTHLY schedules
    if (schedule.day && schedule.scheduleType === 'MONTHLY') {
      schTasksCmd += ` /D ${schedule.day}`;
    }

    if (schedule.startTime) {
      schTasksCmd += ` /ST ${schedule.startTime}`;
    }

    // Run as current user, don't prompt for password
    schTasksCmd += ' /RU SYSTEM /F';

    try {
      execSync(schTasksCmd, { stdio: 'pipe' });
      logger.info(`[TaskSchedulerManager] Successfully created task ${taskName}`);

      // Save metadata for reconstruction
      this.saveMetadata(jobId, cronExpression, command);
    } catch (error) {
      throw new Error(`Failed to create Windows scheduled task: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Remove a scheduled task
   */
  removeJob(jobId: string): void {
    logger.info(`[TaskSchedulerManager] Removing job: ${jobId}`);

    const taskName = this.getTaskName(jobId);

    try {
      execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: 'pipe' });
      logger.info(`[TaskSchedulerManager] Successfully deleted task ${taskName}`);
    } catch (error) {
      logger.warn(`[TaskSchedulerManager] Task ${taskName} not found or could not be deleted`);
    }

    // Delete metadata
    this.deleteMetadata(jobId);
  }

  /**
   * Get all NCP jobs from Task Scheduler
   */
  getJobs(): TaskEntry[] {
    const jobs: TaskEntry[] = [];

    try {
      // List all tasks with NCP prefix
      const output = execSync('schtasks /Query /FO CSV /NH', { encoding: 'utf-8' });
      const lines = output.split('\n').filter(line => line.trim());

      for (const line of lines) {
        // CSV format: "TaskName","Next Run Time","Status"
        const match = line.match(/^"([^"]+)"/);
        if (match) {
          const taskName = match[1];
          if (taskName.startsWith(`\\${TaskSchedulerManager.TASK_PREFIX}`)) {
            // Extract job ID
            const jobId = taskName.substring(TaskSchedulerManager.TASK_PREFIX.length + 1); // +1 for leading backslash

            // Load metadata
            const metadata = this.loadMetadata(jobId);
            if (metadata) {
              jobs.push({
                id: jobId,
                cronExpression: metadata.cronExpression,
                command: metadata.command
              });
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`[TaskSchedulerManager] Failed to query tasks: ${error}`);
    }

    return jobs;
  }

  /**
   * Get a specific job
   */
  getJob(jobId: string): TaskEntry | null {
    const taskName = this.getTaskName(jobId);

    try {
      // Query specific task
      execSync(`schtasks /Query /TN "${taskName}" /FO LIST`, { stdio: 'pipe' });

      // Task exists, load metadata
      const metadata = this.loadMetadata(jobId);
      if (metadata) {
        return {
          id: jobId,
          cronExpression: metadata.cronExpression,
          command: metadata.command
        };
      }
    } catch {
      // Task doesn't exist
    }

    return null;
  }

  /**
   * Check if a job exists in Task Scheduler
   */
  hasJob(jobId: string): boolean {
    return this.getJob(jobId) !== null;
  }

  /**
   * Remove all NCP jobs from Task Scheduler
   */
  removeAllJobs(): void {
    logger.info('[TaskSchedulerManager] Removing all NCP jobs from Task Scheduler');

    const jobs = this.getJobs();
    for (const job of jobs) {
      this.removeJob(job.id);
    }

    logger.info('[TaskSchedulerManager] Successfully removed all NCP jobs');
  }

  /**
   * Validate cron expression format (re-uses same validation as CronManager)
   */
  static validateCronExpression(expression: string): { valid: boolean; error?: string } {
    const parts = expression.trim().split(/\s+/);

    if (parts.length !== 5) {
      return {
        valid: false,
        error: `Cron expression must have exactly 5 fields (minute hour day month weekday), got ${parts.length}`
      };
    }

    // Basic validation for each field
    const validators = [
      { name: 'minute', range: [0, 59] },
      { name: 'hour', range: [0, 23] },
      { name: 'day', range: [1, 31] },
      { name: 'month', range: [1, 12] },
      { name: 'weekday', range: [0, 7] } // 0 and 7 both represent Sunday
    ];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const validator = validators[i];

      // Allow wildcard
      if (part === '*') continue;

      // Validate */N pattern
      if (/^\*\/\d+$/.test(part)) {
        const step = parseInt(part.split('/')[1]);
        if (step < 1 || step > validator.range[1]) {
          return {
            valid: false,
            error: `Invalid ${validator.name} step value: ${step} (must be 1-${validator.range[1]})`
          };
        }
        continue;
      }

      // Validate N-M range pattern
      if (/^\d+-\d+$/.test(part)) {
        const [start, end] = part.split('-').map(n => parseInt(n));
        if (start < validator.range[0] || start > validator.range[1]) {
          return {
            valid: false,
            error: `Invalid ${validator.name} range start: ${start} (must be ${validator.range[0]}-${validator.range[1]})`
          };
        }
        if (end < validator.range[0] || end > validator.range[1]) {
          return {
            valid: false,
            error: `Invalid ${validator.name} range end: ${end} (must be ${validator.range[0]}-${validator.range[1]})`
          };
        }
        continue;
      }

      // Validate N,M,O list pattern
      if (/^[\d,]+$/.test(part)) {
        const values = part.split(',').map(n => parseInt(n));
        for (const val of values) {
          if (isNaN(val) || val < validator.range[0] || val > validator.range[1]) {
            return {
              valid: false,
              error: `Invalid ${validator.name} value in list: ${val} (must be ${validator.range[0]}-${validator.range[1]})`
            };
          }
        }
        continue;
      }

      // If we get here, it's an invalid pattern
      return {
        valid: false,
        error: `Invalid ${validator.name} pattern: ${part}`
      };
    }

    return { valid: true };
  }
}
