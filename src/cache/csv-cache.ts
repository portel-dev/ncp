/**
 * CSV-based incremental cache for NCP
 * Enables resumable indexing by appending each MCP as it's indexed
 */

import { createWriteStream, WriteStream, fsync, openSync, fsyncSync, closeSync } from 'fs';
import { mkdir, readFile, writeFile, access, constants } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export interface CachedTool {
  mcpName: string;
  toolId: string;
  toolName: string;
  description: string;
  hash: string;
  timestamp: string;
}

export interface CachedMCP {
  name: string;
  hash: string;
  toolCount: number;
  timestamp: string;
  tools: CachedTool[];
}

export interface FailedMCP {
  name: string;
  lastAttempt: string; // ISO timestamp
  errorType: string; // 'timeout', 'connection_refused', 'unknown'
  errorMessage: string;
  attemptCount: number;
  nextRetry: string; // ISO timestamp - when to retry next
}

export interface CacheMetadata {
  version: string;
  profileName: string;
  profileHash: string;
  ncpVersion: string; // Track NCP version to detect code changes
  createdAt: string;
  lastUpdated: string;
  totalMCPs: number;
  totalTools: number;
  indexedMCPs: Map<string, string>; // mcpName -> mcpHash
  failedMCPs: Map<string, FailedMCP>; // mcpName -> failure info
}

export class CSVCache {
  private csvPath: string;
  private metaPath: string;
  private writeStream: WriteStream | null = null;
  private metadata: CacheMetadata | null = null;

  constructor(private cacheDir: string, private profileName: string) {
    // Debug logging to track profile name
    if (process.env.NCP_DEBUG === 'true') {
      console.error(`[DEBUG CSV] CSVCache initialized with profileName: ${profileName}`);
      console.error(`[DEBUG CSV] csvPath: ${join(cacheDir, `${profileName}-tools.csv`)}`);
      console.error(`[DEBUG CSV] metaPath: ${join(cacheDir, `${profileName}-cache-meta.json`)}`);
    }
    this.csvPath = join(cacheDir, `${profileName}-tools.csv`);
    this.metaPath = join(cacheDir, `${profileName}-cache-meta.json`);
  }

