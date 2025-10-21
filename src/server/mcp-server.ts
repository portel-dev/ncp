/**
 * NCP MCP Server - Clean 2-Method Architecture
 * Exposes exactly 2 methods: discover + execute
 */

import * as crypto from 'crypto';
import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';
import { logger } from '../utils/logger.js';
import { ToolSchemaParser, ParameterInfo } from '../services/tool-schema-parser.js';
import { ToolContextResolver } from '../services/tool-context-resolver.js';
import { ToolFinder } from '../services/tool-finder.js';
import { UsageTipsGenerator } from '../services/usage-tips-generator.js';
import { TextUtils } from '../utils/text-utils.js';
import { RegistryClient } from '../services/registry-client.js';
import { NCP_PROMPTS, generateAddConfirmation, generateRemoveConfirmation, generateConfigInput, generateOperationConfirmation, parseOperationConfirmationResponse } from './mcp-prompts.js';
import { loadGlobalSettings, isToolWhitelisted, addToolToWhitelist } from '../utils/global-settings.js';
import { version } from '../utils/version.js';
import chalk from 'chalk';

interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class MCPServer {
  private orchestrator: NCPOrchestrator;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;
  private initializationProgress: { current: number; total: number; currentMCP: string } | null = null;

  // NCP connection tracking (distinct from protocol session_id)
  private ncpTrackingId: string | null = null;
  private clientSessionId: string | null = null; // Client's original session_id
  private clientName: string | null = null;
  private clientInfo: { name: string; version: string } | null = null; // Full client info for passthrough
  private sessionStartTime: number | null = null;

  constructor(profileName: string = 'default', showProgress: boolean = false, forceRetry: boolean = false) {
    // Profile-aware orchestrator using real MCP connections
    this.orchestrator = new NCPOrchestrator(profileName, showProgress, forceRetry);
  }

  async initialize(): Promise<void> {
    logger.info('Starting NCP MCP server');

    // Start initialization in the background, don't await it
    this.initializationPromise = this.orchestrator.initialize().then(() => {
      this.isInitialized = true;
      this.initializationProgress = null;
      logger.info('NCP MCP server indexing complete');
    }).catch((error) => {
      logger.error('Failed to initialize orchestrator:', error);
      this.isInitialized = true; // Mark as initialized even on error to unblock
      this.initializationProgress = null;
    });

    // Don't wait for indexing to complete - return immediately
    logger.info('NCP MCP server ready (indexing in background)');
  }

  /**
   * Wait for initialization to complete
   * Useful for CLI commands that need full indexing before proceeding
   */
  async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  async handleRequest(request: any): Promise<MCPResponse | undefined> {
    // Handle notifications (requests without id)
    if (!('id' in request)) {
      // Handle common MCP notifications
      if (request.method === 'notifications/initialized') {
        // Client finished initialization - no response needed
        return undefined;
      }
      return undefined;
    }

    // Validate JSON-RPC structure
    if (!request || request.jsonrpc !== '2.0' || !request.method) {
      return {
        jsonrpc: '2.0',
        id: request.id || null,
        error: {
          code: -32600,
          message: 'Invalid request'
        }
      };
    }

    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);

        case 'tools/list':
          return this.handleListTools(request);

        case 'tools/call':
          return this.handleCallTool(request);

        case 'prompts/list':
          return this.handleListPrompts(request);

        case 'prompts/get':
          return this.handleGetPrompt(request);

        case 'resources/list':
          return this.handleListResources(request);

        case 'resources/read':
          return this.handleReadResource(request);

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error: any) {
      logger.error(`Error handling request: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
    }
  }

  private handleInitialize(request: MCPRequest): MCPResponse {
    // Generate NCP-specific tracking ID (not session_id - we don't own that)
    this.ncpTrackingId = crypto.randomUUID();
    this.sessionStartTime = Date.now();

    // Extract client's original session_id (if provided)
    this.clientSessionId = request.params?._meta?.session_id || null;

    // Extract full clientInfo for transparent passthrough to downstream MCPs
    const clientInfo = request.params?.clientInfo;
    this.clientInfo = clientInfo ? {
      name: clientInfo.name || 'unknown',
      version: clientInfo.version || version
    } : null;

    // Extract client name for logging and auto-import
    this.clientName = this.clientInfo?.name || 'unknown';

    // Pass client info to orchestrator for transparent passthrough to downstream MCPs
    if (this.clientInfo) {
      this.orchestrator.setClientInfo(this.clientInfo);
    }

    // Log connection start with tracking info
    const sessionInfo = this.clientSessionId
      ? `session=${this.clientSessionId}, tracking=${this.ncpTrackingId}`
      : `tracking=${this.ncpTrackingId}`;
    logger.info(`Connection started: client=${this.clientName}, ${sessionInfo}`);

    // Trigger auto-import asynchronously (don't block initialize response)
    if (this.clientName) {
      this.orchestrator.triggerAutoImport(this.clientName).catch(error => {
        logger.error(`[${this.ncpTrackingId}] Auto-import failed for ${this.clientName}: ${error.message}`);
      });
    }

    // Build response _meta - preserve client's session_id if provided
    const responseMeta: any = {
      ncp_tracking_id: this.ncpTrackingId,
      ncp_client: this.clientName
    };

    // If client provided session_id, echo it back (transparent passthrough)
    if (this.clientSessionId) {
      responseMeta.session_id = this.clientSessionId;
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          prompts: {}
        },
        serverInfo: {
          name: 'ncp',
          title: 'Natural Context Provider - Unified MCP Orchestrator',
          version: version
        },
        _meta: responseMeta
      }
    };
  }

  private async handleListTools(request: MCPRequest): Promise<MCPResponse> {
    // Always return tools immediately, even if indexing is in progress
    // This prevents MCP connection failures during startup
    const tools: MCPTool[] = [
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
              description: 'Information depth level: 0=Tool names only, 1=Tool names + descriptions, 2=Full details with parameters (default, recommended for AI). Higher depth shows more complete information.',
              enum: [0, 1, 2],
              default: 2
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

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools
      }
    };
  }

  private async handleCallTool(request: MCPRequest): Promise<MCPResponse> {
    if (!request.params || !request.params.name) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: 'Invalid params: missing tool name'
        }
      };
    }

    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'find':
          return this.handleFind(request, args);

        case 'run':
          return this.handleRun(request, args);

        default:
          // Suggest similar methods
          const suggestions = this.getSuggestions(name, ['find', 'run']);
          const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';

          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: '${name}'. NCP OSS supports 'find' and 'run' methods.${suggestionText} Use 'find()' to discover available tools.`
            }
          };
      }
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error'
        }
      };
    }
  }

  public async handleFind(request: MCPRequest, args: any): Promise<MCPResponse> {
    const isStillIndexing = !this.isInitialized && this.initializationPromise;

    const description = args?.description || '';
    const page = Math.max(1, args?.page || 1);
    const limit = args?.limit || (description ? 5 : 20);
    const depth = args?.depth !== undefined ? Math.max(0, Math.min(2, args.depth)) : 2;
    const confidenceThreshold = args?.confidence_threshold !== undefined ? args.confidence_threshold : 0.35;

    // Use ToolFinder service for search logic - always run to get partial results
    const finder = new ToolFinder(this.orchestrator);
    const findResult = await finder.find({
      query: description,
      page,
      limit,
      depth,
      confidenceThreshold
    });

    const { tools: results, groupedByMCP: mcpGroups, pagination, mcpFilter, isListing } = findResult;

    // Get indexing progress if still indexing
    const progress = isStillIndexing ? this.orchestrator.getIndexingProgress() : null;

    const filterText = mcpFilter ? ` (filtered to ${mcpFilter})` : '';

    // Enhanced pagination display
    const paginationInfo = pagination.totalPages > 1 ?
      ` | Page ${pagination.page} of ${pagination.totalPages} (showing ${pagination.resultsInPage} of ${pagination.totalResults} results)` :
      ` (${pagination.totalResults} results)`;

    let output: string;
    if (description) {
      // Search mode - highlight the search query with reverse colors for emphasis
      const highlightedQuery = chalk.inverse(` ${description} `);
      output = `\n🔍 Found tools for ${highlightedQuery}${filterText}${paginationInfo}:\n\n`;
    } else {
      // Listing mode - show all available tools
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

    // Add indexing progress if still indexing (parity with CLI)
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

    // Handle no results case (but only if not indexing - during indexing we already showed message above)
    if (results.length === 0 && !progress && description) {
      output += `❌ No tools found for "${description}"\n\n`;

      // Intelligent fallback: Search MCP registry for matching tools
      try {
        logger.debug(`Searching registry for: ${description}`);
        const registryClient = new RegistryClient();
        const registryCandidates = await registryClient.searchForSelection(description);

        if (registryCandidates.length > 0) {
          output += `💡 **I don't have this capability yet, but found ${registryCandidates.length} MCP${registryCandidates.length > 1 ? 's' : ''} in the registry that can help:**\n\n`;

          // Show top 5 results
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

          output += `**Option 2: Direct add with clipboard secrets:**\n`;
          output += `1. Copy config to clipboard (for secrets): \`{"env":{"API_KEY":"your_secret"}}\`\n`;
          output += `2. Call: \`run("ncp:add", {mcp_name: "${topCandidates[0].displayName}", command: "${topCandidates[0].command}", args: ${JSON.stringify(topCandidates[0].args)}})\`\n\n`;

          output += `💡 *MCPs will be available after NCP restarts.*`;

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: output }]
            }
          };
        }
      } catch (error: any) {
        logger.warn(`Registry search failed: ${error.message}`);
        // Continue to show available MCPs below
      }

      // Fallback: Show sample of available MCPs (if registry search failed or returned no results)
      const samples = await finder.getSampleTools(8);

      if (samples.length > 0) {
        output += `📝 Available MCPs to explore:\n`;
        samples.forEach(sample => {
          output += `📁 **${sample.mcpName}** - ${sample.description}\n`;
        });
        output += `\n💡 *Try broader search terms or specify an MCP name in your query.*`;
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: output }]
        }
      };
    }

    // If no results but still indexing, return progress message
    if (results.length === 0 && progress) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: output }]
        }
      };
    }

    // Format output based on depth and mode
    if (depth === 0) {
      // Depth 0: Tool names only (no parameters, no descriptions)
      // Use original results array to maintain confidence-based ordering
      results.forEach((tool) => {
        if (isListing) {
          output += `# **${tool.toolName}**\n`;
        } else {
          const confidence = Math.round(tool.confidence * 100);
          output += `# **${tool.toolName}** (${confidence}% match)\n`;
        }
      });
    } else if (depth === 1) {
      // Depth 1: Tool name + description only (no parameters)
      // Use original results array to maintain confidence-based ordering
      results.forEach((tool, toolIndex) => {
        if (toolIndex > 0) output += '---\n';

        // Tool name
        if (isListing) {
          output += `# **${tool.toolName}**\n`;
        } else {
          const confidence = Math.round(tool.confidence * 100);
          output += `# **${tool.toolName}** (${confidence}% match)\n`;
        }

          // Tool description
        if (tool.description) {
          const cleanDescription = tool.description
            .replace(/^[^:]+:\s*/, '') // Remove MCP prefix
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          output += `${cleanDescription}\n`;
        }

        // No parameters at depth 1
      });
    } else {
      // Depth 2: Full details with parameter descriptions
      // Use original results array to maintain confidence-based ordering
      results.forEach((tool, toolIndex) => {
        if (toolIndex > 0) output += '---\n';

        // Tool name
        if (isListing) {
          output += `# **${tool.toolName}**\n`;
        } else {
          const confidence = Math.round(tool.confidence * 100);
          output += `# **${tool.toolName}** (${confidence}% match)\n`;
        }

          // Tool description
        if (tool.description) {
          const cleanDescription = tool.description
            .replace(/^[^:]+:\s*/, '') // Remove MCP prefix
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          output += `${cleanDescription}\n`;
        }

        // Parameters with descriptions inline
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

    // Add comprehensive usage guidance
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
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{
          type: 'text',
          text: output
        }]
      }
    };
  }



  private getToolContext(toolName: string): string {
    return ToolContextResolver.getContext(toolName);
  }

  private parseParameters(schema: any): ParameterInfo[] {
    return ToolSchemaParser.parseParameters(schema);
  }

  private wrapText(text: string, maxWidth: number, indent: string): string {
    return TextUtils.wrapText(text, {
      maxWidth,
      indent,
      cleanupPrefixes: true
    });
  }

  private getSuggestions(input: string, validOptions: string[]): string[] {
    const inputLower = input.toLowerCase();
    return validOptions.filter(option => {
      const optionLower = option.toLowerCase();
      // Simple fuzzy matching: check if input contains part of option or vice versa
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
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
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

    // Add operation-specific warnings and descriptions
    const warnings = this.getDryRunWarnings(toolName, parameters);
    if (warnings.length > 0) {
      preview += '\n⚠️  Warnings:\n';
      warnings.forEach(warning => preview += `   • ${warning}\n`);
    }

    const description = this.getDryRunDescription(toolName, parameters);
    if (description) {
      preview += `\n📖 This operation will: ${description}`;
    }

    return preview;
  }

  private getDryRunWarnings(toolName: string, parameters: any): string[] {
    const warnings: string[] = [];

    if (toolName.includes('write') || toolName.includes('create')) {
      warnings.push('This operation will modify files/data');
    }
    if (toolName.includes('delete') || toolName.includes('remove')) {
      warnings.push('This operation will permanently delete data');
    }
    if (toolName.includes('move') || toolName.includes('rename')) {
      warnings.push('This operation will move/rename files');
    }
    if (parameters.path && (parameters.path.includes('/') || parameters.path.includes('\\'))) {
      warnings.push('File system operation - check path permissions');
    }

    return warnings;
  }

  private getDryRunDescription(toolName: string, parameters: any): string {
    if (toolName === 'write_file' && parameters.path) {
      return `Create or overwrite file at: ${parameters.path}`;
    }
    if (toolName === 'read_file' && parameters.path) {
      return `Read contents of file: ${parameters.path}`;
    }
    if (toolName === 'create_directory' && parameters.path) {
      return `Create directory at: ${parameters.path}`;
    }
    if (toolName === 'list_directory' && parameters.path) {
      return `List contents of directory: ${parameters.path}`;
    }

    return `Execute ${toolName} with provided parameters`;
  }

  private async handleRun(request: MCPRequest, args: any): Promise<MCPResponse> {
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
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: progressMessage }]
          }
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
          if (timeoutId) clearTimeout(timeoutId);
        });
      } catch {
        // Continue even if timeout - try to execute with what's available
      }
    }

    if (!args?.tool) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: 'tool parameter is required'
        }
      };
    }

    const toolIdentifier = args.tool;
    const parameters = args.parameters || {};
    const dryRun = args.dry_run || false;

    // Extract _meta for transparent passthrough and merge with NCP tracking
    const clientMeta = request.params?._meta || {};
    const meta = {
      ...clientMeta,
      // Preserve client's session_id if present (don't overwrite!)
      // Add NCP tracking info in separate namespace
      ncp_tracking_id: this.ncpTrackingId,
      ncp_client: this.clientName
    };

    // ===== CONFIRM-BEFORE-RUN FEATURE =====
    // Check if this operation requires user confirmation
    const userResponse = args._userResponse; // User's response from previous confirmation dialog

    const settings = await loadGlobalSettings();
    const confirmSettings = settings.confirmBeforeRun;

    if (confirmSettings.enabled && !userResponse) {
      // Check whitelist first
      const isWhitelisted = await isToolWhitelisted(toolIdentifier);

      if (!isWhitelisted) {
        // Get tool description by searching for the tool
        const toolSearchResults = await this.orchestrator.find(toolIdentifier, 1, true);
        const toolDescription = toolSearchResults.length > 0 ? toolSearchResults[0].description || '' : '';

        // Use vector search to check if tool matches modifier pattern
        // Search the modifier pattern to see if the tool description matches
        const searchQuery = `${toolIdentifier} ${toolDescription}`;
        const matchResults = await this.orchestrator.find(confirmSettings.modifierPattern, 20, false, confirmSettings.vectorThreshold);

        // Check if our tool is in the match results
        const toolMatch = matchResults.find(result => result.toolName === toolIdentifier);

        if (toolMatch && toolMatch.confidence >= confirmSettings.vectorThreshold) {
          // Confirmation required - return error with prompt details
          const confidencePercent = Math.round(toolMatch.confidence * 100);

          // Format parameters for display
          let parametersText = '';
          if (Object.keys(parameters).length > 0) {
            parametersText = '\n\nParameters:';
            for (const [key, value] of Object.entries(parameters)) {
              const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
              parametersText += `\n  ${key}: ${valueStr}`;
            }
          } else {
            parametersText = '\n\nParameters: (none)';
          }

          const [mcpName, toolName] = toolIdentifier.split(':');

          const confirmationMessage = `⚠️ CONFIRMATION REQUIRED

Tool: ${toolName}
MCP: ${mcpName}

Description:
${toolDescription || 'No description available'}${parametersText}

Reason: Matches modifier pattern (${confidencePercent}% confidence)
Pattern: "${confirmSettings.modifierPattern}"

This operation may modify data or have side effects.

Do you want to proceed?
- Reply "YES" to approve this once
- Reply "ALWAYS" to approve and add to whitelist (won't ask again)
- Reply "NO" to cancel

Then call this tool again with your response in the _userResponse parameter.`;

          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32001, // Custom error code for confirmation required
              message: confirmationMessage
            }
          };
        }
      }
    }

    // Handle user response if provided
    if (userResponse) {
      const response = parseOperationConfirmationResponse(userResponse);

      if (response === 'cancel') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: `Operation cancelled by user. The tool "${toolIdentifier}" was not executed.`
          }
        };
      }

      if (response === 'always') {
        // Add to whitelist
        await addToolToWhitelist(toolIdentifier);
        logger.info(`Tool ${toolIdentifier} added to whitelist by user`);
      }

      // For both 'once' and 'always', proceed with execution below
    }
    // ===== END CONFIRM-BEFORE-RUN =====

    if (dryRun) {
      // Dry run mode - show what would happen without executing
      const previewText = this.generateDryRunPreview(toolIdentifier, parameters);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{
            type: 'text',
            text: `🔍 DRY RUN PREVIEW:\n\n${previewText}\n\n⚠️  This was a preview only. Set dry_run: false to execute.`
          }]
        }
      };
    }

    // Normal execution - pass _meta transparently
    const result = await this.orchestrator.run(toolIdentifier, parameters, meta);

    if (result.success) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{
            type: 'text',
            text: typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
          }]
        }
      };
    } else {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: result.error || 'Tool execution failed'
        }
      };
    }
  }

  private async handleListPrompts(request: MCPRequest): Promise<MCPResponse> {
    try {
      // Return NCP's own prompts for user approval during MCP management
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          prompts: NCP_PROMPTS
        }
      };
    } catch (error: any) {
      logger.error(`Error listing prompts: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          prompts: []
        }
      };
    }
  }

  private async handleGetPrompt(request: MCPRequest): Promise<MCPResponse> {
    const promptName = request.params?.name;
    const args = request.params?.arguments || {};

    if (!promptName) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: 'Missing required parameter: name'
        }
      };
    }

    try {
      // Find the prompt definition
      const promptDef = NCP_PROMPTS.find(p => p.name === promptName);

      if (!promptDef) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Unknown prompt: ${promptName}`
          }
        };
      }

      // Generate prompt content based on prompt name
      let messages;
      switch (promptName) {
        case 'confirm_add_mcp':
          messages = generateAddConfirmation(
            args.mcp_name || 'unknown',
            args.command || 'unknown',
            args.args || [],
            args.profile || 'all'
          );
          break;

        case 'confirm_remove_mcp':
          messages = generateRemoveConfirmation(
            args.mcp_name || 'unknown',
            args.profile || 'all'
          );
          break;

        case 'configure_mcp':
          messages = generateConfigInput(
            args.mcp_name || 'unknown',
            args.config_type || 'configuration',
            args.description || 'Please provide configuration value'
          );
          break;

        case 'confirm_operation':
          messages = generateOperationConfirmation(
            args.tool || 'unknown',
            args.tool_description || '',
            args.parameters ? (typeof args.parameters === 'string' ? JSON.parse(args.parameters) : args.parameters) : {},
            args.matched_pattern || '',
            args.confidence || 0
          );
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32602,
              message: `Prompt ${promptName} not implemented`
            }
          };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          description: promptDef.description,
          messages
        }
      };
    } catch (error: any) {
      logger.error(`Error getting prompt: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Failed to get prompt: ${error.message}`
        }
      };
    }
  }

  private async handleListResources(request: MCPRequest): Promise<MCPResponse> {
    try {
      // Get resources from managed MCPs
      const mcpResources = await this.orchestrator.getAllResources();

      // Add NCP-specific help resources
      const ncpResources = [
        {
          uri: 'ncp://help/getting-started',
          name: 'NCP Getting Started Guide',
          description: 'Learn how to use NCP effectively - search tips, parameters, and best practices',
          mimeType: 'text/markdown'
        },
        {
          uri: 'ncp://status/health',
          name: 'MCP Health Dashboard',
          description: 'Shows health status of all configured MCPs',
          mimeType: 'text/markdown'
        },
        {
          uri: 'ncp://status/auto-import',
          name: 'Last Auto-Import Summary',
          description: 'Shows MCPs imported from Claude Desktop on last startup',
          mimeType: 'text/markdown'
        }
      ];

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resources: [...ncpResources, ...(mcpResources || [])]
        }
      };
    } catch (error: any) {
      logger.error(`Error listing resources: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resources: []
        }
      };
    }
  }

  private async handleReadResource(request: MCPRequest): Promise<MCPResponse> {
    const uri = request.params?.uri;

    if (!uri) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: 'Missing required parameter: uri'
        }
      };
    }

    try {
      // Handle NCP-specific resources
      if (uri.startsWith('ncp://')) {
        const content = await this.generateNCPResourceContent(uri);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            contents: [{
              uri,
              mimeType: 'text/markdown',
              text: content
            }]
          }
        };
      }

      // Delegate to orchestrator for MCP resources
      const mcpContent = await this.orchestrator.readResource(uri);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: mcpContent
          }]
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Failed to read resource: ${error.message}`
        }
      };
    }
  }

  private async generateNCPResourceContent(uri: string): Promise<string> {
    switch (uri) {
      case 'ncp://help/getting-started':
        return this.generateGettingStartedGuide();

      case 'ncp://status/health':
        return this.generateHealthDashboard();

      case 'ncp://status/auto-import':
        return this.generateAutoImportSummary();

      default:
        throw new Error(`Unknown NCP resource: ${uri}`);
    }
  }

  private generateGettingStartedGuide(): string {
    return `# NCP Getting Started Guide

## 🎯 Quick Start

NCP provides two simple tools:

1. **find()** - Discover tools across all your MCPs
2. **run()** - Execute tools from any MCP

## 🔍 Using find() - Tool Discovery

### Search Mode (Describe Your Need)
\`\`\`
find("I want to read a file")
find("send an email to the team")
find("query my database")
\`\`\`

### Listing Mode (Browse All Tools)
\`\`\`
find()  // Shows all available tools
\`\`\`

## ⚙️ Advanced Parameters

### Depth Control
- **depth=0**: Tool names only (quick scan)
- **depth=1**: Names + descriptions (overview)
- **depth=2**: Full details with parameters (default, recommended)

\`\`\`
find("file operations", depth=1)
\`\`\`

### Confidence Threshold
Control how strictly tools must match your query:
- **0.1**: Show all loosely related tools
- **0.35**: Balanced (default)
- **0.5**: Strict matching
- **0.7**: Very precise matches only

\`\`\`
find("database query", confidence_threshold=0.5)
\`\`\`

### Pagination
\`\`\`
find("file tools", page=2, limit=10)
\`\`\`

## 🚀 Using run() - Execute Tools

Format: \`mcp_name:tool_name\`

\`\`\`
run("filesystem:read_file", {path: "/path/to/file.txt"})
run("github:create_issue", {title: "Bug report", body: "..."})
\`\`\`

### Dry Run (Preview Only)
\`\`\`
run("filesystem:write_file", {path: "/tmp/test.txt", content: "..."}, dry_run=true)
\`\`\`

## 💡 Pro Tips

1. **Describe intent, not tools**: "send notification" not "slack message"
2. **Start broad, refine**: Lower confidence first, then increase
3. **Use depth wisely**: depth=0 for quick scan, depth=2 for details
4. **Check health**: Health status shows in find() results

## 🔧 Managing MCPs

### Install New MCPs
When find() shows no results, NCP suggests MCPs from the registry:
\`\`\`
run("ncp:import", {from: "discovery", source: "your query", selection: "1"})
\`\`\`

### List Configured MCPs
\`\`\`
run("ncp:list", {profile: "all"})
\`\`\`

### Check Health
Use the health dashboard resource (you're reading resources now!)

## 🆘 Troubleshooting

**No results?**
- Try broader search terms
- Lower confidence_threshold
- Check MCP health status

**Tool not found?**
- Use find() to discover correct tool name
- Format must be \`mcp:tool\` with colon

**Slow indexing?**
- NCP indexes in background
- Partial results available immediately
- Full results after indexing completes
`;
  }

  private generateHealthDashboard(): string {
    const healthStatus = this.orchestrator.getMCPHealthStatus();

    let content = `# MCP Health Dashboard

## Overall Status

**${healthStatus.healthy}/${healthStatus.total} MCPs Healthy**

`;

    if (healthStatus.total === 0) {
      content += `⚠️  No MCPs configured yet.

To add MCPs, use:
\`\`\`
run("ncp:import", {from: "discovery", source: "your search"})
\`\`\`

Or manually:
\`\`\`
run("ncp:add", {mcp_name: "...", command: "...", args: [...]})
\`\`\`
`;
      return content;
    }

    content += `## MCP Status\n\n`;

    healthStatus.mcps.forEach(mcp => {
      const icon = mcp.healthy ? '✅' : '❌';
      const status = mcp.healthy ? 'Running' : 'Unavailable';
      content += `${icon} **${mcp.name}**: ${status}\n`;
    });

    if (healthStatus.unhealthy > 0) {
      content += `\n## ⚠️  Issues Found\n\n`;
      content += `${healthStatus.unhealthy} MCP${healthStatus.unhealthy > 1 ? 's are' : ' is'} unavailable. This may be due to:\n\n`;
      content += `- Missing dependencies or permissions\n`;
      content += `- Incorrect configuration\n`;
      content += `- Network connectivity issues\n`;
      content += `- MCP server crashed or not running\n\n`;

      content += `**To troubleshoot:**\n`;
      content += `1. Check logs: \`~/.ncp/logs/ncp-debug-*.log\` (if debug enabled)\n`;
      content += `2. Verify configuration: \`run("ncp:list")\`\n`;
      content += `3. Try restarting NCP\n`;
    }

    content += `\n---\n\n`;
    content += `**Profile**: ${this.orchestrator.getProfileName()}\n`;
    content += `**Last Updated**: ${new Date().toLocaleString()}\n`;

    return content;
  }

  private generateAutoImportSummary(): string {
    // Try to get auto-import info from orchestrator
    const autoImportInfo = this.orchestrator.getAutoImportSummary();

    if (!autoImportInfo || autoImportInfo.count === 0) {
      return `# Last Auto-Import Summary

No auto-import has run yet, or no MCPs were found.

## What is Auto-Import?

NCP automatically imports MCPs from your MCP client (Claude Desktop, Perplexity, etc.) on startup.

This means:
- You configure MCPs once in your client
- NCP automatically discovers and imports them
- No manual configuration needed
- Continuous sync on every startup

## How It Works

1. NCP detects it's running as an extension
2. Scans client configuration files
3. Imports all MCPs to your profile
4. Skips NCP instances (avoids recursion)

## Manual Import

If auto-import didn't run or you want to import from a file:

\`\`\`
run("ncp:import", {from: "clipboard"})  // Copy config first
run("ncp:import", {from: "file", source: "~/path/to/config.json"})
\`\`\`
`;
    }

    let content = `# Last Auto-Import Summary

## ✅ Import Successful

**${autoImportInfo.count} MCP${autoImportInfo.count > 1 ? 's' : ''} imported** from ${autoImportInfo.source || 'client'}

`;

    if (autoImportInfo.mcps && autoImportInfo.mcps.length > 0) {
      content += `## Imported MCPs\n\n`;
      autoImportInfo.mcps.forEach(mcp => {
        const transport = mcp.transport || 'stdio';
        content += `- **${mcp.name}** (${transport})\n`;
      });
    }

    if (autoImportInfo.skipped && autoImportInfo.skipped > 0) {
      content += `\n## ℹ️  Skipped\n\n`;
      content += `${autoImportInfo.skipped} NCP instance${autoImportInfo.skipped > 1 ? 's' : ''} skipped (avoids recursion)\n`;
    }

    content += `\n---\n\n`;
    content += `**Profile**: ${autoImportInfo.profile || 'all'}\n`;
    content += `**Timestamp**: ${autoImportInfo.timestamp ? new Date(autoImportInfo.timestamp).toLocaleString() : 'Unknown'}\n\n`;

    content += `## Next Import\n\n`;
    content += `Auto-import runs automatically on every NCP startup.\n`;
    content += `New MCPs will be detected and imported next time NCP restarts.\n`;

    return content;
  }

  async cleanup(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    try {
      // Log connection duration if connection was established
      if (this.ncpTrackingId && this.sessionStartTime) {
        const duration = Date.now() - this.sessionStartTime;
        const durationSec = Math.round(duration / 1000);
        const sessionInfo = this.clientSessionId
          ? `session=${this.clientSessionId}, tracking=${this.ncpTrackingId}`
          : `tracking=${this.ncpTrackingId}`;
        logger.info(`Connection ended: ${sessionInfo}, duration=${durationSec}s, client=${this.clientName}`);
      }

      await this.orchestrator.cleanup();
      logger.info('NCP MCP server shut down gracefully');
    } catch (error: any) {
      logger.error(`Error during shutdown: ${error.message}`);
    }
  }

  /**
   * Set up stdio transport listener for MCP protocol messages.
   * Safe to call multiple times (idempotent).
   *
   * This should be called immediately when the process starts to ensure
   * the server is ready to receive protocol messages from any MCP client,
   * without requiring an explicit run() call.
   */
  startStdioListener(): void {
    // Prevent duplicate listener setup
    if ((this as any)._stdioListenerActive) {
      return;
    }
    (this as any)._stdioListenerActive = true;

    // Simple STDIO server
    process.stdin.setEncoding('utf8');
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            const response = await this.handleRequest(request);
            if (response) {
              process.stdout.write(JSON.stringify(response) + '\n');
            }
          } catch (error) {
            const errorResponse = {
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32700,
                message: 'Parse error'
              }
            };
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
          }
        }
      }
    });

    process.stdin.on('end', () => {
      this.shutdown();
    });
  }

  /**
   * Legacy run() method for backwards compatibility.
   * Used by command-line interface entry point.
   *
   * For MCP server usage, prefer calling startStdioListener() immediately
   * and initialize() separately to be protocol-compliant.
   */
  async run(): Promise<void> {
    await this.initialize();
    this.startStdioListener();
  }
}

