/**
 * MCP Registry Client
 *
 * Interacts with the official MCP Registry API for server discovery
 * API Docs: https://registry.modelcontextprotocol.io/
 */

import { logger } from '../utils/logger.js';

export interface RegistryServer {
  server: {
    name: string;
    description: string;
    version: string;
    repository?: {
      url: string;
      type?: string;
    };
    packages?: Array<{
      identifier: string;
      version: string;
      runtimeHint?: string;
      environmentVariables?: Array<{
        name: string;
        description?: string;
        isRequired?: boolean;
        isSecret?: boolean;
        default?: string;
      }>;
    }>;
    remotes?: Array<{
      type: string; // "sse" | "streamable-http"
      url: string;
      environmentVariables?: Array<{
        name: string;
        description?: string;
        isRequired?: boolean;
        isSecret?: boolean;
        default?: string;
      }>;
    }>;
  };
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: string;
      publishedAt?: string;
      updatedAt?: string;
    };
  };
}

export interface ServerSearchResult {
  server: {
    name: string;
    description: string;
    version: string;
    repository?: {
      url: string;
      source?: string;
    };
    packages?: Array<{
      identifier: string;
      version: string;
      runtimeHint?: string;
    }>;
    remotes?: Array<{
      type: string;
      url: string;
    }>;
  };
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: string;
      publishedAt?: string;
      updatedAt?: string;
    };
  };
}

export interface RegistryMCPCandidate {
  number: number;
  name: string;
  displayName: string;
  description: string;
  version: string;
  transport: 'stdio' | 'http' | 'sse';
  // For stdio servers
  command?: string;
  args?: string[];
  // For HTTP/SSE servers
  url?: string;
  remoteType?: string; // "sse" | "streamable-http"
  // Common fields
  envVars?: Array<{
    name: string;
    description?: string;
    isRequired?: boolean;
    isSecret?: boolean;
    default?: string;
  }>;
  downloadCount?: number;
  status?: string;
  // Security indicators
  repository?: {
    url: string;
    source?: string;
  };
  publishedAt?: string;
  isTrusted?: boolean;
  qualityScore?: number; // For debugging/transparency
}

export interface RegistrySearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Security filtering options */
  security?: {
    /** Only include servers with GitHub repositories */
    requireRepository?: boolean;
    /** Trusted namespaces to prioritize (e.g., ['io.github.modelcontextprotocol']) */
    trustedNamespaces?: string[];
    /** Minimum age in days (avoid brand new servers) */
    minAgeDays?: number;
  };
}

export class RegistryClient {
  private baseURL = 'https://registry.modelcontextprotocol.io/v0';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes (longer for large dataset)
  private allServersCache: ServerSearchResult[] | null = null;
  private allServersCacheTime: number = 0;

