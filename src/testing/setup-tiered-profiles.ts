#!/usr/bin/env node
/**
 * Setup Tiered MCP Profiles for Testing
 *
 * Creates a tiered approach for testing the semantic enhancement system:
 * - Adds dummy MCPs to the default 'all' profile
 * - Creates tiered profiles: tier-10, tier-100, tier-1000
 * - Uses realistic MCPs for comprehensive testing at different scales
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

async function setupTieredProfiles(): Promise<void> {
  try {
    // Load real MCP definitions
    const definitionsPath = path.join(__dirname, 'real-mcp-definitions.json');
    const definitionsContent = await fs.readFile(definitionsPath, 'utf-8');
    const realDefinitions = JSON.parse(definitionsContent);
    const definitions: McpDefinitionsFile = { mcps: realDefinitions.mcps };

    // Get NCP base directory and ensure profiles directory exists
    const ncpBaseDir = await getNcpBaseDirectory();
    const profilesDir = path.join(ncpBaseDir, 'profiles');
    await fs.mkdir(profilesDir, { recursive: true });

    // Build dummy MCP server path
    const dummyServerPath = path.join(__dirname, 'dummy-mcp-server.ts');

    // Helper function to create MCP server config
    const createMcpConfig = (mcpName: string) => ({
      command: 'npx',
      args: [
        'tsx',
        dummyServerPath,
        '--mcp-name',
        mcpName,
        '--definitions-file',
        definitionsPath
      ]
    });

    const allMcpNames = Object.keys(definitions.mcps);
    console.log(`📦 Found ${allMcpNames.length} MCP definitions`);

    // 1. ADD TO DEFAULT 'ALL' PROFILE
    console.log(`\n🔧 Adding dummy MCPs to default 'all' profile...`);

    const allProfilePath = path.join(profilesDir, 'all.json');
    let allProfile: any;

    try {
      const existingContent = await fs.readFile(allProfilePath, 'utf-8');
      allProfile = JSON.parse(existingContent);
    } catch {
      // Create default 'all' profile if it doesn't exist
      allProfile = {
        name: 'all',
        description: 'Universal profile with all configured MCP servers',
        mcpServers: {},
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }
      };
    }

    // Add all dummy MCPs to the 'all' profile
    for (const mcpName of allMcpNames) {
      allProfile.mcpServers[mcpName] = createMcpConfig(mcpName);
    }
    allProfile.metadata.modified = new Date().toISOString();

    await fs.writeFile(allProfilePath, JSON.stringify(allProfile, null, 2));
    console.log(`   ✅ Added ${allMcpNames.length} dummy MCPs to 'all' profile`);

    // 2. CREATE TIERED PROFILES
    const tiers = [
      { name: 'tier-10', count: 10, description: 'Lightweight testing with 10 essential MCPs' },
      { name: 'tier-100', count: 100, description: 'Medium load testing with 100 diverse MCPs' },
      { name: 'tier-1000', count: 1000, description: 'Heavy load testing with 1000+ comprehensive MCPs' }
    ];

    for (const tier of tiers) {
      console.log(`\n🏗️  Creating ${tier.name} profile (${tier.count} MCPs)...`);

      let selectedMcps: string[];

      if (tier.count <= allMcpNames.length) {
        // For tier-10 and potentially tier-100, select the most essential MCPs
        if (tier.count === 10) {
          // Hand-pick the 10 most essential MCPs
          selectedMcps = [
            'shell', 'git', 'postgres', 'openai', 'github',
            'docker', 'aws', 'filesystem', 'slack', 'stripe'
          ];
        } else {
          // For tier-100, take first N MCPs (can be randomized later)
          selectedMcps = allMcpNames.slice(0, tier.count);
        }
      } else {
        // For tier-1000, we need to generate more MCPs
        // For now, use all available and indicate we need more
        selectedMcps = allMcpNames;
        console.log(`   ⚠️  Only ${allMcpNames.length} MCPs available, need ${tier.count} for full ${tier.name}`);
      }

      const tierProfile = {
        name: tier.name,
        description: tier.description,
        mcpServers: {} as Record<string, any>,
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          targetCount: tier.count,
          actualCount: selectedMcps.length
        }
      };

      for (const mcpName of selectedMcps) {
        tierProfile.mcpServers[mcpName] = createMcpConfig(mcpName);
      }

      const tierProfilePath = path.join(profilesDir, `${tier.name}.json`);
      await fs.writeFile(tierProfilePath, JSON.stringify(tierProfile, null, 2));

      console.log(`   ✅ Created ${tier.name}: ${selectedMcps.length}/${tier.count} MCPs`);
      console.log(`      Profile: ${tierProfilePath}`);
    }

    // 3. USAGE INSTRUCTIONS
    console.log(`\n📋 Profile Usage Instructions:`);
    console.log(`\n🎯 Default Profile (${allMcpNames.length} MCPs):`);
    console.log(`   npx ncp list                              # List all MCPs`);
    console.log(`   npx ncp find "commit my code to git"      # Semantic enhancement discovery`);
    console.log(`   npx ncp run git:commit --params '{"message":"test"}'  # Execute tools`);

    console.log(`\n⚡ Tiered Testing:`);
    console.log(`   npx ncp --profile tier-10 find "upload code"      # Light testing (10 MCPs)`);
    console.log(`   npx ncp --profile tier-100 find "store data"      # Medium testing (100 MCPs)`);
    console.log(`   npx ncp --profile tier-1000 find "deploy app"     # Heavy testing (1000 MCPs)`);

    console.log(`\n🔍 Performance Testing:`);
    console.log(`   time npx ncp --profile tier-10 find "database query"    # Fast discovery`);
    console.log(`   time npx ncp --profile tier-100 find "database query"   # Medium scale`);
    console.log(`   time npx ncp --profile tier-1000 find "database query"  # Large scale`);

    console.log(`\n📊 Profile Summary:`);
    console.log(`   📦 all: ${allMcpNames.length} MCPs (default profile)`);
    tiers.forEach(tier => {
      const actualCount = tier.count <= allMcpNames.length ?
        (tier.count === 10 ? 10 : Math.min(tier.count, allMcpNames.length)) :
        allMcpNames.length;
      console.log(`   📦 ${tier.name}: ${actualCount}/${tier.count} MCPs`);
    });

    console.log(`\n🚀 Ready for semantic enhancement testing at multiple scales!`);

  } catch (error) {
    console.error('Failed to setup tiered profiles:', error);
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTieredProfiles();
}

export { setupTieredProfiles };