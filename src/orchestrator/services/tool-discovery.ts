/**
 * Tool Discovery Service
 *
 * Provides semantic tool discovery with:
 * - Vector-based search via DiscoveryEngine
 * - Health filtering for disabled MCPs
 * - Score adjustment using SearchEnhancer
 * - CLI tool enhancement for shell commands
 * - Schema resolution from definitions/connections
 */

import { logger } from '../../utils/logger.js';
import { DiscoveryEngine } from '../../discovery/engine.js';
import { SearchEnhancer } from '../../discovery/search-enhancer.js';
import { MCPHealthMonitor } from '../../utils/health-monitor.js';
import type { OrchestratorContext } from '../interfaces/orchestrator-context.js';
import type { OrchestratorService } from '../interfaces/service-container.js';
import type {
  ToolInfo,
  DiscoveryResult,
  ToolSearchOptions,
} from '../types/discovery.js';
import type { MCPDefinition, MCPConnection } from '../types/connection.js';

/**
 * CLI Scanner interface for optional CLI tool enhancement
 */
interface CLIScanner {
  searchTools(query: string): Promise<
    Array<{
      name: string;
      description?: string;
      capabilities: string[];
    }>
  >;
}

/**
 * Tool Discovery Service implementation
 */
export class ToolDiscoveryService implements OrchestratorService {
  private context: OrchestratorContext;
  private discovery: DiscoveryEngine;
  private healthMonitor: MCPHealthMonitor;
  private cliScanner?: CLIScanner;
  private initialized: boolean = false;

  constructor(
    context: OrchestratorContext,
    discovery: DiscoveryEngine,
    healthMonitor: MCPHealthMonitor,
    cliScanner?: CLIScanner
  ) {
    this.context = context;
    this.discovery = discovery;
    this.healthMonitor = healthMonitor;
    this.cliScanner = cliScanner;
  }

  /**
   * Initialize the discovery service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Discovery engine should already be initialized by the orchestrator
    this.initialized = true;
    logger.debug('ToolDiscoveryService initialized');
  }

  /**
   * Set CLI scanner for shell tool enhancement
   */
  setCLIScanner(scanner: CLIScanner): void {
    this.cliScanner = scanner;
  }

  /**
   * Find tools matching a query
   *
   * @param query - Search query (empty for list all)
   * @param options - Search options
   * @returns Discovery results
   */
  async find(
    query: string,
    options: ToolSearchOptions = {}
  ): Promise<DiscoveryResult[]> {
    const {
      limit = 5,
      detailed = false,
      confidenceThreshold = 0.35,
    } = options;

    // Get state from context
    const { allTools, definitions, toolToMCP, connections } =
      this.getStateFromContext();

    if (!query) {
      // No query = list all tools, filtered by health
      return this.listAllTools(allTools, limit, detailed, definitions);
    }

    try {
      // Use double-limit technique to account for health filtering
      const doubleLimit = limit * 2;
      const vectorResults = await this.discovery.findRelevantTools(
        query,
        doubleLimit,
        confidenceThreshold
      );

      // Apply universal term frequency scoring boost
      const adjustedResults = this.adjustScoresUniversally(query, vectorResults);

      // Parse and filter results
      const parsedResults = this.parseResults(
        adjustedResults,
        allTools,
        toolToMCP,
        detailed,
        definitions,
        connections
      );

      // Health filtering: remove tools from disabled MCPs
      const healthyResults = this.filterByHealth(parsedResults);

      // Sort by confidence (highest first) after scoring adjustments
      const sortedResults = healthyResults.sort(
        (a, b) => b.confidence - a.confidence
      );

      // Return up to the original limit
      let finalResults = sortedResults.slice(0, limit);

      // Dynamic CLI enhancement for shell tools
      if (this.cliScanner && finalResults.length > 0 && detailed) {
        finalResults = await this.enhanceWithCLIInfo(finalResults, query);
      }

      if (healthyResults.length < parsedResults.length) {
        logger.debug(
          `Health filtering: ${parsedResults.length - healthyResults.length} tools filtered out from disabled MCPs`
        );
      }

      return finalResults;
    } catch (error: any) {
      logger.error(`Vector search failed: ${error.message}`);

      // Fallback to healthy tools only
      return this.listAllTools(allTools, limit, detailed, definitions);
    }
  }