  /**
   * Fetch ALL servers from registry (up to 100 - API limit) for comprehensive dataset
   * This allows intelligent client-side sorting and filtering
   */
  private async fetchAllServers(): Promise<ServerSearchResult[]> {
    // Check cache first (30 min TTL)
    if (this.allServersCache && Date.now() - this.allServersCacheTime < this.CACHE_TTL) {
      logger.debug('Using cached registry dataset');
      return this.allServersCache;
    }

    logger.debug('Fetching comprehensive registry dataset...');

    try {
      // Fetch maximum allowed dataset (100 servers - API limit)
      const url = `${this.baseURL}/servers?limit=100`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Registry API error: ${response.statusText}`);
      }

      const data = await response.json();
      const servers = data.servers || [];

      // Cache the full dataset
      this.allServersCache = servers;
      this.allServersCacheTime = Date.now();

      logger.debug(`Fetched and cached ${servers.length} servers from registry`);

      return servers;
    } catch (error: any) {
      logger.error(`Failed to fetch registry dataset: ${error.message}`);
      // If we have stale cache, use it
      if (this.allServersCache) {
        logger.warn('Using stale cache due to fetch error');
        return this.allServersCache;
      }
      throw new Error(`Failed to fetch registry: ${error.message}`);
    }
  }

  /**
   * Calculate quality score for a server (higher = better quality)
   */
  private calculateQualityScore(server: ServerSearchResult, trustedNamespaces: string[] = []): number {
    let score = 0;

    // Has repository: +100 (critical for security)
    if (server.server.repository?.url) {
      score += 100;

      // GitHub repository: +20 (easier to audit)
      if (server.server.repository.source === 'github' ||
          server.server.repository.url.includes('github.com')) {
        score += 20;
      }
    }

    // Trusted namespace: +200 (highest priority)
    const isTrusted = trustedNamespaces.some(ns => server.server.name.startsWith(ns));
    if (isTrusted) {
      score += 200;
    }

    // Age scoring (sweet spot: 30-180 days)
    const publishedAt = server._meta?.['io.modelcontextprotocol.registry/official']?.publishedAt;
    if (publishedAt) {
      const ageMs = Date.now() - new Date(publishedAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays >= 30 && ageDays <= 180) {
        // Sweet spot: established but not abandoned
        score += 50;
      } else if (ageDays < 7) {
        // Very new: penalize
        score -= 50;
      } else if (ageDays > 365) {
        // Very old: slight penalty (might be abandoned)
        score -= 10;
      } else if (ageDays >= 7 && ageDays < 30) {
        // New but not brand new: slight boost
        score += 25;
      }
    }

    // Recently updated: +30 (shows active maintenance)
    const updatedAt = server._meta?.['io.modelcontextprotocol.registry/official']?.updatedAt;
    if (updatedAt) {
      const updateAgeMs = Date.now() - new Date(updatedAt).getTime();
      const updateAgeDays = updateAgeMs / (1000 * 60 * 60 * 24);

      if (updateAgeDays < 30) {
        score += 30;
      } else if (updateAgeDays < 90) {
        score += 15;
      }
    }

    return score;
  }

  /**
   * Search for MCP servers with intelligent quality-based sorting
   * Fetches large dataset and sorts by quality indicators
   */
  async search(query: string, options: RegistrySearchOptions = {}): Promise<ServerSearchResult[]> {
    try {
      logger.debug(`Searching registry for: "${query}"`);

      // Fetch full dataset
      const allServers = await this.fetchAllServers();

      // Filter by search query (client-side text matching)
      let results = allServers;
      if (query && query.trim()) {
        const lowerQuery = query.toLowerCase();
        results = allServers.filter(s =>
          s.server.name.toLowerCase().includes(lowerQuery) ||
          s.server.description?.toLowerCase().includes(lowerQuery)
        );
      }

      // Apply security filters
      results = this.applySecurityFilters(results, options.security);

      // Calculate quality scores and sort
      const trustedNamespaces = options.security?.trustedNamespaces || [];
      const scoredResults = results.map(server => ({
        server,
        score: this.calculateQualityScore(server, trustedNamespaces)
      }));

      // Sort by quality score (highest first)
      scoredResults.sort((a, b) => b.score - a.score);

      // Return sorted servers (remove scores)
      const sortedResults = scoredResults.map(r => r.server);

      // Apply limit if specified
      const limit = options.limit || sortedResults.length;
      const finalResults = sortedResults.slice(0, limit);

      logger.debug(`Found ${results.length} matches, returning top ${finalResults.length} by quality`);

      return finalResults;
    } catch (error: any) {
      logger.error(`Registry search failed: ${error.message}`);
      throw new Error(`Failed to search registry: ${error.message}`);
    }
  }

  /**
   * Apply client-side security filters to search results
   * Note: Sorting is handled separately by quality scoring
   */
  private applySecurityFilters(
    servers: ServerSearchResult[],
    security?: RegistrySearchOptions['security']
  ): ServerSearchResult[] {
    if (!security) return servers;

    let filtered = servers;

    // Filter: Require repository
    if (security.requireRepository) {
      filtered = filtered.filter(s =>
        s.server.repository?.url &&
        s.server.repository.url.trim() !== ''
      );
      logger.debug(`After requireRepository filter: ${filtered.length} servers`);
    }

    // Filter: Minimum age
    if (security.minAgeDays) {
      const minAgeMs = security.minAgeDays * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(s => {
        const publishedAt = s._meta?.['io.modelcontextprotocol.registry/official']?.publishedAt;
        if (!publishedAt) return true; // Include if no date available
        const age = Date.now() - new Date(publishedAt).getTime();
        return age >= minAgeMs;
      });
      logger.debug(`After minAgeDays filter: ${filtered.length} servers`);
    }

    return filtered;
  }

  /**
   * Get detailed information about a specific server
   */
  async getServer(serverName: string): Promise<RegistryServer> {
    try {
      const cacheKey = `server:${serverName}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const encoded = encodeURIComponent(serverName);
      const response = await fetch(`${this.baseURL}/servers/${encoded}`);

      if (!response.ok) {
        throw new Error(`Server not found: ${serverName}`);
      }

      const data = await response.json();
      this.setCache(cacheKey, data);

      return data;
    } catch (error: any) {
      logger.error(`Failed to get server ${serverName}: ${error.message}`);
      throw new Error(`Failed to get server: ${error.message}`);
    }
  }

