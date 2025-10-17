/**
 * NCP MCP Server - SDK-based Implementation
 * Uses official @modelcontextprotocol/sdk Server class
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';
import { logger } from '../utils/logger.js';
import { ToolFinder } from '../services/tool-finder.js';
import { UsageTipsGenerator } from '../services/usage-tips-generator.js';
import { RegistryClient } from '../services/registry-client.js';
import { ToolSchemaParser, ParameterInfo } from '../services/tool-schema-parser.js';
import chalk from 'chalk';
import type { ElicitationServer } from '../utils/elicitation-helper.js';

export class MCPServerSDK implements ElicitationServer {
  private server: Server;
  private orchestrator: NCPOrchestrator;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;

  constructor(profileName: string = 'default', showProgress: boolean = false, forceRetry: boolean = false) {
    // Create SDK Server instance with elicitation capability
    this.server = new Server(
      {
        name: 'ncp',
        version: '1.0.4',
      },
      {
        capabilities: {
          tools: {},
          elicitation: {},  // Enable elicitation for credential collection
        },
      }
    );

    // Profile-aware orchestrator using real MCP connections
    this.orchestrator = new NCPOrchestrator(profileName, showProgress, forceRetry);

    // Set up request handlers
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tools/call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'find':
            return await this.handleFind(args);

          case 'run':
            return await this.handleRun(args);

          default:
            // Suggest similar methods
            const suggestions = this.getSuggestions(name, ['find', 'run']);
            const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';

            return {
              content: [{
                type: 'text',
                text: `Method not found: '${name}'. NCP OSS supports 'find' and 'run' methods.${suggestionText} Use 'find()' to discover available tools.`
              }],
              isError: true,
            };
        }
      } catch (error: any) {
        logger.error(`Tool execution failed: ${name} - ${error.message}`);
        return {
          content: [{
            type: 'text',
            text: error.message || 'Tool execution failed'
          }],
          isError: true,
        };
      }
    });
  }

  private getToolDefinitions(): Tool[] {
    // Start with core NCP tools
    const coreTools: Tool[] = [
      {
        name: 'find',
        description: 'Dual-mode tool discovery: (1) SEARCH MODE: Use with description parameter for intelligent vector search - describe your task as user story for best results: "I want to save configuration to a file", "I need to analyze logs for errors". (2) LISTING MODE: Call without description parameter for paginated browsing of all available MCPs and tools with depth control (0=tool names only, 1=tool names + descriptions, 2=full details with parameters).',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'SEARCH MODE: Search query as user story ("I want to save a file") or MCP name to filter results. LISTING MODE: Omit this parameter entirely to browse all available MCPs and tools with pagination.'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of tools to return per page (default: 5 for search, 20 for list). Use higher values to see more results at once.'
            },
            page: {
              type: 'number',
              description: 'Page number for pagination (default: 1). Increment to see more results when total results exceed limit.'
            },
            confidence_threshold: {
              type: 'number',
              description: 'Minimum confidence level for search results (0.0-1.0, default: 0.35). Examples: 0.1=show all, 0.35=balanced, 0.5=strict, 0.7=very precise. Lower values show more loosely related tools, higher values show only close matches.'
            },
            depth: {
              type: 'number',
              description: 'Information depth level: 0=Tool names only, 1=Tool names + descriptions, 2=Full details with parameters (default, recommended). Higher depth shows more complete information.',
              enum: [0, 1, 2],
            }
          }
        }
      },
      {
        name: 'run',
        description: 'Execute tools from managed MCP servers. Requires exact format "mcp_name:tool_name" with required parameters. System provides suggestions if tool not found and automatic fallbacks when tools fail.',
        inputSchema: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'Tool to execute. Format: "mcp_name:tool_name"'
            },
            parameters: {
              type: 'object',
              description: 'Parameters to pass to the tool'
            },
            dry_run: {
              type: 'boolean',
              description: 'Preview what the tool will do without actually executing it (default: false)'
            }
          },
          required: ['tool']
        }
      }
    ];

    // Add internal MCP tools if orchestrator is initialized
    // Internal MCPs (ncp:add, ncp:import, ncp:list, ncp:remove, ncp:export) are always available
    // They don't depend on orchestrator initialization status
    // Note: We'll expose them later when we implement elicitation for credentials
    // For now, they're accessible via run("ncp:add", ...) but not listed separately

    return coreTools;
  }

  async initialize(): Promise<void> {
    logger.info('Starting NCP MCP server (SDK-based)');

    // Start initialization in the background, don't await it
    this.initializationPromise = this.orchestrator.initialize().then(() => {
      this.isInitialized = true;

      // Wire up elicitation server to internal MCPs after initialization
      // This enables clipboard-based credential collection for ncp:add and other management tools
      const internalMCPManager = this.orchestrator.getInternalMCPManager();
      if (internalMCPManager) {
        internalMCPManager.setElicitationServer(this);
        logger.info('Elicitation enabled for internal MCPs (clipboard-based credential collection)');
      }

      logger.info('NCP MCP server indexing complete');
    }).catch((error) => {
      logger.error('Failed to initialize orchestrator:', error);
      this.isInitialized = true; // Mark as initialized even on error to unblock
    });

    // Don't wait for indexing to complete - return immediately
    logger.info('NCP MCP server ready (indexing in background)');
  }

  async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  private async handleFind(args: any): Promise<any> {
    const isStillIndexing = !this.isInitialized && this.initializationPromise;

    const description = args?.description || '';
    const page = Math.max(1, args?.page || 1);
    const limit = args?.limit || (description ? 5 : 20);
    const depth = args?.depth !== undefined ? Math.max(0, Math.min(2, args.depth)) : 2;
    const confidenceThreshold = args?.confidence_threshold !== undefined ? args.confidence_threshold : 0.35;

    // Use ToolFinder service for search logic
    const finder = new ToolFinder(this.orchestrator);
    const findResult = await finder.find({
      query: description,
      page,
      limit,
      depth,
      confidenceThreshold
    });

    const { tools: results, pagination, mcpFilter, isListing } = findResult;

    // Get indexing progress if still indexing
    const progress = isStillIndexing ? this.orchestrator.getIndexingProgress() : null;

    const filterText = mcpFilter ? ` (filtered to ${mcpFilter})` : '';

    // Enhanced pagination display
    const paginationInfo = pagination.totalPages > 1 ?
      ` | Page ${pagination.page} of ${pagination.totalPages} (showing ${pagination.resultsInPage} of ${pagination.totalResults} results)` :
      ` (${pagination.totalResults} results)`;

    let output: string;
    if (description) {
      const highlightedQuery = chalk.inverse(` ${description} `);
      output = `\n🔍 Found tools for ${highlightedQuery}${filterText}${paginationInfo}:\n\n`;
    } else {
      output = `\n🔍 Available tools${filterText}${paginationInfo}:\n\n`;
    }

    // Add MCP health status summary
    const healthStatus = this.orchestrator.getMCPHealthStatus();
    if (healthStatus.total > 0) {
      const healthIcon = healthStatus.unhealthy > 0 ? '⚠️' : '✅';
      output += `${healthIcon} **MCPs**: ${healthStatus.healthy}/${healthStatus.total} healthy`;

      if (healthStatus.unhealthy > 0) {
        const unhealthyNames = healthStatus.mcps
          .filter(mcp => !mcp.healthy)
          .map(mcp => mcp.name)
          .join(', ');
        output += ` (${unhealthyNames} unavailable)`;
      }
      output += '\n\n';
    }

    // Add indexing progress if still indexing
    if (progress && progress.total > 0) {
      const percentComplete = Math.round((progress.current / progress.total) * 100);
      const remainingTime = progress.estimatedTimeRemaining ?
        ` (~${Math.ceil(progress.estimatedTimeRemaining / 1000)}s remaining)` : '';

      output += `⏳ **Indexing in progress**: ${progress.current}/${progress.total} MCPs (${percentComplete}%)${remainingTime}\n`;
      output += `   Currently indexing: ${progress.currentMCP || 'initializing...'}\n\n`;

      if (results.length > 0) {
        output += `📋 **Showing partial results** - more tools will become available as indexing completes.\n\n`;
      } else {
        output += `📋 **No tools available yet** - please try again in a moment as indexing progresses.\n\n`;
      }
    }

    // Handle no results case
    if (results.length === 0 && !progress && description) {
      output += `❌ No tools found for "${description}"\n\n`;

      // Intelligent fallback: Search MCP registry
      try {
        logger.debug(`Searching registry for: ${description}`);
        const registryClient = new RegistryClient();
        const registryCandidates = await registryClient.searchForSelection(description);

        if (registryCandidates.length > 0) {
          output += `💡 **I don't have this capability yet, but found ${registryCandidates.length} MCP${registryCandidates.length > 1 ? 's' : ''} in the registry that can help:**\n\n`;

          const topCandidates = registryCandidates.slice(0, 5);
          topCandidates.forEach(candidate => {
            const statusBadge = candidate.status === 'active' ? '⭐' : '📦';
            const envInfo = candidate.envVars?.length ? ` ⚠️ Requires ${candidate.envVars.length} env var${candidate.envVars.length > 1 ? 's' : ''}` : '';
            output += `${candidate.number}. ${statusBadge} **${candidate.displayName}**${envInfo}\n`;
            output += `   ${candidate.description}\n`;
            output += `   Version: ${candidate.version}\n\n`;
          });

          output += `\n🚀 **To install one of these MCPs:**\n\n`;
          output += `**Option 1: Use discovery import (recommended):**\n`;
          output += `\`\`\`\nrun("ncp:import", {\n`;
          output += `  from: "discovery",\n`;
          output += `  source: "${description}",\n`;
          output += `  selection: "1"  // or "1,3,5" for multiple, or "*" for all\n`;
          output += `})\n\`\`\`\n\n`;

          output += `💡 *MCPs will be available after NCP restarts.*`;

          return {
            content: [{ type: 'text', text: output }]
          };
        }
      } catch (error: any) {
        logger.warn(`Registry search failed: ${error.message}`);
      }

      // Fallback: Show sample of available MCPs
      const samples = await finder.getSampleTools(8);

      if (samples.length > 0) {
        output += `📝 Available MCPs to explore:\n`;
        samples.forEach(sample => {
          output += `📁 **${sample.mcpName}** - ${sample.description}\n`;
        });
        output += `\n💡 *Try broader search terms or specify an MCP name in your query.*`;
      }

      return {
        content: [{ type: 'text', text: output }]
      };
    }

    // If no results but still indexing, return progress message
    if (results.length === 0 && progress) {
      return {
        content: [{ type: 'text', text: output }]
      };
    }

    // Format output based on depth and mode
    if (depth === 0) {
      // Depth 0: Tool names only
      results.forEach((tool) => {
        if (isListing) {
          output += `# **${tool.toolName}**\n`;
        } else {
          const confidence = Math.round(tool.confidence * 100);
          output += `# **${tool.toolName}** (${confidence}% match)\n`;
        }
      });
    } else if (depth === 1) {
      // Depth 1: Tool name + description only
      results.forEach((tool, toolIndex) => {
        if (toolIndex > 0) output += '---\n';

        if (isListing) {
          output += `# **${tool.toolName}**\n`;
        } else {
          const confidence = Math.round(tool.confidence * 100);
          output += `# **${tool.toolName}** (${confidence}% match)\n`;
        }

        if (tool.description) {
          const cleanDescription = tool.description
            .replace(/^[^:]+:\s*/, '') // Remove MCP prefix
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          output += `${cleanDescription}\n`;
        }
      });
    } else {
      // Depth 2: Full details with parameters
      results.forEach((tool, toolIndex) => {
        if (toolIndex > 0) output += '---\n';

        if (isListing) {
          output += `# **${tool.toolName}**\n`;
        } else {
          const confidence = Math.round(tool.confidence * 100);
          output += `# **${tool.toolName}** (${confidence}% match)\n`;
        }

        if (tool.description) {
          const cleanDescription = tool.description
            .replace(/^[^:]+:\s*/, '')
            .replace(/\s+/g, ' ')
            .trim();
          output += `${cleanDescription}\n`;
        }

        // Parameters with descriptions
        if (tool.schema) {
          const params = this.parseParameters(tool.schema);
          if (params.length > 0) {
            params.forEach(param => {
              const optionalText = param.required ? '' : ' *(optional)*';
              const descText = param.description ? ` - ${param.description}` : '';
              output += `### ${param.name}: ${param.type}${optionalText}${descText}\n`;
            });
          } else {
            output += `*[no parameters]*\n`;
          }
        } else {
          output += `*[no parameters]*\n`;
        }
      });
    }

    // Add usage guidance
    output += await UsageTipsGenerator.generate({
      depth,
      page: pagination.page,
      totalPages: pagination.totalPages,
      limit,
      totalResults: pagination.totalResults,
      description,
      mcpFilter,
      results
    });

    return {
      content: [{ type: 'text', text: output }]
    };
  }

  private async handleRun(args: any): Promise<any> {
    // Check if indexing is still in progress
    if (!this.isInitialized && this.initializationPromise) {
      const progress = this.orchestrator.getIndexingProgress();

      if (progress && progress.total > 0) {
        const percentComplete = Math.round((progress.current / progress.total) * 100);
        const remainingTime = progress.estimatedTimeRemaining ?
          ` (~${Math.ceil(progress.estimatedTimeRemaining / 1000)}s remaining)` : '';

        const progressMessage = `⏳ **Indexing in progress**: ${progress.current}/${progress.total} MCPs (${percentComplete}%)${remainingTime}\n` +
          `Currently indexing: ${progress.currentMCP || 'initializing...'}\n\n` +
          `Tool execution will be available once indexing completes. Please try again in a moment.`;

        return {
          content: [{ type: 'text', text: progressMessage }]
        };
      }

      // Wait briefly for initialization to complete (max 2 seconds)
      try {
        let timeoutId: NodeJS.Timeout;
        await Promise.race([
          this.initializationPromise,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), 2000);
          })
        ]).finally(() => {
          if (timeoutId!) clearTimeout(timeoutId);
        });
      } catch {
        // Continue even if timeout - try to execute with what's available
      }
    }

    if (!args?.tool) {
      return {
        content: [{ type: 'text', text: 'tool parameter is required' }],
        isError: true,
      };
    }

    const toolIdentifier = args.tool;
    const parameters = args.parameters || {};
    const dryRun = args.dry_run || false;

    if (dryRun) {
      // Dry run mode - show what would happen without executing
      const previewText = this.generateDryRunPreview(toolIdentifier, parameters);
      return {
        content: [{
          type: 'text',
          text: `🔍 DRY RUN PREVIEW:\n\n${previewText}\n\n⚠️  This was a preview only. Set dry_run: false to execute.`
        }]
      };
    }

    // Normal execution
    const result = await this.orchestrator.run(toolIdentifier, parameters);

    if (result.success) {
      return {
        content: [{
          type: 'text',
          text: typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: result.error || 'Tool execution failed'
        }],
        isError: true,
      };
    }
  }

  private parseParameters(schema: any): ParameterInfo[] {
    return ToolSchemaParser.parseParameters(schema);
  }

  private getSuggestions(input: string, validOptions: string[]): string[] {
    const inputLower = input.toLowerCase();
    return validOptions.filter(option => {
      const optionLower = option.toLowerCase();
      return optionLower.includes(inputLower) || inputLower.includes(optionLower) ||
             this.levenshteinDistance(inputLower, optionLower) <= 2;
    });
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i += 1) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j += 1) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private generateDryRunPreview(toolIdentifier: string, parameters: any): string {
    const parts = toolIdentifier.includes(':') ? toolIdentifier.split(':', 2) : ['unknown', toolIdentifier];
    const mcpName = parts[0];
    const toolName = parts[1];

    let preview = `🛠️  Tool: ${toolName}\n📁 MCP: ${mcpName}\n📋 Parameters:\n`;

    if (Object.keys(parameters).length === 0) {
      preview += '   (none)\n';
    } else {
      for (const [key, value] of Object.entries(parameters)) {
        preview += `   ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    return preview;
  }

  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('NCP MCP server connected via stdio transport');
  }

  async run(): Promise<void> {
    await this.initialize();
    await this.connect();
  }

  async cleanup(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    try {
      await this.orchestrator.cleanup();
      await this.server.close();
      logger.info('NCP MCP server shut down gracefully');
    } catch (error: any) {
      logger.error(`Error during shutdown: ${error.message}`);
    }
  }

  /**
   * Elicitation API for credential collection
   * Implements the ElicitationServer interface to enable clipboard-based credential collection
   */
  async elicitInput(params: {
    message: string;
    requestedSchema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  }): Promise<{
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, any>;
  }> {
    try {
      // Use SDK's elicitInput method to send request to client (Claude Desktop)
      const result = await this.server.elicitInput(params);

      // Transform SDK result to our interface format
      return {
        action: result.action,
        content: result.content
      };
    } catch (error: any) {
      logger.error(`Elicitation failed: ${error.message}`);
      // Return cancel on error
      return {
        action: 'cancel'
      };
    }
  }
}

export default MCPServerSDK;
