#!/usr/bin/env node
/**
 * Verify Profile Scaling with Real Data
 *
 * Verifies that NCP profiles are correctly configured with real MCP data
 * and validates the tool count scaling across different tiers.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProfileMetadata {
  name: string;
  description: string;
  mcpCount: number;
  totalTools: number;
  targetCount: number;
  actualCount: number;
}

async function verifyProfileScaling(): Promise<void> {
  console.log('🔍 Verifying NCP Profile Scaling with Real Data');
  console.log('=' .repeat(50));

  // Load real MCP definitions
  const definitionsPath = path.join(__dirname, 'real-mcp-definitions.json');
  const definitionsData = await fs.readFile(definitionsPath, 'utf-8');
  const definitions = JSON.parse(definitionsData);

  const availableMcps = Object.keys(definitions.mcps);
  const totalToolsAvailable = Object.values(definitions.mcps).reduce(
    (sum: number, mcp: any) => sum + Object.keys(mcp.tools).length,
    0
  );

  console.log(`📊 Available Resources:`);
  console.log(`   Total MCPs: ${availableMcps.length}`);
  console.log(`   Total Tools: ${totalToolsAvailable}`);
  console.log('');

  // Check each profile
  const profilesDir = path.join(__dirname, '../../.ncp/profiles');
  const profileFiles = await fs.readdir(profilesDir);
  const profiles: ProfileMetadata[] = [];

  for (const file of profileFiles.filter(f => f.endsWith('.json'))) {
    const profilePath = path.join(profilesDir, file);
    const profileData = JSON.parse(await fs.readFile(profilePath, 'utf-8'));

    if (profileData.mcpServers) {
      const mcpNames = Object.keys(profileData.mcpServers);
      let totalTools = 0;

      // Calculate tools for MCPs that exist in our definitions
      for (const mcpName of mcpNames) {
        if (definitions.mcps[mcpName]) {
          totalTools += Object.keys(definitions.mcps[mcpName].tools).length;
        }
      }

      profiles.push({
        name: profileData.name || path.basename(file, '.json'),
        description: profileData.description || 'No description',
        mcpCount: mcpNames.length,
        totalTools: totalTools,
        targetCount: profileData.metadata?.targetCount || 0,
        actualCount: profileData.metadata?.actualCount || mcpNames.length
      });
    }
  }

  // Sort profiles by tool count
  profiles.sort((a, b) => b.totalTools - a.totalTools);

  console.log('📋 Profile Analysis:');
  console.log('');

  for (const profile of profiles) {
    const toolsPerMcp = profile.totalTools > 0 ? (profile.totalTools / profile.mcpCount).toFixed(1) : '0';
    const targetAchieved = profile.targetCount > 0 ?
      Math.round((profile.totalTools / (profile.targetCount * 4.6)) * 100) : 100; // Assuming ~4.6 tools per MCP average

    console.log(`🎯 ${profile.name.toUpperCase()}`);
    console.log(`   Description: ${profile.description}`);
    console.log(`   MCPs: ${profile.mcpCount} (target: ${profile.targetCount || 'N/A'})`);
    console.log(`   Tools: ${profile.totalTools} (${toolsPerMcp} per MCP)`);
    if (profile.targetCount > 0) {
      console.log(`   Target Achievement: ${targetAchieved}% (${profile.totalTools}/${profile.targetCount * 4.6} estimated tools)`);
    }
    console.log('');
  }

  // Scaling verification
  console.log('⚖️  Scaling Verification:');
  console.log('');

  const tier10 = profiles.find(p => p.name === 'tier-10');
  const tier100 = profiles.find(p => p.name === 'tier-100');
  const tier1000 = profiles.find(p => p.name === 'tier-1000');

  if (tier10 && tier100 && tier1000) {
    const scalingFactor10to100 = tier100.totalTools / tier10.totalTools;
    const scalingFactor100to1000 = tier1000.totalTools / tier100.totalTools;

    console.log(`✅ Tier-10:   ${tier10.totalTools} tools (${tier10.mcpCount} MCPs)`);
    console.log(`✅ Tier-100:  ${tier100.totalTools} tools (${tier100.mcpCount} MCPs) - ${scalingFactor10to100.toFixed(1)}x scaling`);
    console.log(`✅ Tier-1000: ${tier1000.totalTools} tools (${tier1000.mcpCount} MCPs) - ${scalingFactor100to1000.toFixed(1)}x scaling`);
    console.log('');

    // Assessment
    if (tier100.totalTools >= 100) {
      console.log('🎉 EXCELLENT: Tier-100 achieves 100+ tools as intended!');
    } else if (tier100.totalTools >= 75) {
      console.log('✅ GOOD: Tier-100 provides substantial tool coverage.');
    } else {
      console.log('⚠️  LIMITED: Tier-100 provides basic tool coverage.');
    }

    if (scalingFactor10to100 > 1.5) {
      console.log('✅ Proper scaling between tiers maintained.');
    } else {
      console.log('⚠️  Limited scaling between tiers - more MCPs needed.');
    }
  }

  console.log('');
  console.log('💡 Recommendations:');
  if (totalToolsAvailable >= 100) {
    console.log('   ✅ Sufficient tools available for comprehensive testing');
  } else {
    console.log('   📈 Consider adding more MCPs to reach 100+ tools');
  }

  if (availableMcps.length >= 20) {
    console.log('   ✅ Good variety of MCP types for diverse testing');
  } else {
    console.log('   🔄 Consider diversifying MCP categories');
  }

  console.log('');
  console.log('🚀 Ready for multi-tier semantic enhancement testing!');
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyProfileScaling().catch(error => {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  });
}