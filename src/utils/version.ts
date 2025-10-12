/**
 * Version utility for reading package version
 * Centralized to avoid duplication and simplify testing
 */


import { readFileSync, existsSync, realpathSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Helper to get package info - tries multiple strategies
// IMPORTANT: Should detect the INSTALLED package (e.g. global npm), not the local dev directory

/**
 * Get the directory of the actually running NCP installation.
 * When installed globally, this will be in npm's global directory.
 * This is critical for commands like `ncp -v` to show the correct version.
 */
function getInstalledPackageDir(): string {
  try {
    // Start with the directory containing the running code
    let runningCodeDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

    // If this path is a symlink (common in global npm installs), resolve it
    runningCodeDir = realpathSync(runningCodeDir);

    // Search up from the real location of the running code
    // For global installs this might be: /usr/local/lib/node_modules/@portel/ncp/dist/utils/version.js
    let dir = runningCodeDir;
    for (let i = 0; i < 5; i++) {
      const packagePath = join(dir, 'package.json');
      if (existsSync(packagePath)) {
        try {
          const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
          if (pkg.name === '@portel/ncp') {
            // Found the package.json for the running code (global or local install)
            return dir;
          }
        } catch {}
      }
      dir = dirname(dir);
    }
  } catch (e) {
    console.debug('Error finding installed package:', e);
  }
  
  // Only fallback to cwd if we couldn't find the running package location
  return process.cwd();
}

const installedDir = getInstalledPackageDir();

// Export as function for testability and lazy evaluation
export function getPackageInfo() {
  try {
    // First try the directory where the running code is installed
    // For global installs, this will be the npm global directory
    const installedPackageJson = join(installedDir, 'package.json');
    if (existsSync(installedPackageJson)) {
      const packageJson = JSON.parse(readFileSync(installedPackageJson, 'utf8'));
      if (packageJson.name === '@portel/ncp') {
        // We found the package.json for the running code
        return { version: packageJson.version, packageName: packageJson.name };
      }
    }

    // Only try current directory if we couldn't find the installation
    // This is mainly for development scenarios
    const here = join(process.cwd(), 'package.json');
    if (existsSync(here)) {
      const packageJson = JSON.parse(readFileSync(here, 'utf8'));
      if (packageJson.name === '@portel/ncp') {
        return { version: packageJson.version, packageName: packageJson.name };
      }
    }
  } catch (e) {
    console.debug('Error reading package info:', e);
  }

  // Fallback for when package.json can't be found
  return { version: '1.3.2', packageName: '@portel/ncp' };
}

export const version = getPackageInfo().version;
export const packageName = getPackageInfo().packageName;