  /**
   * Get tool schema by MCP name and tool name
   */
  getToolSchema(mcpName: string, toolName: string): any {
    const { definitions, connections } = this.getStateFromContext();

    // First, try to get schema from definitions (most reliable source)
    const definition = definitions.get(mcpName);
    if (definition) {
      const tool = definition.tools.find((t) => t.name === toolName);
      if (tool && (tool as any).inputSchema) {
        return (tool as any).inputSchema;
      }
    }

    // Fallback to connection if available
    const connection = connections.get(mcpName);
    if (connection?.tools) {
      const tool = connection.tools.find((t) => t.name === toolName);
      if (tool && (tool as any).inputSchema) {
        return (tool as any).inputSchema;
      }
    }

    return undefined;
  }

  /**
   * Get tool schema by identifier (e.g., "mcp:tool")
   */
  getToolSchemaByIdentifier(toolIdentifier: string): any {
    const [mcpName, toolName] = toolIdentifier.split(':');
    if (!mcpName || !toolName) return undefined;
    return this.getToolSchema(mcpName, toolName);
  }

  /**
   * List all tools filtered by health
   */
  private listAllTools(
    allTools: ToolInfo[],
    limit: number,
    detailed: boolean,
    definitions: Map<string, MCPDefinition>
  ): DiscoveryResult[] {
    const healthyTools = allTools.filter(
      (tool) => this.healthMonitor.getHealthyMCPs([tool.mcpName]).length > 0
    );

    return healthyTools.slice(0, limit).map((tool) => {
      const prefixedName = tool.name.includes(':')
        ? tool.name
        : `${tool.mcpName}:${tool.name}`;
      const actualToolName = tool.name.includes(':')
        ? tool.name.split(':', 2)[1]
        : tool.name;

      return {
        toolName: prefixedName,
        mcpName: tool.mcpName,
        confidence: 1.0,
        description: detailed ? tool.description : undefined,
        schema: detailed
          ? this.getToolSchema(tool.mcpName, actualToolName)
          : undefined,
      };
    });
  }

  /**
   * Parse vector search results into discovery results
   */
  private parseResults(
    results: Array<{ name: string; confidence: number; reason?: string }>,
    allTools: ToolInfo[],
    toolToMCP: Map<string, string>,
    detailed: boolean,
    definitions: Map<string, MCPDefinition>,
    connections: Map<string, MCPConnection>
  ): DiscoveryResult[] {
    return results.map((result) => {
      // Parse tool format: "mcp:tool"
      const parts = result.name.includes(':')
        ? result.name.split(':', 2)
        : [toolToMCP.get(result.name) || 'unknown', result.name];
      let mcpName = parts[0];
      const toolName = parts[1] || result.name;

      // Special case: skills use "skill:" prefix but are stored under "__skills__"
      const actualMcpName = mcpName === 'skill' ? '__skills__' : mcpName;

      // Find the tool - it should be stored with prefixed name
      const prefixedToolName = `${mcpName}:${toolName}`;
      const fullTool = allTools.find(
        (t) =>
          (t.name === prefixedToolName || t.name === toolName) &&
          t.mcpName === actualMcpName
      );

      return {
        toolName: fullTool?.name || prefixedToolName,
        mcpName: actualMcpName,
        confidence: result.confidence,
        description: detailed ? fullTool?.description : undefined,
        schema: detailed
          ? this.getToolSchema(actualMcpName, toolName)
          : undefined,
      };
    });
  }

  /**
   * Filter results by health status
   */
  private filterByHealth(results: DiscoveryResult[]): DiscoveryResult[] {
    return results.filter(
      (result) => this.healthMonitor.getHealthyMCPs([result.mcpName]).length > 0
    );
  }

  /**
   * Adjust scores using SearchEnhancer for term frequency boosting
   */
  private adjustScoresUniversally(
    query: string,
    results: Array<{ name: string; confidence: number; description?: string }>
  ): Array<{ name: string; confidence: number; description?: string }> {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2); // Skip very short terms

