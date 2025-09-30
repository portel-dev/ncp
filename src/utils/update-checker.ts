/**
 * Update Checker for NCP
 * Checks for new versions and notifies users
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chalk from 'chalk';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const packageVersion = packageJson.version;
const packageName = packageJson.name;

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable?: boolean;
}

interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
  notificationShown: boolean;
}

export class UpdateChecker {
  private packageVersion: string;
  private packageName: string;
  private cacheFile: string;
  private readonly checkInterval = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Use package info from module-level constants (read from package.json)
    this.packageName = packageName;
    this.packageVersion = packageVersion;

    // Cache file location
    const ncpDir = join(homedir(), '.ncp');
    if (!existsSync(ncpDir)) {
      mkdirSync(ncpDir, { recursive: true });
    }
    this.cacheFile = join(ncpDir, 'update-cache.json');
  }

  private loadCache(): UpdateCache | null {
    try {
      if (!existsSync(this.cacheFile)) {
        return null;
      }
      return JSON.parse(readFileSync(this.cacheFile, 'utf8'));
    } catch {
      return null;
    }
  }

  private saveCache(cache: UpdateCache): void {
    try {
      writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));
    } catch {
      // Ignore cache write errors
    }
  }

  private async fetchLatestVersion(): Promise<string | null> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${this.packageName}/latest`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.version || null;
    } catch {
      return null;
    }
  }

  private compareVersions(current: string, latest: string): boolean {
    // Simple semantic version comparison
    const parseVersion = (v: string) => v.split('.').map(num => parseInt(num, 10));
    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }
    return false;
  }

  async checkForUpdates(forceCheck = false): Promise<UpdateCheckResult> {
    const cache = this.loadCache();
    const now = Date.now();

    // Check if we need to fetch (force check or cache expired)
    const shouldCheck = forceCheck ||
      !cache ||
      (now - cache.lastCheck) > this.checkInterval;

    let latestVersion = cache?.latestVersion;

    if (shouldCheck) {
      const fetchedVersion = await this.fetchLatestVersion();
      if (fetchedVersion) {
        latestVersion = fetchedVersion;

        // Save to cache
        this.saveCache({
          lastCheck: now,
          latestVersion: fetchedVersion,
          notificationShown: false
        });
      }
    }

    const hasUpdate = latestVersion ? this.compareVersions(this.packageVersion, latestVersion) : false;

    return {
      hasUpdate,
      currentVersion: this.packageVersion,
      latestVersion,
      updateAvailable: hasUpdate
    };
  }

  async showUpdateNotification(): Promise<void> {
    const cache = this.loadCache();
    if (cache?.notificationShown) {
      return; // Already shown for this version
    }

    const result = await this.checkForUpdates();
    if (result.hasUpdate && result.latestVersion) {
      console.log();
      console.log(chalk.yellow('📦 Update Available!'));
      console.log(chalk.dim(`   Current: ${result.currentVersion}`));
      console.log(chalk.green(`   Latest:  ${result.latestVersion}`));
      console.log();
      console.log(chalk.cyan('   Run: npm install -g @portel/ncp@latest'));
      console.log(chalk.dim('   Or:  ncp update'));
      console.log();

      // Mark notification as shown
      if (cache) {
        cache.notificationShown = true;
        this.saveCache(cache);
      }
    }
  }

  async performUpdate(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');

      console.log(chalk.blue('🔄 Updating NCP...'));

      return new Promise((resolve) => {
        const updateProcess = spawn('npm', ['install', '-g', '@portel/ncp@latest'], {
          stdio: 'inherit'
        });

        updateProcess.on('close', (code) => {
          if (code === 0) {
            console.log(chalk.green('✅ NCP updated successfully!'));
            console.log(chalk.dim('   Restart your terminal or run: source ~/.bashrc'));
            resolve(true);
          } else {
            console.log(chalk.red('❌ Update failed. Please try manually:'));
            console.log(chalk.dim('   npm install -g @portel/ncp@latest'));
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.log(chalk.red('❌ Update failed:'), error);
      return false;
    }
  }
}