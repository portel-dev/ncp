#!/usr/bin/env node
/**
 * Test story-driven pattern variations
 * Tests if narrative/story form yields better semantic matching
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n📖 Testing Story-Driven Pattern Variations\n');

// Load cached embeddings
const embeddingsPath = path.join(process.env.HOME, '.ncp.backup', 'embeddings.json');
console.log(`Loading cached embeddings from: ${embeddingsPath}`);
const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));

const toolCount = Object.keys(embeddings).length;
console.log(`✓ Loaded ${toolCount} cached tool embeddings\n`);

// Load transformer.js
const { pipeline } = await import('@xenova/transformers');
console.log('Loading embedding model...');
const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
console.log('✓ Model loaded\n');

// Story-driven pattern variations
const patterns = [
  {
    name: 'Current (list form)',
    text: 'operations that delete files, remove data permanently, create or write files to disk, send emails or messages, post or publish content online, execute shell commands or scripts, modify database records, deploy or push to production, make HTTP POST PUT or DELETE requests, update or patch existing data, drop or truncate tables, commit or push to git repositories, transfer money or charge payments, revoke access or permissions, or make any changes that cannot be easily undone'
  },
  {
    name: 'Story: Definition',
    text: 'This is a modifying operation when it performs actions that change the system state. These operations include deleting files or removing data permanently from storage. They include creating new files or writing content to disk. They include sending emails, posting messages, or publishing content online. They include executing shell commands or running scripts. They include modifying database records or updating data. They include deploying to production or pushing changes to live systems. They include making HTTP requests that modify data through POST, PUT, or DELETE methods. They include dropping database tables or revoking permissions. These are operations that make permanent changes which cannot be easily undone.'
  },
  {
    name: 'Story: Consequence-focused',
    text: 'This tool makes permanent changes to your system. It might delete files that cannot be recovered. It might write new data to disk or modify existing files. It might send messages or publish content that others will see. It might execute commands that change your system state. It might modify database records or update data permanently. It might deploy code to production servers. It might make HTTP requests that create, update, or delete data. It might remove database tables or revoke access permissions. These actions have lasting consequences and cannot be easily reversed.'
  },
  {
    name: 'Story: Behavior description',
    text: 'A modifier operation changes things. It deletes files and removes data permanently. It creates new files and writes content to disk. It sends emails and messages. It publishes content online. It executes shell commands and runs scripts. It modifies database records and updates data. It deploys code and pushes to production. It makes HTTP POST, PUT, and DELETE requests. It drops database tables and truncates data. It commits to git repositories and pushes changes. It transfers money and charges payments. It revokes access and changes permissions. These operations modify state and make permanent changes.'
  },
  {
    name: 'Story: Question form',
    text: 'Does this operation modify the system? Does it delete files or remove data permanently? Does it create new files or write to disk? Does it send emails or messages? Does it publish content online? Does it execute shell commands or scripts? Does it modify database records or update data? Does it deploy to production or push changes? Does it make HTTP POST, PUT, or DELETE requests? Does it drop tables or truncate data? Does it commit or push to repositories? Does it transfer money or charge payments? Does it revoke access or change permissions? If yes to any of these, it makes permanent changes that cannot be easily undone.'
  },
  {
    name: 'Story: Classification narrative',
    text: 'We classify an operation as a modifier when it exhibits certain behaviors. A modifier operation writes data, whether by creating new files, updating existing ones, or appending to storage. A modifier operation destroys data through deletion, removal, or truncation. A modifier operation executes code such as shell commands, scripts, or arbitrary programs. A modifier operation communicates externally by sending emails, posting messages, or publishing content. A modifier operation transforms system state through database updates, configuration changes, or permission modifications. A modifier operation deploys changes to production environments or pushes code to repositories. These operations share a common trait: they make permanent changes to state that cannot be trivially reversed.'
  },
  {
    name: 'Story: Impact-centered',
    text: 'This operation has a permanent impact. When it runs, it changes files by writing, deleting, or moving them. When it runs, it modifies data in databases or storage systems. When it runs, it executes commands that alter system state. When it runs, it sends communications like emails or messages. When it runs, it publishes content that becomes visible to others. When it runs, it deploys code or pushes changes to production. When it runs, it makes HTTP requests that create, update, or remove data. When it runs, it changes permissions, access rights, or configurations. The impact of these operations persists after execution and cannot be easily undone.'
  },
  {
    name: 'Story: Safety warning narrative',
    text: 'Be careful: this operation modifies your system in ways that persist. It may delete files, and those files will be gone. It may write new data, and that data will be stored. It may execute commands, and those commands will run. It may send messages, and those messages will be delivered. It may publish content, and that content will be public. It may modify databases, and those changes will be saved. It may deploy to production, and that code will be live. It may make destructive HTTP requests. It may drop database tables. It may revoke permissions. These are not read-only operations—they make real, permanent changes that affect your system state.'
  }
];

// Cosine similarity helper
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += Number(a[i]) * Number(b[i]);
    normA += Number(a[i]) * Number(a[i]);
    normB += Number(b[i]) * Number(b[i]);
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Test each pattern
console.log(`Testing ${patterns.length} story-driven variations...\n`);

const patternResults = [];

for (const pattern of patterns) {
  console.log(`Testing: "${pattern.name}"`);
  console.log(`  Length: ${pattern.text.length} chars`);

  // Create embedding for this pattern
  const patternEmbedding = await model(pattern.text, { pooling: 'mean', normalize: true });

  // Calculate similarities for all tools
  const toolScores = [];

  for (const [toolId, toolData] of Object.entries(embeddings)) {
    const toolEmbedding = new Float32Array(toolData.embedding);
    const confidence = cosineSimilarity(patternEmbedding.data, toolEmbedding);

    if (!isNaN(confidence)) {
      toolScores.push({
        toolId,
        toolName: toolData.toolName,
        description: toolData.description || '',
        confidence
      });
    }
  }

  // Sort by confidence
  toolScores.sort((a, b) => b.confidence - a.confidence);

  // Calculate statistics
  const validScores = toolScores.map(t => t.confidence);
  const avgScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
  const maxScore = Math.max(...validScores);

  // Count tools at different thresholds
  const thresholds = [0.35, 0.40, 0.45, 0.50];
  const thresholdCounts = thresholds.map(thresh => ({
    threshold: thresh,
    count: toolScores.filter(t => t.confidence >= thresh).length,
    percentage: (toolScores.filter(t => t.confidence >= thresh).length / toolScores.length * 100).toFixed(1)
  }));

  patternResults.push({
    pattern,
    toolScores,
    stats: {
      avg: avgScore,
      max: maxScore,
      count: toolScores.length
    },
    thresholdCounts,
    top10: toolScores.slice(0, 10)
  });

  console.log(`  ✓ Max: ${(maxScore * 100).toFixed(1)}% | Avg: ${(avgScore * 100).toFixed(1)}%\n`);
}

console.log('\n📊 Story Pattern Comparison:\n');

// Show comparison table
console.log('Pattern Performance:');
console.log('─'.repeat(110));
console.log('Pattern                           | Length | Max Score | Avg Score | @0.35 | @0.40 | @0.45 | @0.50');
console.log('─'.repeat(110));

patternResults.forEach(result => {
  const name = result.pattern.name.padEnd(33);
  const length = `${result.pattern.text.length}`.padStart(6);
  const max = `${(result.stats.max * 100).toFixed(1)}%`.padStart(9);
  const avg = `${(result.stats.avg * 100).toFixed(1)}%`.padStart(9);
  const counts = result.thresholdCounts.map(t => `${t.count}`.padStart(5)).join(' |');
  console.log(`${name} | ${length} | ${max} | ${avg} | ${counts}`);
});

console.log('─'.repeat(110));
console.log();

// Find best pattern
const bestPattern = patternResults.reduce((best, current) => {
  const currentScore = current.stats.max * (current.thresholdCounts.find(t => t.threshold === 0.40).count / current.stats.count);
  const bestScore = best.stats.max * (best.thresholdCounts.find(t => t.threshold === 0.40).count / best.stats.count);
  return currentScore > bestScore ? current : best;
});

console.log('🏆 Winner:\n');
console.log(`  Pattern: "${bestPattern.pattern.name}"`);
console.log(`  Max Score: ${(bestPattern.stats.max * 100).toFixed(1)}%`);
console.log(`  Avg Score: ${(bestPattern.stats.avg * 100).toFixed(1)}%`);
console.log(`  Length: ${bestPattern.pattern.text.length} characters`);
console.log();

// Recommend threshold
const recommendedThreshold = bestPattern.thresholdCounts.find(t =>
  t.count >= bestPattern.stats.count * 0.05 && t.count <= bestPattern.stats.count * 0.25
)?.threshold || 0.40;

const triggeredCount = bestPattern.toolScores.filter(t => t.confidence >= recommendedThreshold).length;
console.log(`  Recommended Threshold: ${recommendedThreshold.toFixed(2)}`);
console.log(`  Would trigger: ${triggeredCount} tools (${(triggeredCount / bestPattern.stats.count * 100).toFixed(1)}%)`);
console.log();

console.log('🔝 Top 15 Tools with Winner Pattern:\n');
bestPattern.toolScores.slice(0, 15).forEach((tool, idx) => {
  const confidencePercent = (tool.confidence * 100).toFixed(1);
  const wouldTrigger = tool.confidence >= recommendedThreshold ? '✓' : ' ';
  console.log(`  ${wouldTrigger} ${(idx + 1).toString().padStart(2)}. ${tool.toolId.padEnd(40)} ${confidencePercent.padStart(5)}%`);
  if (idx < 10 || tool.confidence >= recommendedThreshold) {
    console.log(`      ${tool.description.substring(0, 75)}${tool.description.length > 75 ? '...' : ''}`);
  }
});

console.log();

// Compare top performers
console.log('🎯 Head-to-Head Top Performers:\n');
const topPerformers = patternResults
  .sort((a, b) => b.stats.max - a.stats.max)
  .slice(0, 3);

console.log('Comparing top 3 patterns by max score:\n');
topPerformers.forEach((result, idx) => {
  console.log(`${idx + 1}. ${result.pattern.name} (Max: ${(result.stats.max * 100).toFixed(1)}%)`);
  console.log(`   Top 5 tools:`);
  result.top10.slice(0, 5).forEach((tool, tidx) => {
    console.log(`   ${tidx + 1}. ${tool.toolId} (${(tool.confidence * 100).toFixed(1)}%)`);
  });
  console.log();
});

// Export detailed results
const summary = {
  winner: {
    name: bestPattern.pattern.name,
    text: bestPattern.pattern.text,
    maxScore: bestPattern.stats.max,
    avgScore: bestPattern.stats.avg,
    recommendedThreshold,
    triggeredCount,
    top10: bestPattern.top10.map(t => ({
      toolId: t.toolId,
      confidence: t.confidence,
      description: t.description
    }))
  },
  allPatterns: patternResults.map(r => ({
    name: r.pattern.name,
    text: r.pattern.text,
    length: r.pattern.text.length,
    maxScore: r.stats.max,
    avgScore: r.stats.avg,
    thresholdCounts: r.thresholdCounts,
    top5: r.toolScores.slice(0, 5).map(t => ({
      toolId: t.toolId,
      confidence: t.confidence
    }))
  }))
};

fs.writeFileSync('./story-pattern-results.json', JSON.stringify(summary, null, 2), 'utf-8');
console.log(`✓ Full results written to ./story-pattern-results.json\n`);

console.log('💡 Key Insights:\n');
console.log('  - Story-driven patterns test narrative vs. list forms');
console.log('  - Longer patterns may provide richer semantic context');
console.log('  - The embedding model responds to natural language structure');
console.log('  - "Everything is a story" philosophy applied to pattern matching\n');
