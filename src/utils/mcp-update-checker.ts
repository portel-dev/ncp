/**
 * MCP Update Checker
 * Detects version updates for installed MCPs and manages cache invalidation
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import { logger } from './logger.js';

export interface MCPVersionInfo {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  lastChecked?: number;
}

interface MCPUpdateCache {
  [mcpName: string]: {
    currentVersion: string;
    latestVersion?: string;
    lastCheck: number;
    notificationShown: boolean;
  };
}

export class MCPUpdateChecker {
  private cacheFile: string;
  private readonly checkInterval = 24 * 60 * 60 * 1000; // 24 hours
  private inFlightRequests: Map<string, Promise<string | null>> = new Map();

  constructor() {
    const ncpDir = join(homedir(), '.ncp');
    if (!existsSync(ncpDir)) {
      mkdirSync(ncpDir, { recursive: true });
    }
    this.cacheFile = join(ncpDir, 'mcp-updates.json');
  }

  private loadCache(): MCPUpdateCache {
    try {
      if (!existsSync(this.cacheFile)) {
        return {};
      }
      return JSON.parse(readFileSync(this.cacheFile, 'utf8'));
    } catch {
      return {};
    }
  }

  private saveCache(cache: MCPUpdateCache): void {
    try {
      // Atomic write: write to temp file then rename
      const tempFile = `${this.cacheFile}.${randomBytes(4).toString('hex')}`;
      writeFileSync(tempFile, JSON.stringify(cache, null, 2));
      // Atomic rename (POSIX-compliant, works on Windows too)
      const fs = require('fs');
      fs.renameSync(tempFile, this.cacheFile);
    } catch (error) {
      logger.debug(`Failed to save MCP update cache: ${error}`);
    }
  }

  /**
   * Fetch latest version from npm registry with deduplication
   * Prevents duplicate requests if multiple tools call this simultaneously
   */
  private async fetchLatestVersionFromNpm(packageName: string): Promise<string | null> {
    // Return in-flight request if it exists
    if (this.inFlightRequests.has(packageName)) {
      return this.inFlightRequests.get(packageName)!;
    }

    const promise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        return data.version || null;
      } catch (error) {
        logger.debug(`Failed to fetch latest version for ${packageName}: ${error}`);
        return null;
      } finally {
        // Clean up in-flight request
        this.inFlightRequests.delete(packageName);
      }
    })();

    this.inFlightRequests.set(packageName, promise);
    return promise;
  }

  /**
   * Compare semantic versions
   * Returns true if latestVersion > currentVersion
   */
  private compareVersions(current: string, latest: string): boolean {
    try {
      const parseVersion = (v: string) => {
        return v.split('.').map(num => {
          const match = num.match(/^\d+/);
          return match ? parseInt(match[0], 10) : 0;
        });
      };

      const currentParts = parseVersion(current);
      const latestParts = parseVersion(latest);

      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const currentPart = currentParts[i] || 0;
        const latestPart = latestParts[i] || 0;

        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check for updates for a specific MCP
   */
  async checkMCPUpdate(mcpName: string, currentVersion: string, packageName?: string): Promise<MCPVersionInfo> {
    const cache = this.loadCache();
    const now = Date.now();
    const pkg = packageName || `@modelcontextprotocol/server-${mcpName}`;

    // Check cache validity
    const cachedInfo = cache[mcpName];
    const shouldCheck = !cachedInfo || (now - cachedInfo.lastCheck) > this.checkInterval;

    let latestVersion = cachedInfo?.latestVersion;

    if (shouldCheck) {
      const fetchedVersion = await this.fetchLatestVersionFromNpm(pkg);
      if (fetchedVersion) {
        latestVersion = fetchedVersion;
        // Update cache
        if (!cache[mcpName]) {
          cache[mcpName] = {
            currentVersion,
            latestVersion: fetchedVersion,
            lastCheck: now,
            notificationShown: false
          };
        } else {
          cache[mcpName].latestVersion = fetchedVersion;
          cache[mcpName].lastCheck = now;
        }
        this.saveCache(cache);
      }
    }

    const hasUpdate = latestVersion ? this.compareVersions(currentVersion, latestVersion) : false;

    return {
      name: mcpName,
      currentVersion,
      latestVersion,
      hasUpdate,
      lastChecked: cachedInfo?.lastCheck
    };
  }

  /**
   * Get inline notification message for outdated MCP
   */
  getUpdateNotification(mcpInfo: MCPVersionInfo): string | null {
    if (!mcpInfo.hasUpdate || !mcpInfo.latestVersion) {
      return null;
    }

    return chalk.yellow(
      `⚠️  "${mcpInfo.name}" v${mcpInfo.currentVersion} → v${mcpInfo.latestVersion} available. ` +
      `Update with: ${chalk.cyan(`ncp update ${mcpInfo.name}`)}`
    );
  }

  /**
   * Record that notification was shown to avoid spam
   */
  markNotificationShown(mcpName: string): void {
    const cache = this.loadCache();
    if (cache[mcpName]) {
      cache[mcpName].notificationShown = true;
      this.saveCache(cache);
    }
  }

  /**
   * Check if notification should be shown (once per day per MCP)
   */
  shouldShowNotification(mcpName: string): boolean {
    const cache = this.loadCache();
    const info = cache[mcpName];

    if (!info) return true;
    if (info.notificationShown) return false;

    // Re-show notification if it's been more than 24 hours
    const now = Date.now();
    return (now - info.lastCheck) > this.checkInterval;
  }

  /**
   * Clear version cache for an MCP (called after update)
   */
  invalidateMCPCache(mcpName: string): void {
    const cache = this.loadCache();
    delete cache[mcpName];
    this.saveCache(cache);
    logger.debug(`Invalidated update cache for ${mcpName}`);
  }

  /**
   * Get all MCPs with available updates
   */
  async checkAllMCPUpdates(
    mcps: Array<{ name: string; version: string; packageName?: string }>
  ): Promise<MCPVersionInfo[]> {
    const results: MCPVersionInfo[] = [];

    for (const mcp of mcps) {
      const info = await this.checkMCPUpdate(mcp.name, mcp.version, mcp.packageName);
      results.push(info);
    }

    return results.filter(info => info.hasUpdate);
  }
}
