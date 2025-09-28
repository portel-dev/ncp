/**
 * Dynamic Profile Manager
 * Creates profiles on-the-fly from natural language descriptions
 */

import { DiscoveryEngine } from '../discovery/engine.js';
import { logger } from '../utils/logger.js';

interface DynamicProfile {
  description: string;
  mcps: string[];
  confidence: number[];
  createdAt: Date;
}

interface CacheEntry {
  profile: DynamicProfile;
  hits: number;
  lastUsed: Date;
}

export class DynamicProfileManager {
  private discoveryEngine: DiscoveryEngine;
  private cache = new Map<string, CacheEntry>();
  private connectionPool = new Map<string, any>();
  private readonly CACHE_SIZE = 100;
  private readonly SIMILARITY_THRESHOLD = 0.85;

  constructor() {
    this.discoveryEngine = new DiscoveryEngine();
  }

  async initialize() {
    await this.discoveryEngine.initialize();
    logger.info('[DynamicProfile] Manager initialized with vector search');
  }

  /**
   * Create a dynamic profile from natural language description
   */
  async createProfile(description: string, limit = 10): Promise<DynamicProfile> {
    const startTime = Date.now();

    // Check cache for exact match
    const cached = this.checkCache(description);
    if (cached) {
      logger.debug(`[DynamicProfile] Cache hit for: "${description}"`);
      return cached;
    }

    // Check for similar descriptions (fuzzy match)
    const similar = await this.findSimilarProfile(description);
    if (similar) {
      logger.debug(`[DynamicProfile] Similar profile found (${similar.confidence[0]}% match)`);
      return similar;
    }

    // Perform vector search
    logger.info(`[DynamicProfile] Creating new profile for: "${description}"`);
    const searchResults = await this.discoveryEngine.findRelevantTools(description, limit * 3);

    // Aggregate by MCP and calculate scores
    const mcpScores = this.aggregateMCPScores(searchResults);

    // Select top MCPs
    const selectedMCPs = mcpScores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter(m => m.score > 0.3); // Confidence threshold

    const profile: DynamicProfile = {
      description,
      mcps: selectedMCPs.map(m => m.mcp),
      confidence: selectedMCPs.map(m => m.score),
      createdAt: new Date()
    };

    // Cache the profile
    this.cacheProfile(description, profile);

    const duration = Date.now() - startTime;
    logger.info(`[DynamicProfile] Profile created in ${duration}ms with ${profile.mcps.length} MCPs`);

    return profile;
  }

  /**
   * Get or create profile config for orchestrator
   */
  async getProfileConfig(description: string) {
    const profile = await this.createProfile(description);

    // Convert to standard profile format
    const config = {
      name: `dynamic-${Date.now()}`,
      description: description,
      mcpServers: {} as Record<string, any>,
      metadata: {
        dynamic: true,
        createdAt: profile.createdAt,
        confidence: profile.confidence
      }
    };

    // Add MCP configurations
    for (const mcpName of profile.mcps) {
      config.mcpServers[mcpName] = await this.getMCPConfig(mcpName);
    }

    return config;
  }

  /**
   * Aggregate tool scores by MCP
   */
  private aggregateMCPScores(searchResults: any[]) {
    const mcpData = new Map<string, any>();

    for (const result of searchResults) {
      const mcpName = this.extractMCPName(result.name);

      if (!mcpData.has(mcpName)) {
        mcpData.set(mcpName, {
          mcp: mcpName,
          tools: [],
          totalScore: 0,
          count: 0
        });
      }

      const data = mcpData.get(mcpName);
      data.tools.push(result);
      data.totalScore += result.confidence;
      data.count++;
    }

    // Calculate final scores with diversity bonus
    return Array.from(mcpData.values()).map(data => ({
      mcp: data.mcp,
      score: (data.totalScore / data.count) * (1 + Math.min(data.count * 0.1, 0.3)),
      toolCount: data.count
    }));
  }

  /**
   * Extract MCP name from tool name
   */
  private extractMCPName(toolName: string): string {
    if (toolName.includes(':')) {
      return toolName.split(':')[0];
    }
    // Fallback to filesystem for unknown tools
    return 'filesystem';
  }

  /**
   * Get MCP configuration (could be from registry)
   */
  private async getMCPConfig(mcpName: string) {
    // This would normally look up from registry or config
    // For now, return basic NPX command structure
    const configs: Record<string, any> = {
      filesystem: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp']
      },
      github: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN }
      },
      postgres: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-postgres'],
        env: { DATABASE_URL: process.env.DATABASE_URL }
      }
      // Add more as needed
    };

    return configs[mcpName] || {
      command: 'npx',
      args: [`@modelcontextprotocol/server-${mcpName}`]
    };
  }

  /**
   * Check cache for exact match
   */
  private checkCache(description: string): DynamicProfile | null {
    const normalized = this.normalizeDescription(description);
    const entry = this.cache.get(normalized);

    if (entry) {
      entry.hits++;
      entry.lastUsed = new Date();
      return entry.profile;
    }

    return null;
  }

  /**
   * Find similar profile using fuzzy matching
   */
  private async findSimilarProfile(description: string): Promise<DynamicProfile | null> {
    // This would use embeddings for similarity
    // For now, simple string similarity
    const normalized = this.normalizeDescription(description);

    for (const [key, entry] of this.cache) {
      const similarity = this.calculateSimilarity(normalized, key);
      if (similarity > this.SIMILARITY_THRESHOLD) {
        entry.hits++;
        entry.lastUsed = new Date();
        return entry.profile;
      }
    }

    return null;
  }

  /**
   * Cache a profile with LRU eviction
   */
  private cacheProfile(description: string, profile: DynamicProfile) {
    const normalized = this.normalizeDescription(description);

    // LRU eviction if cache is full
    if (this.cache.size >= this.CACHE_SIZE) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime())[0];
      this.cache.delete(oldest[0]);
    }

    this.cache.set(normalized, {
      profile,
      hits: 1,
      lastUsed: new Date()
    });
  }

  /**
   * Normalize description for caching
   */
  private normalizeDescription(description: string): string {
    return description.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Calculate string similarity (simple version)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      totalHits: 0,
      profiles: [] as any[]
    };

    for (const [key, entry] of this.cache) {
      stats.totalHits += entry.hits;
      stats.profiles.push({
        description: entry.profile.description,
        mcps: entry.profile.mcps.length,
        hits: entry.hits,
        lastUsed: entry.lastUsed
      });
    }

    stats.profiles.sort((a, b) => b.hits - a.hits);
    return stats;
  }
}

// Example usage
export async function runDynamicProfile(description: string) {
  const manager = new DynamicProfileManager();
  await manager.initialize();

  // Create profile from description
  const profile = await manager.createProfile(description);

  console.log(`\nDynamic Profile Created:`);
  console.log(`Description: ${profile.description}`);
  console.log(`MCPs Selected (${profile.mcps.length}):`);

  profile.mcps.forEach((mcp, i) => {
    console.log(`  - ${mcp} (confidence: ${(profile.confidence[i] * 100).toFixed(1)}%)`);
  });

  // Get orchestrator config
  const config = await manager.getProfileConfig(description);
  console.log(`\nReady to initialize with ${Object.keys(config.mcpServers).length} MCPs`);

  return config;
}