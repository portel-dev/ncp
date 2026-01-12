#!/usr/bin/env npx tsx
/**
 * Test script for workflow Photons
 *
 * Runs each workflow with pre-provided inputs (simulating scheduled execution)
 */

import { executeGenerator, createPrefilledProvider, type EmitYield } from '@portel/photon-core';

// Simple output handler that logs to console
const createConsoleHandler = (name: string) => (emit: EmitYield) => {
  switch (emit.emit) {
    case 'progress':
      const bar = '█'.repeat(Math.round(emit.value * 20)) + '░'.repeat(20 - Math.round(emit.value * 20));
      console.log(`  [${bar}] ${Math.round(emit.value * 100)}% ${emit.message || ''}`);
      break;
    case 'status':
      console.log(`  📢 ${emit.message}`);
      break;
    case 'log':
      const icons = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' };
      console.log(`  ${icons[emit.level || 'info']} ${emit.message}`);
      break;
    case 'toast':
      const toastIcons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
      console.log(`  ${toastIcons[emit.type || 'info']} Toast: ${emit.message}`);
      break;
    case 'thinking':
      console.log(`  🧠 ${emit.active ? 'Thinking...' : 'Done thinking'}`);
      break;
    case 'artifact':
      console.log(`  📎 Artifact: ${emit.title || emit.type}`);
      if (emit.content) console.log(`     ${emit.content.slice(0, 100)}...`);
      break;
  }
};

async function testRSSAggregator() {
  console.log('\n' + '='.repeat(60));
  console.log('📰 Testing RSS Aggregator Workflow');
  console.log('='.repeat(60));

  const RSSAggregator = (await import('./tier1-pure/rss-aggregator.photon.js')).default;
  const workflow = new RSSAggregator();

  // Test quickAggregate (pre-filled, no prompts)
  const generator = workflow.quickAggregate({
    feeds: [
      'https://hnrss.org/frontpage',
      'https://www.reddit.com/r/programming/.rss',
    ],
    outputPath: './test-rss-output.json',
    format: 'json',
    maxPerFeed: 5
  });

  try {
    const result = await executeGenerator(generator, {
      inputProvider: createPrefilledProvider({}),
      outputHandler: createConsoleHandler('rss-aggregator')
    });

    console.log('\n  Result:', JSON.stringify(result, null, 2));
    return { success: true, result };
  } catch (error: any) {
    console.error('\n  ❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function testGitHubReleaseTracker() {
  console.log('\n' + '='.repeat(60));
  console.log('🏷️ Testing GitHub Release Tracker Workflow');
  console.log('='.repeat(60));

  const GitHubReleaseTracker = (await import('./tier1-pure/github-release-tracker.photon.js')).default;
  const workflow = new GitHubReleaseTracker();

  // Test autoTrack (non-interactive)
  const generator = workflow.autoTrack({
    repos: [
      'anthropics/claude-code',
      'vercel/next.js',
      'facebook/react',
    ],
    stateFile: './test-github-state.json'
  });

  try {
    const result = await executeGenerator(generator, {
      inputProvider: createPrefilledProvider({}),
      outputHandler: createConsoleHandler('github-tracker')
    });

    console.log('\n  Result:', JSON.stringify(result, null, 2));
    return { success: true, result };
  } catch (error: any) {
    console.error('\n  ❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Workflow Test Suite');
  console.log('Testing Photon-based workflows with pre-filled inputs\n');

  const results: Record<string, any> = {};

  // Test RSS Aggregator
  results.rssAggregator = await testRSSAggregator();

  // Test GitHub Release Tracker
  results.githubTracker = await testGitHubReleaseTracker();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  for (const [name, result] of Object.entries(results)) {
    console.log(`  ${result.success ? '✅' : '❌'} ${name}`);
  }

  // Cleanup test files
  const fs = await import('fs/promises');
  try {
    await fs.unlink('./test-rss-output.json');
    await fs.unlink('./test-github-state.json');
    console.log('\n  🧹 Cleaned up test files');
  } catch {
    // Files may not exist
  }
}

main().catch(console.error);
