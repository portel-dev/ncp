/**
 * MCP Protocol Logger
 *
 * Logs MCP requests and responses to JSONL format for debugging
 * - Only active when NCP_DEBUG=true
 * - Keeps last 1000 request/response pairs (2000 lines)
 * - Auto-rotates by trimming top lines
 */

import { promises as fs, mkdirSync } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { getNcpBaseDirectory } from './ncp-paths.js';

const MAX_LINES = 2000; // 1000 request/response pairs
const TRIM_LINES = 2;   // Trim 2 lines (1 request+response) when max exceeded

export class MCPProtocolLogger {
  private logFilePath: string;
  private enabled: boolean;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.enabled = process.env.NCP_DEBUG === 'true';

    if (this.enabled) {
      const ncpDir = getNcpBaseDirectory();
      const logsDir = join(ncpDir, 'logs');
      this.logFilePath = join(logsDir, 'mcp-protocol.jsonl');

      // Ensure logs directory exists
      try {
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }
      } catch (error) {
        // Silent fail - don't break initialization
        console.error(`[MCP Protocol Logger] Failed to create logs directory: ${error}`);
      }
    } else {
      this.logFilePath = '';
    }
  }

  /**
   * Log an MCP request
   */
  async logRequest(method: string, params: any): Promise<void> {
    if (!this.enabled) return;

    const entry = {
      type: 'request',
      timestamp: new Date().toISOString(),
      method,
      params
    };

    await this.appendLine(JSON.stringify(entry));
  }

  /**
   * Log an MCP response
   */
  async logResponse(method: string, result: any, error?: any): Promise<void> {
    if (!this.enabled) return;

    const entry = {
      type: 'response',
      timestamp: new Date().toISOString(),
      method,
      ...(error ? { error } : { result })
    };

    await this.appendLine(JSON.stringify(entry));
  }

  /**
   * Append a line to the log file with rotation
   */
  private async appendLine(line: string): Promise<void> {
    // Queue writes to avoid race conditions
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        // Read current content if file exists
        let lines: string[] = [];
        if (existsSync(this.logFilePath)) {
          const content = await fs.readFile(this.logFilePath, 'utf-8');
          lines = content.split('\n').filter(l => l.trim().length > 0);
        }

        // Add new line
        lines.push(line);

        // Rotate if needed (keep last MAX_LINES)
        if (lines.length > MAX_LINES) {
          lines = lines.slice(-MAX_LINES);
        }

        // Write back
        await fs.writeFile(this.logFilePath, lines.join('\n') + '\n', 'utf-8');
      } catch (error: any) {
        // Silent fail - don't break MCP operations due to logging issues
        console.error(`[MCP Protocol Logger] Failed to write: ${error.message}`);
      }
    });

    return this.writeQueue;
  }

  /**
   * Clear the protocol log
   */
  async clear(): Promise<void> {
    if (!this.enabled) return;

    try {
      if (existsSync(this.logFilePath)) {
        await fs.unlink(this.logFilePath);
      }
    } catch (error: any) {
      console.error(`[MCP Protocol Logger] Failed to clear: ${error.message}`);
    }
  }

  /**
   * Read recent protocol logs
   * @param count Number of request/response pairs to return (default: 100)
   */
  async readRecent(count: number = 100): Promise<string> {
    if (!this.enabled || !existsSync(this.logFilePath)) {
      return '';
    }

    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);

      // Get last N*2 lines (each pair = request + response)
      const recentLines = lines.slice(-(count * 2));
      return recentLines.join('\n');
    } catch (error: any) {
      return `Error reading protocol log: ${error.message}`;
    }
  }
}

// Singleton instance
export const mcpProtocolLogger = new MCPProtocolLogger();
