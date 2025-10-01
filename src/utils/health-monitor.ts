/**
 * MCP Health Monitor
 * 
 * Tracks MCP status, automatically excludes failing MCPs,
 * and exposes health information to AI for troubleshooting.
 */

import { spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

export interface MCPHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'disabled' | 'unknown';
  lastCheck: string;
  errorCount: number;
  lastError?: string;
  disabledReason?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HealthReport {
  timestamp: string;
  totalMCPs: number;
  healthy: number;
  unhealthy: number;
  disabled: number;
  details: MCPHealth[];
  recommendations?: string[];
}

export class MCPHealthMonitor {
  private healthStatus: Map<string, MCPHealth> = new Map();
  private healthFile: string;
  private maxRetries = 3;
  private retryDelay = 1000; // ms
  private healthCheckTimeout = 5000; // ms
  
  constructor() {
    this.healthFile = join(homedir(), '.ncp', 'mcp-health.json');
    this.ensureHealthDirectory();
    this.loadHealthHistory();
  }

  /**
   * Ensure the health directory exists
   */
  private async ensureHealthDirectory(): Promise<void> {
    const healthDir = join(homedir(), '.ncp');
    if (!existsSync(healthDir)) {
      try {
        await mkdir(healthDir, { recursive: true });
      } catch (err) {
        logger.debug(`Failed to create health directory: ${err}`);
      }
    }
  }
  
  /**
   * Load previous health status from disk
   */
  private async loadHealthHistory(): Promise<void> {
    if (existsSync(this.healthFile)) {
      try {
        const content = await readFile(this.healthFile, 'utf-8');
        const history = JSON.parse(content);
        for (const [name, health] of Object.entries(history)) {
          this.healthStatus.set(name, health as MCPHealth);
        }
      } catch (err) {
        logger.debug(`Failed to load health history: ${err}`);
      }
    }
  }

  
  /**
   * Save health status to disk for persistence
   */
  private async saveHealthStatus(): Promise<void> {
    const status = Object.fromEntries(this.healthStatus);
    try {
      await writeFile(this.healthFile, JSON.stringify(status, null, 2));
    } catch (err) {
      logger.debug(`Failed to save health status: ${err}`);
    }
  }
  
  /**
   * Check if an MCP is healthy by attempting to start it
   */
  async checkMCPHealth(
    name: string,
    command: string,
    args: string[] = [],
    env?: Record<string, string>
  ): Promise<MCPHealth> {
    logger.debug(`Health: Checking ${name}...`);
    
    const health: MCPHealth = {
      name,
      status: 'unknown',
      lastCheck: new Date().toISOString(),
      errorCount: 0,
      command,
      args,
      env
    };
    
    // Get previous health status
    const previousHealth = this.healthStatus.get(name);
    if (previousHealth) {
      health.errorCount = previousHealth.errorCount;
    }
    
    try {
      // Attempt to spawn the MCP process
      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Set up timeout
      const timeout = setTimeout(() => {
        child.kill();
      }, this.healthCheckTimeout);
      
      // Wait for process to start successfully or fail
      await new Promise<void>((resolve, reject) => {
        let stderr = '';
        
        child.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // If process stays alive for 2 seconds, consider it healthy
        setTimeout(() => {
          if (!child.killed) {
            clearTimeout(timeout);
            child.kill();
            resolve();
          }
        }, 2000);
        
        child.on('exit', (code) => {
          clearTimeout(timeout);
          if (code !== 0 && code !== null) {
            reject(new Error(`Process exited with code ${code}: ${stderr}`));
          }
        });
      });
      
      // MCP started successfully
      health.status = 'healthy';
      health.errorCount = 0;
      delete health.lastError;
      
    } catch (error: any) {
      // MCP failed to start
      health.status = 'unhealthy';
      health.errorCount++;
      health.lastError = error.message;
      
      // Auto-disable after too many failures
      if (health.errorCount >= this.maxRetries) {
        health.status = 'disabled';
        health.disabledReason = `Disabled after ${health.errorCount} consecutive failures`;
        logger.warn(`${name} disabled after ${health.errorCount} failures`);
      }
    }
    
    // Save health status
    this.healthStatus.set(name, health);
    await this.saveHealthStatus();
    
    return health;
  }
  
  /**
   * Check health of multiple MCPs
   */
  async checkMultipleMCPs(mcps: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>): Promise<HealthReport> {
    const results: MCPHealth[] = [];
    
    for (const mcp of mcps) {
      const health = await this.checkMCPHealth(
        mcp.name,
        mcp.command,
        mcp.args,
        mcp.env
      );
      results.push(health);
      
      // Small delay between checks to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return this.generateHealthReport(results);
  }
  
  /**
   * Generate a health report for AI consumption
   */
  generateHealthReport(results?: MCPHealth[]): HealthReport {
    const details = results || Array.from(this.healthStatus.values());
    
    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      totalMCPs: details.length,
      healthy: details.filter(h => h.status === 'healthy').length,
      unhealthy: details.filter(h => h.status === 'unhealthy').length,
      disabled: details.filter(h => h.status === 'disabled').length,
      details,
      recommendations: []
    };
    
    // Generate recommendations for AI
    if (report.unhealthy > 0) {
      report.recommendations?.push(
        'Some MCPs are unhealthy. Check their error messages and ensure dependencies are installed.'
      );
    }
    
    if (report.disabled > 0) {
      report.recommendations?.push(
        'Some MCPs have been auto-disabled due to repeated failures. Fix the issues and re-enable them.'
      );
    }
    
    // Specific recommendations based on common errors
    for (const mcp of details) {
      if (mcp.lastError?.includes('command not found')) {
        report.recommendations?.push(
          `${mcp.name}: Command '${mcp.command}' not found. Install required software or update PATH.`
        );
      }
      if (mcp.lastError?.includes('EACCES')) {
        report.recommendations?.push(
          `${mcp.name}: Permission denied. Check file permissions.`
        );
      }
      if (mcp.lastError?.includes('ENOENT')) {
        report.recommendations?.push(
          `${mcp.name}: File or directory not found. Check installation path.`
        );
      }
    }
    
    return report;
  }
  
  /**
   * Get health status for a specific MCP
   */
  getMCPHealth(name: string): MCPHealth | undefined {
    return this.healthStatus.get(name);
  }
  
  /**
   * Manually enable a disabled MCP (reset error count)
   */
  async enableMCP(name: string): Promise<void> {
    const health = this.healthStatus.get(name);
    if (health) {
      health.status = 'unknown';
      health.errorCount = 0;
      delete health.disabledReason;
      this.healthStatus.set(name, health);
      await this.saveHealthStatus();
    }
  }
  
  /**
   * Manually disable an MCP
   */
  async disableMCP(name: string, reason: string): Promise<void> {
    const health = this.healthStatus.get(name) || {
      name,
      status: 'disabled',
      lastCheck: new Date().toISOString(),
      errorCount: 0
    };
    
    health.status = 'disabled';
    health.disabledReason = reason;
    this.healthStatus.set(name, health);
    await this.saveHealthStatus();
  }
  
  /**
   * Get list of healthy MCPs that should be loaded
   */
  getHealthyMCPs(requestedMCPs: string[]): string[] {
    return requestedMCPs.filter(name => {
      const health = this.healthStatus.get(name);
      // Include if unknown (first time) or healthy
      return !health || health.status === 'healthy' || health.status === 'unknown';
    });
  }
  
  /**
   * Mark MCP as healthy (simple tracking for tool execution)
   */
  markHealthy(mcpName: string): void {
    const existing = this.healthStatus.get(mcpName);
    this.healthStatus.set(mcpName, {
      name: mcpName,
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      errorCount: 0,
      command: existing?.command,
      args: existing?.args,
      env: existing?.env
    });
    // Note: Not saving immediately for performance, will save periodically
  }

  /**
   * Mark MCP as unhealthy due to execution error
   */
  markUnhealthy(mcpName: string, error: string): void {
    const existing = this.healthStatus.get(mcpName);
    const errorCount = (existing?.errorCount || 0) + 1;

    this.healthStatus.set(mcpName, {
      name: mcpName,
      status: errorCount >= 3 ? 'disabled' : 'unhealthy',
      lastCheck: new Date().toISOString(),
      errorCount,
      lastError: error,
      command: existing?.command,
      args: existing?.args,
      env: existing?.env
    });

    if (errorCount >= 3) {
      logger.warn(`🚫 MCP ${mcpName} auto-disabled after ${errorCount} errors: ${error}`);
    }
    // Note: Not saving immediately for performance
  }

  /**
   * Clear health history for fresh start
   */
  async clearHealthHistory(): Promise<void> {
    this.healthStatus.clear();
    await this.saveHealthStatus();
  }

  /**
   * Force save health status to disk
   */
  async saveHealth(): Promise<void> {
    await this.saveHealthStatus();
  }
}

/**
 * Singleton instance
 */
export const healthMonitor = new MCPHealthMonitor();
