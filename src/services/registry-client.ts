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
        default?: string;
      }>;
    }>;
  };
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: string;
    };
  };
}

export interface ServerSearchResult {
  server: {
    name: string;
    description: string;
    version: string;
    packages?: Array<{
      identifier: string;
      version: string;
      runtimeHint?: string;
    }>;
  };
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: string;
    };
  };
}

export interface RegistryMCPCandidate {
  number: number;
  name: string;
  displayName: string;
  description: string;
  version: string;
  command: string;
  args: string[];
  envVars?: Array<{
    name: string;
    description?: string;
    isRequired?: boolean;
    default?: string;
  }>;
  downloadCount?: number;
  status?: string;
}

export class RegistryClient {
  private baseURL = 'https://registry.modelcontextprotocol.io/v0';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Search for MCP servers in the registry
   */
  async search(query: string, limit: number = 50): Promise<ServerSearchResult[]> {
    try {
      const cacheKey = `search:${query}:${limit}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      logger.debug(`Searching registry for: ${query}`);

      const response = await fetch(`${this.baseURL}/servers?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Registry API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Filter results by query (search in name and description)
      const lowerQuery = query.toLowerCase();
      const filtered = (data.servers || []).filter((s: ServerSearchResult) =>
        s.server.name.toLowerCase().includes(lowerQuery) ||
        s.server.description?.toLowerCase().includes(lowerQuery)
      );

      this.setCache(cacheKey, filtered);
      logger.debug(`Found ${filtered.length} results for: ${query}`);

      return filtered;
    } catch (error: any) {
      logger.error(`Registry search failed: ${error.message}`);
      throw new Error(`Failed to search registry: ${error.message}`);
    }
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
   */
  async searchForSelection(query: string): Promise<RegistryMCPCandidate[]> {
    const results = await this.search(query, 20); // Get up to 20 results

    return results.map((result, index) => {
      const pkg = result.server.packages?.[0];
      const shortName = this.extractShortName(result.server.name);

      return {
        number: index + 1,
        name: result.server.name,
        displayName: shortName,
        description: result.server.description || 'No description',
        version: result.server.version,
        command: pkg?.runtimeHint || 'npx',
        args: pkg ? [pkg.identifier] : [],
        status: result._meta?.['io.modelcontextprotocol.registry/official']?.status
      };
    });
  }

  /**
   * Get detailed info for selected MCPs (including env vars)
   */
  async getDetailedInfo(serverName: string): Promise<{
    command: string;
    args: string[];
    envVars?: Array<{
      name: string;
      description?: string;
      isRequired?: boolean;
      default?: string;
    }>;
  }> {
    const server = await this.getServer(serverName);
    const pkg = server.server.packages?.[0];

    if (!pkg) {
      throw new Error(`No package information available for ${serverName}`);
    }

    return {
      command: pkg.runtimeHint || 'npx',
      args: [pkg.identifier],
      envVars: pkg.environmentVariables
    };
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
