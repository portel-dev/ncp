/**
 * Cache Service
 *
 * Unified cache management for the orchestrator. Wraps CSVCache and CachePatcher
 * to provide a single interface for:
 * - Loading cached tools and metadata
 * - Saving/updating cache
 * - Cache validation and integrity checks
 * - Incremental cache updates
 */

import { logger } from '../../utils/logger.js';
import { getCacheDirectory } from '../../utils/ncp-paths.js';
import { CachePatcher } from '../../cache/cache-patcher.js';
import { CSVCache, CachedTool } from '../../cache/csv-cache.js';
import type { MCPDefinition, MCPConfig, Profile } from '../types/connection.js';
import type { ToolInfo } from '../types/discovery.js';
import type { OrchestratorContext } from '../interfaces/orchestrator-context.js';
import type { OrchestratorService } from '../interfaces/service-container.js';

/**
 * Cached MCP data with tools and metadata
 */
export interface CachedMCPData {
  name: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }>;
  serverInfo?: {
    name: string;
    title?: string;
    version: string;
    description?: string;
    websiteUrl?: string;
  };
}

/**
 * Result of loading from cache
 */
export interface CacheLoadResult {
  success: boolean;
  mcpCount: number;
  toolCount: number;
  definitions: Map<string, MCPDefinition>;
  tools: ToolInfo[];
  toolToMCP: Map<string, string>;
}

/**
 * Cache validation result
 */
export interface CacheValidationResult {
  valid: boolean;
  profileHashMatches: boolean;
  integrityValid: boolean;
  reason?: string;
}

/**
 * Cache Service implementation
 */
export class CacheService implements OrchestratorService {
  private context: OrchestratorContext;
  private profileName: string;
  private csvCache: CSVCache;
  private cachePatcher: CachePatcher;
  private initialized: boolean = false;

  constructor(context: OrchestratorContext, profileName?: string) {
    this.context = context;
    this.profileName = profileName || context.profileName;
    this.csvCache = new CSVCache(getCacheDirectory(), this.profileName);
    this.cachePatcher = new CachePatcher();
  }

  /**
   * Initialize the cache service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.csvCache.initialize();
    this.initialized = true;
    logger.debug('CacheService initialized');
  }

  /**
   * Validate cache integrity and profile hash
   */
  async validateCache(profile: Profile): Promise<CacheValidationResult> {
    // Check cache integrity
    const integrity = await this.cachePatcher.validateAndRepairCache();
    if (!integrity.valid) {
      return {
        valid: false,
        profileHashMatches: false,
        integrityValid: false,
        reason: 'Cache integrity check failed',
      };
    }

    // Check profile hash
    const currentHash = this.generateProfileHash(profile);
    const hashValid = await this.cachePatcher.validateCacheWithProfile(currentHash);

    if (!hashValid) {
      return {
        valid: false,
        profileHashMatches: false,
        integrityValid: true,
        reason: 'Profile hash mismatch - configuration changed',
      };
    }

    return {
      valid: true,
      profileHashMatches: true,
      integrityValid: true,
    };
  }

  /**
   * Load cached tools for given MCP configs
   *
   * @param mcpConfigs - MCP configurations to load
   * @returns Cache load result with definitions and tools
   */
  async loadFromCache(mcpConfigs: MCPConfig[]): Promise<CacheLoadResult> {
    const cachedTools = await this.csvCache.loadCachedTools();
    const metadataCache = await this.cachePatcher.loadToolMetadataCache();

    // Group tools by MCP
    const toolsByMCP = new Map<string, CachedTool[]>();
    for (const tool of cachedTools) {
      if (!toolsByMCP.has(tool.mcpName)) {
        toolsByMCP.set(tool.mcpName, []);
      }
      toolsByMCP.get(tool.mcpName)!.push(tool);
    }

    const definitions = new Map<string, MCPDefinition>();
    const tools: ToolInfo[] = [];
    const toolToMCP = new Map<string, string>();
    let loadedMCPCount = 0;

    for (const config of mcpConfigs) {
      let mcpTools = toolsByMCP.get(config.name) || [];
      const mcpMetadata = metadataCache.mcps[config.name];

      // Special handling for CLI tools
      if (
        mcpTools.length === 0 &&
        mcpMetadata &&
        config.env?.NCP_CLI_TOOL === 'true'
      ) {
        mcpTools = mcpMetadata.tools.map((tool: any) => ({
          mcpName: config.name,
          toolId: `${config.name}:${tool.name}`,
          toolName: tool.name,
          description: tool.description,
          hash: '',
          timestamp: new Date().toISOString(),
        }));
      }

      if (mcpTools.length === 0) continue;

      // Skip if metadata cache is missing schemas
      if (!mcpMetadata?.tools?.length) {
        logger.info(
          `Metadata cache missing for ${config.name}, will re-index`
        );
        this.csvCache.removeMCPFromIndex(config.name);
        continue;
      }

      loadedMCPCount++;

      // Create definition with schemas from metadata
      const definition: MCPDefinition = {
        name: config.name,
        config,
        tools: mcpTools.map((t) => {
          const toolMetadata = mcpMetadata?.tools?.find(
            (mt: any) => mt.name === t.toolName
          );
          return {
            name: t.toolName,
            description: t.description,
            inputSchema: toolMetadata?.inputSchema,
          };
        }),
        serverInfo: mcpMetadata?.serverInfo,
      };

      definitions.set(config.name, definition);

      // Add to tools list and mappings
      for (const cachedTool of mcpTools) {
        tools.push({
          name: cachedTool.toolName,
          description: cachedTool.description,
          mcpName: config.name,
        });

        // Map both formats
        toolToMCP.set(cachedTool.toolName, config.name);
        toolToMCP.set(cachedTool.toolId, config.name);
      }
    }

    logger.info(`Loaded ${tools.length} tools from cache`);

    return {
      success: true,
      mcpCount: loadedMCPCount,
      toolCount: tools.length,
      definitions,
      tools,
      toolToMCP,
    };
  }

