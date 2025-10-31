#!/usr/bin/env node
/**
 * MCP Client Sniffer
 *
 * A minimal MCP server that logs all initialize requests to capture:
 * 1. clientInfo.name - What name the client sends
 * 2. protocolVersion - What protocol version they use
 * 3. capabilities - What capabilities they support
 *
 * Usage:
 *   1. Configure this script as an MCP server in your client
 *   2. Client connects and sends initialize request
 *   3. This script logs the clientInfo and saves to client-info-log.json
 *   4. Use the captured info to update client-registry.ts
 *
 * Example MCP config for Claude Desktop:
 * {
 *   "mcpServers": {
 *     "client-sniffer": {
 *       "command": "node",
 *       "args": ["/path/to/ncp/scripts/mcp-client-sniffer.cjs"]
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'client-info-log.json');
const capturedClients = [];

// Load existing log if present
if (fs.existsSync(LOG_FILE)) {
  try {
    const existing = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    capturedClients.push(...existing);
  } catch (e) {
    // Ignore
  }
}

// Read from stdin (MCP protocol over stdio)
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');

  // Process complete lines
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const request = JSON.parse(line);

      // Log all requests for debugging
      fs.appendFileSync(
        path.join(process.cwd(), 'mcp-sniffer-debug.log'),
        `[${new Date().toISOString()}] ${line}\n`
      );

      if (request.method === 'initialize') {
        const clientInfo = request.params?.clientInfo || { name: 'unknown', version: 'unknown' };
        const timestamp = new Date().toISOString();

        console.error('\n' + '='.repeat(70));
        console.error('✨ CLIENT DETECTED!');
        console.error('='.repeat(70));
        console.error('Timestamp:', timestamp);
        console.error('Client Name:', clientInfo.name);
        console.error('Client Version:', clientInfo.version);
        console.error('Protocol Version:', request.params?.protocolVersion || 'unknown');
        console.error('='.repeat(70) + '\n');

        // Save to log
        capturedClients.push({
          timestamp,
          clientInfo,
          protocolVersion: request.params?.protocolVersion,
          capabilities: request.params?.capabilities
        });

        // Deduplicate by client name
        const unique = {};
        capturedClients.forEach(c => {
          unique[c.clientInfo.name] = c;
        });

        fs.writeFileSync(LOG_FILE, JSON.stringify(Object.values(unique), null, 2));
        console.error(`💾 Saved to ${LOG_FILE}\n`);

        // Send initialize response
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'mcp-client-sniffer',
              version: '1.0.0'
            },
            capabilities: {
              tools: {}
            }
          }
        };

        process.stdout.write(JSON.stringify(response) + '\n');
      } else if (request.method === 'tools/list') {
        // Respond to tools/list with empty list
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: []
          }
        };

        process.stdout.write(JSON.stringify(response) + '\n');
      } else if (request.method === 'notifications/initialized') {
        // Ignore notifications (no response needed)
      } else {
        // Respond to unknown methods with error
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };

        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
    }
  }

  // Keep the incomplete line
  buffer = lines[lines.length - 1];
});

// Log startup
console.error('🎯 MCP Client Sniffer Started');
console.error('Waiting for client connections...\n');
console.error('Configure this script as an MCP server in your client:');
console.error(`  "command": "node"`);
console.error(`  "args": ["${__filename}"]\n`);
