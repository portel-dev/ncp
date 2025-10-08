/**
 * Version utility for reading package version
 * Centralized to avoid duplication and simplify testing
 */


import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Helper to get package info - tries multiple strategies



// Lazy file path resolution for compatibility with ESM, CJS, and test runners
function getCurrentFile() {
  // Try ESM (import.meta.url)
  try {
    // Only access import.meta inside function
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      // @ts-ignore
      return fileURLToPath(import.meta.url);
    }
  } catch {}
  // Try CommonJS (__filename)
  try {
    // @ts-ignore
    if (typeof __filename !== 'undefined') {
      // @ts-ignore
      return __filename;
    }
  } catch {}
  // Fallback: process.cwd()
  return join(process.cwd(), 'src/utils/version.ts');
}




// Export as function for testability and lazy evaluation
export function getPackageInfo() {
  try {
    const currentFile = getCurrentFile();
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
  } catch {}

  // Fallback for when package.json can't be found
  return { version: '1.3.2', packageName: '@portel/ncp' };
}

export const version = getPackageInfo().version;
export const packageName = getPackageInfo().packageName;