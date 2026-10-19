/**
 * MCP Wrapper for Clean Console Output
 *
 * Creates a wrapper script that redirects MCP server output to logs
 * while preserving JSON-RPC communication, similar to Claude Desktop.
 */

import { createWriteStream, WriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { logger } from './logger.js';

export class MCPWrapper {
  private readonly LOG_DIR: string;
  private readonly WRAPPER_DIR: string;
  private readonly MAX_LOG_AGE_DAYS = 7; // Keep logs for 1 week

  constructor() {
    this.LOG_DIR = join(homedir(), '.ncp', 'logs');
    this.WRAPPER_DIR = join(tmpdir(), 'ncp-wrappers');
    this.ensureDirectories();
    this.cleanupOldLogs();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!existsSync(this.LOG_DIR)) {
      mkdirSync(this.LOG_DIR, { recursive: true });
    }
    if (!existsSync(this.WRAPPER_DIR)) {
      mkdirSync(this.WRAPPER_DIR, { recursive: true });
    }
  }

  /**
   * Get log file path for current week
   */
  private getLogFilePath(mcpName: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = this.getWeekNumber(now);
    return join(this.LOG_DIR, `mcp-${mcpName}-${year}w${week.toString().padStart(2, '0')}.log`);
  }

  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Clean up old log files (older than 1 week)
   */
  private cleanupOldLogs(): void {
    try {
      if (!existsSync(this.LOG_DIR)) return;

      const files = readdirSync(this.LOG_DIR);
      const cutoffTime = Date.now() - (this.MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.startsWith('mcp-') && file.endsWith('.log')) {
          const filePath = join(this.LOG_DIR, file);
          const stats = statSync(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            unlinkSync(filePath);
            logger.debug(`Cleaned up old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Create a wrapper script that redirects MCP server output to logs
   */
  createWrapper(mcpName: string, command: string, args: string[] = []): { command: string; args: string[] } {
    const logFile = this.getLogFilePath(mcpName);
    const wrapperPath = join(this.WRAPPER_DIR, `mcp-${mcpName}-wrapper.js`);

    // Escape strings for embedding in JavaScript - handles Windows backslashes
    const escapeForJS = (str: string) => JSON.stringify(str);

    // Create Node.js wrapper script
    const wrapperScript = `#!/usr/bin/env node
/**
 * MCP Wrapper for ${mcpName}
 * Redirects stdout/stderr to logs while preserving JSON-RPC
 */

const { spawn } = require('child_process');
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

// Paths are JSON-encoded to handle Windows backslashes properly
const logFile = ${escapeForJS(logFile)};
const command = ${escapeForJS(command)};
const args = ${JSON.stringify(args)};

// Ensure log directory exists
const logDir = require('path').dirname(logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create log stream
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
logStream.write(\`\\n--- MCP \${process.argv[2] || '${mcpName}'} Session Started: \${new Date().toISOString()} ---\\n\`);

// Spawn the actual MCP server
// On Windows, .cmd/.bat files require shell execution
const isWindows = process.platform === 'win32';
const needsShell = isWindows && /\\.(cmd|bat)$/i.test(command);

const child = spawn(command, args, {
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: needsShell
});

// Forward stdin to child (for JSON-RPC requests)
process.stdin.pipe(child.stdin);

// Handle stdout: Log everything, but forward complete JSON-RPC frames to parent
const stdoutDecoder = new StringDecoder('utf8');
let stdoutBuffer = '';

function forwardLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  try {
    const parsed = JSON.parse(line);
    if (parsed.jsonrpc === '2.0' ||
        (typeof parsed.id !== 'undefined' &&
         (parsed.method || parsed.result || parsed.error))) {
      // This is JSON-RPC, forward it as a complete protocol frame.
      process.stdout.write(line + '\\n');
    }
  } catch (e) {
    // Not JSON-RPC, just log it
    logStream.write('[NON-JSONRPC] ' + line + '\\n');
  }
}

function handleStdoutText(text) {
  if (!text) return;
  logStream.write('[STDOUT] ' + text);
  stdoutBuffer += text;

  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf('\\n')) !== -1) {
    const line = stdoutBuffer.slice(0, newlineIndex);
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    forwardLine(line);
  }
}

child.stdout.on('data', (chunk) => {
  handleStdoutText(stdoutDecoder.write(chunk));
});

child.stdout.on('end', () => {
  handleStdoutText(stdoutDecoder.end());
  if (stdoutBuffer.trim()) forwardLine(stdoutBuffer);
  stdoutBuffer = '';
});

// Handle stderr: Log everything (these are usually startup messages)
child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  logStream.write(\`[STDERR] \${text}\`);
});

// Handle child process events
child.on('error', (error) => {
  logStream.write(\`[ERROR] Process error: \${error.message}\\n\`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  // The child has stopped accepting input; detach from the parent's stdin so
  // an otherwise-open client pipe cannot keep this wrapper alive.
  process.stdin.unpipe(child.stdin);
  process.stdin.pause();
  if (typeof process.stdin.unref === 'function') process.stdin.unref();

  logStream.write(\`[EXIT] Process exited with code \${code}, signal \${signal}\\n\`);
  logStream.write(\`--- MCP Session Ended: \${new Date().toISOString()} ---\\n\\n\`);
  logStream.end();
  // Let queued protocol frames and log writes drain before Node exits.
  process.exitCode = code || 0;
});

// Handle parent process signals
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
`;

    // Write wrapper script
    writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });

    // Return wrapper command instead of original
    return {
      command: 'node',
      args: [wrapperPath, mcpName]
    };
  }

  /**
   * Get current log file path for an MCP (for debugging)
   */
  getLogFile(mcpName: string): string {
    return this.getLogFilePath(mcpName);
  }

  /**
   * List all current log files
   */
  listLogFiles(): string[] {
    try {
      if (!existsSync(this.LOG_DIR)) return [];
      return readdirSync(this.LOG_DIR)
        .filter(file => file.startsWith('mcp-') && file.endsWith('.log'))
        .map(file => join(this.LOG_DIR, file));
    } catch {
      return [];
    }
  }
}

// Singleton instance
export const mcpWrapper = new MCPWrapper();
