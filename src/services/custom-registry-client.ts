/**
 * Custom MCP Registry Client
 * Connects to our custom registry at api.mcps.portel.dev
 */

import { logger } from '../utils/logger.js';

export interface CustomRegistryMCP {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: {
    name: string;
  };
  repository: {
    url: string;
    source: string;
  };
  homepage?: string;
  keywords: string[];
  license: string;
  installCommand: string;
  runtimeHint: string;
  transport: {
    type: string;
  };
  createdAt: string;
  updatedAt: string;
  verified: boolean;
  stats: {
    downloads: number;
    stars: number;
    upvotes: number;
    downvotes: number;
    views: number;
    score: number;
  };
}

export interface CustomRegistrySearchOptions {
  /** Search query */
  q?: string;
  /** Sort by: downloads, stars, name, recent */
  sort?: 'downloads' | 'stars' | 'name' | 'recent';
  /** Category filter */
  category?: string;
  /** Only verified MCPs */
  verified?: boolean;
  /** Maximum results */
  limit?: number;
}

export interface CustomRegistryStats {
  totalMCPs: number;
  totalVotes: number;
  totalUsers: number;
  totalTags: number;
  verifiedMCPs: number;
  totalDownloads: number;
}

export class CustomRegistryClient {
  private baseURL = 'https://api.mcps.portel.dev';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Search for MCPs in the custom registry
   */
  async search(options: CustomRegistrySearchOptions = {}): Promise<CustomRegistryMCP[]> {
    try {
      const params = new URLSearchParams();

      if (options.q) params.set('q', options.q);
      if (options.sort) params.set('sort', options.sort);
      if (options.category) params.set('category', options.category);
      if (options.verified) params.set('verified', 'true');
      if (options.limit) params.set('limit', options.limit.toString());

      const endpoint = options.q ? '/search' : '/trending';
      const url = `${this.baseURL}${endpoint}?${params}`;

      logger.debug(`Searching custom registry: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      let mcps = result.data || result;

      // Handle search API response format (nested mcps array)
      if (mcps && typeof mcps === 'object' && 'mcps' in mcps) {
        mcps = mcps.mcps;
      }

      // Ensure we return an array
      if (!Array.isArray(mcps)) {
        logger.warn('API returned non-array response, wrapping in array');
        return mcps ? [mcps] : [];
      }

      logger.debug(`Found ${mcps.length} MCPs from custom registry`);
      return mcps;
    } catch (error: any) {
      logger.error(`Custom registry search failed: ${error.message}`);
      throw new Error(`Failed to search custom registry: ${error.message}`);
    }
  }

  /**
   * Get trending MCPs
   */
  async getTrending(limit: number = 10): Promise<CustomRegistryMCP[]> {
    try {
      const cacheKey = `trending:${limit}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const url = `${this.baseURL}/trending?limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status}`);
      }

      const result = await response.json();
      const mcps = result.data || result;

      this.setCache(cacheKey, mcps);
      return mcps;
    } catch (error: any) {
      logger.error(`Failed to get trending: ${error.message}`);
      throw new Error(`Failed to get trending MCPs: ${error.message}`);
    }
  }

  /**
   * Get specific MCP by ID
   */
  async getMCP(id: string): Promise<CustomRegistryMCP> {
    try {
      const cacheKey = `mcp:${id}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const url = `${this.baseURL}/mcp?id=${encodeURIComponent(id)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`MCP not found: ${id}`);
      }

      const result = await response.json();
      const mcp = result.data || result;

      this.setCache(cacheKey, mcp);
      return mcp;
    } catch (error: any) {
      logger.error(`Failed to get MCP ${id}: ${error.message}`);
      throw new Error(`Failed to get MCP: ${error.message}`);
    }
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<CustomRegistryStats> {
    try {
      const cacheKey = 'stats';
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const url = `${this.baseURL}/stats`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to get stats: ${response.status}`);
      }

      const result = await response.json();
      const stats = result.data || result;

      this.setCache(cacheKey, stats);
      return stats;
    } catch (error: any) {
      logger.error(`Failed to get stats: ${error.message}`);
      throw new Error(`Failed to get registry stats: ${error.message}`);
    }
  }

  /**
   * Vote on an MCP
   */
  async vote(id: string, vote: 'up' | 'down'): Promise<void> {
    try {
      const url = `${this.baseURL}/vote`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, vote })
      });

      if (!response.ok) {
        throw new Error(`Failed to vote: ${response.status}`);
      }

      // Clear cache for this MCP
      this.cache.delete(`mcp:${id}`);
    } catch (error: any) {
      logger.error(`Failed to vote: ${error.message}`);
      throw new Error(`Failed to vote on MCP: ${error.message}`);
    }
  }

  /**
   * Search and format for user selection
   */
  async searchForSelection(query: string, limit: number = 20): Promise<Array<{
    number: number;
    id: string;
    name: string;
    displayName: string;
    description: string;
    version: string;
    verified: boolean;
    downloads: number;
    stars: number;
    score: number;
    installCommand: string;
  }>> {
    // Use default relevance sorting (no sort parameter) to get best matches first
    // Sorting by downloads can put less relevant results first when downloads are tied
    const results = await this.search({ q: query, limit });

    return results.map((mcp, index) => ({
      number: index + 1,
      id: mcp.id,
      name: mcp.name,
      displayName: mcp.displayName,
      description: mcp.description,
      version: mcp.version,
      verified: mcp.verified,
      downloads: mcp.stats?.downloads || 0,
      stars: mcp.stats?.stars || 0,
      score: mcp.stats?.score || 0,
      installCommand: mcp.installCommand
    }));
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}
