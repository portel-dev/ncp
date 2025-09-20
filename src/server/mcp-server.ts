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
import { UsageTipsGenerator } from '../services/usage-tips-generator.js';
import { TextUtils } from '../utils/text-utils.js';

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
        description: 'AI-powered intelligent tool discovery with vector similarity search and bidirectional domain mapping. Understands natural language queries and maps user intent to actual tool capabilities. FEATURES: Vector RAG search finds semantically similar tools; Domain-to-capability mapping connects queries like "git-commit" to tools that can execute git commands; Cross-MCP intelligent search; Bidirectional mapping where terminal tools advertise git/development capabilities; Context-aware scoring that distinguishes actual capabilities from incidental mentions. USAGE: Search with MCP name ("filesystem", "portel", "memory") to filter to specific MCP, or use natural language ("file operations", "git commit", "terminal command") for intelligent cross-MCP discovery. Returns tools ranked by relevance with confidence scores. Call with NO PARAMETERS for MCP overview.',
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
        description: 'Intelligent tool execution with automatic discovery and failure recovery. Accepts both exact tool names and natural language queries. FEATURES: Single-word intelligent search automatically finds matching tools when exact name not provided; Shows multiple options with confidence scores for user selection; Automatic alternative suggestions when tools are unavailable or fail; Domain-aware tool discovery that connects intent to capabilities; Graceful failure recovery with contextual alternatives; Works with tool names, partial names, or natural language descriptions. USAGE: Use exact tool name (mcp_name:tool_name) for direct execution, or natural language ("git-commit", "read file") for intelligent discovery. System will find best matches and guide you to working tools.',
        inputSchema: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'Tool to execute. Accepts: (1) Exact tool name "mcp_name:tool_name" for direct execution, (2) Partial/natural language queries like "git-commit", "read file", "terminal command" for intelligent discovery, (3) Single words like "commit" that trigger automatic tool search with ranked suggestions. System will find best matches and guide you to appropriate tools.'
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

    const queryText = description ? `"${description}"` : 'all available tools';
    const filterText = mcpFilter ? ` (filtered to ${mcpFilter})` : '';

    // Enhanced pagination display
    const paginationInfo = pagination.totalPages > 1 ?
      ` | Page ${pagination.page} of ${pagination.totalPages} (showing ${pagination.resultsInPage} of ${pagination.totalResults} results)` :
      ` (${pagination.totalResults} results)`;

    let output = `🔍 Found tools for ${queryText}${filterText}${paginationInfo}:\n\n`;

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

export class ParameterPredictor {
  predictValue(paramName: string, paramType: string, toolContext: string, description?: string): any {
    const name = paramName.toLowerCase();
    const desc = (description || '').toLowerCase();

    // String type predictions
    if (paramType === 'string') {
      return this.predictStringValue(name, desc, toolContext);
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

  private predictStringValue(name: string, desc: string, context: string): string {
    // File and path patterns
    if (name.includes('path') || name.includes('file') || desc.includes('path') || desc.includes('file')) {
      if (context === 'filesystem') {
        if (name.includes('dir') || desc.includes('directory')) {
          return '/home/user/documents';
        }
        if (name.includes('config') || desc.includes('config')) {
          return '/etc/config.json';
        }
        return '/home/user/document.txt';
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