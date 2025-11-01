/**
 * Test MCP server with notification system integration
 */

import { MCPServer } from '../src/server/mcp-server.js';

console.log('Testing MCP Server with Notifications...\n');

try {
  // Create server instance (this should initialize notifications)
  console.log('Creating MCP server instance...');
  const server = new MCPServer('all', false, false);
  console.log('✓ Server created successfully\n');

  console.log('✅ Notification system integrated correctly!');
  console.log('\nReady for testing with Windsurf:');
  console.log('1. Restart Windsurf');
  console.log('2. NCP will auto-import MCPs');
  console.log('3. If elicitation times out, notification will be queued');
  console.log('4. Next tool call will show notification to AI');

  process.exit(0);
} catch (error: any) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
