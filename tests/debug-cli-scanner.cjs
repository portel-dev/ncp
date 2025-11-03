#!/usr/bin/env node
/**
 * Debug CLI Scanner
 */

const { CLIScanner } = require('../dist/services/cli-scanner.js');

async function test() {
  console.log('Testing CLI Scanner...\n');

  const scanner = new CLIScanner();

  console.log('Scanning system...');
  const tools = await scanner.scanSystem(false);

  console.log(`Found ${tools.length} tools:`);
  tools.slice(0, 10).forEach(t => {
    console.log(`  - ${t.name}: ${t.description} (${t.capabilities.slice(0, 3).join(', ')})`);
  });
  console.log('');

  // Test search
  console.log('Searching for "video"...');
  const videoTools = await scanner.searchTools('video');
  console.log(`Found ${videoTools.length} video-related tools:`);
  videoTools.slice(0, 5).forEach(t => {
    console.log(`  - ${t.name}: ${t.description} (${t.capabilities.slice(0, 3).join(', ')})`);
  });

  console.log('\nSearching for "git"...');
  const gitTools = await scanner.searchTools('git');
  console.log(`Found ${gitTools.length} git-related tools:`);
  gitTools.slice(0, 5).forEach(t => {
    console.log(`  - ${t.name}: ${t.description} (${t.capabilities.slice(0, 3).join(', ')})`);
  });
}

test().catch(console.error);
