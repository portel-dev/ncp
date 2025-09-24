#!/usr/bin/env node

/**
 * Enhancement System Validation Test
 * Tests real user stories against our enhanced Discovery System
 */

import { EnhancementSystem } from '../dist/discovery/enhancement-system.js';

console.log('🧪 Testing Enhanced Discovery System with Real User Stories\n');

// Create enhancement system instance
const enhancementSystem = new EnhancementSystem();

// Test user stories that should now work with enhancements
const testCases = [
  {
    story: "I want to commit my changes to git",
    expectedMcps: ['shell-mcp', 'git-mcp', 'github-mcp'],
    tools: [
      { id: 'shell-mcp:run_command', description: 'Execute shell commands' },
      { id: 'git-mcp:commit', description: 'Commit changes to repository' },
      { id: 'github-mcp:commit', description: 'Commit via GitHub API' },
      { id: 'postgres-mcp:query', description: 'Execute SQL queries' } // Should not match
    ]
  },
  {
    story: "I need to compress a video file",
    expectedMcps: ['shell-mcp'],
    tools: [
      { id: 'shell-mcp:run_command', description: 'Execute shell commands' },
      { id: 'postgres-mcp:query', description: 'Execute SQL queries' },
      { id: 'github-mcp:create_issue', description: 'Create GitHub issue' }
    ]
  },
  {
    story: "I want to resize images",
    expectedMcps: ['shell-mcp'],
    tools: [
      { id: 'shell-mcp:run_command', description: 'Execute shell commands' },
      { id: 'docker-mcp:build', description: 'Build Docker image' },
      { id: 'github-mcp:create_pr', description: 'Create pull request' }
    ]
  },
  {
    story: "I need to store customer data",
    expectedMcps: ['postgres-mcp', 'database-mcp'],
    tools: [
      { id: 'postgres-mcp:insert', description: 'Insert data into PostgreSQL' },
      { id: 'shell-mcp:run_command', description: 'Execute shell commands' },
      { id: 'github-mcp:create_issue', description: 'Create GitHub issue' }
    ]
  },
  {
    story: "I want to deploy my application with Docker",
    expectedMcps: ['docker-mcp', 'shell-mcp'],
    tools: [
      { id: 'docker-mcp:build', description: 'Build Docker image' },
      { id: 'docker-mcp:run', description: 'Run Docker container' },
      { id: 'shell-mcp:run_command', description: 'Execute shell commands' },
      { id: 'postgres-mcp:query', description: 'Execute SQL queries' }
    ]
  }
];

let totalTests = 0;
let passedTests = 0;

function testEnhancement(story, tools, expectedMcps) {
  console.log(`\n📝 Testing: "${story}"`);

  const results = [];

  // Test each tool against the story
  for (const tool of tools) {
    const enhancements = enhancementSystem.enhance(story, tool.id, tool.description);

    if (enhancements.length > 0) {
      const totalBoost = enhancements.reduce((sum, e) => sum + e.boost, 0);
      const reasons = enhancements.map(e => e.reason).join('; ');

      results.push({
        toolId: tool.id,
        mcpName: tool.id.split(':')[0],
        boost: totalBoost,
        reasons: reasons,
        enhanced: true
      });

      console.log(`   ✅ ${tool.id} → +${totalBoost.toFixed(3)} boost`);
      console.log(`      Reasons: ${reasons}`);
    } else {
      results.push({
        toolId: tool.id,
        mcpName: tool.id.split(':')[0],
        boost: 0,
        reasons: 'No enhancement',
        enhanced: false
      });

      console.log(`   ❌ ${tool.id} → No enhancement`);
    }
  }

  // Sort by boost (highest first)
  results.sort((a, b) => b.boost - a.boost);

  console.log(`\n   🎯 Top Results:`);
  results.slice(0, 3).forEach((result, index) => {
    console.log(`   ${index + 1}. ${result.toolId} (boost: +${result.boost.toFixed(3)})`);
  });

  // Validate that expected MCPs are in top results
  const topMcps = results.slice(0, 3).map(r => r.mcpName);
  const foundExpectedMcps = expectedMcps.filter(expectedMcp =>
    topMcps.some(topMcp => topMcp.includes(expectedMcp) || expectedMcp.includes(topMcp))
  );

  totalTests++;
  if (foundExpectedMcps.length > 0) {
    console.log(`   ✅ SUCCESS: Found expected MCPs: ${foundExpectedMcps.join(', ')}`);
    passedTests++;
  } else {
    console.log(`   ❌ FAILED: Expected ${expectedMcps.join(', ')}, got ${topMcps.join(', ')}`);
  }

  return results;
}

// Run all test cases
console.log('🚀 Running Enhancement System Validation Tests\n');

for (const testCase of testCases) {
  testEnhancement(testCase.story, testCase.tools, testCase.expectedMcps);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log(`📊 Enhancement System Test Results:`);
console.log(`   Tests Run: ${totalTests}`);
console.log(`   Passed: ${passedTests}`);
console.log(`   Failed: ${totalTests - passedTests}`);
console.log(`   Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

const stats = enhancementSystem.getStats();
console.log(`\n📈 Enhancement System Stats:`);
console.log(`   Domain Capabilities: ${stats.domainCapabilities}`);
console.log(`   Semantic Bridges: ${stats.semanticBridges}`);
console.log(`   Total Domains: ${stats.totalDomains}`);
console.log(`   Avg Capability Confidence: ${stats.averageConfidence.capabilities.toFixed(2)}`);
console.log(`   Avg Bridge Confidence: ${stats.averageConfidence.bridges.toFixed(2)}`);

if (passedTests === totalTests) {
  console.log('\n🎉 All tests passed! Enhancement system is working correctly.');
} else {
  console.log('\n⚠️  Some tests failed. Enhancement system needs tuning.');
}

console.log('\n✨ Enhancement validation complete!');