export class ParameterPredictor {
  predictValue(paramName: string, paramType: string, toolContext: string, description?: string, toolName?: string): any {
    const name = paramName.toLowerCase();
    const desc = (description || '').toLowerCase();
    const tool = (toolName || '').toLowerCase();

    // String type predictions
    if (paramType === 'string') {
      return this.predictStringValue(name, desc, toolContext, tool);
    }

    // Number type predictions
    if (paramType === 'number' || paramType === 'integer') {
      return this.predictNumberValue(name, desc, toolContext);
    }

    // Boolean type predictions
    if (paramType === 'boolean') {
      return this.predictBooleanValue(name, desc);
    }

    // Array type predictions
    if (paramType === 'array') {
      return this.predictArrayValue(name, desc, toolContext);
    }

    // Object type predictions
    if (paramType === 'object') {
      return this.predictObjectValue(name, desc);
    }

    // Default fallback
    return this.getDefaultForType(paramType);
  }

  private predictStringValue(name: string, desc: string, context: string, tool?: string): string {
    // File and path patterns
    if (name.includes('path') || name.includes('file') || desc.includes('path') || desc.includes('file')) {
      // Check if tool name suggests directory operations
      const isDirectoryTool = tool && (
        tool.includes('list_dir') ||
        tool.includes('list_folder') ||
        tool.includes('read_dir') ||
        tool.includes('scan_dir') ||
        tool.includes('get_dir')
      );

      // Check if parameter or description suggests directory
      const isDirectoryParam = name.includes('dir') ||
                              name.includes('folder') ||
                              desc.includes('directory') ||
                              desc.includes('folder');

      // Smart detection: if it's just "path" but tool is clearly for directories
      if (name === 'path' && isDirectoryTool) {
        return context === 'filesystem' ? '/home/user/documents' : './';
      }

      if (context === 'filesystem') {
        if (isDirectoryParam || isDirectoryTool) {
          return '/home/user/documents';
        }
        if (name.includes('config') || desc.includes('config')) {
          return '/etc/config.json';
        }
        return '/home/user/document.txt';
      }

      // Default based on whether it's likely a directory or file
      if (isDirectoryParam || isDirectoryTool) {
        return './';
      }
      return './file.txt';
    }

    // URL patterns
    if (name.includes('url') || name.includes('link') || desc.includes('url') || desc.includes('http')) {
      if (context === 'web') {
        return 'https://api.example.com/data';
      }
      return 'https://example.com';
    }

    // Email patterns
    if (name.includes('email') || name.includes('mail') || desc.includes('email')) {
      return 'user@example.com';
    }

    // Name patterns
    if (name.includes('name') || name === 'title' || name === 'label') {
      if (context === 'filesystem') {
        return 'my-file';
      }
      return 'example-name';
    }

    // Content/text patterns
    if (name.includes('content') || name.includes('text') || name.includes('message') || name.includes('body')) {
      return 'Hello, world!';
    }

    // Query/search patterns
    if (name.includes('query') || name.includes('search') || name.includes('term')) {
      return 'search term';
    }

    // Key/ID patterns
    if (name.includes('key') || name.includes('id') || name.includes('token')) {
      if (context === 'payment') {
        return 'sk_test_...';
      }
      return 'abc123';
    }

    // Command patterns
    if (name.includes('command') || name.includes('cmd')) {
      if (context === 'system') {
        return 'ls -la';
      }
      return 'echo hello';
    }

    // Default string
    return 'example';
  }

