/**
 * Logger utility for NCP
 * 
 * Controls logging based on context:
 * - When running as MCP server: minimal/no logging to stderr
 * - When running as CLI or debugging: full logging
 */

export class Logger {
  private static instance: Logger;
  private isMCPMode: boolean = false;
  private isCLIMode: boolean = false;
  private debugMode: boolean = false;

  private constructor() {
    // Check if running CLI commands (find, run, etc.)
    this.isCLIMode = process.argv.some(arg =>
      arg === '--find' || arg === '--run' || arg === '--help'
    );

    // Detect if running as MCP server (no CLI commands and either explicit --server or no args)
    this.isMCPMode = !this.isCLIMode && (
      process.argv.includes('--server') ||
      process.env.NCP_MODE === 'mcp' ||
      (!process.stdout.isTTY && !process.env.NCP_DEBUG)
    );

    // Enable debug mode ONLY if explicitly requested
    this.debugMode = process.env.NCP_DEBUG === 'true' ||
                     process.argv.includes('--debug');
  }
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  /**
   * Log informational messages
   * Suppressed in MCP mode and CLI mode unless debugging
   */
  info(message: string): void {
    if ((!this.isMCPMode && !this.isCLIMode) || this.debugMode) {
      console.error(`[NCP] ${message}`);
    }
  }
  
  /**
   * Log only essential startup messages in MCP mode
   */
  mcpInfo(message: string): void {
    if (!this.isMCPMode) {
      console.error(`[NCP] ${message}`);
    }
    // In MCP mode, stay completely silent unless debugging
  }
  
  /**
   * Log debug messages
   * Only shown in debug mode
   */
  debug(message: string): void {
    if (this.debugMode) {
      console.error(`[NCP DEBUG] ${message}`);
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
        console.error(`[NCP ERROR] ${message}`);
      }
    } else {
      console.error(`[NCP ERROR] ${message}`);
      if (error) {
        console.error(error);
      }
    }
  }
  
  /**
   * Log warnings
   * Suppressed in MCP mode and CLI mode unless debugging
   */
  warn(message: string): void {
    if ((!this.isMCPMode && !this.isCLIMode) || this.debugMode) {
      console.error(`[NCP WARN] ${message}`);
    }
  }
  
  /**
   * Log progress updates
   * Suppressed in MCP mode and CLI mode unless debugging
   */
  progress(message: string): void {
    if ((!this.isMCPMode && !this.isCLIMode) || this.debugMode) {
      console.error(`[NCP] ${message}`);
    }
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