  /**
   * Search and format results as numbered candidates for user selection
   * Includes security filtering and trust indicators
   */
  async searchForSelection(query: string, options: RegistrySearchOptions = {}): Promise<RegistryMCPCandidate[]> {
    // Apply default security settings for user-facing search
    const searchOptions: RegistrySearchOptions = {
      limit: options.limit || 20,
      security: {
        // Default: prioritize trusted namespaces
        trustedNamespaces: options.security?.trustedNamespaces || [
          'io.github.modelcontextprotocol',  // Official Anthropic servers
          'com.github.microsoft',            // Microsoft
          'io.github.anthropics'             // Anthropic alternative namespace
        ],
        requireRepository: options.security?.requireRepository,
        minAgeDays: options.security?.minAgeDays,
        ...options.security
      },
      ...options
    };

    const results = await this.search(query, searchOptions);

    return results.map((result, index) => {
      const pkg = result.server.packages?.[0];
      const remote = result.server.remotes?.[0];
      const shortName = this.extractShortName(result.server.name);

      // Determine transport type
      let transport: 'stdio' | 'http' | 'sse' = 'stdio';
      if (remote) {
        transport = remote.type === 'sse' ? 'sse' : 'http';
      }

      // Check if trusted namespace
      const trustedNamespaces = searchOptions.security?.trustedNamespaces || [];
      const isTrusted = trustedNamespaces.some(ns =>
        result.server.name.startsWith(ns)
      );

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(result, trustedNamespaces);

      const candidate: RegistryMCPCandidate = {
        number: index + 1,
        name: result.server.name,
        displayName: shortName,
        description: result.server.description || 'No description',
        version: result.server.version,
        transport,
        status: result._meta?.['io.modelcontextprotocol.registry/official']?.status,
        // Security indicators
        repository: result.server.repository,
        publishedAt: result._meta?.['io.modelcontextprotocol.registry/official']?.publishedAt,
        isTrusted,
        qualityScore
      };

      // Add stdio-specific fields
      if (pkg) {
        candidate.command = pkg.runtimeHint || 'npx';
        candidate.args = [pkg.identifier];
      }

      // Add HTTP/SSE-specific fields
      if (remote) {
        candidate.url = remote.url;
        candidate.remoteType = remote.type;
      }

      return candidate;
    });
  }

  /**
   * Get detailed info for selected MCPs (including env vars)
   * Returns unified configuration for both stdio and HTTP/SSE servers
   */
  async getDetailedInfo(serverName: string): Promise<{
    transport: 'stdio' | 'http' | 'sse';
    // For stdio servers
    command?: string;
    args?: string[];
    // For HTTP/SSE servers
    url?: string;
    remoteType?: string;
    // Common fields
    envVars?: Array<{
      name: string;
      description?: string;
      isRequired?: boolean;
      isSecret?: boolean;
      default?: string;
    }>;
  }> {
    const server = await this.getServer(serverName);
    const pkg = server.server.packages?.[0];
    const remote = server.server.remotes?.[0];

    // Prefer remotes over packages if both exist
    if (remote) {
      return {
        transport: remote.type === 'sse' ? 'sse' : 'http',
        url: remote.url,
        remoteType: remote.type,
        envVars: remote.environmentVariables
      };
    }

    if (pkg) {
      return {
        transport: 'stdio',
        command: pkg.runtimeHint || 'npx',
        args: [pkg.identifier],
        envVars: pkg.environmentVariables
      };
    }

    throw new Error(`No package or remote information available for ${serverName}`);
  }

  /**
   * Extract short name from full registry name
   * io.github.modelcontextprotocol/server-filesystem → server-filesystem
   */
  private extractShortName(fullName: string): string {
    const parts = fullName.split('/');
    return parts[parts.length - 1] || fullName;
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cache with timestamp
   */
  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