  private predictNumberValue(name: string, desc: string, context: string): number {
    // Process ID patterns
    if (name.includes('pid') || desc.includes('process') || desc.includes('pid')) {
      return 1234;
    }

    // Port patterns
    if (name.includes('port') || desc.includes('port')) {
      return 8080;
    }

    // Size/length patterns
    if (name.includes('size') || name.includes('length') || name.includes('limit') || name.includes('count')) {
      return 10;
    }

    // Line number patterns
    if (name.includes('line') || name.includes('head') || name.includes('tail')) {
      return 5;
    }

    // Timeout patterns
    if (name.includes('timeout') || name.includes('delay') || desc.includes('timeout')) {
      return 5000;
    }

    // Default number
    return 1;
  }

  private predictBooleanValue(name: string, desc: string): boolean {
    // Negative patterns default to false
    if (name.includes('disable') || name.includes('skip') || name.includes('ignore')) {
      return false;
    }

    // Most booleans default to true for examples
    return true;
  }

  private predictArrayValue(name: string, desc: string, context: string): any[] {
    // File paths array
    if (name.includes('path') || name.includes('file') || desc.includes('path')) {
      return ['/path/to/file1.txt', '/path/to/file2.txt'];
    }

    // Arguments array
    if (name.includes('arg') || name.includes('param') || desc.includes('argument')) {
      return ['--verbose', '--output', 'result.txt'];
    }

    // Tags/keywords
    if (name.includes('tag') || name.includes('keyword') || name.includes('label')) {
      return ['tag1', 'tag2'];
    }

    // Default array
    return ['item1', 'item2'];
  }

  private predictObjectValue(name: string, desc: string): object {
    // Options/config object
    if (name.includes('option') || name.includes('config') || name.includes('setting')) {
      return { enabled: true, timeout: 5000 };
    }

    // Default object
    return { key: 'value' };
  }

  private getDefaultForType(type: string): any {
    switch (type) {
      case 'string': return 'value';
      case 'number':
      case 'integer': return 0;
      case 'boolean': return true;
      case 'array': return [];
      case 'object': return {};
      default: return null;
    }
  }
}

export default MCPServer;