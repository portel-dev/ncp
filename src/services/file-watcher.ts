/**
 * File Watcher Service - Monitor skills and photons directories for changes
 *
 * Watches ~/.ncp/skills/ and ~/.ncp/photons/ directories and triggers
 * incremental index updates when files are added, modified, or deleted.
 * Uses chokidar for cross-platform support (Windows, macOS, Linux).
 */

import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  fileName: string;
  directory: 'skills' | 'photons';
}

export interface FileWatcherCallbacks {
  onSkillAdded?: (fileName: string, filePath: string) => Promise<void>;
  onSkillModified?: (fileName: string, filePath: string) => Promise<void>;
  onSkillRemoved?: (fileName: string) => Promise<void>;
  onPhotonAdded?: (fileName: string, filePath: string) => Promise<void>;
  onPhotonModified?: (fileName: string, filePath: string) => Promise<void>;
  onPhotonRemoved?: (fileName: string) => Promise<void>;
  onError?: (error: Error) => void;
}

export class FileWatcher {
  private skillsWatcher: FSWatcher | null = null;
  private photonsWatcher: FSWatcher | null = null;
  private callbacks: FileWatcherCallbacks;
  private isInitialized = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;

  // Patterns to ignore (temp files, editor backups, system files)
  private static IGNORE_PATTERNS = [
    /~$/, // Vim/Emacs backup files
    /\.swp$/, // Vim swap files
    /\.swo$/, // Vim swap files
    /\.bak$/, // Generic backups
    /\.tmp$/, // Temp files
    /\.orig$/, // Original copies
    /^\._/, // macOS resource forks
    /^\.DS_Store$/, // macOS folder metadata
    /Thumbs\.db$/, // Windows thumbnails
    /~\d+$/, // Word/Office backups
  ];

  constructor(callbacks: FileWatcherCallbacks = {}, debounceMs?: number) {
    this.callbacks = callbacks;
    // Default 300ms debounce, configurable via NCP_FILE_WATCHER_DEBOUNCE_MS
    this.debounceMs = debounceMs || parseInt(process.env.NCP_FILE_WATCHER_DEBOUNCE_MS || '300', 10);
  }

  /**
   * Check if a file should be ignored
   */
  private shouldIgnoreFile(fileName: string): boolean {
    return FileWatcher.IGNORE_PATTERNS.some(pattern => pattern.test(fileName));
  }

  /**
   * Debounce file event processing
   */
  private debounceEvent(key: string, callback: () => Promise<void>): void {
    // Clear existing timer for this key
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const newTimer = setTimeout(() => {
      this.debounceTimers.delete(key);
      callback().catch(error => {
        logger.error(`Debounced event callback failed: ${error.message}`);
      });
    }, this.debounceMs);

    this.debounceTimers.set(key, newTimer);
  }

  /**
   * Start watching for file changes in skills and photons directories
   */
  async start(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('FileWatcher already started');
      return;
    }

    const ncpDir = getNcpBaseDirectory();
    const skillsDir = path.join(ncpDir, 'skills');
    const photonsDir = path.join(ncpDir, 'photons');

