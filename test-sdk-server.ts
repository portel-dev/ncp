#!/usr/bin/env ts-node
/**
 * Automated test for SDK-based MCP server
 * Uses MCP SDK Client to connect and test the server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, details?: any, error?: string) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (details) {
    console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
  }
  if (error) {
    console.log(`   Error: ${error}`);
  }
}

async function runTests() {
  console.log('🧪 Starting SDK Server Tests\n');

  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  try {
    // Step 1: Create transport to connect to our server
    console.log('📡 Connecting to NCP SDK server...');
    const serverPath = join(__dirname, 'dist', 'index-mcp.js');

    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // Step 2: Create client
    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    // Step 3: Connect
    await client.connect(transport);
    logTest('Server Connection', true, { message: 'Connected successfully' });

    // Step 4: Get server info
    const serverInfo = client.getServerVersion();
    logTest('Server Info', !!serverInfo, {
      name: serverInfo?.name,
      version: serverInfo?.version
    });

    // Step 5: List tools
    console.log('\n🔧 Testing tools/list...');
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools;

    logTest('Tools List Response', tools.length > 0, {
      toolCount: tools.length,
      toolNames: tools.map(t => t.name)
    });

    // Step 6: Verify 'find' tool exists
    const findTool = tools.find(t => t.name === 'find');
    logTest('Find Tool Available', !!findTool, {
      hasDescription: !!findTool?.description,
      hasSchema: !!findTool?.inputSchema
    });

    // Step 7: Verify 'run' tool exists
    const runTool = tools.find(t => t.name === 'run');
    logTest('Run Tool Available', !!runTool, {
      hasDescription: !!runTool?.description,
      hasSchema: !!runTool?.inputSchema
    });

    // Step 8: Test calling 'find' tool (list mode)
    console.log('\n🔍 Testing find tool (list mode)...');
    try {
      const findResult = await client.callTool({
        name: 'find',
        arguments: {}
      });

      const hasContent = findResult.content && findResult.content.length > 0;
      logTest('Find Tool Execution (list mode)', hasContent, {
        contentType: findResult.content[0]?.type,
        hasText: !!(findResult.content[0] as any)?.text
      });
    } catch (error: any) {
      logTest('Find Tool Execution (list mode)', false, undefined, error.message);
    }

    // Step 9: Test calling 'find' tool (search mode)
    console.log('\n🔍 Testing find tool (search mode)...');
    try {
      const searchResult = await client.callTool({
        name: 'find',
        arguments: {
          description: 'file operations',
          limit: 3
        }
      });

      const hasContent = searchResult.content && searchResult.content.length > 0;
      logTest('Find Tool Execution (search mode)', hasContent, {
        contentType: searchResult.content[0]?.type,
        hasText: !!(searchResult.content[0] as any)?.text
      });
    } catch (error: any) {
      logTest('Find Tool Execution (search mode)', false, undefined, error.message);
    }

    // Step 10: Test 'run' tool with dry_run
    console.log('\n🚀 Testing run tool (dry run)...');
    try {
      const runResult = await client.callTool({
        name: 'run',
        arguments: {
          tool: 'test:sample',
          parameters: { example: 'value' },
          dry_run: true
        }
      });

      const hasContent = runResult.content && runResult.content.length > 0;
      const text = (runResult.content[0] as any)?.text || '';
      const isDryRun = text.includes('DRY RUN');

      logTest('Run Tool Execution (dry run)', hasContent && isDryRun, {
        contentType: runResult.content[0]?.type,
        isDryRunPreview: isDryRun
      });
    } catch (error: any) {
      logTest('Run Tool Execution (dry run)', false, undefined, error.message);
    }

    // Step 11: Test internal MCPs discovery (ncp:list, ncp:add, etc.)
    console.log('\n🔍 Testing internal MCPs discovery...');
    try {
      const ncpSearchResult = await client.callTool({
        name: 'find',
        arguments: {
          description: 'ncp configuration',
          limit: 10
        }
      });

      const hasContent = ncpSearchResult.content && ncpSearchResult.content.length > 0;
      const text = (ncpSearchResult.content[0] as any)?.text || '';
      const hasInternalTools = text.includes('ncp:') || text.includes('add') || text.includes('import');

      logTest('Internal MCPs Discovery', hasContent && hasInternalTools, {
        contentType: ncpSearchResult.content[0]?.type,
        foundInternalMCPs: hasInternalTools
      });
    } catch (error: any) {
      logTest('Internal MCPs Discovery', false, undefined, error.message);
    }

    // Step 12: Test calling internal MCP tool (ncp:list)
    console.log('\n🔧 Testing internal MCP execution (ncp:list)...');
    try {
      const listResult = await client.callTool({
        name: 'run',
        arguments: {
          tool: 'ncp:list',
          parameters: {}
        }
      });

      const hasContent = listResult.content && listResult.content.length > 0;
      const text = (listResult.content[0] as any)?.text || '';
      const isSuccess = !((listResult as any).isError) && (text.includes('MCP') || text.includes('profile'));

      logTest('Internal MCP Execution (ncp:list)', hasContent && isSuccess, {
        contentType: listResult.content[0]?.type,
        hasResponse: !!text,
        isError: !!(listResult as any).isError
      });
    } catch (error: any) {
      logTest('Internal MCP Execution (ncp:list)', false, undefined, error.message);
    }

    // Step 13: Test error handling (invalid tool)
    console.log('\n⚠️  Testing error handling...');
    try {
      const errorResult = await client.callTool({
        name: 'nonexistent-tool',
        arguments: {}
      });

      // SDK might return error in result instead of throwing
      const hasError = (errorResult as any).isError ||
                       (errorResult.content && errorResult.content[0] &&
                        (errorResult.content[0] as any).text?.includes('not found'));

      logTest('Error Handling (invalid tool)', hasError, {
        errorHandled: true,
        errorInResponse: !!(errorResult as any).isError
      });
    } catch (error: any) {
      const hasErrorMessage = error.message && (
        error.message.includes('not found') ||
        error.message.includes('Method not found')
      );
      logTest('Error Handling (invalid tool)', hasErrorMessage, {
        errorReceived: true,
        errorMessage: error.message
      });
    }

    // Step 14: Cleanup
    console.log('\n🧹 Cleaning up...');
    await client.close();
    logTest('Client Disconnect', true);

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }

    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error || 'Unknown error'}`);
    });
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
