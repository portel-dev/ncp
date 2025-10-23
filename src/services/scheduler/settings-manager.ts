/**
 * Settings Manager - Persist and load scheduler configuration
 * Supports JSON config files and DXT extension configs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getSchedulerDirectory } from '../../utils/ncp-paths.js';
import { SchedulerConfig } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';

export class SettingsManager {
  private configFile: string | null = null;
  private config: SchedulerConfig | null = null;
  private initialized: boolean = false;

  // Default configuration
  private static readonly DEFAULTS: SchedulerConfig = {
    maxExecutionsPerJob: 100,
    maxExecutionAgeDays: 14,
    cleanupSchedule: '0 0 * * *', // Daily at midnight
    enableAutoCleanup: true,
    defaultTimeout: 5 * 60 * 1000 // 5 minutes
  };

  constructor() {
    // Lazy initialization - don't traverse directories during construction
  }

  /**
   * Initialize paths and configuration on first use
   */
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    const schedulerDir = getSchedulerDirectory();
    this.configFile = join(schedulerDir, 'config.json');

    // Ensure scheduler directory exists
    if (!existsSync(schedulerDir)) {
      mkdirSync(schedulerDir, { recursive: true });
      logger.info(`[SettingsManager] Created scheduler directory: ${schedulerDir}`);
    }

    // Load or create config
    this.config = this.loadConfig();
    this.initialized = true;
  }

  /**
   * Load configuration from file, or create default if missing
   */
  private loadConfig(): SchedulerConfig {
    try {
      if (existsSync(this.configFile!)) {
        const content = readFileSync(this.configFile!, 'utf-8');
        const loaded = JSON.parse(content) as Partial<SchedulerConfig>;

        // Merge with defaults (for new fields added in updates)
        const merged = { ...SettingsManager.DEFAULTS, ...loaded };
        logger.info('[SettingsManager] Loaded configuration from file');
        return merged;
      } else {
        // Create default config file
        this.saveConfig(SettingsManager.DEFAULTS);
        logger.info('[SettingsManager] Created default configuration file');
        return { ...SettingsManager.DEFAULTS };
      }
    } catch (error) {
      logger.error(`[SettingsManager] Failed to load config: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn('[SettingsManager] Using default configuration');
      return { ...SettingsManager.DEFAULTS };
    }
  }

  /**
   * Save configuration to file
   */
  private saveConfig(config: SchedulerConfig): void {
    this.ensureInitialized();
    try {
      writeFileSync(this.configFile!, JSON.stringify(config, null, 2), 'utf-8');
      logger.info('[SettingsManager] Saved configuration to file');
    } catch (error) {
      logger.error(`[SettingsManager] Failed to save config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SchedulerConfig {
    this.ensureInitialized();
    return { ...this.config! };
  }

  /**
   * Update configuration (partial update)
   */
  updateConfig(updates: Partial<SchedulerConfig>): void {
    this.ensureInitialized();
    this.config = { ...this.config!, ...updates };
    this.saveConfig(this.config);
    logger.info('[SettingsManager] Updated configuration');
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    this.ensureInitialized();
    this.config = { ...SettingsManager.DEFAULTS };
    this.saveConfig(this.config);
    logger.info('[SettingsManager] Reset configuration to defaults');
  }

  /**
   * Load configuration from DXT extension config (for Claude Desktop)
   * This allows .dxt extensions to specify scheduler retention policies
   */
  static loadFromDXTConfig(dxtConfig: any): Partial<SchedulerConfig> {
    const schedulerConfig: Partial<SchedulerConfig> = {};

    // Check for scheduler settings in DXT config
    if (dxtConfig?.scheduler) {
      const dxtScheduler = dxtConfig.scheduler;

      if (typeof dxtScheduler.maxExecutionsPerJob === 'number') {
        schedulerConfig.maxExecutionsPerJob = dxtScheduler.maxExecutionsPerJob;
      }

      if (typeof dxtScheduler.maxExecutionAgeDays === 'number') {
        schedulerConfig.maxExecutionAgeDays = dxtScheduler.maxExecutionAgeDays;
      }

      if (typeof dxtScheduler.cleanupSchedule === 'string') {
        schedulerConfig.cleanupSchedule = dxtScheduler.cleanupSchedule;
      }

      if (typeof dxtScheduler.enableAutoCleanup === 'boolean') {
        schedulerConfig.enableAutoCleanup = dxtScheduler.enableAutoCleanup;
      }

      if (typeof dxtScheduler.defaultTimeout === 'number') {
        schedulerConfig.defaultTimeout = dxtScheduler.defaultTimeout;
      }
    }

    return schedulerConfig;
  }
}
