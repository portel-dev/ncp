/**
 * NCP Doctor Command
 * Comprehensive diagnostics for troubleshooting NCP and MCP health
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OutputFormatter } from '../../services/output-formatter.js';
import { getNcpBaseDirectory } from '../../utils/ncp-paths.js';

export interface DiagnosticCheck {
  name: string;
  status: 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'UNKNOWN';
  message?: string;
  details?: string[];
}

export class DoctorCommand {
  /**
   * Run all diagnostic checks
   */
  static async diagnose(mcpName?: string): Promise<void> {
    console.log(OutputFormatter.header('🏥 NCP Doctor - System Diagnostics'));
    console.log(OutputFormatter.muted('Checking system health and MCP configuration...\n'));

    const checks: DiagnosticCheck[] = [];

    // System checks
    checks.push(this.checkNodeVersion());
    checks.push(this.checkNpm());
    checks.push(await this.checkCwd());
    checks.push(await this.checkProfileDirectory());
    checks.push(await this.checkCacheSystem());

    // MCP-specific checks if requested
    if (mcpName) {
      console.log(OutputFormatter.muted(`\nChecking MCP: ${mcpName}...\n`));
      // These would require the orchestrator
      // checks.push(await this.checkMcpConfig(mcpName));
      // checks.push(await this.checkMcpTransport(mcpName));
      // checks.push(await this.checkMcpTools(mcpName));
    }

    // Display results
    this.displayResults(checks);

    // Summary
    const healthy = checks.filter(c => c.status === 'HEALTHY').length;
    const total = checks.length;
    const percentage = Math.round((healthy / total) * 100);

    console.log(OutputFormatter.muted(`\n${'─'.repeat(50)}\n`));
    console.log(OutputFormatter.highlight(`📊 Summary: ${healthy}/${total} checks passed (${percentage}%)\n`));

    if (healthy === total) {
      console.log(OutputFormatter.success('System is healthy!\n'));
    } else {
      console.log(OutputFormatter.warning('Some checks failed. See details above.\n'));
    }
  }

  private static checkNodeVersion(): DiagnosticCheck {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);

    if (major >= 18) {
      return {
        name: 'Node.js Version',
        status: 'HEALTHY',
        message: `Node.js ${version} ✓ (≥18 required)`,
        details: [version]
      };
    } else {
      return {
        name: 'Node.js Version',
        status: 'UNHEALTHY',
        message: `Node.js ${version} ✗ (upgrade to ≥18 required)`,
        details: [version]
      };
    }
  }

  private static checkNpm(): DiagnosticCheck {
    try {
      const { execSync } = require('child_process');
      const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();

      return {
        name: 'npm Availability',
        status: 'HEALTHY',
        message: `npm ${npmVersion} available ✓`,
        details: [npmVersion]
      };
    } catch {
      return {
        name: 'npm Availability',
        status: 'UNHEALTHY',
        message: 'npm not found ✗',
        details: ['npm is required but not available in PATH']
      };
    }
  }

  private static async checkCwd(): Promise<DiagnosticCheck> {
    try {
      const cwd = process.cwd();
      const stat = await fs.stat(cwd);

      if (stat.isDirectory()) {
        return {
          name: 'Working Directory',
          status: 'HEALTHY',
          message: `${cwd} ✓`,
          details: [cwd]
        };
      }
    } catch (error: any) {
      return {
        name: 'Working Directory',
        status: 'UNHEALTHY',
        message: `Cannot access working directory ✗`,
        details: [error.message]
      };
    }

    return {
      name: 'Working Directory',
      status: 'UNKNOWN',
      message: 'Cannot determine working directory',
      details: []
    };
  }

  private static async checkProfileDirectory(): Promise<DiagnosticCheck> {
    try {
      const ncpDir = getNcpBaseDirectory();
      const stat = await fs.stat(ncpDir);

      if (stat.isDirectory()) {
        // Check if config exists
        const configPath = path.join(ncpDir, 'config.json');
        try {
          await fs.stat(configPath);
          return {
            name: 'Profile Directory',
            status: 'HEALTHY',
            message: `${ncpDir} ✓`,
            details: [`Config found at ${configPath}`]
          };
        } catch {
          return {
            name: 'Profile Directory',
            status: 'DEGRADED',
            message: `${ncpDir} exists but no config found`,
            details: ['Run ncp config to initialize']
          };
        }
      }
    } catch (error: any) {
      return {
        name: 'Profile Directory',
        status: 'DEGRADED',
        message: `Profile directory missing`,
        details: [`Run ncp add <mcp> to initialize`]
      };
    }

    return {
      name: 'Profile Directory',
      status: 'UNKNOWN',
      message: 'Cannot determine profile directory',
      details: []
    };
  }

  private static async checkCacheSystem(): Promise<DiagnosticCheck> {
    try {
      const cacheDir = path.join(getNcpBaseDirectory(), 'cache');
      const stat = await fs.stat(cacheDir);

      if (stat.isDirectory()) {
        // Check for essential cache files
        const files = await fs.readdir(cacheDir);
        const csvCaches = files.filter(f => f.endsWith('.csv'));
        const metaCaches = files.filter(f => f.endsWith('.json'));

        if (csvCaches.length > 0 || metaCaches.length > 0) {
          return {
            name: 'Cache System',
            status: 'HEALTHY',
            message: `Cache ready ✓`,
            details: [
              `CSV caches: ${csvCaches.length}`,
              `Metadata caches: ${metaCaches.length}`
            ]
          };
        } else {
          return {
            name: 'Cache System',
            status: 'DEGRADED',
            message: `Cache directory exists but is empty`,
            details: ['Run ncp find to generate caches']
          };
        }
      }
    } catch (error: any) {
      return {
        name: 'Cache System',
        status: 'DEGRADED',
        message: `Cache system not initialized`,
        details: ['Run ncp find to initialize caches']
      };
    }

    return {
      name: 'Cache System',
      status: 'UNKNOWN',
      message: 'Cannot determine cache status',
      details: []
    };
  }

  private static displayResults(checks: DiagnosticCheck[]): void {
    checks.forEach(check => {
      const statusIcon = this.getStatusIcon(check.status);
      console.log(statusIcon + ' ' + check.name);

      if (check.message) {
        console.log(OutputFormatter.muted(`   ${check.message}`));
      }

      if (check.details && check.details.length > 0) {
        check.details.forEach(detail => {
          console.log(OutputFormatter.muted(`   • ${detail}`));
        });
      }

      console.log();
    });
  }

  private static getStatusIcon(status: string): string {
    // Use OutputFormatter status badges for consistency
    const badge = OutputFormatter.STATUS[status as keyof typeof OutputFormatter.STATUS];
    if (badge) {
      // Extract just the icon part (first character)
      return badge.charAt(0);
    }
    return '?';
  }
}
