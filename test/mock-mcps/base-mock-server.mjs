#!/usr/bin/env node

/**
 * Base Mock MCP Server
 * Provides a template for creating realistic MCP servers for testing
 * These servers respond to MCP protocol but don't actually execute tools
 */

console.error('[DEBUG] Loading base mock server module...');

// Import SDK modules and debug each import step
let Server;
let StdioServerTransport;
let McpTypes;
import { z } from 'zod';

try {
  const serverModule = await import('@modelcontextprotocol/sdk/server/index.js');
  Server = serverModule.Server;
  console.error('[DEBUG] Successfully loaded Server module');
} catch (err) {
  console.error('[ERROR] Failed to load Server module:', err);
  throw err;
}

try {
  const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
  StdioServerTransport = stdioModule.StdioServerTransport;
  console.error('[DEBUG] Successfully loaded StdioServerTransport module');
} catch (err) {
  console.error('[ERROR] Failed to load StdioServerTransport module:', err);
  throw err;
}

try {
  McpTypes = await import('@modelcontextprotocol/sdk/types.js');
  console.error('[DEBUG] Successfully loaded McpTypes module. Exports:', Object.keys(McpTypes));
} catch (err) {
  console.error('[ERROR] Failed to load McpTypes module:', err);
  throw err;
}

// Log exports for debugging
console.error('[DEBUG] Available MCP types:', Object.keys(McpTypes));

class MockMCPServer {
  constructor(serverInfo, tools, resources = [], capabilities = {
    tools: {
      listTools: true,
      callTool: true,
      find: true,
    },
    resources: {},
  }) {
    console.error('[DEBUG] MockMCPServer constructor called');
    console.error('[DEBUG] Server info:', JSON.stringify(serverInfo, null, 2));
    console.error('[DEBUG] Capabilities:', JSON.stringify(capabilities, null, 2));
    
    this.serverInfo = serverInfo; // Store server info for reference
    
    try {
      this.server = new Server(serverInfo, { capabilities });
      console.error('[DEBUG] Server instance created successfully');
    } catch (err) {
      console.error('[ERROR] Failed to create Server instance:', err);
      console.error('[ERROR] Error stack:', err.stack);
      throw err;
    }
    
    this.tools = tools;
    this.resources = resources;
    
    try {
      this.setupHandlers();
      console.error('[DEBUG] Handlers set up successfully');
    } catch (err) {
      console.error('[ERROR] Failed to set up handlers:', err);
      console.error('[ERROR] Error stack:', err.stack);
      throw err;
    }
  }

