/**
 * Version utility for reading package version
 * Centralized to avoid duplication and simplify testing
 */


import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
// import { fileURLToPath } from 'url';

// Helper to get package info - tries multiple strategies




// Get the directory of the current file (works in CJS and with ts-node)
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();




// Export as function for testability and lazy evaluation

export function getPackageInfo() {
  try {
    // Try package.json in current directory
    const here = join(currentDir, 'package.json');
    if (existsSync(here)) {
      const packageJson = JSON.parse(readFileSync(here, 'utf8'));
      if (packageJson.name === '@portel/ncp') {
        return { version: packageJson.version, packageName: packageJson.name };
      }
    }
    // Try package.json one level up
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