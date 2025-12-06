/**
 * Runtime Detector
 *
 * Detects which runtime (bundled vs system) NCP is currently running with.
 * This is detected fresh on every boot to respect Claude Desktop's dynamic settings.
 */

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { userInfo } from 'os';
import { getBundledRuntimePath } from './client-registry.js';
import { logger } from './logger.js';

// Cache for resolved commands to avoid repeated filesystem lookups
const commandCache = new Map<string, string>();

/**
 * Get platform-specific executable extensions to try.
 * On Windows, commands can be .exe, .cmd, .bat, or extensionless.
 * On Unix, commands are typically extensionless.
 */
function getExecutableExtensions(): string[] {
  if (process.platform === 'win32') {
    // Windows: try these extensions in order (matching PATHEXT behavior)
    return ['.exe', '.cmd', '.bat', ''];
  }
  // Unix: no extension needed
  return [''];
}

/**
 * Parse PATH environment variable into array of directories.
 */
function getPATHDirectories(): string[] {
  const pathEnv = process.env.PATH || '';
  const separator = process.platform === 'win32' ? ';' : ':';
  return pathEnv.split(separator).filter(dir => dir.length > 0);
}

/**
 * Find a command in PATH by searching directories and trying platform-specific extensions.
 * This is a pure filesystem-based approach - no subprocess spawning.
 */
function findInPATH(command: string): string | null {
  // Check cache first
  const cached = commandCache.get(command);
  if (cached !== undefined) {
    return cached || null;
  }

  const directories = getPATHDirectories();
  const extensions = getExecutableExtensions();

  // If command already has an extension, try it as-is first
  const hasExtension = /\.(exe|cmd|bat)$/i.test(command);

  for (const dir of directories) {
    if (hasExtension) {
      // Command has extension - try exact match
      const fullPath = join(dir, command);
      if (existsSync(fullPath)) {
        commandCache.set(command, fullPath);
        logger.debug(`Found ${command} at ${fullPath}`);
        return fullPath;
      }
    } else {
      // No extension - try all platform-specific extensions
      for (const ext of extensions) {
        const fullPath = join(dir, command + ext);
        if (existsSync(fullPath)) {
          commandCache.set(command, fullPath);
          logger.debug(`Found ${command} at ${fullPath}`);
          return fullPath;
        }
      }
    }
  }

  // Not found - cache negative result
  commandCache.set(command, '');
  logger.debug(`Could not find ${command} in PATH`);
  return null;
}

export interface RuntimeInfo {
  /** The runtime being used ('bundled' or 'system') */
  type: 'bundled' | 'system';

  /** Path to Node.js runtime to use */
  nodePath: string;

  /** Path to Python runtime to use (if available) */
  pythonPath?: string;
}

/**
 * Detect which runtime NCP is currently running with.
 *
 * Strategy:
 * 1. Check process.execPath (how NCP was launched)
 * 2. Compare with known bundled runtime paths
 * 3. If match → we're running via bundled runtime
 * 4. If no match → we're running via system runtime
 */
export function detectRuntime(): RuntimeInfo {
  const currentNodePath = process.execPath;

  // Check if we're running via Claude Desktop's bundled Node
  const claudeBundledNode = getBundledRuntimePath('claude-desktop', 'node');
  const claudeBundledPython = getBundledRuntimePath('claude-desktop', 'python');

  // If our execPath matches the bundled Node path, we're running via bundled runtime
  if (claudeBundledNode && currentNodePath === claudeBundledNode) {
    return {
      type: 'bundled',
      nodePath: claudeBundledNode,
      pythonPath: claudeBundledPython || undefined
    };
  }

  // Check if we're running inside Claude Desktop (as .dxt extension or otherwise)
  // Note: Claude Desktop does NOT provide bundled Node/Python - it uses system runtimes
  const isInsideClaudeApp = currentNodePath.includes('/Claude.app/') ||
                            currentNodePath.includes('\\Claude\\') ||
                            currentNodePath.includes('/Claude/') ||
                            currentNodePath.includes('Claude Helper') ||
                            currentNodePath.includes('Electron');

  if (isInsideClaudeApp) {
    // Running inside Claude Desktop - use platform-specific system runtimes
    // Claude Desktop expects node/npx/python3 to be available on the system
    const platform = process.platform;
    let nodePath: string;
    let pythonPath: string;

    if (platform === 'darwin') {
      // macOS: Use Homebrew paths (most common install method)
      const arch = process.arch;
      if (arch === 'arm64') {
        // Apple Silicon - Homebrew installs to /opt/homebrew
        nodePath = '/opt/homebrew/bin/node';
        pythonPath = '/opt/homebrew/bin/python3';
      } else {
        // Intel Mac - Homebrew installs to /usr/local
        nodePath = '/usr/local/bin/node';
        pythonPath = '/usr/local/bin/python3';
      }
    } else if (platform === 'win32') {
      // Windows - search PATH for actual installation paths
      // This handles Scoop, Chocolatey, nvm-windows, manual installs, etc.
      nodePath = findInPATH('node') || 'node';
      pythonPath = findInPATH('python') || 'python';
    } else {
      // Linux - use system paths
      nodePath = '/usr/bin/node';
      pythonPath = '/usr/bin/python3';
    }

    return {
      type: 'system',
      nodePath,
      pythonPath
    };
  }

  return {
    type: 'system',
    nodePath: 'node', // Use system node
    pythonPath: 'python3' // Use system python
  };
}