  /**
   * Save MCP data to cache
   */
  async saveMCP(
    mcpName: string,
    config: MCPConfig,
    tools: Array<{ name: string; description: string; inputSchema?: any }>,
    serverInfo?: any,
    mcpHash?: string
  ): Promise<void> {
    // Save to metadata cache
    await this.cachePatcher.patchAddMCP(mcpName, config, tools, serverInfo || null);

    // Save to CSV cache
    const cachedTools: CachedTool[] = tools.map((tool) => ({
      mcpName,
      toolId: `${mcpName}:${tool.name}`,
      toolName: tool.name,
      description: tool.description,
      hash: mcpHash || '',
      timestamp: new Date().toISOString(),
    }));

    await this.csvCache.appendMCP(mcpName, cachedTools, mcpHash || '');
  }

  /**
   * Mark MCP as failed in cache
   */
  markMCPFailed(mcpName: string, error: Error): void {
    this.csvCache.markFailed(mcpName, error);
  }

  /**
   * Check if MCP is indexed in cache
   */
  isMCPIndexed(mcpName: string, hash?: string): boolean {
    return this.csvCache.isMCPIndexed(mcpName, hash || '');
  }

  /**
   * Check if failed MCP should be retried
   */
  shouldRetryFailed(mcpName: string, forceRetry: boolean): boolean {
    return this.csvCache.shouldRetryFailed(mcpName, forceRetry);
  }

  /**
   * Check if MCP previously failed
   */
  isMCPFailed(mcpName: string): boolean {
    return this.csvCache.isMCPFailed(mcpName);
  }

  /**
   * Get map of indexed MCPs (name -> hash)
   */
  getIndexedMCPs(): Map<string, string> {
    return this.csvCache.getIndexedMCPs();
  }

  /**
   * Get count of failed MCPs
   */
  getFailedMCPsCount(): number {
    return this.csvCache.getFailedMCPsCount();
  }

  /**
   * Start incremental write mode
   */
  async startIncrementalWrite(profileHash: string): Promise<void> {
    await this.csvCache.startIncrementalWrite(profileHash);
  }

  /**
   * Finalize cache writes
   */
  async finalize(): Promise<void> {
    await this.csvCache.finalize();
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    await this.csvCache.clear();
    await this.csvCache.initialize();
  }

  /**
   * Generate profile hash
   */
  generateProfileHash(profile: Profile): string {
    return this.cachePatcher.generateProfileHash(profile);
  }

  /**
   * Update profile hash in cache
   */
  async updateProfileHash(hash: string): Promise<void> {
    await this.cachePatcher.updateProfileHash(hash);
  }

  /**
   * Remove MCP from cache index
   */
  removeMCPFromIndex(mcpName: string): void {
    this.csvCache.removeMCPFromIndex(mcpName);
  }

  /**
   * Load tool metadata cache directly
   */
  async loadToolMetadataCache(): Promise<any> {
    return this.cachePatcher.loadToolMetadataCache();
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    try {
      await this.csvCache.finalize();
    } catch (error) {
      // Ignore cleanup errors
    }
    logger.debug('CacheService cleaned up');
  }
}

/**
 * Create a cache service instance
 */
export function createCacheService(
  context: OrchestratorContext,
  profileName?: string
): CacheService {
  return new CacheService(context, profileName);
}
