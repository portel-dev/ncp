/**
 * Launchd Manager - macOS native scheduling via launchd
 * Zero dependencies - uses launchctl binary commands
 * macOS only - does NOT require Full Disk Access (unlike cron)
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir, userInfo } from 'os';
import { logger } from '../../utils/logger.js';

export interface LaunchdCalendarInterval {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Month?: number;
  Weekday?: number;
}

export class LaunchdManager {
  private readonly launchAgentsDir: string;
  private static readonly LABEL_PREFIX = 'com.portel.ncp.job.';

  constructor() {
    this.launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');

    // Ensure LaunchAgents directory exists
    if (!existsSync(this.launchAgentsDir)) {
      mkdirSync(this.launchAgentsDir, { recursive: true });
    }

    logger.debug('[LaunchdManager] Initialized');
  }

  /**
   * Get helpful error message for launchd issues
   */
  private getLaunchdErrorMessage(operation: string, error: any): string {
    const errorMsg = error instanceof Error ? error.message : String(error);

    return `Failed to ${operation} with launchd: ${errorMsg}

Check launchd status:
  launchctl list | grep com.portel.ncp

Check permissions:
  ls -la ~/Library/LaunchAgents

View recent errors:
  log show --predicate 'subsystem == "com.apple.launchd"' --last 1h

Docs: https://www.launchd.info/

(This message is visible to AI assistants for troubleshooting)`;
  }

  /**
   * Convert cron expression to launchd calendar interval
   * Cron format: minute hour day month weekday
   */
  private cronToCalendarInterval(cronExpression: string): LaunchdCalendarInterval[] {
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const [minute, hour, day, month, weekday] = parts;

    // Handle simple cases first
    const interval: LaunchdCalendarInterval = {};

    // Parse minute (0-59 or *)
    if (minute !== '*') {
      if (minute.startsWith('*/')) {
        // Every N minutes - not directly supported, return multiple intervals
        const n = parseInt(minute.substring(2));
        const intervals: LaunchdCalendarInterval[] = [];
        for (let m = 0; m < 60; m += n) {
          intervals.push({ Minute: m });
        }
        return intervals;
      } else {
        interval.Minute = parseInt(minute);
      }
    }

    // Parse hour (0-23 or *)
    if (hour !== '*') {
      interval.Hour = parseInt(hour);
    }

    // Parse day of month (1-31 or *)
    if (day !== '*') {
      interval.Day = parseInt(day);
    }

    // Parse month (1-12 or *)
    if (month !== '*') {
      interval.Month = parseInt(month);
    }

    // Parse weekday (0-7, 0 and 7 = Sunday)
    if (weekday !== '*') {
      let wd = parseInt(weekday);
      // launchd uses 0=Sunday through 6=Saturday (same as cron)
      interval.Weekday = wd === 7 ? 0 : wd;
    }

    return [interval];
  }

  /**
   * Get the full path to node executable
   */
  private getNodePath(): string {
    try {
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
      return nodePath;
    } catch (error) {
      // Fallback to common locations
      const commonPaths = [
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node'
      ];

      for (const path of commonPaths) {
        if (existsSync(path)) {
          return path;
        }
      }

      throw new Error('Node executable not found. Please ensure node is installed.');
    }
  }

  /**
   * Create launchd plist for a job
   */
  private createPlist(jobId: string, calendarIntervals: LaunchdCalendarInterval[], command: string): string {
    const label = LaunchdManager.LABEL_PREFIX + jobId;

    // Build StartCalendarInterval array
    const intervalStrings = calendarIntervals.map(interval => {
      const parts: string[] = [];
      if (interval.Minute !== undefined) parts.push(`      <key>Minute</key>\n      <integer>${interval.Minute}</integer>`);
      if (interval.Hour !== undefined) parts.push(`      <key>Hour</key>\n      <integer>${interval.Hour}</integer>`);
      if (interval.Day !== undefined) parts.push(`      <key>Day</key>\n      <integer>${interval.Day}</integer>`);
      if (interval.Month !== undefined) parts.push(`      <key>Month</key>\n      <integer>${interval.Month}</integer>`);
      if (interval.Weekday !== undefined) parts.push(`      <key>Weekday</key>\n      <integer>${interval.Weekday}</integer>`);

      return `    <dict>\n${parts.join('\n')}\n    </dict>`;
    });

    const calendarIntervalXML = calendarIntervals.length === 1
      ? intervalStrings[0]
      : `  <array>\n${intervalStrings.join('\n')}\n  </array>`;

    // Parse command into program and arguments
    const cmdParts = command.split(/\s+/);
    const program = cmdParts[0];
    const args = cmdParts.slice(1);

    // Get node path to avoid PATH issues in launchd
    const nodePath = this.getNodePath();

    // Build ProgramArguments with explicit node path
    // Instead of relying on shebang, explicitly invoke: node <script> <args>
    const argsXML = `  <key>ProgramArguments</key>\n  <array>\n    <string>${nodePath}</string>\n    <string>${program}</string>\n${args.map(arg => `    <string>${arg}</string>`).join('\n')}\n  </array>`;

    // Add environment variables to ensure proper context
    const homeDir = homedir();
    const userName = userInfo().username;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  ${argsXML}
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${homeDir}</string>
    <key>USER</key>
    <string>${userName}</string>
    <key>LOGNAME</key>
    <string>${userName}</string>
  </dict>
  <key>StartCalendarInterval</key>
${calendarIntervalXML}
  <key>StandardInPath</key>
  <string>/dev/null</string>
  <key>StandardOutPath</key>
  <string>/tmp/ncp-launchd-${jobId}.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ncp-launchd-${jobId}.err</string>
</dict>
</plist>`;
  }

  /**
   * Get plist file path for a job
   */
  private getPlistPath(jobId: string): string {
    const label = LaunchdManager.LABEL_PREFIX + jobId;
    return join(this.launchAgentsDir, `${label}.plist`);
  }

  /**
   * Get launchd label for a job
   */
  private getLabel(jobId: string): string {
    return LaunchdManager.LABEL_PREFIX + jobId;
  }

  /**
   * Add a scheduled job using launchd
   */
  addJob(jobId: string, cronExpression: string, command: string): void {
    try {
      logger.debug(`[LaunchdManager] Adding job: ${jobId} with cron: ${cronExpression}`);

      // Convert cron to calendar intervals
      const intervals = this.cronToCalendarInterval(cronExpression);

      // Create plist content
      const plistContent = this.createPlist(jobId, intervals, command);
      const plistPath = this.getPlistPath(jobId);

      // Write plist file
      writeFileSync(plistPath, plistContent, { encoding: 'utf-8' });
      logger.debug(`[LaunchdManager] Created plist: ${plistPath}`);

      // Load the job with launchctl
      const label = this.getLabel(jobId);
      try {
        execSync(`launchctl load "${plistPath}"`, {
          stdio: 'pipe',
          encoding: 'utf-8'
        });
        logger.info(`[LaunchdManager] Loaded launchd job: ${label}`);
      } catch (loadError) {
        // If load fails, clean up the plist file
        unlinkSync(plistPath);
        throw loadError;
      }

    } catch (error) {
      logger.error(`[LaunchdManager] Failed to add job ${jobId}`);
      throw new Error(this.getLaunchdErrorMessage('add job', error));
    }
  }

  /**
   * Remove a scheduled job
   */
  removeJob(jobId: string): void {
    try {
      logger.debug(`[LaunchdManager] Removing job: ${jobId}`);

      const label = this.getLabel(jobId);
      const plistPath = this.getPlistPath(jobId);

      // Unload the job if it's loaded
      try {
        execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`, {
          stdio: 'pipe',
          encoding: 'utf-8'
        });
        logger.debug(`[LaunchdManager] Unloaded job: ${label}`);
      } catch (error) {
        // Ignore errors - job might not be loaded
        logger.debug(`[LaunchdManager] Job ${label} was not loaded`);
      }

      // Remove plist file
      if (existsSync(plistPath)) {
        unlinkSync(plistPath);
        logger.info(`[LaunchdManager] Removed plist: ${plistPath}`);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[LaunchdManager] Failed to remove job ${jobId}: ${errorMsg}`);
      throw new Error(`Failed to remove launchd job: ${errorMsg}`);
    }
  }

  /**
   * Get all scheduled jobs (stub - not needed for launchd)
   * Returns empty array since launchd jobs are managed independently
   */
  getJobs(): Array<{ id: string; cronExpression: string; command: string }> {
    return [];
  }
}
