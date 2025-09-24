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
 * Checks for local NCP installation first, falls back to global ~/.ncp
 */
export function getNcpBaseDirectory(): string {
  if (_ncpBaseDir) return _ncpBaseDir;

  // Start from current working directory and traverse up
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

        // If this is an NCP project (has ncp in name or dependencies), use local .ncp
        if (packageJson.name?.includes('ncp') ||
            packageJson.dependencies?.['@portel/ncp'] ||
            packageJson.devDependencies?.['@portel/ncp'] ||
            packageJson.name === '@portel/ncp') {
          _ncpBaseDir = path.join(currentDir, '.ncp');
          return _ncpBaseDir;
        }
      } catch {
        // Invalid package.json, continue searching
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback to global ~/.ncp directory
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