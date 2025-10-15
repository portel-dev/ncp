/**
 * Shared service for tool discovery and search
 * Handles pagination, filtering, and result organization
 */

import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';

export interface FindOptions {
  query?: string;
  page?: number;
  limit?: number;
  depth?: number;
  mcpFilter?: string | null;
  confidenceThreshold?: number;
}

export interface PaginationInfo {
  page: number;
  totalPages: number;
  totalResults: number;
  startIndex: number;
  endIndex: number;
  resultsInPage: number;
}

export interface GroupedTool {
  toolName: string;
  confidence: number;
  description?: string;
  schema?: any;
}

export interface FindResult {
  tools: any[];
  groupedByMCP: Record<string, GroupedTool[]>;
  pagination: PaginationInfo;
  mcpFilter: string | null;
  isListing: boolean;
  query: string;
}

export class ToolFinder {
  constructor(private orchestrator: NCPOrchestrator) {}

  /**
   * Main search method with all features
   */
  async find(options: FindOptions = {}): Promise<FindResult> {
    const {
      query = '',
      page = 1,
      limit = query ? 5 : 20,
      depth = 2,
      mcpFilter = null,
      confidenceThreshold = 0.35
    } = options;

    // Detect MCP-specific search if not explicitly provided
    const detectedMCPFilter = mcpFilter || this.detectMCPFilter(query);

    // Adjust search query based on MCP filter
    const searchQuery = detectedMCPFilter ? '' : query;

    // Get results with proper confidence-based ordering from orchestrator
    // Request enough for pagination but not excessive amounts
    const searchLimit = Math.min(1000, (page * limit) + 50); // Get enough for current page + buffer
    const allResults = await this.orchestrator.find(searchQuery, searchLimit, depth >= 1, confidenceThreshold);

    // Apply MCP filtering if detected
    const filteredResults = detectedMCPFilter ?
      allResults.filter(r => r.mcpName.toLowerCase() === detectedMCPFilter.toLowerCase()) :
      allResults;

    // Results are already sorted by confidence from orchestrator - maintain that order
    // Calculate pagination
    const pagination = this.calculatePagination(filteredResults.length, page, limit);

    // Get page results while preserving confidence-based order
    const pageResults = filteredResults.slice(pagination.startIndex, pagination.endIndex);

    // Group by MCP
    const groupedByMCP = this.groupByMCP(pageResults);

    return {
      tools: pageResults,
      groupedByMCP,
      pagination,
      mcpFilter: detectedMCPFilter,
      isListing: !query || query.trim() === '',
      query
    };
  }

  /**
   * Calculate pagination details
   */
  private calculatePagination(totalResults: number, page: number, limit: number): PaginationInfo {
    const totalPages = Math.ceil(totalResults / limit);
    const safePage = Math.max(1, Math.min(page, totalPages || 1));
    const startIndex = (safePage - 1) * limit;
    const endIndex = Math.min(startIndex + limit, totalResults);

    return {
      page: safePage,
      totalPages,
      totalResults,
      startIndex,
      endIndex,
      resultsInPage: endIndex - startIndex
    };
  }

  /**
   * Group tools by their MCP
   */
  private groupByMCP(results: any[]): Record<string, GroupedTool[]> {
    const groups: Record<string, GroupedTool[]> = {};

    results.forEach(result => {
      if (!groups[result.mcpName]) {
        groups[result.mcpName] = [];
      }
      groups[result.mcpName].push({
        toolName: result.toolName,
        confidence: result.confidence,
        description: result.description,
        schema: result.schema
      });
    });

    return groups;
  }

  /**
   * Detect if query is an MCP-specific search
   */
  private detectMCPFilter(query: string): string | null {
    if (!query) return null;

    const lowerQuery = query.toLowerCase().trim();

    // Common MCP names to check
    const knownMCPs = [
      'filesystem', 'memory', 'shell', 'portel', 'tavily',
      'desktop-commander', 'stripe', 'sequential-thinking',
      'context7-mcp', 'github', 'gitlab', 'slack'
    ];

    // Check for exact MCP name match
    for (const mcp of knownMCPs) {
      if (lowerQuery === mcp || lowerQuery === `${mcp}:`) {
        return mcp;
      }
    }

    // Check if query starts with MCP:tool pattern
    if (lowerQuery.includes(':')) {
      const [potentialMCP] = lowerQuery.split(':');
      if (knownMCPs.includes(potentialMCP)) {
        return potentialMCP;
      }
    }

    return null;
  }

  /**
   * Get sample tools when no results found
   */
  async getSampleTools(count: number = 8): Promise<{ mcpName: string; description: string }[]> {
    const sampleTools = await this.orchestrator.find('', count);
    const mcpSet = new Set<string>();
    const samples: { mcpName: string; description: string }[] = [];

    for (const tool of sampleTools) {
      if (!mcpSet.has(tool.mcpName)) {
        mcpSet.add(tool.mcpName);
        samples.push({
          mcpName: tool.mcpName,
          description: tool.mcpName // TODO: Get from MCP server info
        });
      }
    }

    return samples;
  }

}