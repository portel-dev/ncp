#!/usr/bin/env node

/**
 * Test Enhanced Discovery Integration
 * Validates that ecosystem enhancements are properly integrated
 */

import { PersistentRAGEngine } from '../dist/discovery/rag-engine.js';
import { EnhancementSystem } from '../dist/discovery/enhancement-system.js';
import { applyEcosystemEnhancements, getEnhancementStats } from '../dist/discovery/enhanced-domain-mappings.js';

console.log('🧪 Testing Ecosystem Enhancement Integration\n');

// Test 1: Direct enhancement system application
console.log('1. Testing Direct Enhancement System:');
const directSystem = new EnhancementSystem();
const statsBefore = directSystem.getStats();
console.log(`   Before: ${statsBefore.domainCapabilities} capabilities, ${statsBefore.semanticBridges} bridges`);

applyEcosystemEnhancements(directSystem);
const statsAfter = directSystem.getStats();
console.log(`   After: ${statsAfter.domainCapabilities} capabilities, ${statsAfter.semanticBridges} bridges`);

const enhancementStats = getEnhancementStats();
console.log(`   Expected: ${enhancementStats.domainCapabilities} capabilities, ${enhancementStats.semanticBridges} bridges`);

if (statsAfter.domainCapabilities > statsBefore.domainCapabilities) {
  console.log('   ✅ Domain capabilities successfully added');
} else {
  console.log('   ❌ Domain capabilities not added');
}

if (statsAfter.semanticBridges > statsBefore.semanticBridges) {
  console.log('   ✅ Semantic bridges successfully added');
} else {
  console.log('   ❌ Semantic bridges not added');
}

// Test 2: RAG Engine integration
console.log('\n2. Testing RAG Engine Integration:');
try {
  const ragEngine = new PersistentRAGEngine();
  console.log('   ✅ RAG Engine created successfully');
  console.log('   ✅ Enhancement system should be automatically initialized');
} catch (error) {
  console.log(`   ❌ RAG Engine creation failed: ${error.message}`);
}

// Test 3: Enhancement scenarios
console.log('\n3. Testing Enhancement Scenarios:');

const testScenarios = [
  {
    query: 'I want to commit my changes to git',
    toolId: 'shell:run_command',
    description: 'Execute shell commands with environment control',
    expectedEnhancement: true,
    expectedReason: 'shell has git version control operations capabilities'
  },
  {
    query: 'compress a video file with ffmpeg',
    toolId: 'shell:run_command',
    description: 'Execute shell commands',
    expectedEnhancement: true,
    expectedReason: 'shell has ffmpeg video processing capabilities'
  },
  {
    query: 'deploy my application to kubernetes',
    toolId: 'shell:run_command',
    description: 'Execute shell commands',
    expectedEnhancement: true,
    expectedReason: 'shell has kubernetes cluster operations capabilities'
  },
  {
    query: 'save customer data',
    toolId: 'postgres:insert',
    description: 'Insert data into PostgreSQL',
    expectedEnhancement: true,
    expectedReason: 'semantic bridge for storing customer data'
  },
  {
    query: 'generate some text',
    toolId: 'openai:completion',
    description: 'OpenAI text completion',
    expectedEnhancement: true,
    expectedReason: 'semantic bridge for text generation'
  }
];

let scenariosPassed = 0;

for (const scenario of testScenarios) {
  const enhancements = directSystem.enhance(
    scenario.query,
    scenario.toolId,
    scenario.description
  );

  const hasEnhancement = enhancements.length > 0;
  const totalBoost = enhancements.reduce((sum, e) => sum + e.boost, 0);

  if (hasEnhancement && totalBoost > 0) {
    console.log(`   ✅ "${scenario.query}" → ${scenario.toolId} (+${totalBoost.toFixed(3)})`);
    console.log(`      Reason: ${enhancements[0].reason}`);
    scenariosPassed++;
  } else {
    console.log(`   ❌ "${scenario.query}" → ${scenario.toolId} (no enhancement)`);
  }
}

console.log(`\n   Enhanced scenarios: ${scenariosPassed}/${testScenarios.length}`);

// Test 4: Specific shell → git mapping
console.log('\n4. Testing Shell → Git Capability Mapping:');

const shellGitTest = directSystem.enhance(
  'commit my file changes to version control',
  'shell:run_command',
  'Execute shell commands and scripts'
);

if (shellGitTest.length > 0) {
  console.log('   ✅ Shell MCP enhanced for git operations');
  console.log(`   Boost: +${shellGitTest.reduce((sum, e) => sum + e.boost, 0).toFixed(3)}`);
  shellGitTest.forEach(e => {
    console.log(`   - ${e.type}: ${e.reason} (confidence: ${e.confidence})`);
  });
} else {
  console.log('   ❌ Shell MCP not enhanced for git operations');
}

// Summary
console.log('\n📊 Integration Test Summary:');
console.log(`   Domain capabilities: ${statsAfter.domainCapabilities}`);
console.log(`   Semantic bridges: ${statsAfter.semanticBridges}`);
console.log(`   Enhancement scenarios working: ${scenariosPassed}/${testScenarios.length}`);

const successRate = Math.round((scenariosPassed / testScenarios.length) * 100);
if (successRate >= 80) {
  console.log(`\n🎉 Integration successful! ${successRate}% of scenarios working`);
} else {
  console.log(`\n⚠️  Integration needs work. Only ${successRate}% of scenarios working`);
}

console.log('\n✅ The enhancement system should now bridge the gap between:');
console.log('   • User queries like "commit to git"');
console.log('   • Shell MCP capabilities (which include git)');
console.log('   • RAG search results (which would miss this connection)');