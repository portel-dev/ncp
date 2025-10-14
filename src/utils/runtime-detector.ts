/**
 * Runtime Detector
 *
 * Detects which runtime (bundled vs system) NCP is currently running with.
 * This is detected fresh on every boot to respect Claude Desktop's dynamic settings.
 */

import { existsSync } from 'fs';
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

  // Check if execPath is inside Claude.app (might be different bundled path)
  const isInsideClaudeApp = currentNodePath.includes('/Claude.app/') ||
                            currentNodePath.includes('\\Claude\\') ||
                            currentNodePath.includes('/Claude/');

  if (isInsideClaudeApp && claudeBundledNode && existsSync(claudeBundledNode)) {
    // We're running from Claude Desktop, use its bundled runtimes
    return {
      type: 'bundled',
      nodePath: claudeBundledNode,
      pythonPath: claudeBundledPython || undefined
    };
  }

  // Otherwise, we're running via system runtime
  // When running as .dxt extension, PATH may not include common locations
  // Use full paths to ensure executables can be found
  const isRunningAsDxt = currentNodePath.includes('Claude Helper') ||
                         currentNodePath.includes('Electron');

  if (isRunningAsDxt) {
    // Common system node locations
    const commonNodePaths = [
      '/opt/homebrew/bin/node',      // Homebrew on Apple Silicon
      '/usr/local/bin/node',         // Homebrew on Intel Mac
      '/usr/bin/node',               // Linux system
      'C:\\Program Files\\nodejs\\node.exe'  // Windows
    ];

    // Find first existing node
    const { existsSync } = require('fs');
    const nodePath = commonNodePaths.find(p => existsSync(p)) || 'node';

    // Derive npx and python paths
    const npxPath = nodePath.replace(/\/node$/, '/npx').replace(/\\node\.exe$/, '\\npx.cmd');
    const pythonPath = nodePath.replace(/\/node$/, '/python3').replace(/\\node\.exe$/, '\\python.exe');

    return {
      type: 'system',
      nodePath,
      pythonPath: existsSync(pythonPath) ? pythonPath : 'python3'
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
    const { existsSync } = require('fs');

    // Handle uv (Python package manager)
    if (command === 'uv' || command.endsWith('/uv') || command.endsWith('\\uv.exe')) {
      const commonUvPaths = [
        '/Users/' + require('os').userInfo().username + '/.local/bin/uv',  // User install
        '/opt/homebrew/bin/uv',         // Homebrew on Apple Silicon
        '/usr/local/bin/uv',            // Homebrew on Intel Mac
        '/usr/bin/uv'                   // Linux system
      ];
      const uvPath = commonUvPaths.find(p => existsSync(p));
      if (uvPath) return uvPath;
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
