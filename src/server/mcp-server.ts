/**
 * NCP MCP Server - SDK-based Implementation
 * Uses official @modelcontextprotocol/sdk Server class
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InitializedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';
import { logger } from '../utils/logger.js';
import { mcpProtocolLogger } from '../utils/mcp-protocol-logger.js';
import { ToolFinder } from '../services/tool-finder.js';
import { UsageTipsGenerator } from '../services/usage-tips-generator.js';
import { UnifiedRegistryClient } from '../services/unified-registry-client.js';
import { ToolSchemaParser, ParameterInfo } from '../services/tool-schema-parser.js';
import { loadGlobalSettings, isToolWhitelisted, addToolToWhitelist } from '../utils/global-settings.js';
import { NCP_PROMPTS, generateAddConfirmation, generateRemoveConfirmation, generateConfigInput, generateOperationConfirmation } from './mcp-prompts.js';
import chalk from 'chalk';
import type { ElicitationServer } from '../utils/elicitation-helper.js';
import { version } from '../utils/version.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SessionNotificationManager } from '../utils/session-notifications.js';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load and encode the NCP icon as a data URI
function getIconDataURI(): string {
  try {
    const iconPath = join(__dirname, '..', '..', 'assets', 'icons', 'ncp.png');
    const iconBuffer = readFileSync(iconPath);
    const base64Icon = iconBuffer.toString('base64');
    return `data:image/png;base64,${base64Icon}`;
  } catch (error) {
    logger.warn(`Failed to load icon: ${error}`);
    return '';
  }
}

export class MCPServer implements ElicitationServer {
  private server: Server;
  private orchestrator: NCPOrchestrator;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;
  private initializationError: Error | null = null;
  private notifications: SessionNotificationManager;

  constructor(profileName: string = 'default', showProgress: boolean = false, forceRetry: boolean = false) {
    // Initialize session-scoped notification manager
    this.notifications = new SessionNotificationManager();

    // Load icon data URI
    const iconDataURI = getIconDataURI();

    // Create SDK Server instance with elicitation capability
    this.server = new Server(
      {
        name: 'ncp',
        version: version,  // Read version from package.json dynamically
        ...(iconDataURI && { icon: { src: iconDataURI } })  // Add icon if successfully loaded
      },
      {
        capabilities: {
          tools: {},
          elicitation: {},  // Enable elicitation for credential collection
          prompts: {},      // Enable prompts for user confirmation dialogs
          resources: {},    // Enable resources for help docs and health status
        },
      }
    );

    // Profile-aware orchestrator using real MCP connections
    this.orchestrator = new NCPOrchestrator(profileName, showProgress, forceRetry);

    // Set up callback to capture clientInfo from actual client (e.g., Claude Desktop, Cursor)
    // This enables protocol transparency - passing through actual client identity to downstream MCPs
    // IMPORTANT: Must be set AFTER orchestrator creation to avoid race condition
    this.server.oninitialized = () => {
      const clientVersion = this.server.getClientVersion();
      if (clientVersion) {
        const clientInfo = {
          name: clientVersion.name || 'unknown',
          version: clientVersion.version || '1.0.0'
        };
        this.orchestrator.setClientInfo(clientInfo);
        logger.debug(`Client info captured: ${clientInfo.name} v${clientInfo.version}`);

        // Log initialize handshake to protocol log
        const serverInfo = {
          name: 'ncp',
          version,
          ...(iconDataURI && { icon: { src: iconDataURI } })
        };
        mcpProtocolLogger.logInitialize(clientInfo, serverInfo, '2024-11-05').catch(error => {
          logger.error('Failed to log initialize handshake', error);
        });

        // Trigger auto-import asynchronously (don't block initialize response)
        if (clientInfo.name && clientInfo.name !== 'unknown') {
          logger.debug(`Triggering auto-import for client: ${clientInfo.name}`);
          this.orchestrator.triggerAutoImport(
            clientInfo.name,
            this,  // elicitation server for config replacement dialog
            this.notifications  // notification manager for tips
          ).then(() => {
            logger.debug(`Auto-import completed for ${clientInfo.name}`);
          }).catch(error => {
            logger.error(`Auto-import failed for ${clientInfo.name}: ${error.message}`);
          });
        } else {
          logger.debug(`Skipping auto-import - clientInfo.name: ${clientInfo.name}`);
        }
      }
    };

    // BUGFIX: Manually register notification handler to ensure oninitialized gets called
    // The SDK's constructor already set up a handler, but it captured undefined.
    // We need to re-register it after setting the callback.
    this.server.setNotificationHandler(InitializedNotificationSchema, () => {
      if (this.server.oninitialized) {
        this.server.oninitialized();
      }
    });

    // Wire up elicitation server to internal MCPs IMMEDIATELY
    // This must happen before initialization so confirmations work from the start
    const internalMCPManager = this.orchestrator.getInternalMCPManager();
    if (internalMCPManager) {
      internalMCPManager.setElicitationServer(this);
      logger.info('Elicitation enabled for internal MCPs (clipboard-based credential collection)');
    }

    // Set up request handlers
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      await mcpProtocolLogger.logRequest('tools/list', {});
      const result = {
        tools: this.getToolDefinitions(),
      };
      await mcpProtocolLogger.logResponse('tools/list', result);
      return result;
    });

    // Handle tools/call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Log request
      await mcpProtocolLogger.logRequest('tools/call', { name, arguments: args });

      try {
        let result;
        switch (name) {
          case 'find':
            result = await this.handleFind(args);
            break;

          case 'run':
            result = await this.handleRun(args);
            break;

          default:
            // Suggest similar methods
            const suggestions = this.getSuggestions(name, ['find', 'run']);
            const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';

            result = {
              content: [{
                type: 'text',
                text: `Method not found: '${name}'. NCP supports 'find' and 'run' methods.${suggestionText} Use 'find()' to discover available tools.`
              }],
              isError: true,
            };
        }

        // Append notifications to response (if any)
        if (this.notifications.hasNotifications() && result.content && result.content.length > 0) {
          const notificationText = this.notifications.formatForResponse();
          const firstContent = result.content[0];
          if (firstContent.type === 'text') {
            firstContent.text += notificationText;
          }
        }

        // Log successful response
        await mcpProtocolLogger.logResponse('tools/call', result);
        return result;
      } catch (error: any) {
        logger.error(`Tool execution failed: ${name} - ${error.message}`);

        // Log to error log
        mcpProtocolLogger.logError(error, `tools/call:${name}`).catch(() => {});

        const errorResult = {
          content: [{
            type: 'text',
            text: error.message || 'Tool execution failed'
          }],
          isError: true,
        };

        // Log error response
        await mcpProtocolLogger.logResponse('tools/call', null, {
          code: 'TOOL_EXECUTION_FAILED',
          message: error.message
        });

        return errorResult;
      }
    });

    // Handle prompts/list
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: NCP_PROMPTS
      };
    });

    // Handle prompts/get
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        return await this.handleGetPromptInternal(name, args || {});
      } catch (error: any) {
        logger.error(`Prompt generation failed: ${name} - ${error.message}`);
        throw error;
      }
    });

    // Handle resources/list
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: await this.handleListResources()
      };
    });

    // Handle resources/read
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      await mcpProtocolLogger.logRequest('resources/read', { uri });

      try {
        const result = await this.handleReadResource(uri);
        await mcpProtocolLogger.logResponse('resources/read', result);
        return result;
      } catch (error: any) {
        logger.error(`Resource read failed: ${uri} - ${error.message}`);

        // Log to error log
        mcpProtocolLogger.logError(error, `resources/read:${uri}`).catch(() => {});

        await mcpProtocolLogger.logResponse('resources/read', null, {
          code: 'RESOURCE_READ_FAILED',
          message: error.message
        });
        throw error;
      }
    });
  }

  private getToolDefinitions(): Tool[] {
    // Start with core NCP tools
    const coreTools: Tool[] = [
      {
        name: 'find',
        description: 'Dual-mode tool discovery: (1) SEARCH MODE: Use with description parameter for intelligent vector search - describe your task or capability: "save file", "analyze logs", "send email". For multiple capabilities at once, use pipe separator: "read gmail | send slack | create issue". (2) LISTING MODE: Call without description parameter for paginated browsing of all available MCPs and tools with depth control (0=tool names only, 1=tool names + descriptions, 2=full details with parameters).',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'SEARCH MODE: Search query describing what you want to do ("save file", "read database", "send message") or MCP name to filter results. For multiple queries, use pipe separator: "read gmail | send slack". LISTING MODE: Omit this parameter entirely to browse all available MCPs and tools with pagination.'
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

    // Internal MCPs are indexed and accessible via find/run, not exposed as direct tools
    // This keeps the tool list minimal (only 2 tools) to avoid overwhelming AI

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

      // Log to error log
      mcpProtocolLogger.logError(error, 'orchestrator:initialize').catch(() => {});

      this.initializationError = error; // Store error for later checking
      this.isInitialized = true; // Mark as initialized even on error to unblock
    });

    // Don't wait for indexing to complete - return immediately
    logger.info('NCP MCP server ready (indexing in background)');
  }

  async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      // If initialization failed, throw the stored error
      if (this.initializationError) {
        throw new Error(`Server initialization failed: ${this.initializationError.message}`, {
          cause: this.initializationError
        });
      }
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      // Check again after waiting
      if (this.initializationError) {
        throw new Error(`Server initialization failed: ${this.initializationError.message}`, {
          cause: this.initializationError
        });
      }
    }
  }

  /**
   * Public method for CLI to call tools programmatically
   * @param toolName - Name of the tool to call ('find' or 'run')
   * @param args - Tool arguments
   * @returns Tool result
   */
  async callTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'find':
        return await this.handleFind(args);
      case 'run':
        return await this.handleRun(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Public method for tests to send JSON-RPC requests
   * @param request - JSON-RPC request object
   * @returns JSON-RPC response object
   */
  async handleRequest(request: any): Promise<any> {
    // Validate JSON-RPC request
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32600, message: 'Invalid Request' }
      };
    }

    // Forward to the SDK server's internal request handler
    // The SDK server handles the JSON-RPC protocol internally
    const method = request.method;

    if (method === 'initialize') {
      // Load icon for test responses
      const iconDataURI = getIconDataURI();

      // Return initialization response
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            elicitation: {}
          },
          serverInfo: {
            name: 'ncp',
            version,
            ...(iconDataURI && { icon: { src: iconDataURI } })  // Add icon if successfully loaded
          }
        }
      };
    } else if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            { name: 'find', description: 'Dual-mode tool discovery', inputSchema: {} },
            { name: 'run', description: 'Execute tools', inputSchema: {} }
          ]
        }
      };
    } else if (method === 'tools/call') {
      const toolName = request.params?.name;
      const args = request.params?.arguments || {};

      try {
        const result = await this.callTool(toolName, args);

        return {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } catch (error: any) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: error.message || 'Tool execution failed'
          }
        };
      }
    } else if (method === 'resources/list') {
      const resources = await this.handleListResources();
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { resources }
      };
    } else if (method === 'resources/read') {
      const uri = request.params?.uri;
      if (!uri) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32602, message: 'Missing required parameter: uri' }
        };
      }

      try {
        const result = await this.handleReadResource(uri);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } catch (error: any) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: error.message || 'Failed to read resource' }
        };
      }
    } else if (method === 'prompts/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { prompts: [] }
      };
    } else if (method.startsWith('notifications/')) {
      // Notifications don't get responses
      return undefined;
    } else {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method not found' }
      };
    }
  }

  /**
   * Public method for tests to call prompts/list
   * @param request - JSON-RPC request object
   * @returns JSON-RPC response with prompts list
   */
  async handleListPrompts(request: any): Promise<any> {
    try {
      // Get all MCP prompts from orchestrator
      const mcpPrompts = await this.orchestrator.getAllPrompts();

      // Combine NCP prompts and MCP prompts
      const allPrompts = [...NCP_PROMPTS, ...mcpPrompts];

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          prompts: allPrompts
        }
      };
    } catch (error) {
      // Fallback to NCP prompts only if orchestrator fails
      logger.warn(`Failed to get MCP prompts, falling back to NCP only: ${error}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          prompts: NCP_PROMPTS
        }
      };
    }
  }

  /**
   * Public method for tests to call prompts/get
   * @param request - JSON-RPC request object with params.name and params.arguments
   * @returns JSON-RPC response with prompt content
   */
  async handleGetPrompt(request: any): Promise<any> {
    const promptName = request.params?.name;

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

    const args = request.params?.arguments || {};

    // Check if it's an MCP prompt (has prefix format "mcp_name:prompt_name")
    if (promptName.includes(':')) {
      const [mcpName, ...promptParts] = promptName.split(':');
      const actualPromptName = promptParts.join(':'); // Handle multiple colons in prompt name

      try {
        const result = await this.orchestrator.getPromptFromMCP(mcpName, actualPromptName, args);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } catch (error: any) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: error.message || 'Failed to get MCP prompt'
          }
        };
      }
    }

    // Handle NCP prompts
    try {
      const result = await this.handleGetPromptInternal(promptName, args);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error.message || 'Failed to get prompt'
        }
      };
    }
  }

  private async handleGetPromptInternal(promptName: string, args: Record<string, any>): Promise<any> {
    // Find the prompt definition
    const promptDef = NCP_PROMPTS.find(p => p.name === promptName);

    if (!promptDef) {
      throw new Error(`Unknown prompt: ${promptName}`);
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
        throw new Error(`Prompt ${promptName} not implemented`);
    }

    return {
      description: promptDef.description,
      messages
    };
  }

  private async handleMultiQuery(queries: string[], options: any): Promise<any> {
    const { limit, depth, confidenceThreshold, isStillIndexing } = options;
    const finder = new ToolFinder(this.orchestrator);

    // Execute parallel searches for all queries
    const searchResults = await Promise.all(
      queries.map(query =>
        finder.find({
          query,
          page: 1,
          limit,
          depth,
          confidenceThreshold
        })
      )
    );

    // Get indexing progress if still indexing
    const progress = isStillIndexing ? this.orchestrator.getIndexingProgress() : null;

    // Get health status
    const healthStatus = this.orchestrator.getMCPHealthStatus();

    // Format multi-query results
    let output = `\n🔍 Found tools for ${queries.length} queries:\n\n`;

    // Add MCP health status summary
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
    }

    // Display results for each query
    searchResults.forEach((result, index) => {
      const query = queries[index];
      const { tools: results } = result;

      output += `**Query ${index + 1}:** ${chalk.inverse(` ${query} `)}\n`;

      if (results.length === 0) {
        output += `   ❌ No tools found\n\n`;
      } else {
        output += `   Found ${results.length} tool${results.length > 1 ? 's' : ''}:\n`;
        results.forEach((tool: any) => {
          const healthIcon = tool.healthy !== false ? '✅' : '❌';
          const description = depth >= 1 ? tool.description : '';
          output += `   ${healthIcon} ${chalk.bold(tool.name)}`;
          if (description && depth >= 1) {
            output += ` - ${description}`;
          }
          output += '\n';
        });
        output += '\n';
      }
    });

    // Add total tools found summary
    const totalTools = searchResults.reduce((sum, r) => sum + r.tools.length, 0);
    output += `\n📊 **Total**: ${totalTools} tool${totalTools !== 1 ? 's' : ''} found across ${queries.length} queries\n`;

    return { content: [{ type: 'text', text: output }] };
  }

  private async handleFind(args: any): Promise<any> {
    const isStillIndexing = !this.isInitialized && this.initializationPromise;

    const description = args?.description || '';
    const page = Math.max(1, args?.page || 1);
    const limit = args?.limit || (description ? 5 : 20);
    const depth = args?.depth !== undefined ? Math.max(0, Math.min(2, args.depth)) : 2;
    const confidenceThreshold = args?.confidence_threshold !== undefined ? args.confidence_threshold : 0.35;

    // Check for pipe-delimited multi-query
    const queries = description.includes('|')
      ? description.split('|').map((q: string) => q.trim()).filter((q: string) => q.length > 0)
      : null;

    // Handle multi-query case
    if (queries && queries.length > 1) {
      return this.handleMultiQuery(queries, { page, limit, depth, confidenceThreshold, isStillIndexing });
    }

    // Use ToolFinder service for single-query search logic
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
        const registryClient = new UnifiedRegistryClient();
        const registryCandidates = await registryClient.searchForSelection(description);

        if (registryCandidates.length > 0) {
          output += `💡 **I don't have this capability yet, but found ${registryCandidates.length} MCP${registryCandidates.length > 1 ? 's' : ''} in the registry:**\n\n`;

          const topCandidates = registryCandidates.slice(0, 5);
          topCandidates.forEach(candidate => {
            const statusBadge = candidate.status === 'active' ? '⭐' : '📦';
            const envInfo = candidate.envVars?.length ? ` ⚠️ Requires ${candidate.envVars.length} env var${candidate.envVars.length > 1 ? 's' : ''}` : '';
            output += `${candidate.number}. ${statusBadge} **${candidate.displayName}**${envInfo}\n`;
            output += `   ${candidate.description}\n`;
            output += `   Version: ${candidate.version}\n\n`;
          });

          output += `\n🚀 **To install:**\n\n`;

          // Check if query is a simple MCP name (single word, likely a direct MCP name)
          const isMicroMCPName = description.trim().split(/\s+/).length === 1;

          if (isMicroMCPName) {
            // For simple queries like "canva", prioritize direct add
            output += `**Option 1: Try direct add (recommended for exact names):**\n`;
            output += `\`\`\`\nrun("ncp:add", {\n`;
            output += `  mcp_name: "${description}"\n`;
            output += `})\n\`\`\`\n\n`;

            output += `**Option 2: Install from registry results:**\n`;
            output += `\`\`\`\nrun("ncp:import", {\n`;
            output += `  from: "discovery",\n`;
            output += `  source: "${description}",\n`;
            output += `  selection: "1"  // or "1,3,5" for multiple\n`;
            output += `})\n\`\`\`\n\n`;
          } else {
            // For descriptive queries, prioritize registry search
            output += `**Option 1: Install from registry (recommended):**\n`;
            output += `\`\`\`\nrun("ncp:import", {\n`;
            output += `  from: "discovery",\n`;
            output += `  source: "${description}",\n`;
            output += `  selection: "1"  // or "1,3,5" for multiple, or "*" for all\n`;
            output += `})\n\`\`\`\n\n`;

            output += `**Option 2: If you know the exact MCP name:**\n`;
            output += `\`\`\`\nrun("ncp:add", {\n`;
            output += `  mcp_name: "<exact-mcp-name>"\n`;
            output += `})\n\`\`\`\n\n`;
          }

          output += `💡 *MCPs will be available after NCP restarts.*`;

          return {
            content: [{ type: 'text', text: output }]
          };
        }
      } catch (error: any) {
        logger.warn(`Registry search failed: ${error.message}`);
      }

      // Fallback: No registry results, suggest direct add or show samples
      const isMicroMCPName = description.trim().split(/\s+/).length === 1;

      if (isMicroMCPName) {
        // For simple queries, suggest trying direct add first
        output += `💡 **Try adding directly:**\n\n`;
        output += `\`\`\`\nrun("ncp:add", {\n`;
        output += `  mcp_name: "${description}"\n`;
        output += `})\n\`\`\`\n\n`;
        output += `This will search for an MCP named "${description}" and guide you through installation.\n\n`;
      }

      const samples = await finder.getSampleTools(8);

      if (samples.length > 0) {
        output += `📝 **Or explore these available MCPs:**\n`;
        samples.forEach(sample => {
          output += `📁 **${sample.mcpName}** - ${sample.description}\n`;
        });
        output += `\n💡 *Try broader search terms or browse registry at https://smithery.ai*`;
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
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.initializationPromise,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), 2000);
          })
        ]);
      } catch {
        // Continue even if timeout - try to execute with what's available
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    }

    if (!args?.tool) {
      throw new Error('tool parameter is required');
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

    // ===== CONFIRM-BEFORE-RUN FEATURE =====
    // Check if this operation requires user confirmation
    try {
      const settings = await loadGlobalSettings();
      const confirmSettings = settings.confirmBeforeRun;

      if (confirmSettings.enabled) {
        // Check whitelist first
        const isWhitelisted = await isToolWhitelisted(toolIdentifier);

        if (!isWhitelisted) {
          // Get tool description by searching for the tool
          const finder = new ToolFinder(this.orchestrator);
          const findResult = await finder.find({
            query: toolIdentifier,
            page: 1,
            limit: 1,
            depth: 2,
            confidenceThreshold: 0
          });

          const toolDescription = findResult.tools.length > 0 ? findResult.tools[0].description || '' : '';

          // Use vector search to check if tool matches modifier pattern
          // We search the tools against the modifier pattern to see if this tool is dangerous
          const searchQuery = `${toolIdentifier} ${toolDescription}`;
          const patternResults = await finder.find({
            query: confirmSettings.modifierPattern,
            page: 1,
            limit: 20,
            depth: 0,
            confidenceThreshold: confirmSettings.vectorThreshold
          });

          // Check if our tool is in the match results
          const toolMatch = patternResults.tools.find(result => result.toolName === toolIdentifier);

          if (toolMatch && toolMatch.confidence >= confirmSettings.vectorThreshold) {
            // Confirmation required - use elicitation
            logger.info(`Tool "${toolIdentifier}" requires confirmation (${Math.round(toolMatch.confidence * 100)}% confidence)`);

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
            const confidencePercent = Math.round(toolMatch.confidence * 100);

            const confirmationMessage = `⚠️ CONFIRMATION REQUIRED

Tool: ${toolName}
MCP: ${mcpName}

Description:
${toolDescription || 'No description available'}${parametersText}

Reason: Matches modifier pattern (${confidencePercent}% confidence)
Pattern: "${confirmSettings.modifierPattern.substring(0, 100)}..."

This operation may modify data or have side effects.`;

            // Use elicitation to get user confirmation
            const elicitationResult = await this.elicitInput({
              message: confirmationMessage,
              requestedSchema: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['approve_once', 'approve_always', 'cancel'],
                    description: 'Choose: approve_once (run this time only), approve_always (add to whitelist), or cancel (don\'t execute)'
                  }
                },
                required: ['action']
              }
            });

            // Handle user response
            if (elicitationResult.action === 'decline' || elicitationResult.action === 'cancel') {
              return {
                content: [{
                  type: 'text',
                  text: `⛔ Operation cancelled by user. The tool "${toolIdentifier}" was not executed.`
                }],
                isError: true
              };
            }

            if (elicitationResult.action === 'accept' && elicitationResult.content) {
              const userAction = elicitationResult.content.action;

              if (userAction === 'cancel') {
                return {
                  content: [{
                    type: 'text',
                    text: `⛔ Operation cancelled by user. The tool "${toolIdentifier}" was not executed.`
                  }],
                  isError: true
                };
              }

              if (userAction === 'approve_always') {
                // Add to whitelist
                await addToolToWhitelist(toolIdentifier);
                logger.info(`Tool ${toolIdentifier} added to whitelist by user`);
              }

              // For both 'approve_once' and 'approve_always', proceed with execution below
              logger.info(`User approved execution of "${toolIdentifier}" (${userAction})`);
            }
          }
        }
      }
    } catch (error: any) {
      // Log but don't block execution if confirmation logic fails
      logger.warn(`Confirmation check failed: ${error.message}`);
    }
    // ===== END CONFIRM-BEFORE-RUN =====

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
   * Handle resources/list request
   */
  private async handleListResources(): Promise<any[]> {
    // Add NCP-specific help resources first (always available)
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

    // Only get MCP resources if orchestrator is initialized (non-blocking)
    if (this.isInitialized) {
      try {
        const mcpResources = await this.orchestrator.getAllResources();
        return [...ncpResources, ...(mcpResources || [])];
      } catch (error: any) {
        logger.warn(`Failed to get MCP resources: ${error.message}`);
        return ncpResources;
      }
    }

    // Return just NCP resources if still initializing
    return ncpResources;
  }

  /**
   * Handle resources/read request
   */
  private async handleReadResource(uri: string): Promise<any> {
    // Handle NCP-specific resources (always available)
    if (uri.startsWith('ncp://')) {
      const content = await this.generateNCPResourceContent(uri);
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: content
        }]
      };
    }

    // Delegate to orchestrator for MCP resources (only if initialized)
    if (this.isInitialized) {
      try {
        const mcpContent = await this.orchestrator.readResource(uri);
        return {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: mcpContent
          }]
        };
      } catch (error: any) {
        throw new Error(`Failed to read resource: ${error.message}`);
      }
    }

    // If still initializing, return error
    throw new Error(`Resource not available during initialization: ${uri}`);
  }

  /**
   * Generate NCP-specific resource content
   */
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

  /**
   * Generate getting started guide
   */
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

  /**
   * Generate health dashboard
   */
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
    content += `**Last Updated**: ${new Date().toLocaleString()}\n`;

    return content;
  }

  /**
   * Generate auto-import summary
   */
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

  /**
   * Elicitation API for credential collection
   * Implements the ElicitationServer interface to enable clipboard-based credential collection
   *
   * Note: Includes 5-second timeout to detect unsupported clients quickly
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
      // Add 5-second timeout to detect if client doesn't support elicitation
      // If client supports it, response comes immediately
      // If client doesn't support it, request hangs - we treat timeout as "not supported"
      const result = await Promise.race([
        this.server.elicitInput(params),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            // Throw error -32601 (Method not found) to trigger native dialog fallback
            const error: any = new Error('Elicitation not supported by client (timeout after 5s)');
            error.code = -32601;
            reject(error);
          }, 5000)
        )
      ]);

      // Transform SDK result to our interface format
      return {
        action: result.action,
        content: result.content
      };
    } catch (error: any) {
      logger.error(`Elicitation failed: ${error.message}`);
      // Re-throw the error so ncp-management.ts can catch it and use native dialog fallback
      throw error;
    }
  }
}

export default MCPServer;
