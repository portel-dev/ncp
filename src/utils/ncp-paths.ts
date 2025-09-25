/**
 * NCP Paths Utility
 * Determines whether to use local or global .ncp directory
 */

import * as path from 'path';
import { readFileSync, existsSync } from 'fs';
import * as os from 'os';

let _ncpBaseDir: string | null = null;

/**
 * Determines the base .ncp directory to use
 * Only uses local .ncp if directory already exists, otherwise falls back to global ~/.ncp
 */
export function getNcpBaseDirectory(): string {
  if (_ncpBaseDir) return _ncpBaseDir;

  // Start from current working directory and traverse up
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const localNcpDir = path.join(currentDir, '.ncp');

    // Only use local .ncp if the directory already exists
    if (existsSync(localNcpDir)) {
      _ncpBaseDir = localNcpDir;
      return _ncpBaseDir;
    }

    currentDir = path.dirname(currentDir);
  }

  // Fallback to global ~/.ncp directory (will be created if needed)
  _ncpBaseDir = path.join(os.homedir(), '.ncp');
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