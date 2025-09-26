/**
 * Cache Patcher for NCP
 * Provides incremental, MCP-by-MCP cache patching operations
 * Enables fast startup by avoiding full re-indexing
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getCacheDirectory } from '../utils/ncp-paths.js';
import { logger } from '../utils/logger.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
}

export interface ToolMetadataCache {
  version: string;
  profileHash: string;        // SHA256 of entire profile
  lastModified: number;
  mcps: {
    [mcpName: string]: {
      configHash: string;      // SHA256 of command+args+env
      discoveredAt: number;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: any;
      }>;
      serverInfo: {
        name: string;
        version: string;
        description?: string;
      };
    }
  }
}

export interface EmbeddingsCache {
  version: string;
  modelVersion: string;        // all-MiniLM-L6-v2
  lastModified: number;
  vectors: {
    [toolId: string]: number[];  // toolId = "mcpName:toolName"
  };
  metadata: {
    [toolId: string]: {
      mcpName: string;
      generatedAt: number;
      enhancedDescription: string;  // Used for generation
    }
  }
}

export interface MCPConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class CachePatcher {
  private cacheDir: string;
  private toolMetadataCachePath: string;
  private embeddingsCachePath: string;
  private embeddingsMetadataCachePath: string;

  constructor() {
    this.cacheDir = getCacheDirectory();
    this.toolMetadataCachePath = join(this.cacheDir, 'all-tools.json');
    this.embeddingsCachePath = join(this.cacheDir, 'embeddings.json');
    this.embeddingsMetadataCachePath = join(this.cacheDir, 'embeddings-metadata.json');

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate SHA256 hash for MCP configuration
   */
  generateConfigHash(config: MCPConfig): string {
    const hashInput = JSON.stringify({
      command: config.command,
      args: config.args || [],
      env: config.env || {}
    });
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Generate SHA256 hash for entire profile
   */
  generateProfileHash(profile: any): string {
    const hashInput = JSON.stringify(profile.mcpServers || {});
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Load cache with atomic file operations and error handling
   */
  private async loadCache<T>(path: string, defaultValue: T): Promise<T> {
    try {
      if (!existsSync(path)) {
        logger.debug(`Cache file not found: ${path}, using default`);
        return defaultValue;
      }

      const content = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(content);
      logger.debug(`Loaded cache from ${path}`);
      return parsed as T;
    } catch (error: any) {
      logger.warn(`Failed to load cache from ${path}: ${error.message}, using default`);
      return defaultValue;
    }
  }

  /**
   * Save cache with atomic file operations to prevent corruption
   */
  private async saveCache<T>(path: string, data: T): Promise<void> {
    try {
      const tmpPath = `${path}.tmp`;
      const content = JSON.stringify(data, null, 2);

      // Write to temporary file first
      writeFileSync(tmpPath, content, 'utf-8');

      // Atomic replacement
      await this.atomicReplace(tmpPath, path);

      logger.debug(`Saved cache to ${path}`);
    } catch (error: any) {
      logger.error(`Failed to save cache to ${path}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Atomic file replacement to prevent corruption
   */
  private async atomicReplace(tmpPath: string, finalPath: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.rename(tmpPath, finalPath);
  }

  /**
   * Load tool metadata cache
   */
  async loadToolMetadataCache(): Promise<ToolMetadataCache> {
    const defaultCache: ToolMetadataCache = {
      version: '1.0.0',
      profileHash: '',
      lastModified: Date.now(),
      mcps: {}
    };

    return await this.loadCache(this.toolMetadataCachePath, defaultCache);
  }

  /**
   * Save tool metadata cache
   */
  async saveToolMetadataCache(cache: ToolMetadataCache): Promise<void> {
    cache.lastModified = Date.now();
    await this.saveCache(this.toolMetadataCachePath, cache);
  }

  /**
   * Load embeddings cache
   */
  async loadEmbeddingsCache(): Promise<EmbeddingsCache> {
    const defaultCache: EmbeddingsCache = {
      version: '1.0.0',
      modelVersion: 'all-MiniLM-L6-v2',
      lastModified: Date.now(),
      vectors: {},
      metadata: {}
    };

    return await this.loadCache(this.embeddingsCachePath, defaultCache);
  }

  /**
   * Save embeddings cache
   */
  async saveEmbeddingsCache(cache: EmbeddingsCache): Promise<void> {
    cache.lastModified = Date.now();
    await this.saveCache(this.embeddingsCachePath, cache);
  }

  /**
   * Patch tool metadata cache - Add MCP
   */
  async patchAddMCP(mcpName: string, config: MCPConfig, tools: Tool[], serverInfo: any): Promise<void> {
    logger.info(`🔧 Patching tool metadata cache: adding ${mcpName}`);

    const cache = await this.loadToolMetadataCache();
    const configHash = this.generateConfigHash(config);

    cache.mcps[mcpName] = {
      configHash,
      discoveredAt: Date.now(),
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description || 'No description available',
        inputSchema: tool.inputSchema || {}
      })),
      serverInfo: {
        name: serverInfo?.name || mcpName,
        version: serverInfo?.version || '1.0.0',
        description: serverInfo?.description
      }
    };

    await this.saveToolMetadataCache(cache);
    logger.info(`✅ Added ${tools.length} tools from ${mcpName} to metadata cache`);
  }

  /**
   * Patch tool metadata cache - Remove MCP
   */
  async patchRemoveMCP(mcpName: string): Promise<void> {
    logger.info(`🔧 Patching tool metadata cache: removing ${mcpName}`);

    const cache = await this.loadToolMetadataCache();

    if (cache.mcps[mcpName]) {
      const toolCount = cache.mcps[mcpName].tools.length;
      delete cache.mcps[mcpName];
      await this.saveToolMetadataCache(cache);
      logger.info(`✅ Removed ${toolCount} tools from ${mcpName} from metadata cache`);
    } else {
      logger.warn(`MCP ${mcpName} not found in metadata cache`);
    }
  }

  /**
   * Patch tool metadata cache - Update MCP
   */
  async patchUpdateMCP(mcpName: string, config: MCPConfig, tools: Tool[], serverInfo: any): Promise<void> {
    logger.info(`🔧 Patching tool metadata cache: updating ${mcpName}`);

    // Remove then add for clean update
    await this.patchRemoveMCP(mcpName);
    await this.patchAddMCP(mcpName, config, tools, serverInfo);
  }

  /**
   * Patch embeddings cache - Add MCP tools
   */
  async patchAddEmbeddings(mcpName: string, toolEmbeddings: Map<string, any>): Promise<void> {
    logger.info(`🔧 Patching embeddings cache: adding ${mcpName} vectors`);

    const cache = await this.loadEmbeddingsCache();
    let addedCount = 0;

    for (const [toolId, embeddingData] of toolEmbeddings) {
      if (embeddingData && embeddingData.embedding) {
        // Convert Float32Array to regular array for JSON serialization
        cache.vectors[toolId] = Array.from(embeddingData.embedding);
        cache.metadata[toolId] = {
          mcpName,
          generatedAt: Date.now(),
          enhancedDescription: embeddingData.enhancedDescription || ''
        };
        addedCount++;
      }
    }

    await this.saveEmbeddingsCache(cache);
    logger.info(`✅ Added ${addedCount} embeddings for ${mcpName}`);
  }

  /**
   * Patch embeddings cache - Remove MCP tools
   */
  async patchRemoveEmbeddings(mcpName: string): Promise<void> {
    logger.info(`🔧 Patching embeddings cache: removing ${mcpName} vectors`);

    const cache = await this.loadEmbeddingsCache();
    let removedCount = 0;

    // Remove all tool embeddings for this MCP
    const toolIdsToRemove = Object.keys(cache.metadata).filter(
      toolId => cache.metadata[toolId].mcpName === mcpName
    );

    for (const toolId of toolIdsToRemove) {
      delete cache.vectors[toolId];
      delete cache.metadata[toolId];
      removedCount++;
    }

    await this.saveEmbeddingsCache(cache);
    logger.info(`✅ Removed ${removedCount} embeddings for ${mcpName}`);
  }

  /**
   * Update profile hash in tool metadata cache
   */
  async updateProfileHash(profileHash: string): Promise<void> {
    const cache = await this.loadToolMetadataCache();
    cache.profileHash = profileHash;
    await this.saveToolMetadataCache(cache);
    logger.debug(`Updated profile hash: ${profileHash.substring(0, 8)}...`);
  }

  /**
   * Validate if cache is current with profile
   */
  async validateCacheWithProfile(currentProfileHash: string): Promise<boolean> {
    try {
      const cache = await this.loadToolMetadataCache();

      // Handle empty or corrupt cache
      if (!cache || !cache.profileHash) {
        logger.info('Cache validation failed: no profile hash found');
        return false;
      }

      // Handle version mismatches
      if (cache.version !== '1.0.0') {
        logger.info(`Cache validation failed: version mismatch (${cache.version} → 1.0.0)`);
        return false;
      }

      const isValid = cache.profileHash === currentProfileHash;

      if (!isValid) {
        logger.info(`Cache validation failed: profile changed (${cache.profileHash?.substring(0, 8)}... → ${currentProfileHash.substring(0, 8)}...)`);
      } else {
        logger.debug(`Cache validation passed: ${currentProfileHash.substring(0, 8)}...`);
      }

      return isValid;
    } catch (error: any) {
      logger.warn(`Cache validation error: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate cache integrity and repair if needed
   */
  async validateAndRepairCache(): Promise<{ valid: boolean; repaired: boolean }> {
    try {
      const stats = await this.getCacheStats();

      if (!stats.toolMetadataExists) {
        logger.warn('Tool metadata cache missing');
        return { valid: false, repaired: false };
      }

      const cache = await this.loadToolMetadataCache();

      // Check for corruption
      if (!cache.mcps || typeof cache.mcps !== 'object') {
        logger.warn('Cache corruption detected: invalid mcps structure');
        return { valid: false, repaired: false };
      }

      // Check for missing tools
      let hasMissingTools = false;
      for (const [mcpName, mcpData] of Object.entries(cache.mcps)) {
        if (!Array.isArray(mcpData.tools)) {
          logger.warn(`Cache corruption detected: invalid tools array for ${mcpName}`);
          hasMissingTools = true;
        }
      }

      if (hasMissingTools) {
        logger.warn('Cache has missing or invalid tool data');
        return { valid: false, repaired: false };
      }

      logger.debug('Cache integrity validation passed');
      return { valid: true, repaired: false };

    } catch (error: any) {
      logger.error(`Cache validation failed: ${error.message}`);
      return { valid: false, repaired: false };
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    toolMetadataExists: boolean;
    embeddingsExists: boolean;
    mcpCount: number;
    toolCount: number;
    embeddingCount: number;
    lastModified: Date | null;
  }> {
    const toolMetadataExists = existsSync(this.toolMetadataCachePath);
    const embeddingsExists = existsSync(this.embeddingsCachePath);

    let mcpCount = 0;
    let toolCount = 0;
    let embeddingCount = 0;
    let lastModified: Date | null = null;

    if (toolMetadataExists) {
      try {
        const cache = await this.loadToolMetadataCache();
        mcpCount = Object.keys(cache.mcps).length;
        toolCount = Object.values(cache.mcps).reduce((sum, mcp) => sum + mcp.tools.length, 0);
        lastModified = new Date(cache.lastModified);
      } catch (error) {
        // Ignore errors for stats
      }
    }

    if (embeddingsExists) {
      try {
        const cache = await this.loadEmbeddingsCache();
        embeddingCount = Object.keys(cache.vectors).length;
      } catch (error) {
        // Ignore errors for stats
      }
    }

    return {
      toolMetadataExists,
      embeddingsExists,
      mcpCount,
      toolCount,
      embeddingCount,
      lastModified
    };
  }
}