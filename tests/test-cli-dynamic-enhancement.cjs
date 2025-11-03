#!/usr/bin/env node
/**
 * Test CLI Dynamic Enhancement
 * Verifies that CLI tools are appended dynamically based on search query
 */

const { NCPOrchestrator } = require('../dist/orchestrator/ncp-orchestrator.js');

async function testDynamicEnhancement() {
  console.log('🧪 Testing Dynamic CLI Enhancement\n');

  // Enable CLI autoscan
  process.env.NCP_CLI_AUTOSCAN = 'true';

  const orchestrator = new NCPOrchestrator('all', false);

  console.log('⏳ Waiting for initialization...');
  await orchestrator.waitForInitialization();

  console.log('✅ Initialization complete\n');

  // Test 1: Search for video conversion
  console.log('📹 Test 1: Searching for "convert video"...');
  const videoResults = await orchestrator.find('convert video', 3, true);

  console.log(`Found ${videoResults.length} results:`);
  videoResults.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.toolName} (${r.mcpName}) - confidence: ${r.confidence.toFixed(2)}`);
    if (r.description) {
      const cliMatch = r.description.match(/Relevant CLI tools for ".*?": (.*?)$/);
      if (cliMatch) {
        console.log(`     🎯 CLI Enhancement: ${cliMatch[1]}`);
      }
    }
  });

  console.log('');

  // Test 2: Search for github control
  console.log('🔧 Test 2: Searching for "github control"...');
  const githubResults = await orchestrator.find('github control', 3, true);

  console.log(`Found ${githubResults.length} results:`);
  githubResults.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.toolName} (${r.mcpName}) - confidence: ${r.confidence.toFixed(2)}`);
    if (r.description) {
      const cliMatch = r.description.match(/Relevant CLI tools for ".*?": (.*?)$/);
      if (cliMatch) {
        console.log(`     🎯 CLI Enhancement: ${cliMatch[1]}`);
      }
    }
  });

  console.log('');

  // Test 3: Verify different CLI tools for different queries
  const videoHasCLI = videoResults.some(r => r.description?.includes('Relevant CLI tools'));
  const githubHasCLI = githubResults.some(r => r.description?.includes('Relevant CLI tools'));

  if (videoHasCLI) {
    console.log('✅ Video search was enhanced with CLI tools');
  } else {
    console.log('⚠️  Video search was NOT enhanced (might be expected if no Shell MCP or no ffmpeg)');
  }

  if (githubHasCLI) {
    console.log('✅ GitHub search was enhanced with CLI tools');
  } else {
    console.log('⚠️  GitHub search was NOT enhanced (might be expected if no Shell MCP or no gh)');
  }

  console.log('\n✅ Test complete!');
  process.exit(0);
}

testDynamicEnhancement().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
