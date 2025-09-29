/**
 * NCP MCP Server - Clean 2-Method Architecture
 * Exposes exactly 2 methods: discover + execute
 */

import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';
import { logger } from '../utils/logger.js';
import { updater } from '../utils/updater.js';
import { ToolSchemaParser, ParameterInfo } from '../services/tool-schema-parser.js';
import { ToolContextResolver } from '../services/tool-context-resolver.js';
import { ToolFinder } from '../services/tool-finder.js';
import { ResourceFinder } from '../services/resource-finder.js';
import { AutoResourceDetector, ResourceCandidate } from '../services/auto-resource-detector.js';
import { AutoResourceGenerator, GeneratedResource } from '../services/auto-resource-generator.js';
import { UsageTipsGenerator } from '../services/usage-tips-generator.js';
import { TextUtils } from '../utils/text-utils.js';
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
  private autoResourceDetector: AutoResourceDetector;
  private autoResourceGenerator: AutoResourceGenerator;
  private autoResourcesGenerated: boolean = false;

  constructor(profileName: string = 'default') {
    // Profile-aware orchestrator using real MCP connections
    this.orchestrator = new NCPOrchestrator(profileName);
    this.autoResourceDetector = new AutoResourceDetector();
    this.autoResourceGenerator = new AutoResourceGenerator(this.orchestrator);
  }

  async initialize(): Promise<void> {
    logger.info('Starting NCP MCP server');
    await this.orchestrator.initialize();

    // Generate auto-resources from existing tools
    await this.generateAutoResources();

    logger.info('NCP MCP server ready');
  }

  /**
   * Analyze tools and generate auto-resources for efficiency
   */
  private async generateAutoResources(): Promise<void> {
    try {
      // Get all available tools from orchestrator
      const allTools = await this.getAllToolsForAnalysis();

      if (allTools.length === 0) {
        logger.info('No tools available for auto-resource generation');
        return;
      }

      // Detect resource candidates
      const candidates = this.autoResourceDetector.detectResourceCandidates(allTools);

      if (candidates.length === 0) {
        logger.info('No suitable tools found for auto-resource generation');
        return;
      }

      // Generate resources from high-confidence candidates
      const generatedResources = await this.autoResourceGenerator.generateResources(candidates);

      logger.info(`Generated ${generatedResources.length} auto-resources from ${allTools.length} tools`);

      // Log efficiency gains
      const stats = this.autoResourceGenerator.getEfficiencyStats();
      logger.info(`Auto-resource coverage: ${stats.totalGenerated} resources across ${Object.keys(stats.coverageByMcp).length} MCPs`);

      this.autoResourcesGenerated = true;

    } catch (error: any) {
      logger.warn(`Auto-resource generation failed: ${error.message}`);
    }
  }

  /**
   * Get all tools from orchestrator for auto-resource analysis
   */
  private async getAllToolsForAnalysis(): Promise<Array<{name: string, description: string, inputSchema: any, mcpName: string}>> {
    try {
      const finder = new ToolFinder(this.orchestrator);
      const findResult = await finder.find({
        query: '',
        page: 1,
        limit: 10000, // Get all tools
        depth: 2
      });

      return findResult.tools.map(tool => ({
        name: tool.toolName,
        description: tool.description || '',
        inputSchema: tool.schema || {},
        mcpName: tool.mcpName
      }));
    } catch (error: any) {
      logger.warn(`Failed to get tools for analysis: ${error.message}`);
      return [];
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

        case 'resources/list':
          return this.handleListResources(request);

        case 'resources/read':
          return this.handleResourcesRead(request);

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
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'ncp',
          title: 'Natural Context Provider - Unified MCP Orchestrator',
          version: '1.0.4'
        }
      }
    };
  }

  private async handleListTools(request: MCPRequest): Promise<MCPResponse> {
    // NCP core architecture: 2-3 methods depending on resource availability
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
              description: 'Minimum confidence level for search results (0.0-1.0, default: 0.3). Examples: 0.1=show all, 0.3=balanced, 0.5=strict, 0.7=very precise. Lower values show more loosely related tools, higher values show only close matches.'
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

    // Conditionally add resource discovery tool if any MCPs provide resources
    try {
      const availableResources = await this.orchestrator.getAllResources();
      if (availableResources && availableResources.length > 0) {
        tools.push({
          name: 'resource',
          description: 'Dual-mode resource discovery: (1) SEARCH MODE: Use with description parameter for intelligent vector search - describe the data you need: "I need project documentation", "I want current system metrics". (2) LISTING MODE: Call without description parameter for paginated browsing of all available resources and templates.',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'SEARCH MODE: Search query for needed data/documents ("project docs", "live weather"). LISTING MODE: Omit to browse all available resources with pagination.'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of resources to return per page (default: 5 for search, 20 for list)'
              },
              page: {
                type: 'number',
                description: 'Page number for pagination (default: 1)'
              },
              confidence_threshold: {
                type: 'number',
                description: 'Minimum confidence level for search results (0.0-1.0, default: 0.3)'
              },
              depth: {
                type: 'number',
                description: 'Information depth: 0=Resource names only, 1=Names + descriptions, 2=Full details with URIs and metadata',
                enum: [0, 1, 2],
                default: 2
              }
            }
          }
        });
      }
    } catch (error) {
      // If resource check fails, just continue without resource tool
      logger.warn(`Failed to check resource availability: ${error}`);
    }

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

        case 'resource':
          return this.handleResource(request, args);

        default:
          // Suggest similar methods
          const availableTools = ['find', 'run'];

          // Check if resources are available to include in suggestions
          try {
            const resources = await this.orchestrator.getAllResources();
            if (resources && resources.length > 0) {
              availableTools.push('resource');
            }
          } catch (error) {
            // Ignore error for suggestions
          }

          const suggestions = this.getSuggestions(name, availableTools);
          const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
          const methodList = availableTools.map(tool => `'${tool}'`).join(', ');

          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: '${name}'. NCP OSS supports ${methodList} methods.${suggestionText} Use 'find()' to discover available tools.`
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
    const description = args?.description || '';
    const page = Math.max(1, args?.page || 1);
    const limit = args?.limit || (description ? 5 : 20);
    const depth = args?.depth !== undefined ? Math.max(0, Math.min(2, args.depth)) : 2;

    // Use ToolFinder service for search logic
    const finder = new ToolFinder(this.orchestrator);
    const findResult = await finder.find({
      query: description,
      page,
      limit,
      depth
    });

    const { tools: results, groupedByMCP: mcpGroups, pagination, mcpFilter, isListing } = findResult;

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

    // Handle no results case
    if (results.length === 0) {
      output = `❌ No tools found for "${description}"\n\n`;

      // Show sample of available MCPs
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

  public async handleResource(request: MCPRequest, args: any): Promise<MCPResponse> {
    const description = args?.description || '';
    const page = Math.max(1, args?.page || 1);
    const limit = args?.limit || (description ? 5 : 20);
    const depth = args?.depth !== undefined ? Math.max(0, Math.min(2, args.depth)) : 2;

    // Use ResourceFinder service for search logic
    const finder = new ResourceFinder(this.orchestrator);
    const findResult = await finder.find({
      query: description,
      page,
      limit,
      depth
    });

    const { resources: results, groupedByMCP: mcpGroups, pagination, mcpFilter, isListing } = findResult;

    const filterText = mcpFilter ? ` (filtered to ${mcpFilter})` : '';

    // Enhanced pagination display
    const paginationInfo = pagination.totalPages > 1 ?
      ` | Page ${pagination.page} of ${pagination.totalPages} (showing ${pagination.resultsInPage} of ${pagination.totalResults} results)` :
      ` (${pagination.totalResults} results)`;

    let output: string;
    if (description) {
      // Search mode - highlight the search query with reverse colors for emphasis
      const highlightedQuery = chalk.inverse(` ${description} `);
      output = `\n📄 Found resources for ${highlightedQuery}${filterText}${paginationInfo}:\n\n`;
    } else {
      // Listing mode - show all available resources
      output = `\n📄 Available resources${filterText}${paginationInfo}:\n\n`;
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

    // Handle no results case
    if (results.length === 0) {
      output = `❌ No resources found for "${description}"\n\n`;

      // Show sample of available MCPs with resources
      const samples = await finder.getSampleResources(8);

      if (samples.length > 0) {
        output += `📝 Available MCPs with resources:\n`;
        samples.forEach(sample => {
          output += `📁 **${sample.mcpName}** - ${sample.description}\n`;
        });
        output += `\n💡 *Try broader search terms or specify an MCP name in your query.*`;
      } else {
        output += `💡 *No resources are currently available from connected MCPs.*`;
      }

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
      // Depth 0: Resource names only (no descriptions, no URIs)
      results.forEach((resource) => {
        if (isListing) {
          output += `# **${resource.name}**\n`;
        } else {
          const confidence = Math.round(resource.confidence * 100);
          output += `# **${resource.name}** (${confidence}% match)\n`;
        }
      });
    } else if (depth === 1) {
      // Depth 1: Resource name + description only (no URIs)
      results.forEach((resource, resourceIndex) => {
        if (resourceIndex > 0) output += '---\n';

        // Resource name
        if (isListing) {
          output += `# **${resource.name}**\n`;
        } else {
          const confidence = Math.round(resource.confidence * 100);
          output += `# **${resource.name}** (${confidence}% match)\n`;
        }

        // Resource description
        if (resource.description) {
          const cleanDescription = resource.description
            .replace(/^[^:]+:\s*/, '') // Remove MCP prefix
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          output += `${cleanDescription}\n`;
        }

        // Show MIME type if available
        if (resource.mimeType) {
          output += `*Type: ${resource.mimeType}*\n`;
        }
      });
    } else {
      // Depth 2: Full details with URIs for resources/read
      results.forEach((resource, resourceIndex) => {
        if (resourceIndex > 0) output += '---\n';

        // Resource name
        if (isListing) {
          output += `# **${resource.name}**\n`;
        } else {
          const confidence = Math.round(resource.confidence * 100);
          output += `# **${resource.name}** (${confidence}% match)\n`;
        }

        // Resource description
        if (resource.description) {
          const cleanDescription = resource.description
            .replace(/^[^:]+:\s*/, '') // Remove MCP prefix
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          output += `${cleanDescription}\n`;
        }

        // Resource URI for access
        if (resource.uri) {
          output += `**URI**: \`${resource.uri}\`\n`;
          output += `*Use \`resources/read\` with this URI to access the content*\n`;
        }

        // Show MIME type if available
        if (resource.mimeType) {
          output += `**Type**: ${resource.mimeType}\n`;
        }
      });
    }

    // Add usage guidance for resources
    if (depth === 2 && results.length > 0) {
      output += '\n---\n\n';
      output += '💡 **Next Steps**:\n';
      output += '1. Use `resources/read` with any URI above to access content\n';
      output += '2. For parameterized resources (containing `{variables}`), substitute values first\n';
      output += '3. Use lower depth (0-1) for browsing, depth 2 for implementation\n';
    }

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

    // Normal execution
    const result = await this.orchestrator.run(toolIdentifier, parameters);

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
      const prompts = await this.orchestrator.getAllPrompts();
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          prompts: prompts || []
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

  private async handleListResources(request: MCPRequest): Promise<MCPResponse> {
    try {
      // Get both actual resources and auto-generated resources
      const actualResources = await this.orchestrator.getAllResources();
      const autoResources = this.autoResourcesGenerated ? this.autoResourceGenerator.getGeneratedResources() : [];

      const allResourcesExist = (actualResources && actualResources.length > 0) || autoResources.length > 0;

      if (allResourcesExist) {
        // Resources are available - include both actual and auto-generated
        const helpResource = {
          uri: "ncp://help/resource-discovery",
          name: "NCP Resource Discovery Guide",
          description: "Use semantic search to find resources instead of browsing hundreds. Use the 'resource' tool to discover what you need.",
          mimeType: "text/markdown"
        };

        // Convert auto-generated resources to MCP format
        const autoResourcesMcp = autoResources.map((resource: GeneratedResource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }));

        // Combine all resources
        const combinedResources = [helpResource, ...autoResourcesMcp];

        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: combinedResources
          }
        };
      } else {
        // No resources available - return empty list
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: []
          }
        };
      }
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

  private async handleResourcesRead(request: MCPRequest): Promise<MCPResponse> {
    try {
      if (!request.params || !request.params.uri) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Invalid params: missing uri parameter'
          }
        };
      }

      const uri = request.params.uri;

      // Handle special discovery guide URI
      if (uri === "ncp://help/resource-discovery") {
        const guideContent = this.generateResourceDiscoveryGuide();
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            contents: [{
              uri: uri,
              mimeType: "text/markdown",
              text: guideContent
            }]
          }
        };
      }

      // Check if this is an auto-generated resource first
      if (this.autoResourcesGenerated) {
        try {
          const autoResult = await this.autoResourceGenerator.executeResource(uri, request.params || {});
          if (autoResult.success) {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                contents: [{
                  uri: uri,
                  mimeType: "text/markdown", // Auto-resources use formatted markdown
                  text: autoResult.content
                }]
              }
            };
          }
        } catch (error: any) {
          // If auto-resource execution fails, fall through to regular resource handling
          logger.debug(`Auto-resource execution failed for ${uri}: ${error.message}`);
        }
      }

      // Handle real resource URIs - proxy to appropriate MCP
      return await this.proxyResourceRead(uri, request.id);

    } catch (error: any) {
      logger.error(`Error reading resource: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error reading resource',
          data: error.message
        }
      };
    }
  }

  private generateResourceDiscoveryGuide(): string {
    return `# NCP Resource Discovery Guide

Welcome to NCP's resource discovery system! Instead of browsing through potentially hundreds of resources, use **semantic search** to find exactly what you need.

## How to Discover Resources

Use the \`resource\` tool with natural language queries:

### Example Searches:
- \`resource("project documentation")\` - Find README files, API docs, guides
- \`resource("configuration files")\` - Find config.json, settings, .env files
- \`resource("system metrics")\` - Find live performance data, logs, status
- \`resource("current weather")\` - Find live weather data endpoints
- \`resource("database schema")\` - Find schema definitions, database docs

### Search Modes:

#### 1. Search Mode (Recommended)
\`\`\`
resource("what you're looking for")
\`\`\`
Returns the most relevant resources with confidence scores.

#### 2. Listing Mode
\`\`\`
resource()  // No description parameter
\`\`\`
Browse all available resources with pagination.

#### 3. MCP-Specific Search
\`\`\`
resource("mcp-name:specific-resource")
\`\`\`
Filter to a specific MCP's resources.

## Using Discovered Resources

After finding resources, use their URIs with \`resources/read\`:

\`\`\`
resources/read(uri="docs://project/readme")
\`\`\`

For parameterized resources with variables like \`{city}\`:
\`\`\`
resources/read(uri="weather://current/san-francisco")
\`\`\`

## Benefits of Semantic Discovery

- **No Clutter**: See only relevant resources, not everything
- **Intelligent**: Understands what you're looking for, not just exact matches
- **Fast**: Find what you need in seconds, not minutes
- **Scalable**: Works with any number of MCPs and resources

## Need Help?

- Use \`depth=0\` for just resource names
- Use \`depth=1\` for names + descriptions
- Use \`depth=2\` for full details with URIs (default)

Start exploring with: \`resource("your search here")\`
`;
  }

  private async proxyResourceRead(uri: string, requestId: string | number): Promise<MCPResponse> {
    try {
      // Find which MCP owns this resource by checking available resources
      const allResources = await this.orchestrator.getAllResources();
      const targetResource = allResources.find(resource => resource.uri === uri);

      if (!targetResource) {
        return {
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: `Resource not found: ${uri}`
          }
        };
      }

      // Get the MCP that owns this resource
      const mcpName = targetResource._source;
      if (!mcpName) {
        return {
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32603,
            message: 'Resource has no associated MCP'
          }
        };
      }

      // Use the orchestrator's existing resource reading capability
      const content = await this.readResourceFromMCP(mcpName, uri);

      return {
        jsonrpc: '2.0',
        id: requestId,
        result: {
          contents: [{
            uri: uri,
            mimeType: targetResource.mimeType || "text/plain",
            text: content
          }]
        }
      };

    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32603,
          message: `Failed to read resource: ${error.message}`
        }
      };
    }
  }

  private async readResourceFromMCP(mcpName: string, uri: string): Promise<string> {
    // Create temporary connection to read resource
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    const definition = this.orchestrator['definitions'].get(mcpName);
    if (!definition) {
      throw new Error(`MCP definition not found: ${mcpName}`);
    }

    const transport = new StdioClientTransport({
      command: definition.config.command,
      args: definition.config.args || [],
      env: definition.config.env || {}
    });

    const client = new Client(
      { name: 'ncp-oss-resource-reader', version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
      const response = await client.readResource({ uri });
      await client.close();

      if (response.contents && response.contents.length > 0) {
        const content = response.contents[0];
        if (typeof content.text === 'string') {
          return content.text;
        }
        return JSON.stringify(content);
      }

      return 'Resource content not available';

    } catch (error) {
      await client.close();
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    try {
      await this.orchestrator.cleanup();
      logger.info('NCP MCP server shut down gracefully');
    } catch (error: any) {
      logger.error(`Error during shutdown: ${error.message}`);
    }
  }

  async run(): Promise<void> {
    await this.initialize();

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