/**
 * Version-Aware Cache Validator
 * Detects MCP version changes and triggers per-MCP cache invalidation
 */

import { logger } from '../utils/logger.js';
import { CachePatcher, ToolMetadataCache } from './cache-patcher.js';

export interface MCPVersionChange {
  mcpName: string;
  cachedVersion: string;
  currentVersion: string;
  toolCount: number;
  requiresRefresh: boolean;
}

export class VersionAwareValidator {
  constructor(private cachePatcher: CachePatcher) {}

  /**
   * Validate cache against current MCP versions and detect changes
   * Returns list of MCPs that need cache refresh
   *
   * Handles backwards compatibility:
   * - Skips MCPs with version='unknown' (old cache files)
   * - Only compares when both versions are known
   */
  async validateAndDetectVersionChanges(
    cache: ToolMetadataCache,
    currentMCPVersions: Record<string, string>
  ): Promise<MCPVersionChange[]> {
    const changes: MCPVersionChange[] = [];

    for (const [mcpName, mcpData] of Object.entries(cache.mcps)) {
      const cachedVersion = mcpData.serverInfo?.version || 'unknown';
      const currentVersion = currentMCPVersions[mcpName];

      // Skip if MCP no longer exists in profile
      if (!currentVersion) {
        logger.debug(`MCP ${mcpName} removed from profile`);
        continue;
      }

      // Skip version check if cached version is unknown (backwards compatibility)
      // This handles cache files created before version tracking was added
      if (cachedVersion === 'unknown') {
        logger.debug(`Skipping version check for ${mcpName} - cache from older NCP version`);
        continue;
      }

      const versionChanged = cachedVersion !== currentVersion;

      if (versionChanged) {
        logger.info(
          `📦 Version change detected for ${mcpName}: ${cachedVersion} → ${currentVersion}`
        );

        changes.push({
          mcpName,
          cachedVersion,
          currentVersion,
          toolCount: mcpData.tools?.length || 0,
          requiresRefresh: true
        });
      } else {
        logger.debug(`✅ ${mcpName} version unchanged (${cachedVersion})`);
      }
    }

    return changes;
  }

  /**
   * Invalidate cache for specific MCPs that have version changes
   * This allows selective cache refresh without invalidating entire profile
   */
  async invalidateMCPsInCache(mcpNames: string[]): Promise<void> {
    const cache = await this.cachePatcher.loadToolMetadataCache();
    let invalidatedCount = 0;

    for (const mcpName of mcpNames) {
      if (cache.mcps[mcpName]) {
        const toolCount = cache.mcps[mcpName].tools?.length || 0;
        delete cache.mcps[mcpName];
        logger.info(`🗑️  Invalidated cache for ${mcpName} (${toolCount} tools)`);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      // Don't clear entire profile hash - just update timestamp
      cache.lastModified = Date.now();
      await this.cachePatcher.saveToolMetadataCache(cache);
    }
  }

  /**
   * Invalidate embeddings cache for specific MCPs
   */
  async invalidateEmbeddingsForMCPs(mcpNames: string[]): Promise<void> {
    for (const mcpName of mcpNames) {
      await this.cachePatcher.patchRemoveEmbeddings(mcpName);
    }
  }

  /**
   * Get a summary of version changes
   */
  getSummary(changes: MCPVersionChange[]): string {
    if (changes.length === 0) {
      return 'All MCP versions are current';
    }

    const lines = [
      `Found ${changes.length} MCP version change(s) requiring cache refresh:`,
      ...changes.map(
        c => `  • ${c.mcpName}: ${c.cachedVersion} → ${c.currentVersion} (${c.toolCount} tools)`
      )
    ];

    return lines.join('\n');
  }

  /**
   * Apply version changes by invalidating affected MCPs (atomic operation)
   * Ensures both metadata and embeddings are invalidated together
   */
  async applyVersionChanges(changes: MCPVersionChange[]): Promise<void> {
    const mcpsToInvalidate = changes
      .filter(c => c.requiresRefresh)
      .map(c => c.mcpName);

    if (mcpsToInvalidate.length === 0) {
      return;
    }

    logger.info(`Refreshing cache for ${mcpsToInvalidate.length} MCP(s)...`);

    try {
      // Invalidate both metadata and embeddings together (atomic)
      // If either fails, the whole operation is considered failed
      await Promise.all([
        this.invalidateMCPsInCache(mcpsToInvalidate),
        this.invalidateEmbeddingsForMCPs(mcpsToInvalidate)
      ]);

      logger.info(`✅ Cache refresh complete for: ${mcpsToInvalidate.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to apply version changes: ${error}`);
      throw error;
    }
  }
}
