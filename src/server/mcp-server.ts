/**
 * NCP MCP Server - Clean 2-Method Architecture
 * Exposes exactly 2 methods: discover + execute
 */

import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';
import { logger } from '../utils/logger.js';
import { updater } from '../utils/updater.js';

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

  constructor(profileName: string = 'default') {
    // Profile-aware orchestrator using real MCP connections
    this.orchestrator = new NCPOrchestrator(profileName);
  }

  async initialize(): Promise<void> {
    logger.info('Starting NCP MCP server');
    await this.orchestrator.initialize();
    logger.info('NCP MCP server ready');
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
          name: 'ncp-oss',
          version: '1.0.0'
        }
      }
    };
  }

  private async handleListTools(request: MCPRequest): Promise<MCPResponse> {
    // NCP core 2-method architecture
    const tools: MCPTool[] = [
      {
        name: 'find',
        description: 'Find tools using natural language or list available tools with pagination. IMPORTANT: Search with MCP name (e.g., "filesystem", "portel", "memory") to see all tools from that specific MCP. Use descriptive queries (e.g., "file operations", "write file") for cross-MCP search. Call with NO PARAMETERS to see MCP overview.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Search query: Use MCP name ("filesystem", "portel", "memory") to filter to specific MCP, or descriptive terms ("file operations", "write file") for cross-MCP search. Omit to see MCP overview.'
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
              description: 'Minimum confidence level for search results (0.0-1.0, default: 0.3). Lower values show more loosely related tools.'
            },
            depth: {
              type: 'number',
              description: 'Tree depth level: 0=MCPs only (quick overview), 1=MCPs+Tools (names only), 2=Full details with parameters (recommended for AI - default)',
              enum: [0, 1, 2],
              default: 2
            }
          }
        }
      },
      {
        name: 'run',
        description: 'Execute a specific tool with parameters. Use this when you know exactly which tool you want to run.',
        inputSchema: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'The specific tool name to execute (format: "mcp_name:tool_name"). Use find() to discover available tools.'
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
    const description = args?.description || '';
    const page = Math.max(1, args?.page || 1);
    const limit = args?.limit || (description ? 5 : 20);
    const depth = args?.depth !== undefined ? Math.max(0, Math.min(2, args.depth)) : 2; // Tree depth: 0=MCPs, 1=MCPs+Tools, 2=Full Details (default: 2 for AI-friendly experience)

    // Detect MCP-specific search (e.g., "portel" -> show only portel tools)
    const mcpFilter = this.detectMCPFilter(description);

    // Get all results first for pagination calculation
    // For MCP filters, get all tools then filter. For semantic search, use the description.
    const searchQuery = mcpFilter ? '' : description;
    const allResults = await this.orchestrator.find(searchQuery, 1000, depth >= 1);

    // Apply MCP filtering if detected
    const filteredResults = mcpFilter ?
      allResults.filter(r => r.mcpName.toLowerCase() === mcpFilter.toLowerCase()) :
      allResults;

    // Calculate pagination
    const totalResults = filteredResults.length;
    const totalPages = Math.ceil(totalResults / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, totalResults);
    const results = filteredResults.slice(startIndex, endIndex);

    // Group results by MCP
    const mcpGroups: Record<string, Array<{toolName: string, confidence: number, description?: string, schema?: any}>> = {};
    results.forEach(result => {
      if (!mcpGroups[result.mcpName]) {
        mcpGroups[result.mcpName] = [];
      }
      mcpGroups[result.mcpName].push({
        toolName: result.toolName,
        confidence: result.confidence,
        description: result.description,
        schema: result.schema
      });
    });

    const queryText = description ? `"${description}"` : 'all available tools';
    const filterText = mcpFilter ? ` (filtered to ${mcpFilter})` : '';

    // Enhanced pagination display
    const paginationInfo = totalPages > 1 ?
      ` | Page ${page} of ${totalPages} (showing ${results.length} of ${totalResults} results)` :
      ` (${totalResults} results)`;

    let output = `🔍 Found tools for ${queryText}${filterText}${paginationInfo}:\n\n`;

    // Handle no results case
    if (results.length === 0) {
      output = `❌ No tools found for "${description}"\n\n`;

      // Show sample of available MCPs
      const sampleTools = await this.orchestrator.find('', 8);
      const sampleMCPs = [...new Set(sampleTools.map(t => t.mcpName))];

      if (sampleMCPs.length > 0) {
        output += `📝 Available MCPs to explore:\n`;
        sampleMCPs.forEach(mcpName => {
          output += `📁 **${mcpName}** - ${this.getMCPDescription(mcpName)}\n`;
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

    // Check if this is a listing (no query) or search (with query)
    const isListing = !description || description.trim() === '';

    // Format output based on depth and mode
    if (depth === 0) {
      // Depth 0: Tool names only (no parameters, no descriptions)
      Object.entries(mcpGroups).forEach(([mcpName, tools]) => {
        tools.forEach((tool) => {
          if (isListing) {
            output += `# **${tool.toolName}**\n`;
          } else {
            const confidence = Math.round(tool.confidence * 100);
            output += `# **${tool.toolName}** (${confidence}% match)\n`;
          }
        });
      });
    } else if (depth === 1) {
      // Depth 1: Tool name + description only (no parameters)
      let toolIndex = 0;
      Object.entries(mcpGroups).forEach(([mcpName, tools]) => {
        tools.forEach((tool) => {
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

          toolIndex++;
        });
      });
    } else {
      // Depth 2: Full details with parameter descriptions
      let toolIndex = 0;
      Object.entries(mcpGroups).forEach(([mcpName, tools]) => {
        tools.forEach((tool) => {
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

          toolIndex++;
        });
      });
    }
    output += '\n';

    // Add comprehensive usage guidance
    output += await this.generateUsageTips(depth, page, totalPages, limit, totalResults, description, mcpFilter);

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


  private parseParameters(schema: any): Array<{name: string, type: string, required: boolean, description?: string}> {
    const params: Array<{name: string, type: string, required: boolean, description?: string}> = [];

    if (!schema || typeof schema !== 'object') {
      return params;
    }

    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const [name, prop] of Object.entries(properties)) {
      const propDef = prop as any;
      params.push({
        name,
        type: propDef.type || 'unknown',
        required: required.includes(name),
        description: propDef.description
      });
    }

    return params;
  }

  private wrapText(text: string, maxWidth: number, indent: string): string {
    if (!text) {
      return text;
    }

    // Clean up the text: remove extra whitespace, newlines, and MCP prefixes
    const cleanText = text
      .replace(/^[^:]+:\s*/, '') // Remove "desktop-commander: " prefix
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .trim();

    if (cleanText.length <= maxWidth) {
      return cleanText;
    }

    const words = cleanText.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word longer than maxWidth
          lines.push(word);
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Join lines with proper indentation for continuation
    return lines.map((line, index) =>
      index === 0 ? line : `\n${indent}${line}`
    ).join('');
  }

  private getMCPDescription(mcpName: string): string {
    const descriptions: Record<string, string> = {
      'filesystem': 'File and directory operations',
      'memory': 'Knowledge graph and entity storage',
      'shell': 'System command execution',
      'sequential-thinking': 'Step-by-step reasoning and analysis',
      'portel': 'Code analysis and development tools',
      'tavily': 'Web search and information retrieval',
      'stripe': 'Payment processing and billing',
      'context7-mcp': 'Documentation and library context',
      'desktop-commander': 'Desktop automation and control'
    };
    return descriptions[mcpName] || 'MCP server tools';
  }

  private detectMCPFilter(description: string): string | null {
    if (!description) return null;

    // Get list of available MCPs from the descriptions
    const availableMCPs = ['filesystem', 'memory', 'shell', 'sequential-thinking', 'portel', 'tavily', 'stripe', 'context7-mcp', 'desktop-commander'];

    // Check if description is exactly an MCP name or starts with MCP name
    const lowerDesc = description.toLowerCase().trim();

    for (const mcpName of availableMCPs) {
      if (lowerDesc === mcpName.toLowerCase() || lowerDesc.startsWith(mcpName.toLowerCase() + ' ')) {
        return mcpName;
      }
    }

    return null;
  }

  private async generateUsageTips(depth: number, page: number, totalPages: number, limit: number, totalResults: number, description: string, mcpFilter: string | null): Promise<string> {
    let tips = '\n\n💡 **Usage Tips**:\n';

    // Depth guidance
    if (depth === 0) {
      tips += `• **See tools**: Use \`--depth 1\` to see tool names or \`--depth 2\` for full details\n`;
    } else if (depth === 1) {
      tips += `• **See details**: Use \`--depth 2\` for parameter schemas (recommended for AI)\n`;
      tips += `• **Quick overview**: Use \`--depth 0\` for just MCP names\n`;
    } else {
      tips += `• **Less detail**: Use \`--depth 1\` for tool names only or \`--depth 0\` for MCP overview\n`;
    }

    // Pagination guidance
    if (totalPages > 1) {
      tips += `• **Navigation**: `;
      if (page < totalPages) {
        tips += `\`--page ${page + 1}\` for next page, `;
      }
      if (page > 1) {
        tips += `\`--page ${page - 1}\` for previous, `;
      }
      tips += `\`--limit ${Math.min(limit * 2, 50)}\` for more per page\n`;
    } else if (totalResults > limit) {
      tips += `• **See more**: Use \`--limit ${Math.min(totalResults, 50)}\` to see all ${totalResults} results\n`;
    } else if (limit > 10 && totalResults < limit) {
      tips += `• **Smaller pages**: Use \`--limit 5\` for easier browsing\n`;
    }

    // Search guidance
    if (!description) {
      tips += `• **Search examples**: \`ncp --find "filesystem"\` (MCP filter) or \`ncp --find "write file"\` (cross-MCP search)\n`;
    } else if (mcpFilter) {
      tips += `• **Broader search**: Remove MCP name from query for cross-MCP results\n`;
    } else {
      tips += `• **Filter to MCP**: Use MCP name like \`ncp --find "filesystem"\` to see only that MCP's tools\n`;
    }

    // Tool execution guidance
    tips += `• **Run tools**: Use \`ncp --run <tool_name> --params '{"param": "value"}'\` to execute\n`;

    // Check for updates (non-blocking)
    try {
      const updateTip = await updater.getUpdateTip();
      if (updateTip) {
        tips += `• ${updateTip}\n`;
      }
    } catch {
      // Fail silently - don't let update checks break the find command
    }

    return tips;
  }

  private formatSchema(schema: any): string {
    // Use commercial NCP's battle-tested parameter formatting
    if (!schema || typeof schema !== 'object') {
      return "none";
    }

    const { type, properties, required = [] } = schema;

    if (!properties || typeof properties !== 'object') {
      return "none";
    }

    const paramLines: string[] = [];

    // Group parameters by required/optional (commercial approach)
    const requiredParams: string[] = [];
    const optionalParams: string[] = [];

    for (const [name, paramSchema] of Object.entries(properties)) {
      const isRequired = required.includes(name);
      const ps = paramSchema as any;
      const paramType = ps.type || 'any';
      const description = ps.description || '';

      const paramString = `${name} (${paramType})${description ? ': ' + description.split('.')[0] : ''}`;

      if (isRequired) {
        requiredParams.push(paramString);
      } else {
        optionalParams.push(paramString);
      }
    }

    if (requiredParams.length > 0) {
      paramLines.push('Required: ' + requiredParams.join(', '));
    }

    if (optionalParams.length > 0) {
      paramLines.push('Optional: ' + optionalParams.join(', '));
    }

    return paramLines.length > 0 ? paramLines.join(' | ') : "none";
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
      const resources = await this.orchestrator.getAllResources();
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resources: resources || []
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

export default MCPServer;