  setupHandlers() {
    try {
      console.error('[DEBUG] Setting up server request handlers');

      console.error('[DEBUG] McpTypes.ListToolsRequestSchema:', McpTypes.ListToolsRequestSchema);
      
      // List available tools
      this.server.setRequestHandler(McpTypes.ListToolsRequestSchema, async () => ({
        tools: this.tools,
      }));
      console.error('[DEBUG] Set up tools/list handler');

      // Handle tool calls (always return success with mock data)
      this.server.setRequestHandler(McpTypes.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        // Find the tool
        const tool = this.tools.find(t => t.name === name);
        if (!tool) {
          throw new McpTypes.McpError(McpTypes.ErrorCode.MethodNotFound, `Tool "${name}" not found`);
        }

        // Return mock successful response
        return {
          content: [
            {
              type: "text",
              text: `Mock execution of ${name} with args: ${JSON.stringify(args, null, 2)}\n\nThis is a test MCP server - no actual operation was performed.`
            }
          ]
        };
      });
      console.error('[DEBUG] Set up tools/call handler');

                  // Handle find requests using standard MCP schema
      const FindToolsSchema = z.object({
        method: z.literal("tools/find"),
        params: z.object({
          query: z.string(),
        })
      });

      this.server.setRequestHandler(FindToolsSchema, async (request) => {
        try {
          // For the git-server, just return all tools that match the query string
          const { query } = request.params;
          const matchingTools = this.tools.filter(tool => 
            tool.name.toLowerCase().includes(query.toLowerCase()) ||
            (tool.description && tool.description.toLowerCase().includes(query.toLowerCase()))
          );
          
          return {
            tools: matchingTools
          };
        } catch (err) {
          console.error('[ERROR] Error in tools/find handler:', err);
          throw err;
        }
      });
      console.error('[DEBUG] Set up tools/find handler');

      // List resources (if any)
      this.server.setRequestHandler(McpTypes.ListResourcesRequestSchema, async () => ({
        resources: this.resources,
      }));
      console.error('[DEBUG] Set up resources/list handler');

      // Read resources (if any)
      this.server.setRequestHandler(McpTypes.ReadResourceRequestSchema, async (request) => {
        const resource = this.resources.find(r => r.uri === request.params.uri);
        if (!resource) {
          throw new McpTypes.McpError(McpTypes.ErrorCode.InvalidRequest, `Resource not found: ${request.params.uri}`);
        }

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "text/plain",
              text: `Mock resource content for ${request.params.uri}`
            }
          ]
        };
      });
      console.error('[DEBUG] Set up resources/read handler');
    } catch (err) {
      console.error('[ERROR] Error in setupHandlers:', err);
      console.error('[ERROR] Error stack:', err.stack);
      console.error('[ERROR] Server state:', {
        serverInfo: this.serverInfo,
        serverCapabilities: this.server?.capabilities,
        availableSchemas: Object.keys(McpTypes)
      });
      throw err;
    }
  }

  async run() {
    try {
      const name = this.serverInfo.name;
      console.error('[DEBUG] Starting mock MCP server...');
      console.error('[DEBUG] Server name:', name);
      console.error('[DEBUG] Server info:', JSON.stringify(this.serverInfo, null, 2));
      console.error('[DEBUG] Server capabilities:', JSON.stringify(this.server.capabilities, null, 2));

      // Validate server is ready for transport
      if (!this.server) {
        throw new Error('Server instance not initialized');
      }

      // Set up transport
      console.error('[DEBUG] Creating StdioServerTransport...');
      let transport;
      try {
        transport = new StdioServerTransport();
        console.error('[DEBUG] StdioServerTransport instance:', transport);
        console.error('[DEBUG] StdioServerTransport created successfully');
      } catch (err) {
        console.error('[ERROR] Failed to create StdioServerTransport:');
        console.error('[ERROR] Error message:', err.message);
        console.error('[ERROR] Error stack:', err.stack);
        console.error('[ERROR] Error details:', err);
        throw err;
      }
      
      // Connect server
      console.error('[DEBUG] Connecting server to transport...');
      try {
        const connectResult = await this.server.connect(transport);
        console.error('[DEBUG] Server connected to transport successfully');
        console.error('[DEBUG] Connect result:', connectResult);
      } catch (err) {
        console.error('[ERROR] Failed to connect server to transport:');
        console.error('[ERROR] Error message:', err.message);
        console.error('[ERROR] Error stack:', err.stack);
        console.error('[ERROR] Error details:', err);
        console.error('[ERROR] Server state:', {
          serverInfo: this.serverInfo,
          capabilities: this.server.capabilities,
          transportState: transport
        });
        throw err;
      }
      
        // Signal that we're ready with name and capabilities on both stdout and stderr for robustness
      const readyMessage = `[READY] ${name}\n`;
      const readyJson = JSON.stringify({
        event: 'ready',
        name,
        capabilities: this.server.capabilities,
        timestamp: Date.now()
      });
      
      // Signal that we're ready on stdout first (more reliable)
      console.error('[DEBUG] About to send ready signal to stdout...');
      
      // Buffer outputs to avoid interleaving
      const outputBuffer = [];
      outputBuffer.push(readyMessage);
      outputBuffer.push(readyJson + '\n');
      outputBuffer.push(readyMessage);
      
      // Write all buffered outputs at once
      try {
        process.stdout.write(outputBuffer.join(''));
        console.error('[DEBUG] Successfully wrote ready signal to stdout');
      } catch (err) {
        console.error('[ERROR] Failed to write to stdout:', err);
        throw err;
      }
      
      // Then send to stderr for debugging
      try {
        process.stderr.write(`[STARTUP] ${name}: sending ready signal\n`);
        process.stderr.write(readyMessage);
        process.stderr.write(`[STARTUP] ${name}: ${readyJson}\n`);
        console.error('[DEBUG] Successfully wrote debug info to stderr');
      } catch (err) {
        console.error('[ERROR] Failed to write to stderr:', err);
        throw err;
      }      // Add debug info after ready signal
      process.stderr.write(`[STARTUP] ${name}: adding capabilities info\n`);
      console.error(`Mock MCP server ${name} running on stdio`);
      console.error(`[CAPABILITIES] ${JSON.stringify(this.server.capabilities)}`);

      // Keep the process alive but ensure we can exit
      const stdin = process.stdin.resume();
      stdin.unref(); // Allow process to exit if stdin is the only thing keeping it alive

      // Set up a startup timeout
      const startupTimeout = setTimeout(() => {
        console.error(`[TIMEOUT] ${name} server startup timeout after ${process.uptime()}s`);
        console.error('[DEBUG] Process state:', {
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          connections: this.server?.transport?.connections || []
        });
        process.exit(1);
      }, 10000);

      // Make sure the timeout doesn't keep the process alive
      startupTimeout.unref();
      
      // Monitor event loop blockage
      let lastCheck = Date.now();
      const blockageCheck = setInterval(() => {
        const now = Date.now();
        const delay = now - lastCheck - 1000; // Should be ~1000ms
        if (delay > 100) { // Over 100ms delay indicates blockage
          console.error(`[WARN] Event loop blocked for ${delay}ms in ${name} server`);
        }
        lastCheck = now;
      }, 1000);
      
      blockageCheck.unref(); // Don't prevent exit

      // Handle cleanup
      process.on('SIGTERM', () => {
        clearTimeout(startupTimeout);
        console.error(`[SHUTDOWN] ${this.serverInfo.name}`);
        process.exit(0);
      });

      // Handle other signals
      process.on('SIGINT', () => {
        clearTimeout(startupTimeout);
        const name = this.server.info?.name || this.serverInfo.name;
        console.error(`[SHUTDOWN] ${name} (interrupted)`);
        process.exit(0);
      });
    } catch (error) {
      const name = this.serverInfo?.name || "unknown";
      console.error(`Error starting mock server ${name}:`, error);
      console.error('Server info:', JSON.stringify(this.serverInfo, null, 2));
      console.error('Server capabilities:', JSON.stringify(this.server.capabilities, null, 2));
      process.exit(1);
    }
  }
}

export { MockMCPServer };