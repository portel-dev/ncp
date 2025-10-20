/**
 * Cron Manager - Native OS crontab manipulation
 * Zero dependencies - uses direct crontab binary commands
 * Unix/Linux/macOS only (Windows support via Task Scheduler would be separate)
 */

import { execSync } from 'child_process';
import { platform } from 'os';
import { logger } from '../../utils/logger.js';

export interface CronEntry {
  id: string;
  cronExpression: string;
  command: string;
  comment?: string;
}

export class CronManager {
  private static readonly MARKER_PREFIX = '# NCP_JOB:';
  private static readonly NCP_SECTION_START = '# === NCP SCHEDULED JOBS - DO NOT EDIT MANUALLY ===';
  private static readonly NCP_SECTION_END = '# === END NCP SCHEDULED JOBS ===';

  constructor() {
    // Validate platform
    const currentPlatform = platform();
    if (currentPlatform === 'win32') {
      throw new Error('CronManager does not support Windows. Use TaskSchedulerManager instead.');
    }

    logger.debug('[CronManager] Initialized for platform: ' + currentPlatform);
  }

  /**
   * Check if crontab command is available
   */
  private isCrontabAvailable(): boolean {
    try {
      execSync('which crontab', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current user's crontab
   */
  private getCurrentCrontab(): string {
    if (!this.isCrontabAvailable()) {
      throw new Error('crontab command not found. Please install cron.');
    }

    try {
      return execSync('crontab -l 2>/dev/null || echo ""', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      // If crontab returns error (e.g., "no crontab for user"), return empty string
      logger.debug('[CronManager] No existing crontab found, starting fresh');
      return '';
    }
  }

  /**
   * Write crontab content
   */
  private writeCrontab(content: string): void {
    try {
      // Use heredoc to avoid shell escaping issues
      execSync('crontab -', {
        input: content,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      logger.debug('[CronManager] Successfully wrote crontab');
    } catch (error) {
      throw new Error(`Failed to write crontab: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse NCP jobs from crontab
   */
  private parseNCPJobs(crontab: string): CronEntry[] {
    const lines = crontab.split('\n');
    const jobs: CronEntry[] = [];
    let inNCPSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line === CronManager.NCP_SECTION_START) {
        inNCPSection = true;
        continue;
      }

      if (line === CronManager.NCP_SECTION_END) {
        inNCPSection = false;
        continue;
      }

      if (inNCPSection && line.startsWith(CronManager.MARKER_PREFIX)) {
        // Extract job ID from comment
        const jobId = line.substring(CronManager.MARKER_PREFIX.length).trim();

        // Next line should be the cron entry
        if (i + 1 < lines.length) {
          const cronLine = lines[i + 1];
          const parsed = this.parseCronLine(cronLine);
          if (parsed) {
            jobs.push({
              id: jobId,
              cronExpression: parsed.cronExpression,
              command: parsed.command
            });
          }
        }
      }
    }

    return jobs;
  }

  /**
   * Parse a single cron line
   */
  private parseCronLine(line: string): { cronExpression: string; command: string } | null {
    if (!line || line.startsWith('#') || !line.trim()) {
      return null;
    }

    // Cron format: minute hour day month weekday command
    // Split on whitespace, first 5 fields are schedule, rest is command
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) {
      return null;
    }

    const cronExpression = parts.slice(0, 5).join(' ');
    const command = parts.slice(5).join(' ');

    return { cronExpression, command };
  }

  /**
   * Get non-NCP crontab entries
   */
  private getNonNCPEntries(crontab: string): string {
    const lines = crontab.split('\n');
    const nonNCPLines: string[] = [];
    let inNCPSection = false;

    for (const line of lines) {
      if (line === CronManager.NCP_SECTION_START) {
        inNCPSection = true;
        continue;
      }

      if (line === CronManager.NCP_SECTION_END) {
        inNCPSection = false;
        continue;
      }

      if (!inNCPSection) {
        nonNCPLines.push(line);
      }
    }

    // Remove trailing empty lines
    while (nonNCPLines.length > 0 && !nonNCPLines[nonNCPLines.length - 1].trim()) {
      nonNCPLines.pop();
    }

    return nonNCPLines.join('\n');
  }

  /**
   * Build NCP section content
   */
  private buildNCPSection(jobs: CronEntry[]): string {
    if (jobs.length === 0) {
      return '';
    }

    const lines = [CronManager.NCP_SECTION_START];

    for (const job of jobs) {
      lines.push(`${CronManager.MARKER_PREFIX} ${job.id}`);
      lines.push(`${job.cronExpression} ${job.command}`);
    }

    lines.push(CronManager.NCP_SECTION_END);
    return lines.join('\n');
  }

  /**
   * Add or update a cron job
   */
  addJob(jobId: string, cronExpression: string, command: string): void {
    logger.info(`[CronManager] Adding job: ${jobId} with schedule: ${cronExpression}`);

    const currentCrontab = this.getCurrentCrontab();
    const existingJobs = this.parseNCPJobs(currentCrontab);
    const nonNCPContent = this.getNonNCPEntries(currentCrontab);

    // Remove existing job with same ID if present
    const updatedJobs = existingJobs.filter(j => j.id !== jobId);

    // Add new job
    updatedJobs.push({
      id: jobId,
      cronExpression,
      command
    });

    // Build new crontab
    const ncpSection = this.buildNCPSection(updatedJobs);
    const newCrontab = nonNCPContent
      ? `${nonNCPContent}\n\n${ncpSection}\n`
      : `${ncpSection}\n`;

    this.writeCrontab(newCrontab);
    logger.info(`[CronManager] Successfully added job ${jobId} to crontab`);
  }

  /**
   * Remove a cron job
   */
  removeJob(jobId: string): void {
    logger.info(`[CronManager] Removing job: ${jobId}`);

    const currentCrontab = this.getCurrentCrontab();
    const existingJobs = this.parseNCPJobs(currentCrontab);
    const nonNCPContent = this.getNonNCPEntries(currentCrontab);

    // Remove job with matching ID
    const updatedJobs = existingJobs.filter(j => j.id !== jobId);

    if (updatedJobs.length === existingJobs.length) {
      logger.warn(`[CronManager] Job ${jobId} not found in crontab`);
      return;
    }

    // Build new crontab
    const ncpSection = this.buildNCPSection(updatedJobs);
    const newCrontab = ncpSection
      ? (nonNCPContent ? `${nonNCPContent}\n\n${ncpSection}\n` : `${ncpSection}\n`)
      : (nonNCPContent ? `${nonNCPContent}\n` : '');

    this.writeCrontab(newCrontab);
    logger.info(`[CronManager] Successfully removed job ${jobId} from crontab`);
  }

  /**
   * Get all NCP jobs from crontab
   */
  getJobs(): CronEntry[] {
    const currentCrontab = this.getCurrentCrontab();
    return this.parseNCPJobs(currentCrontab);
  }

  /**
   * Get a specific job
   */
  getJob(jobId: string): CronEntry | null {
    const jobs = this.getJobs();
    return jobs.find(j => j.id === jobId) || null;
  }

  /**
   * Check if a job exists in crontab
   */
  hasJob(jobId: string): boolean {
    return this.getJob(jobId) !== null;
  }

  /**
   * Remove all NCP jobs from crontab
   */
  removeAllJobs(): void {
    logger.info('[CronManager] Removing all NCP jobs from crontab');

    const currentCrontab = this.getCurrentCrontab();
    const nonNCPContent = this.getNonNCPEntries(currentCrontab);

    const newCrontab = nonNCPContent ? `${nonNCPContent}\n` : '';
    this.writeCrontab(newCrontab);

    logger.info('[CronManager] Successfully removed all NCP jobs');
  }

  /**
   * Validate cron expression format
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
