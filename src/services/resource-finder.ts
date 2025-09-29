/**
 * Shared service for resource discovery and search
 * Handles pagination, filtering, and result organization for resources
 */

import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';

export interface ResourceFindOptions {
  query?: string;
  page?: number;
  limit?: number;
  depth?: number;
  mcpFilter?: string | null;
}

export interface ResourcePaginationInfo {
  page: number;
  totalPages: number;
  totalResults: number;
  startIndex: number;
  endIndex: number;
  resultsInPage: number;
}

export interface GroupedResource {
  resourceName: string;
  confidence: number;
  description?: string;
  uri?: string;
  mimeType?: string;
}

export interface ResourceFindResult {
  resources: any[];
  groupedByMCP: Record<string, GroupedResource[]>;
  pagination: ResourcePaginationInfo;
  mcpFilter: string | null;
  isListing: boolean;
  query: string;
}

export class ResourceFinder {
  constructor(private orchestrator: NCPOrchestrator) {}

  /**
   * Main search method for resources
   */
  async find(options: ResourceFindOptions = {}): Promise<ResourceFindResult> {
    const {
      query = '',
      page = 1,
      limit = query ? 5 : 20,
      depth = 2,
      mcpFilter = null
    } = options;

    // Detect MCP-specific search if not explicitly provided
    const detectedMCPFilter = mcpFilter || this.detectMCPFilter(query);

    // Adjust search query based on MCP filter
    const searchQuery = detectedMCPFilter ? '' : query;

    const isListing = !searchQuery;
    const confidenceThreshold = 0.3;

    let results: any[] = [];

    if (isListing || detectedMCPFilter) {
      // Listing mode or MCP-specific mode
      results = await this.getAllResourcesFiltered(detectedMCPFilter);
    } else {
      // Search mode - use semantic search
      results = await this.searchResources(searchQuery, confidenceThreshold);
    }

    // Group results by MCP
    const groupedByMCP = this.groupResourcesByMCP(results);

    // Calculate pagination
    const totalResults = results.length;
    const totalPages = Math.ceil(totalResults / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, totalResults);
    const paginatedResults = results.slice(startIndex, endIndex);

    const pagination: ResourcePaginationInfo = {
      page,
      totalPages,
      totalResults,
      startIndex,
      endIndex,
      resultsInPage: paginatedResults.length
    };

    return {
      resources: paginatedResults,
      groupedByMCP,
      pagination,
      mcpFilter: detectedMCPFilter,
      isListing,
      query: searchQuery
    };
  }

  /**
   * Detect if query contains MCP name
   */
  private detectMCPFilter(query: string): string | null {
    if (!query) return null;

    const queryLower = query.toLowerCase();

    // Check if query is just an MCP name or contains MCP identifier
    // This is a simple heuristic - could be enhanced
    if (queryLower.includes(':') && !queryLower.includes(' ')) {
      const parts = query.split(':');
      if (parts.length === 2) {
        return parts[0];
      }
    }

    return null;
  }

  /**
   * Get all resources, optionally filtered by MCP
   */
  private async getAllResourcesFiltered(mcpFilter: string | null): Promise<any[]> {
    const allResources = await this.orchestrator.getAllResources();

    if (!mcpFilter) {
      return allResources;
    }

    return allResources.filter(resource =>
      resource._source === mcpFilter ||
      resource.name?.startsWith(`${mcpFilter}:`)
    );
  }

  /**
   * Semantic search for resources
   */
  private async searchResources(query: string, confidenceThreshold: number): Promise<any[]> {
    const allResources = await this.orchestrator.getAllResources();

    // For now, implement simple text matching
    // TODO: Integrate with discovery engine for semantic search
    const queryLower = query.toLowerCase();

    return allResources
      .map(resource => ({
        ...resource,
        confidence: this.calculateResourceConfidence(resource, queryLower)
      }))
      .filter(resource => resource.confidence >= confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate confidence score for resource matching
   */
  private calculateResourceConfidence(resource: any, queryLower: string): number {
    let score = 0;

    // Check name match
    if (resource.name?.toLowerCase().includes(queryLower)) {
      score += 0.8;
    }

    // Check description match
    if (resource.description?.toLowerCase().includes(queryLower)) {
      score += 0.6;
    }

    // Check URI match
    if (resource.uri?.toLowerCase().includes(queryLower)) {
      score += 0.4;
    }

    // Check mime type relevance
    if (queryLower.includes('doc') && resource.mimeType?.includes('text')) {
      score += 0.3;
    }

    if (queryLower.includes('json') && resource.mimeType?.includes('json')) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Group resources by MCP
   */
  private groupResourcesByMCP(resources: any[]): Record<string, GroupedResource[]> {
    const grouped: Record<string, GroupedResource[]> = {};

    for (const resource of resources) {
      const mcpName = resource._source || 'unknown';

      if (!grouped[mcpName]) {
        grouped[mcpName] = [];
      }

      grouped[mcpName].push({
        resourceName: resource.name || 'unnamed',
        confidence: resource.confidence || 1.0,
        description: resource.description,
        uri: resource.uri,
        mimeType: resource.mimeType
      });
    }

    return grouped;
  }

  /**
   * Get sample resources for help text
   */
  async getSampleResources(limit: number = 8): Promise<Array<{ mcpName: string; description: string }>> {
    try {
      const allResources = await this.orchestrator.getAllResources();
      const mcpMap = new Map<string, string>();

      // Get unique MCPs with their resource descriptions
      for (const resource of allResources) {
        const mcpName = resource._source || 'unknown';
        if (!mcpMap.has(mcpName) && mcpMap.size < limit) {
          mcpMap.set(mcpName, resource.description || 'Resources available');
        }
      }

      return Array.from(mcpMap.entries()).map(([mcpName, description]) => ({
        mcpName,
        description
      }));
    } catch (error) {
      return [];
    }
  }
}