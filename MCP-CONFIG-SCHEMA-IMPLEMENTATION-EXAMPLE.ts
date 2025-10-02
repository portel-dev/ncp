/**
 * Example: How MCP Servers Implement configurationSchema
 *
 * This shows the actual code that MCP servers add to return
 * configuration schema in their initialize() response.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Create MCP server with configurationSchema in capabilities
const server = new Server(
  {
    name: 'gmail-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},

      // ADD THIS: configurationSchema in capabilities
      configurationSchema: {
        environmentVariables: [
          {
            name: 'GCP_OAUTH_KEYS_PATH',
            description: 'Path to the GCP OAuth keys JSON file',
            type: 'path',
            required: true,
            sensitive: true,
          },
          {
            name: 'CREDENTIALS_PATH',
            description: 'Path to the stored credentials JSON file',
            type: 'path',
            required: true,
            sensitive: true,
          },
        ],
      },
    },
  }
);

// The rest of your MCP server code...
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Your tools...
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();

/**
 * What this does:
 *
 * 1. MCP client (like NCP) calls initialize()
 * 2. Server returns InitializeResult with configurationSchema
 * 3. Client sees schema and prompts user for required config
 * 4. User provides GCP_OAUTH_KEYS_PATH and CREDENTIALS_PATH
 * 5. Client sets environment variables and starts server
 *
 * Before (without schema):
 *   Error: GCP_OAUTH_KEYS_PATH is required
 *   (User has to figure out what's needed)
 *
 * After (with schema):
 *   📋 Configuration needed:
 *   GCP_OAUTH_KEYS_PATH: [required, path]
 *     Path to the GCP OAuth keys JSON file
 *   Enter GCP_OAUTH_KEYS_PATH: _
 *   (User is guided through setup)
 */
