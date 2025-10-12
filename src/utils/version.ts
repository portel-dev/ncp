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
  let runningCodeDir: string;

  if (typeof (global as any).__dirname === 'string' && (global as any).__dirname) {
    runningCodeDir = (global as any).__dirname;
  } else if (process.argv[1]) {
    // In production, use the entry script location to find where code is installed
    // This works for both global and local installations
    runningCodeDir = dirname(process.argv[1]);
  } else {
    // Last resort fallback to cwd
    runningCodeDir = process.cwd();
  }

  try {
    // Resolve symlinks (common in global npm installs)
    const realDir = realpathSync(runningCodeDir);

    // Walk up the directory tree to find the package root
    let dir = realDir;
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
    // If symlink resolution fails, continue with fallback
  }

  // Fallback to process.cwd()
  const cwd = process.cwd();
  if (isOurPackage(cwd)) {
    return cwd;
  }

  return cwd;
}

// Export as function for testability and lazy evaluation
export function getPackageInfo() {
  const packageDir = getInstalledPackageDir();
  
  // Make sure we have a valid directory
  if (!packageDir) {
    return { version: '1.3.2', packageName: '@portel/ncp' };
  }
  
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
    console.debug('Error reading package info:', e);
  }
  
  // If we couldn't read package.json or it wasn't valid, return default
  return { version: '1.3.2', packageName: '@portel/ncp' };
}

export const version = getPackageInfo().version;
export const packageName = getPackageInfo().packageName;