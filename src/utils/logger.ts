/**
 * Logger utility for NCP
 *
 * Controls logging based on context:
 * - When running as MCP server: minimal/no logging to stderr
 * - When running as CLI or debugging: full logging
 * - When debug enabled as extension: file-based logging
 */

import { homedir } from 'os';
import { join } from 'path';
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';

export class Logger {
  private static instance: Logger;
  private isMCPMode: boolean = false;
  private isCLIMode: boolean = false;
  private debugMode: boolean = false;
  private logFilePath: string | null = null;

  private constructor() {
    // Check if running CLI commands (list, find, run, add, remove, config, etc.)
    this.isCLIMode = process.argv.some(arg =>
      ['list', 'find', 'run', 'add', 'remove', 'config', '--help', 'help', '--version', '-v', '-h', 'import'].includes(arg)
    );

    // Detect if running as MCP server - more reliable detection
    // MCP server mode: default when no CLI commands are provided
    this.isMCPMode = !this.isCLIMode || process.env.NCP_MODE === 'mcp';

    // Enable debug mode ONLY if explicitly requested
    this.debugMode = process.env.NCP_DEBUG === 'true' ||
                     process.argv.includes('--debug');

    // Set up file-based logging for extensions with debug enabled
    if (this.debugMode && (process.env.NCP_MODE === 'extension' || process.env.NCP_MODE === 'mcp')) {
      this.setupFileLogging();
    }
  }

  /**
   * Set up file-based logging to avoid console spam in Claude Desktop
   * Keeps last 10 log files, deletes older ones
   */
  private setupFileLogging(): void {
    try {
      const configPath = process.env.NCP_CONFIG_PATH || join(homedir(), '.ncp');
      const logsDir = join(configPath, 'logs');

      // Ensure logs directory exists
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      // Rotate old log files (keep last 10)
      this.rotateLogFiles(logsDir, 10);

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      this.logFilePath = join(logsDir, `ncp-debug-${timestamp}.log`);

      // Write initial header
      this.writeToFile(`\n${'='.repeat(80)}\n`);
      this.writeToFile(`NCP Debug Log - ${new Date().toISOString()}\n`);
      this.writeToFile(`Profile: ${process.env.NCP_PROFILE || 'all'}\n`);
      this.writeToFile(`Config Path: ${configPath}\n`);
      this.writeToFile(`${'='.repeat(80)}\n\n`);
    } catch (error: any) {
      // Fallback to console if file logging fails
      console.error(`[NCP] Failed to set up file logging: ${error.message}`);
      this.logFilePath = null;
    }
  }

  /**
   * Rotate log files - keep last N files, delete older ones
   */
  private rotateLogFiles(logsDir: string, keepCount: number): void {
    try {
      // Get all debug log files
      const files = readdirSync(logsDir)
        .filter(f => f.startsWith('ncp-debug-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: join(logsDir, f),
          mtime: statSync(join(logsDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime); // Sort by modification time (newest first)

      // Delete oldest files if we have more than keepCount
      if (files.length >= keepCount) {
        const filesToDelete = files.slice(keepCount - 1); // Keep room for new file
        filesToDelete.forEach(file => {
          try {
            unlinkSync(file.path);
          } catch (error) {
            // Silent fail - don't break logging setup
          }
        });
      }
    } catch (error) {
      // Silent fail - don't break logging setup if rotation fails
    }
  }

  /**
   * Write message to log file
   */
  private writeToFile(message: string): void {
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, message);
      } catch (error) {
        // Silently fail - don't spam console
      }
    }
  }

  /**
   * Format log message with timestamp
   */
  private formatLogMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}\n`;
  }
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  /**
   * Log informational messages
   * Completely suppressed in MCP mode and CLI mode unless debugging
   */
  info(message: string): void {
    if (this.debugMode) {
      if (this.logFilePath) {
        this.writeToFile(this.formatLogMessage('INFO', message));
      } else {
        console.error(`[NCP] ${message}`);
      }
    }
  }

  /**
   * Log only essential startup messages in MCP mode
   */
  mcpInfo(message: string): void {
    if (this.debugMode) {
      if (this.logFilePath) {
        this.writeToFile(this.formatLogMessage('INFO', message));
      } else {
        console.error(`[NCP] ${message}`);
      }
    }
    // In MCP mode and CLI mode, stay completely silent unless debugging
  }

  /**
   * Log debug messages
   * Only shown in debug mode
   */
  debug(message: string): void {
    if (this.debugMode) {
      if (this.logFilePath) {
        this.writeToFile(this.formatLogMessage('DEBUG', message));
      } else {
        console.error(`[NCP DEBUG] ${message}`);
      }
    }
  }

  /**
   * Log error messages
   * Always shown (but minimal in MCP mode)
   */
  error(message: string, error?: any): void {
    if (this.isMCPMode && !this.debugMode) {
      // In MCP mode, only log critical errors
      if (error?.critical) {
        if (this.logFilePath) {
          this.writeToFile(this.formatLogMessage('ERROR', message));
          if (error) {
            this.writeToFile(this.formatLogMessage('ERROR', JSON.stringify(error, null, 2)));
          }
        } else {
          console.error(`[NCP ERROR] ${message}`);
        }
      }
    } else {
      if (this.logFilePath) {
        this.writeToFile(this.formatLogMessage('ERROR', message));
        if (error) {
          this.writeToFile(this.formatLogMessage('ERROR', JSON.stringify(error, null, 2)));
        }
      } else {
        console.error(`[NCP ERROR] ${message}`);
        if (error) {
          console.error(error);
        }
      }
    }
  }

  /**
   * Log warnings
   * Completely suppressed in MCP mode and CLI mode unless debugging
   */
  warn(message: string): void {
    if (this.debugMode) {
      if (this.logFilePath) {
        this.writeToFile(this.formatLogMessage('WARN', message));
      } else {
        console.error(`[NCP WARN] ${message}`);
      }
    }
  }

  /**
   * Log progress updates
   * Completely suppressed in MCP mode and CLI mode unless debugging
   */
  progress(message: string): void {
    if (this.debugMode) {
      if (this.logFilePath) {
        this.writeToFile(this.formatLogMessage('PROGRESS', message));
      } else {
        console.error(`[NCP] ${message}`);
      }
    }
  }

  /**
   * Get current log file path (for debugging)
   */
  getLogFilePath(): string | null {
    return this.logFilePath;
  }
  
  /**
   * Check if in MCP mode
   */
  isInMCPMode(): boolean {
    return this.isMCPMode;
  }
  
  /**
   * Force enable/disable MCP mode
   */
  setMCPMode(enabled: boolean): void {
    this.isMCPMode = enabled;
  }
}

// Singleton export
export const logger = Logger.getInstance();
