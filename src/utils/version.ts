/**
 * Version utility for reading package version
 * Centralized to avoid duplication and simplify testing
 */


import { readFileSync, existsSync, realpathSync } from 'fs';
import { join, dirname } from 'path';

// Helper to get package info - tries multiple strategies
// IMPORTANT: Should detect the INSTALLED package (e.g. global npm), not the local dev directory

/**
 * Get the directory of the actually running NCP installation.
 * When installed globally, this will be in npm's global directory.
 * This is critical for commands like `ncp -v` to show the correct version.
 */
function getInstalledPackageDir(): string {
    // Helper to validate a package.json belongs to our package
  function isOurPackage(dir: string): boolean {
    try {
      if (!dir) {
        return false;
      }

      const pkgPath = join(dir, 'package.json');

      if (!existsSync(pkgPath)) {
        return false;
      }

      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      return pkg && pkg.name === '@portel/ncp';
    } catch (e) {
      return false;
    }
  }

  // Get the directory where code is running from
  // Check global.__dirname first (set by tests to simulate global installation)
  let runningCodeDir: string | undefined;

  if (typeof (global as any).__dirname === 'string' && (global as any).__dirname) {
    runningCodeDir = (global as any).__dirname;
  } else if (process.argv[1]) {
    try {
      // Resolve the script file symlink first (common in npm global installs)
      // e.g., /usr/local/bin/ncp -> /usr/local/lib/node_modules/@portel/ncp/dist/index.js
      const realScriptPath = realpathSync(process.argv[1]);
      // Then get the directory containing the actual script
      runningCodeDir = dirname(realScriptPath);
    } catch (e) {
      // If symlink resolution fails, fall back to dirname of argv[1]
      runningCodeDir = dirname(process.argv[1]);
    }
  }

  // If we have a running code directory, walk up to find the package root
  if (runningCodeDir) {
    try {
      let dir = runningCodeDir;
      const seenDirs = new Set<string>();

      while (dir && !seenDirs.has(dir)) {
        seenDirs.add(dir);

        if (isOurPackage(dir)) {
          return dir;
        }

        const parentDir = dirname(dir);
        if (parentDir === dir) break; // At root
        dir = parentDir;
      }
    } catch (e) {
      // Continue to fallback
    }
  }

  // Fallback to process.cwd() only as last resort
  const cwd = process.cwd();
  if (isOurPackage(cwd)) {
    return cwd;
  }

  return cwd;
}

// Export as function for testability and lazy evaluation
export function getPackageInfo() {
  const packageDir = getInstalledPackageDir();

  // Try to get package info from directory
  const pkgPath = join(packageDir, 'package.json');
  try {
    if (existsSync(pkgPath)) {
      const content = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(content);
      if (pkg.name === '@portel/ncp') {
        return { version: pkg.version, packageName: pkg.name };
      }
    }
  } catch (e) {
    // In test environments, fs might be mocked - handle gracefully
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return { version: '0.0.0-test', packageName: '@portel/ncp' };
    }
    console.error('Error reading package info:', e);
  }

  // If we reach here in production, something is wrong
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return { version: '0.0.0-test', packageName: '@portel/ncp' };
  }

  throw new Error(`Failed to find @portel/ncp package.json. Searched in: ${packageDir}`);
}

export const version = getPackageInfo().version;
export const packageName = getPackageInfo().packageName;