    try {
      // Watch skills directory
      this.skillsWatcher = chokidar.watch(skillsDir, {
        persistent: true,
        ignored: /(^|[/\\])\.|node_modules|\.git/,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      });

      this.skillsWatcher.on('add', (filePath) => this.handleSkillEvent('add', filePath));
      this.skillsWatcher.on('change', (filePath) => this.handleSkillEvent('change', filePath));
      this.skillsWatcher.on('unlink', (filePath) => this.handleSkillEvent('unlink', filePath));
      this.skillsWatcher.on('error', (error: any) => {
        logger.error(`Skills watcher error: ${error?.message || error}`);
        if (error instanceof Error) {
          this.callbacks.onError?.(error);
        }
      });

      // Watch photons directory
      this.photonsWatcher = chokidar.watch(photonsDir, {
        persistent: true,
        ignored: /(^|[/\\])\.|node_modules|\.git/,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      });

      this.photonsWatcher.on('add', (filePath) => this.handlePhotonEvent('add', filePath));
      this.photonsWatcher.on('change', (filePath) => this.handlePhotonEvent('change', filePath));
      this.photonsWatcher.on('unlink', (filePath) => this.handlePhotonEvent('unlink', filePath));
      this.photonsWatcher.on('error', (error: any) => {
        logger.error(`Photons watcher error: ${error?.message || error}`);
        if (error instanceof Error) {
          this.callbacks.onError?.(error);
        }
      });

      this.isInitialized = true;
      logger.info(`📁 File watcher started for skills and photons directories (debounce: ${this.debounceMs}ms)`);
    } catch (error: any) {
      logger.error(`Failed to start file watcher: ${error.message}`);
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (!this.isInitialized) {
      logger.debug('FileWatcher not started');
      return;
    }

    try {
      // Clear all pending debounce timers
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      await this.skillsWatcher?.close();
      await this.photonsWatcher?.close();
      this.isInitialized = false;
      logger.info('📁 File watcher stopped');
    } catch (error: any) {
      logger.error(`Failed to stop file watcher: ${error.message}`);
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /**
   * Handle skill directory events
   */
  private async handleSkillEvent(type: 'add' | 'change' | 'unlink', filePath: string) {
    try {
      // Only process SKILL.md files or skill directories
      const fileName = path.basename(filePath);

      // Ignore temp/system files
      if (this.shouldIgnoreFile(fileName)) {
        logger.debug(`Ignoring temp file: ${fileName}`);
        return;
      }

      const parentDir = path.basename(path.dirname(filePath));
      const ncpDir = getNcpBaseDirectory();
      const skillsDir = path.join(ncpDir, 'skills');

      // For SKILL.md files or when parent is a skill directory
      if (fileName === 'SKILL.md' || (filePath.startsWith(skillsDir) && filePath !== skillsDir)) {
        const skillName = fileName === 'SKILL.md' ? parentDir : fileName.replace(/\.(ts|js|md)$/, '');

        logger.debug(`Skill ${type}: ${skillName} (${filePath})`);

        // Debounce the event to prevent duplicate processing
        const debounceKey = `skill:${skillName}:${type}`;
        this.debounceEvent(debounceKey, async () => {
          if (type === 'add' && this.callbacks.onSkillAdded) {
            await this.callbacks.onSkillAdded(skillName, filePath);
          } else if (type === 'change' && this.callbacks.onSkillModified) {
            await this.callbacks.onSkillModified(skillName, filePath);
          } else if (type === 'unlink' && this.callbacks.onSkillRemoved) {
            await this.callbacks.onSkillRemoved(skillName);
          }
        });
      }
    } catch (error: any) {
      logger.error(`Error handling skill event: ${error.message}`);
      this.callbacks.onError?.(error);
    }
  }

  /**
   * Handle photon directory events
   */
  private async handlePhotonEvent(type: 'add' | 'change' | 'unlink', filePath: string) {
    try {
      // Only process .photon.ts files
      const fileName = path.basename(filePath);

      // Ignore temp/system files
      if (this.shouldIgnoreFile(fileName)) {
        logger.debug(`Ignoring temp file: ${fileName}`);
        return;
      }

      // Match photon files ending in .photon.ts or .photon.js
      if (fileName.match(/\.photon\.(ts|js)$/)) {
        const photonName = fileName.replace(/\.photon\.(ts|js)$/, '');

        logger.debug(`Photon ${type}: ${photonName} (${filePath})`);

        // Debounce the event to prevent duplicate processing
        const debounceKey = `photon:${photonName}:${type}`;
        this.debounceEvent(debounceKey, async () => {
          if (type === 'add' && this.callbacks.onPhotonAdded) {
            await this.callbacks.onPhotonAdded(photonName, filePath);
          } else if (type === 'change' && this.callbacks.onPhotonModified) {
            await this.callbacks.onPhotonModified(photonName, filePath);
          } else if (type === 'unlink' && this.callbacks.onPhotonRemoved) {
            await this.callbacks.onPhotonRemoved(photonName);
          }
        });
      }
    } catch (error: any) {
      logger.error(`Error handling photon event: ${error.message}`);
      this.callbacks.onError?.(error);
    }
  }

  /**
   * Check if watcher is initialized
   */
  isRunning(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance for application-wide use
let fileWatcherInstance: FileWatcher | null = null;

export function getFileWatcher(callbacks?: FileWatcherCallbacks): FileWatcher {
  if (!fileWatcherInstance) {
    fileWatcherInstance = new FileWatcher(callbacks);
  } else if (callbacks) {
    // Update callbacks if provided
    fileWatcherInstance['callbacks'] = callbacks;
  }
  return fileWatcherInstance;
}
