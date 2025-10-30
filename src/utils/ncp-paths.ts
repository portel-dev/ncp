/**
 * NCP Paths Utility
 * Determines whether to use local or global .ncp directory
 */

import * as path from 'path';
import { readFileSync, existsSync } from 'fs';
import * as os from 'os';

let _ncpBaseDir: string | null = null;
let _overrideWorkingDirectory: string | null = null;

/**
 * Set override working directory for profile resolution
 * This allows the --working-dir parameter to override process.cwd()
 */
export function setOverrideWorkingDirectory(dir: string | null): void {
  _overrideWorkingDirectory = dir;
  // Clear cached base directory so it gets recalculated with new working directory
  _ncpBaseDir = null;
}

/**
 * Get the effective working directory (override or process.cwd())
 */
export function getEffectiveWorkingDirectory(): string {
  return _overrideWorkingDirectory || process.cwd();
}

/**
 * Determines the base .ncp directory to use
 * Uses local .ncp if directory exists in CWD or parent directories, otherwise falls back to global ~/.ncp
 */
export function getNcpBaseDirectory(): string {
  if (_ncpBaseDir) {
    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG PATHS] Using cached _ncpBaseDir: ${_ncpBaseDir}`);
    }
    return _ncpBaseDir;
  }

  // If --working-dir was explicitly set, FORCE using that directory (don't fall back to global)
  // This ensures isolated testing and prevents pollution from global ~/.ncp
  if (_overrideWorkingDirectory) {
    _ncpBaseDir = path.join(_overrideWorkingDirectory, '.ncp');
    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG PATHS] Using --working-dir override: ${_ncpBaseDir}`);
    }
    return _ncpBaseDir;
  }

  // Start from effective working directory and traverse up
  let currentDir = getEffectiveWorkingDirectory();
  const root = path.parse(currentDir).root;

  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG PATHS] Searching for .ncp starting from: ${currentDir}`);
  }

  while (currentDir !== root) {
    const localNcpDir = path.join(currentDir, '.ncp');

    // Use local .ncp if directory exists - will create subdirectories (profiles/, cache/, logs/) as needed
    if (existsSync(localNcpDir)) {
      _ncpBaseDir = localNcpDir;
      if (process.env.NCP_DEBUG === 'true') {
        console.error(`[DEBUG PATHS] Using local .ncp: ${_ncpBaseDir}`);
      }
      return _ncpBaseDir;
    }

    currentDir = path.dirname(currentDir);
  }

  // Fallback to global ~/.ncp directory (will be created if needed)
  _ncpBaseDir = path.join(os.homedir(), '.ncp');
  if (process.env.NCP_DEBUG === 'true') {
    console.error(`[DEBUG PATHS] Using global .ncp: ${_ncpBaseDir}`);
  }
  return _ncpBaseDir;
}

/**
 * Get the profiles directory (local or global)
 */
export function getProfilesDirectory(): string {
  return path.join(getNcpBaseDirectory(), 'profiles');
}

/**
 * Get the cache directory (local or global)
 */
export function getCacheDirectory(): string {
  return path.join(getNcpBaseDirectory(), 'cache');
}

/**
 * Get the logs directory (local or global)
 */
export function getLogsDirectory(): string {
  return path.join(getNcpBaseDirectory(), 'logs');
}

/**
 * Check if we're using a local NCP installation
 */
export function isLocalNcpInstallation(): boolean {
  const baseDir = getNcpBaseDirectory();
  return !baseDir.startsWith(os.homedir());
}

/**
 * Get the scheduler directory (always global ~/.ncp/scheduler)
 * Scheduler jobs are stored globally regardless of working directory
 * The workingDirectory field in jobs controls which .ncp is used during execution
 */
export function getSchedulerDirectory(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.ncp', 'scheduler');
}

/**
 * Get the scheduler executions directory
 */
export function getSchedulerExecutionsDirectory(): string {
  return path.join(getSchedulerDirectory(), 'executions');
}

/**
 * Get the scheduler execution results directory
 */
export function getSchedulerResultsDirectory(): string {
  return path.join(getSchedulerExecutionsDirectory(), 'results');
}