/**
 * Get runtime to use for spawning .dxt extension processes.
 * Uses the same runtime that NCP itself is running with.
 *
 * On Windows, searches PATH for executables with platform-specific extensions (.exe, .cmd, .bat).
 * This handles all installation methods (Scoop, Chocolatey, nvm-windows, etc.)
 */
export function getRuntimeForExtension(command: string): string {
  const runtime = detectRuntime();
  const platform = process.platform;

  // Extract base command name (without path or extension)
  const baseCommand = command
    .replace(/^.*[/\\]/, '')  // Remove path prefix
    .replace(/\.(exe|cmd|bat)$/i, '');  // Remove extension

  // On Windows, use PATH-based resolution for all commands
  if (platform === 'win32') {
    // For node, use already-detected path
    if (baseCommand === 'node') {
      return runtime.nodePath;
    }

    // For python/python3, use already-detected path
    if (baseCommand === 'python' || baseCommand === 'python3') {
      return runtime.pythonPath || command;
    }

    // For npx, first try to find it next to node (most reliable)
    if (baseCommand === 'npx') {
      if (runtime.nodePath && runtime.nodePath !== 'node') {
        const nodeDir = dirname(runtime.nodePath);
        // Try npx.cmd first (Windows npm), then npx (might be a shim)
        for (const ext of ['.cmd', '.exe', '']) {
          const npxPath = join(nodeDir, 'npx' + ext);
          if (existsSync(npxPath)) {
            logger.debug(`Found npx at ${npxPath}`);
            return npxPath;
          }
        }
      }
    }

    // General case: search PATH for the command
    const resolved = findInPATH(baseCommand);
    if (resolved) {
      return resolved;
    }

    // Not found in PATH - return original command and let the system try
    return command;
  }

  // Non-Windows platforms: original logic

  // If command is 'node' or ends with '/node', use detected Node runtime
  if (baseCommand === 'node') {
    return runtime.nodePath;
  }

  // If command is 'npx', use npx from detected Node runtime
  if (baseCommand === 'npx') {
    // If using bundled runtime, construct npx path from node path
    if (runtime.type === 'bundled') {
      const npxPath = runtime.nodePath.replace(/\/node$/, '/npx');
      return npxPath;
    }
    // For system runtime, derive npx from node path if absolute
    if (runtime.nodePath.startsWith('/')) {
      const npxPath = runtime.nodePath.replace(/\/node$/, '/npx');
      return npxPath;
    }
    return 'npx';
  }

  // If command is 'python3'/'python', use detected Python runtime
  if (baseCommand === 'python' || baseCommand === 'python3') {
    return runtime.pythonPath || command;
  }

  // Handle uv/uvx when running as .dxt (node path is absolute)
  if (runtime.nodePath.startsWith('/') && (baseCommand === 'uv' || baseCommand === 'uvx')) {
    if (platform === 'darwin') {
      const arch = process.arch;
      // Try user install first
      const userPath = '/Users/' + userInfo().username + '/.local/bin/' + baseCommand;
      if (existsSync(userPath)) {
        return userPath;
      }
      // Then try Homebrew paths based on architecture
      const homebrewPath = arch === 'arm64'
        ? '/opt/homebrew/bin/' + baseCommand
        : '/usr/local/bin/' + baseCommand;
      if (existsSync(homebrewPath)) {
        return homebrewPath;
      }
      // Fallback to user path (let it fail with clear error if not found)
      return userPath;
    } else {
      // Linux
      const userPath = '/home/' + userInfo().username + '/.local/bin/' + baseCommand;
      if (existsSync(userPath)) {
        return userPath;
      }
      return '/usr/bin/' + baseCommand;
    }
  }

  // For other commands, return as-is
  return command;
}

/**
 * Log runtime detection info for debugging
 */
export function logRuntimeInfo(): void {
  const runtime = detectRuntime();
  logger.debug('[Runtime Detection]');
  logger.debug(`  Type: ${runtime.type}`);
  logger.debug(`  Node: ${runtime.nodePath}`);
  if (runtime.pythonPath) {
    logger.debug(`  Python: ${runtime.pythonPath}`);
  }
  logger.debug(`  Process execPath: ${process.execPath}`);
}
