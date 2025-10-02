# MCP Protocol Compliance: Configuration Checking

## Critical Implementation Rule

**MCP servers MUST respond to `initialize` request successfully, even when configuration is missing.**

## The Problem

Many MCP implementations check for required configuration **too early** - during startup or in the constructor. This violates the MCP protocol because:

1. Server crashes before client can send `initialize`
2. Client never receives `configurationSchema`
3. User gets raw error message instead of guided setup
4. Protocol benefits are lost

## ❌ Incorrect Implementation (Common but Wrong)

```typescript
#!/usr/bin/env node

// BAD: Check configuration on startup
const API_KEY = process.env.API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!API_KEY) {
  console.error('Error: API_KEY environment variable is required');
  process.exit(1);  // ← Server dies before initialize!
}

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

// This code never runs if config is missing
const server = new Server(
  { name: 'my-mcp', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
      configurationSchema: {
        environmentVariables: [
          { name: 'API_KEY', required: true },
          { name: 'DATABASE_URL', required: true }
        ]
      }
    }
  }
);
```

**Problems**:
- ❌ Server crashes before responding to `initialize`
- ❌ Client never sees `configurationSchema`
- ❌ User doesn't get guided configuration experience
- ❌ Breaks protocol contract

## ✅ Correct Implementation (Protocol-Compliant)

```typescript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Create server WITHOUT checking configuration
// Server must be able to respond to initialize
const server = new Server(
  {
    name: 'my-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      // Declare configuration requirements in schema
      configurationSchema: {
        environmentVariables: [
          {
            name: 'API_KEY',
            description: 'API key for service authentication',
            type: 'string',
            required: true,
            sensitive: true,
          },
          {
            name: 'DATABASE_URL',
            description: 'Database connection URL',
            type: 'url',
            required: true,
            sensitive: true,
          },
        ],
      },
    },
  }
);

// List tools - this should always work
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_data',
        description: 'Query data from database',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute',
            },
          },
        },
      },
    ],
  };
});

// Check configuration ONLY when tools are called
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Validate configuration at tool execution time
  const API_KEY = process.env.API_KEY;
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!API_KEY || !DATABASE_URL) {
    // Return error as tool result, don't crash
    return {
      content: [
        {
          type: 'text',
          text: `Configuration error: Missing required environment variables.
Required:
  - API_KEY: API key for service authentication
  - DATABASE_URL: Database connection URL

Please configure these variables and try again.`,
        },
      ],
      isError: true,
    };
  }

  // Configuration is valid, execute tool
  if (name === 'query_data') {
    try {
      // Use API_KEY and DATABASE_URL here
      const result = await executeQuery(args.query, DATABASE_URL, API_KEY);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing query: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[INFO] Server started successfully');
}

main().catch((error) => {
  console.error('[ERROR] Server failed to start:', error);
  process.exit(1);
});
```

**Benefits**:
- ✅ Server always responds to `initialize` successfully
- ✅ Client receives `configurationSchema`
- ✅ User gets guided configuration experience
- ✅ Follows MCP protocol correctly
- ✅ Graceful error handling at tool execution time

## Key Principles

### 1. Separate Initialization from Configuration Validation

**Initialization** (startup):
- Create server instance
- Define capabilities and schema
- Register tool handlers
- Connect transport
- Respond to `initialize` request

**Configuration Validation** (tool execution):
- Check environment variables
- Validate configuration
- Return helpful error if invalid
- Execute tool if valid

### 2. Always Respond to Initialize

The server MUST be able to:
- Start successfully
- Respond to `initialize` with `configurationSchema`
- List available tools

Even when configuration is completely missing!

### 3. Fail Gracefully at Tool Execution

When tools are called without proper configuration:
- Return error as tool result (not crash)
- Include helpful error message
- Reference the configurationSchema
- Let client handle the error

## Real-World Example: Gmail MCP

### Before (Non-Compliant)
```typescript
#!/usr/bin/env node

// Dies immediately if config missing
const gcpKeysPath = process.env.GCP_OAUTH_KEYS_PATH;
if (!gcpKeysPath || !existsSync(gcpKeysPath)) {
  throw new Error('OAuth keys file not found. Please place gcp-oauth.keys.json...');
}

const server = new Server(...);
// Never reaches here if config missing
```

### After (Compliant)
```typescript
#!/usr/bin/env node

const server = new Server(
  { name: 'gmail-mcp', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
      configurationSchema: {
        environmentVariables: [
          {
            name: 'GCP_OAUTH_KEYS_PATH',
            description: 'Path to the GCP OAuth keys JSON file',
            type: 'path',
            required: true,
            sensitive: true,
          }
        ]
      }
    }
  }
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Check config when tool is actually used
  const gcpKeysPath = process.env.GCP_OAUTH_KEYS_PATH;
  if (!gcpKeysPath || !existsSync(gcpKeysPath)) {
    return {
      content: [{
        type: 'text',
        text: 'Configuration error: GCP_OAUTH_KEYS_PATH not set or file not found'
      }],
      isError: true
    };
  }

  // Use config to execute tool...
});
```

## For Client Developers

If you're building an MCP client (like NCP), you should:

1. **Try to read configurationSchema first**
   - Start server
   - Send `initialize`
   - Read `configurationSchema` from response
   - Prompt user for required config
   - Restart with proper environment variables

2. **Fall back to error parsing if needed**
   - Some servers still check config on startup (non-compliant)
   - Parse stderr for configuration hints
   - Prompt user based on error messages
   - This is less ideal but necessary for backward compatibility

3. **Encourage protocol compliance**
   - Report issues to MCP maintainers
   - Suggest moving config checks to tool execution
   - Reference this guide

## Summary

**The Golden Rule**:

> MCP servers must successfully respond to `initialize` regardless of configuration state. Configuration validation happens at tool execution time, not server startup.

This enables:
- ✅ Guided user configuration experiences
- ✅ Better error messages
- ✅ Protocol-compliant implementations
- ✅ Interoperability between clients

**When submitting PRs to add configurationSchema, also suggest moving configuration checks from startup to tool execution if needed.**
