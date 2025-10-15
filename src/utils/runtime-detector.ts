/**
 * Runtime Detector
 *
 * Detects which runtime (bundled vs system) NCP is currently running with.
 * This is detected fresh on every boot to respect Claude Desktop's dynamic settings.
 */

import { existsSync } from 'fs';
import { userInfo } from 'os';
import { getBundledRuntimePath } from './client-registry.js';

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
      // Windows - use common install locations
      nodePath = 'C:\\Program Files\\nodejs\\node.exe';
      pythonPath = 'C:\\Python\\python.exe';
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
 */
export function getRuntimeForExtension(command: string): string {
  const runtime = detectRuntime();

  // If command is 'node' or ends with '/node', use detected Node runtime
  if (command === 'node' || command.endsWith('/node') || command.endsWith('\\node.exe')) {
    return runtime.nodePath;
  }

  // If command is 'npx', use npx from detected Node runtime
  if (command === 'npx' || command.endsWith('/npx') || command.endsWith('\\npx.cmd')) {
    // If using bundled runtime, construct npx path from node path
    if (runtime.type === 'bundled') {
      // Bundled node path: /Applications/Claude.app/.../node
      // Bundled npx path: /Applications/Claude.app/.../npx
      const npxPath = runtime.nodePath.replace(/\/node$/, '/npx').replace(/\\node\.exe$/, '\\npx.cmd');
      return npxPath;
    }
    // For system runtime, derive npx from node path
    // If node path is absolute (starts with /), derive npx from it
    if (runtime.nodePath.startsWith('/') || runtime.nodePath.startsWith('C:')) {
      const npxPath = runtime.nodePath.replace(/\/node$/, '/npx').replace(/\\node\.exe$/, '\\npx.cmd');
      return npxPath;
    }
    // Otherwise use system npx
    return 'npx';
  }

  // If command is 'python3'/'python', use detected Python runtime
  if (command === 'python3' || command === 'python' ||
      command.endsWith('/python3') || command.endsWith('/python') ||
      command.endsWith('\\python.exe') || command.endsWith('\\python3.exe')) {
    return runtime.pythonPath || command; // Fallback to original if no Python detected
  }

  // Handle other common tools that may not be in PATH when running from .dxt
  // Only resolve if running as .dxt (when node path is absolute)
  if (runtime.nodePath.startsWith('/') || runtime.nodePath.startsWith('C:')) {
    // Handle uv (Python package manager)
    if (command === 'uv' || command.endsWith('/uv') || command.endsWith('\\uv.exe')) {
      // Use platform-specific UV path (don't check existence due to sandbox)
      const platform = process.platform;
      const arch = process.arch;

      if (platform === 'darwin') {
        // Try user install first, then homebrew
        const userUv = '/Users/' + userInfo().username + '/.local/bin/uv';
        const homebrewUv = arch === 'arm64' ? '/opt/homebrew/bin/uv' : '/usr/local/bin/uv';
        return userUv;  // Prefer user install
      } else if (platform === 'win32') {
        return 'uv.exe';  // Windows
      } else {
        return '/usr/bin/uv';  // Linux
      }
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
  console.log(`[Runtime Detection]`);
  console.log(`  Type: ${runtime.type}`);
  console.log(`  Node: ${runtime.nodePath}`);
  if (runtime.pythonPath) {
    console.log(`  Python: ${runtime.pythonPath}`);
  }
  console.log(`  Process execPath: ${process.execPath}`);
}
