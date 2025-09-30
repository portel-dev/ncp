/**
 * Auto-Update System for @portel/ncp
 *
 * Checks NPM registry for newer versions and notifies users.
 * Follows npm best practices - users control when to update.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const packageVersion = packageJson.version;
const packageName = packageJson.name;

interface VersionInfo {
  current: string;
  latest: string;
  isOutdated: boolean;
  updateCommand: string;
}

export class NPCUpdater {
  private readonly packageName = packageName;
  private readonly checkInterval = 24 * 60 * 60 * 1000; // 24 hours
  private readonly timeout = 5000; // 5 seconds

  /**
   * Get current package version from package.json
   */
  private async getCurrentVersion(): Promise<string> {
    return packageVersion;
  }

  /**
   * Fetch latest version from NPM registry
   */
  private async getLatestVersion(): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`https://registry.npmjs.org/${this.packageName}/latest`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ncp-updater/1.0.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.version;
    } catch (error) {
      // Fail silently - don't disrupt normal operation
      logger.debug(`Update check failed: ${error}`);
      return null;
    }
  }

  /**
   * Compare version strings (semver-like)
   */
  private isNewerVersion(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  }

  /**
   * Check if update is available
   */
  async checkForUpdates(): Promise<VersionInfo | null> {
    const current = await this.getCurrentVersion();
    const latest = await this.getLatestVersion();

    if (!latest) {
      return null; // Network/registry error
    }

    const isOutdated = this.isNewerVersion(current, latest);

    return {
      current,
      latest,
      isOutdated,
      updateCommand: `npm update -g ${this.packageName}`
    };
  }

  /**
   * Get update tip for --find results (if update available)
   */
  async getUpdateTip(): Promise<string | null> {
    try {
      const versionInfo = await this.checkForUpdates();

      if (versionInfo?.isOutdated) {
        return `🚀 Update available: v${versionInfo.current} → v${versionInfo.latest} (run: ${versionInfo.updateCommand})`;
      }

      return null;
    } catch (error) {
      // Fail silently - updates shouldn't break normal operation
      logger.debug(`Update check error: ${error}`);
      return null;
    }
  }
}

// Singleton instance
export const updater = new NPCUpdater();