/**
 * Version utility for reading package version
 * Centralized to avoid duplication and simplify testing
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Helper to get package info - tries multiple strategies

function getPackageInfo() {
  try {
    // Always use ESM-safe file path resolution
    const currentFile = typeof import.meta !== 'undefined' && import.meta.url
      ? fileURLToPath(import.meta.url)
      : (typeof __filename !== 'undefined' ? __filename : undefined);
    if (currentFile) {
      const currentDir = dirname(currentFile);
      // Try ../../package.json (works for dist/utils/version.js and src/utils/version.ts)
      const upTwo = join(currentDir, '../../package.json');
      if (existsSync(upTwo)) {
        const packageJson = JSON.parse(readFileSync(upTwo, 'utf8'));
        if (packageJson.name === '@portel/ncp') {
          return { version: packageJson.version, packageName: packageJson.name };
        }
      }
      // Try ../package.json (in case structure changes)
      const upOne = join(currentDir, '../package.json');
      if (existsSync(upOne)) {
        const packageJson = JSON.parse(readFileSync(upOne, 'utf8'));
        if (packageJson.name === '@portel/ncp') {
          return { version: packageJson.version, packageName: packageJson.name };
        }
      }
    }
  } catch {}

  // Fallback for when package.json can't be found
  return { version: '1.3.2', packageName: '@portel/ncp' };
}

const packageInfo = getPackageInfo();
export const version = packageInfo.version;
export const packageName = packageInfo.packageName;