    return results.map((result) => {
      const toolName = result.name.toLowerCase();
      const toolDescription = (result.description || '').toLowerCase();

      let nameBoost = 0;
      let descBoost = 0;

      // Process each query term with SearchEnhancer classification
      for (const term of queryTerms) {
        const termType = SearchEnhancer.classifyTerm(term);
        const weight = SearchEnhancer.getTypeWeights(termType);

        // Apply scoring based on term type
        if (toolName.includes(term)) {
          nameBoost += weight.name;
        }
        if (toolDescription.includes(term)) {
          descBoost += weight.desc;
        }

        // Apply semantic action matching for ACTION terms
        if (termType === 'ACTION') {
          const semantics = SearchEnhancer.getActionSemantics(term);
          for (const semanticMatch of semantics) {
            if (toolName.includes(semanticMatch)) {
              nameBoost += weight.name * 1.2; // 120% for semantic matches
            }
            if (toolDescription.includes(semanticMatch)) {
              descBoost += weight.desc * 1.2;
            }
          }

          // Apply intent penalties for conflicting actions
          const penalty = SearchEnhancer.getIntentPenalty(term, toolName);
          nameBoost -= penalty;
        }
      }

      // Apply diminishing returns to prevent excessive stacking
      const baseWeight = 0.15;
      const finalNameBoost =
        nameBoost > 0
          ? nameBoost * Math.pow(0.8, Math.max(0, nameBoost / baseWeight - 1))
          : 0;
      const finalDescBoost =
        descBoost > 0
          ? descBoost *
            Math.pow(0.8, Math.max(0, descBoost / (baseWeight / 2) - 1))
          : 0;

      const totalBoost = 1 + finalNameBoost + finalDescBoost;

      return {
        ...result,
        confidence: result.confidence * totalBoost,
      };
    });
  }

  /**
   * Enhance shell tool descriptions with relevant CLI info
   */
  private async enhanceWithCLIInfo(
    results: DiscoveryResult[],
    query: string
  ): Promise<DiscoveryResult[]> {
    if (!this.cliScanner) return results;

    try {
      const relevantCLITools = await this.getRelevantCLITools(query, 3);

      if (relevantCLITools.length === 0) return results;

      return results.map((result) => {
        const isShellMCP =
          result.mcpName.toLowerCase().includes('shell') ||
          result.mcpName.toLowerCase().includes('command') ||
          result.mcpName.toLowerCase().includes('terminal') ||
          result.mcpName.toLowerCase().includes('cli');

        const isExecutionTool =
          result.toolName.toLowerCase().includes('execute') ||
          result.toolName.toLowerCase().includes('run') ||
          result.toolName.toLowerCase().includes('command');

        // Enhance shell execution tools with relevant CLI tool info
        if (isShellMCP && isExecutionTool && result.description) {
          const cliInfo = relevantCLITools.join('; ');
          result.description = `${result.description}. Relevant CLI tools for "${query}": ${cliInfo}`;
          logger.debug(
            `Enhanced ${result.toolName} with CLI info: ${relevantCLITools.length} tools`
          );
        }

        return result;
      });
    } catch (error: any) {
      logger.debug(`CLI enhancement failed: ${error.message}`);
      return results;
    }
  }

  /**
   * Get relevant CLI tools for a query
   */
  private async getRelevantCLITools(
    query: string,
    limit: number = 3
  ): Promise<string[]> {
    if (!this.cliScanner) return [];

    try {
      const matches = await this.cliScanner.searchTools(query);

      return matches.slice(0, limit).map((tool) => {
        const capabilities = tool.capabilities.slice(0, 3).join(', ');
        return `${tool.name} (${capabilities}): ${tool.description || 'command-line tool'}`;
      });
    } catch (error: any) {
      logger.debug(`CLI tool search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get required state from context
   */
  private getStateFromContext(): {
    allTools: ToolInfo[];
    definitions: Map<string, MCPDefinition>;
    toolToMCP: Map<string, string>;
    connections: Map<string, MCPConnection>;
  } {
    const state = this.context.state;
    return {
      allTools: state.allTools,
      definitions: state.definitions,
      toolToMCP: state.toolToMCP,
      connections: state.connections,
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    logger.debug('ToolDiscoveryService cleaned up');
  }
}

/**
 * Create a tool discovery service instance
 */
export function createToolDiscoveryService(
  context: OrchestratorContext,
  discovery: DiscoveryEngine,
  healthMonitor: MCPHealthMonitor,
  cliScanner?: CLIScanner
): ToolDiscoveryService {
  return new ToolDiscoveryService(context, discovery, healthMonitor, cliScanner);
}