  /**
   * Initialize cache - create files if needed
   */
  async initialize(): Promise<void> {
    // Ensure cache directory exists
    await mkdir(dirname(this.csvPath), { recursive: true });

    // Get current NCP version
    const currentVersion = await this.getNcpVersion();

    // Load or create metadata
    try {
      await access(this.metaPath, constants.F_OK);
      // File exists, read it
      const content = await readFile(this.metaPath, 'utf-8');
      const parsed = JSON.parse(content);
      // Convert objects back to Maps
      const loadedMetadata = {
        ...parsed,
        indexedMCPs: new Map(Object.entries(parsed.indexedMCPs || {})),
        failedMCPs: new Map(Object.entries(parsed.failedMCPs || {}))
      };

      // Check if NCP version changed (code updated)
      if (loadedMetadata.ncpVersion !== currentVersion) {
        logger.info(`NCP version changed (${loadedMetadata.ncpVersion || 'unknown'} → ${currentVersion}), clearing failed MCPs`);
        loadedMetadata.ncpVersion = currentVersion;
        loadedMetadata.failedMCPs.clear(); // Clear failures when code changes
      }

      this.metadata = loadedMetadata;
      await this.saveMetadata();
    } catch (error) {
      // File doesn't exist or parse error - will create new metadata below
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to load cache metadata: ${error}`);
      }
      this.metadata = null;
    }

    if (!this.metadata) {
      this.metadata = {
        version: '1.0',
        profileName: this.profileName,
        profileHash: '',
        ncpVersion: currentVersion,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        totalMCPs: 0,
        totalTools: 0,
        indexedMCPs: new Map(),
        failedMCPs: new Map()
      };
    }
  }

  /**
   * Get NCP version from package.json (async)
   */
  private async getNcpVersion(): Promise<string> {
    try {
      // Get __dirname equivalent in ES modules
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Try multiple paths to find package.json
      const possiblePaths = [
        join(__dirname, '../../package.json'), // From dist/cache
        join(process.cwd(), 'package.json'),   // From CWD
        join(__dirname, '../../../package.json') // From node_modules
      ];

      for (const pkgPath of possiblePaths) {
        try {
          await access(pkgPath, constants.F_OK);
          const content = await readFile(pkgPath, 'utf-8');
          const pkg = JSON.parse(content);
          if (pkg.version) {
            return pkg.version;
          }
        } catch {
          // Try next path
          continue;
        }
      }

      return '1.0.0'; // Fallback version
    } catch (error) {
      logger.debug(`Could not determine NCP version: ${error}`);
      return '1.0.0';
    }
  }

  /**
   * Validate cache against current profile configuration (async)
   */
  async validateCache(currentProfileHash: string): Promise<boolean> {
    if (!this.metadata) return false;

    // Check if profile configuration changed
    if (this.metadata.profileHash !== currentProfileHash) {
      logger.info('Profile configuration changed, cache invalid');
      return false;
    }

    // Check if CSV file exists
    try {
      await access(this.csvPath, constants.F_OK);
    } catch {
      logger.info('CSV cache file missing');
      return false;
    }

    // Check cache age (invalidate after 7 days)
    const cacheAge = Date.now() - new Date(this.metadata.createdAt).getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (cacheAge > maxAge) {
      logger.info('Cache older than 7 days, invalidating');
      return false;
    }

    return true;
  }

  /**
   * Get list of already-indexed MCPs with their hashes
   */
  getIndexedMCPs(): Map<string, string> {
    return this.metadata?.indexedMCPs || new Map();
  }

  /**
   * Check if an MCP is already indexed and up-to-date
   */
  isMCPIndexed(mcpName: string, currentHash: string): boolean {
    const cached = this.metadata?.indexedMCPs.get(mcpName);
    return cached === currentHash;
  }

  /**
   * Remove MCP from index (forces re-indexing)
   */
  removeMCPFromIndex(mcpName: string): void {
    if (this.metadata?.indexedMCPs) {
      this.metadata.indexedMCPs.delete(mcpName);
    }
  }

  /**
   * Load all cached tools from CSV (async)
   */
  async loadCachedTools(): Promise<CachedTool[]> {
    try {
      await access(this.csvPath, constants.F_OK);
    } catch {
      return [];
    }

    try {
      const content = await readFile(this.csvPath, 'utf-8');
      const lines = content.trim().split('\n');

      // Skip header
      if (lines.length <= 1) return [];

      const tools: CachedTool[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = this.parseCSVLine(lines[i]);
        if (parts.length >= 6) {
          tools.push({
            mcpName: parts[0],
            toolId: parts[1],
            toolName: parts[2],
            description: parts[3],
            hash: parts[4],
            timestamp: parts[5]
          });
        }
      }

      return tools;
    } catch (error) {
      logger.error(`Failed to load cached tools: ${error}`);
      return [];
    }
  }

  /**
   * Load cached tools for a specific MCP (async)
   */
  async loadMCPTools(mcpName: string): Promise<CachedTool[]> {
    const allTools = await this.loadCachedTools();
    return allTools.filter(t => t.mcpName === mcpName);
  }

  /**
   * Start incremental writing (append mode)
   */
  async startIncrementalWrite(profileHash: string): Promise<void> {
    let isNewCache = true;
    try {
      await access(this.csvPath, constants.F_OK);
      isNewCache = false;
    } catch {
      // File doesn't exist, it's a new cache
    }

    // Always update profile hash (critical for cache validation)
    if (this.metadata) {
      this.metadata.profileHash = profileHash;
    }

    if (isNewCache) {
      // Create new cache file with header
      this.writeStream = createWriteStream(this.csvPath, { flags: 'w' });
      this.writeStream.write('mcp_name,tool_id,tool_name,description,hash,timestamp\n');

      // Initialize metadata for new cache
      if (this.metadata) {
        this.metadata.createdAt = new Date().toISOString();
        this.metadata.indexedMCPs.clear();
      }
    } else {
      // Append to existing cache
      this.writeStream = createWriteStream(this.csvPath, { flags: 'a' });
    }
  }

  /**
   * Append tools from an MCP to cache
   */
  async appendMCP(mcpName: string, tools: CachedTool[], mcpHash: string): Promise<void> {
    if (!this.writeStream) {
      throw new Error('Cache writer not initialized. Call startIncrementalWrite() first.');
    }

    // Write each tool as a CSV row
    for (const tool of tools) {
      const row = this.formatCSVLine([
        tool.mcpName,
        tool.toolId,
        tool.toolName,
        tool.description,
        tool.hash,
        tool.timestamp
      ]);
      this.writeStream.write(row + '\n');
    }

    // Force flush to disk for crash safety
    await this.flushWriteStream();

    // Update metadata
    if (this.metadata) {
      this.metadata.indexedMCPs.set(mcpName, mcpHash);
      this.metadata.totalMCPs = this.metadata.indexedMCPs.size;
      this.metadata.totalTools += tools.length;
      this.metadata.lastUpdated = new Date().toISOString();

      // Save metadata after each MCP (for crash safety)
      this.saveMetadata();
    }

    logger.info(`📝 Appended ${tools.length} tools from ${mcpName} to cache`);
  }

  /**
   * Finalize cache writing
   */
  async finalize(): Promise<void> {
    if (this.writeStream) {
      // Wait for stream to finish writing before closing
      await new Promise<void>((resolve, reject) => {
        this.writeStream!.end((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.writeStream = null;
    }

    await this.saveMetadata();
    logger.debug(`Cache finalized: ${this.metadata?.totalTools} tools from ${this.metadata?.totalMCPs} MCPs`);
  }

  /**
   * Clear cache completely
   */
  async clear(): Promise<void> {
    try {
      // Try to delete CSV file
      try {
        await access(this.csvPath, constants.F_OK);
        const fs = await import('fs/promises');
        await fs.unlink(this.csvPath);
      } catch {
        // File doesn't exist, skip
      }

      // Try to delete metadata file
      try {
        await access(this.metaPath, constants.F_OK);
        const fs = await import('fs/promises');
        await fs.unlink(this.metaPath);
      } catch {
        // File doesn't exist, skip
      }

      this.metadata = null;
      logger.info('Cache cleared');
    } catch (error) {
      logger.error(`Failed to clear cache: ${error}`);
    }
  }

  /**
   * Save metadata to disk with fsync for crash safety (async)
   */
  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;

    try {
      // Convert Maps to objects for JSON serialization
      const metaToSave = {
        ...this.metadata,
        indexedMCPs: Object.fromEntries(this.metadata.indexedMCPs),
        failedMCPs: Object.fromEntries(this.metadata.failedMCPs)
      };

      // Write metadata file asynchronously
      await writeFile(this.metaPath, JSON.stringify(metaToSave, null, 2), 'utf-8');

      // Force sync to disk (open file, fsync, close)
      const fd = openSync(this.metaPath, 'r+');
      await new Promise<void>((resolve, reject) => {
        fsync(fd, (err) => {
          closeSync(fd);
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      logger.error(`Failed to save metadata: ${error}`);
    }
  }

  /**
   * Force flush write stream to disk
   */
  private async flushWriteStream(): Promise<void> {
    if (!this.writeStream) return;

    return new Promise((resolve, reject) => {
      // Wait for any pending writes to drain
      if (this.writeStream!.writableNeedDrain) {
        this.writeStream!.once('drain', () => {
          // Then force sync to disk
          const fd = (this.writeStream as any).fd;
          if (fd !== undefined) {
            fsync(fd, (err) => {
              if (err) reject(err);
              else resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        // No drain needed, just sync to disk
        const fd = (this.writeStream as any).fd;
        if (fd !== undefined) {
          fsync(fd, (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          resolve();
        }
      }
    });
  }

  /**
   * Format CSV line with proper escaping
   */
  private formatCSVLine(fields: string[]): string {
    return fields.map(field => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    }).join(',');
  }

  /**
   * Parse CSV line handling quoted fields
   */
  private parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    fields.push(current);
    return fields;
  }

  /**
   * Mark an MCP as failed with retry scheduling
   */
  markFailed(mcpName: string, error: Error): void {
    if (!this.metadata) return;

    const existing = this.metadata.failedMCPs.get(mcpName);
    const attemptCount = (existing?.attemptCount || 0) + 1;

    // Exponential backoff: 1 hour, 6 hours, 24 hours, then always 24 hours
    const retryDelays = [
      60 * 60 * 1000,      // 1 hour
      6 * 60 * 60 * 1000,  // 6 hours
      24 * 60 * 60 * 1000  // 24 hours (then keep this)
    ];
    const delayIndex = Math.min(attemptCount - 1, retryDelays.length - 1);
    const retryDelay = retryDelays[delayIndex];

    // Determine error type
    let errorType = 'unknown';
    if (error.message.includes('timeout') || error.message.includes('Probe timeout')) {
      errorType = 'timeout';
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
      errorType = 'connection_refused';
    } else if (error.message.includes('ENOENT') || error.message.includes('command not found')) {
      errorType = 'command_not_found';
    }

    const failedMCP: FailedMCP = {
      name: mcpName,
      lastAttempt: new Date().toISOString(),
      errorType,
      errorMessage: error.message,
      attemptCount,
      nextRetry: new Date(Date.now() + retryDelay).toISOString()
    };

    this.metadata.failedMCPs.set(mcpName, failedMCP);
    this.saveMetadata();

    logger.info(`📋 Marked ${mcpName} as failed (attempt ${attemptCount}), will retry after ${new Date(failedMCP.nextRetry).toLocaleString()}`);
  }

  /**
   * Check if we should retry a failed MCP
   */
  shouldRetryFailed(mcpName: string, forceRetry: boolean = false): boolean {
    if (!this.metadata) return true;

    const failed = this.metadata.failedMCPs.get(mcpName);
    if (!failed) return true; // Never tried, should try

    if (forceRetry) return true; // Force retry flag

    // Check if enough time has passed
    const now = new Date();
    const nextRetry = new Date(failed.nextRetry);
    return now >= nextRetry;
  }

  /**
   * Clear all failed MCPs (for force retry)
   */
  clearFailedMCPs(): void {
    if (!this.metadata) return;
    this.metadata.failedMCPs.clear();
    this.saveMetadata();
    logger.info('Cleared all failed MCPs');
  }

  /**
   * Get failed MCPs count
   */
  getFailedMCPsCount(): number {
    return this.metadata?.failedMCPs.size || 0;
  }

  /**
   * Get failed MCPs that are ready for retry
   */
  getRetryReadyFailedMCPs(): string[] {
    if (!this.metadata) return [];

    const now = new Date();
    const ready: string[] = [];

    for (const [name, failed] of this.metadata.failedMCPs) {
      const nextRetry = new Date(failed.nextRetry);
      if (now >= nextRetry) {
        ready.push(name);
      }
    }

    return ready;
  }

  /**
   * Check if an MCP is in the failed list
   */
  isMCPFailed(mcpName: string): boolean {
    if (!this.metadata) return false;
    return this.metadata.failedMCPs.has(mcpName);
  }

  /**
   * Hash profile configuration for change detection
   */
  static hashProfile(profile: any): string {
    const str = JSON.stringify(profile, Object.keys(profile).sort());
    return createHash('sha256').update(str).digest('hex');
  }

  /**
   * Hash tool configuration for change detection
   */
  static hashTools(tools: any[]): string {
    const str = JSON.stringify(tools.map(t => ({ name: t.name, description: t.description })));
    return createHash('sha256').update(str).digest('hex');
  }
}
