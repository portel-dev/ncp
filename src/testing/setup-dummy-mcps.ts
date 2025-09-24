#!/usr/bin/env node
/**
 * Setup Dummy MCPs for Testing
 *
 * Creates NCP profile configurations that use dummy MCP servers for testing
 * the semantic enhancement system without requiring real MCP connections.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface McpDefinitionsFile {
  mcps: Record<string, any>;
}

async function setupDummyMcps(): Promise<void> {
  try {
    // Load MCP definitions
    const definitionsPath = path.join(__dirname, 'mcp-definitions.json');
    const definitionsContent = await fs.readFile(definitionsPath, 'utf-8');
    const definitions: McpDefinitionsFile = JSON.parse(definitionsContent);

    // Get NCP base directory and ensure profiles directory exists
    const ncpBaseDir = await getNcpBaseDirectory();
    const profilesDir = path.join(ncpBaseDir, 'profiles');
    await fs.mkdir(profilesDir, { recursive: true });

    // Create test profile configuration
    const profileConfig = {
      name: "semantic-test",
      description: "Testing profile with dummy MCPs for semantic enhancement validation",
      mcpServers: {} as Record<string, any>,
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    };

    // Build dummy MCP server path
    const dummyServerPath = path.join(__dirname, 'dummy-mcp-server.ts');
    const nodeExecutable = process.execPath;
    const tsNodePath = path.join(path.dirname(nodeExecutable), 'npx');

    // Add each MCP from definitions as a dummy MCP
    for (const [mcpName, mcpDef] of Object.entries(definitions.mcps)) {
      profileConfig.mcpServers[mcpName] = {
        command: 'npx',
        args: [
          'tsx', // Use tsx to run TypeScript directly
          dummyServerPath,
          '--mcp-name',
          mcpName,
          '--definitions-file',
          definitionsPath
        ]
      };
    }

    // Write profile configuration
    const profilePath = path.join(profilesDir, 'semantic-test.json');
    await fs.writeFile(profilePath, JSON.stringify(profileConfig, null, 2));

    console.log(`✅ Created semantic-test profile with ${Object.keys(definitions.mcps).length} dummy MCPs:`);
    Object.keys(definitions.mcps).forEach(name => {
      console.log(`   - ${name}: ${definitions.mcps[name].description}`);
    });
    console.log(`\nProfile saved to: ${profilePath}`);
    console.log(`\nTo use this profile:`);
    console.log(`  npx ncp --profile semantic-test list`);
    console.log(`  npx ncp --profile semantic-test find "commit my code to git"`);
    console.log(`  npx ncp --profile semantic-test run git:commit --params '{"message":"test commit"}'`);

    // Create a simplified test profile with just key MCPs for faster testing
    const quickTestConfig = {
      name: "semantic-quick",
      description: "Quick test profile with essential MCPs for semantic enhancement",
      mcpServers: {
        shell: profileConfig.mcpServers.shell,
        git: profileConfig.mcpServers.git,
        postgres: profileConfig.mcpServers.postgres,
        openai: profileConfig.mcpServers.openai
      },
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    };

    const quickProfilePath = path.join(profilesDir, 'semantic-quick.json');
    await fs.writeFile(quickProfilePath, JSON.stringify(quickTestConfig, null, 2));

    console.log(`\n✅ Created semantic-quick profile with 4 essential MCPs`);
    console.log(`Profile saved to: ${quickProfilePath}`);

  } catch (error) {
    console.error('Failed to setup dummy MCPs:', error);
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDummyMcps();
}