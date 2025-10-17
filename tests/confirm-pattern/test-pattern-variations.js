#!/usr/bin/env node
/**
 * Test multiple pattern variations to find optimal wording
 * Compares confidence scores across different pattern formulations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🧪 Testing Multiple Pattern Variations\n');

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

// Pattern variations to test
const patterns = [
  {
    name: 'Current (verbose)',
    text: 'operations that delete files, remove data permanently, create or write files to disk, send emails or messages, post or publish content online, execute shell commands or scripts, modify database records, deploy or push to production, make HTTP POST PUT or DELETE requests, update or patch existing data, drop or truncate tables, commit or push to git repositories, transfer money or charge payments, revoke access or permissions, or make any changes that cannot be easily undone'
  },
  {
    name: 'Simplified verbs',
    text: 'operations that write, delete, modify, execute, deploy, publish, or change data permanently'
  },
  {
    name: 'Core concepts',
    text: 'modify delete write execute change deploy publish'
  },
  {
    name: 'Danger focus',
    text: 'dangerous operations that make permanent changes like deleting, writing, executing, or modifying data'
  },
  {
    name: 'State-changing',
    text: 'operations that change system state, modify files, execute commands, or alter data'
  },
  {
    name: 'Non-idempotent',
    text: 'non-idempotent operations that write, delete, execute, or permanently modify data'
  },
  {
    name: 'Side-effects',
    text: 'operations with side effects including file writes, deletions, executions, and data modifications'
  },
  {
    name: 'Mutating operations',
    text: 'mutating operations that write files, delete data, execute commands, or change database records'
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
console.log(`Testing ${patterns.length} pattern variations...\n`);

const patternResults = [];

for (const pattern of patterns) {
  console.log(`Testing: "${pattern.name}"`);
  console.log(`  Text: ${pattern.text.substring(0, 80)}...`);

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
  const minScore = Math.min(...validScores);

  // Count tools at different thresholds
  const thresholds = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60];
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
      min: minScore,
      count: toolScores.length
    },
    thresholdCounts,
    top10: toolScores.slice(0, 10)
  });

  console.log(`  ✓ Max: ${(maxScore * 100).toFixed(1)}% | Avg: ${(avgScore * 100).toFixed(1)}% | Top 10 range: ${(toolScores[0].confidence * 100).toFixed(1)}%-${(toolScores[9].confidence * 100).toFixed(1)}%\n`);
}

console.log('\n📊 Comparison Summary:\n');

// Show comparison table
console.log('Pattern Performance:');
console.log('─'.repeat(100));
console.log('Pattern                  | Max Score | Avg Score | @0.35 | @0.40 | @0.45 | @0.50 | @0.55 | @0.60');
console.log('─'.repeat(100));

patternResults.forEach(result => {
  const name = result.pattern.name.padEnd(24);
  const max = `${(result.stats.max * 100).toFixed(1)}%`.padStart(9);
  const avg = `${(result.stats.avg * 100).toFixed(1)}%`.padStart(9);
  const counts = result.thresholdCounts.map(t => `${t.count}`.padStart(5)).join(' |');
  console.log(`${name} | ${max} | ${avg} | ${counts}`);
});

console.log('─'.repeat(100));
console.log();

// Find best pattern (highest max score and good distribution)
const bestPattern = patternResults.reduce((best, current) => {
  // Score = max score * (tools at 0.40 threshold / total tools)
  // We want high max score but also reasonable number of triggers
  const currentScore = current.stats.max * (current.thresholdCounts.find(t => t.threshold === 0.40).count / current.stats.count);
  const bestScore = best.stats.max * (best.thresholdCounts.find(t => t.threshold === 0.40).count / best.stats.count);
  return currentScore > bestScore ? current : best;
});

console.log('🏆 Recommended Pattern:\n');
console.log(`  Name: "${bestPattern.pattern.name}"`);
console.log(`  Text: "${bestPattern.pattern.text}"`);
console.log(`  Max Score: ${(bestPattern.stats.max * 100).toFixed(1)}%`);
console.log(`  Avg Score: ${(bestPattern.stats.avg * 100).toFixed(1)}%`);
console.log();

// Recommend threshold for best pattern
const recommendedThreshold = bestPattern.thresholdCounts.find(t =>
  t.count >= bestPattern.stats.count * 0.08 && t.count <= bestPattern.stats.count * 0.25
)?.threshold || 0.40;

const triggeredCount = bestPattern.toolScores.filter(t => t.confidence >= recommendedThreshold).length;
console.log(`  Recommended Threshold: ${recommendedThreshold.toFixed(2)}`);
console.log(`  Would trigger: ${triggeredCount} tools (${(triggeredCount / bestPattern.stats.count * 100).toFixed(1)}%)`);
console.log();

console.log('🔝 Top 10 Tools with Recommended Pattern:\n');
bestPattern.top10.forEach((tool, idx) => {
  const confidencePercent = (tool.confidence * 100).toFixed(1);
  const wouldTrigger = tool.confidence >= recommendedThreshold ? '✓' : ' ';
  console.log(`  ${wouldTrigger} ${idx + 1}. ${tool.toolId} (${confidencePercent}%)`);
  console.log(`     ${tool.description.substring(0, 80)}${tool.description.length > 80 ? '...' : ''}`);
});

console.log();

// Export detailed CSV for best pattern
const csvRows = [];
csvRows.push('MCP,Tool,Description,Confidence,Trigger_0.35,Trigger_0.40,Trigger_0.45,Trigger_0.50');

for (const tool of bestPattern.toolScores) {
  const [mcpName, toolName] = tool.toolId.split(':');
  const triggers = [0.35, 0.40, 0.45, 0.50].map(t => tool.confidence >= t ? 'YES' : 'NO').join(',');

  function escapeCsv(field) {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  csvRows.push([
    escapeCsv(mcpName || ''),
    escapeCsv(toolName || tool.toolId),
    escapeCsv(tool.description),
    tool.confidence.toFixed(4),
    triggers
  ].join(','));
}

const outputPath = './optimal-pattern-results.csv';
fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');
console.log(`✓ Detailed results written to ${outputPath}\n`);

// Export summary JSON
const summary = {
  recommendation: {
    patternName: bestPattern.pattern.name,
    patternText: bestPattern.pattern.text,
    threshold: recommendedThreshold,
    expectedTriggers: triggeredCount,
    expectedPercentage: (triggeredCount / bestPattern.stats.count * 100).toFixed(1) + '%'
  },
  allPatterns: patternResults.map(r => ({
    name: r.pattern.name,
    text: r.pattern.text,
    maxScore: r.stats.max,
    avgScore: r.stats.avg,
    thresholdCounts: r.thresholdCounts
  }))
};

fs.writeFileSync('./pattern-comparison-summary.json', JSON.stringify(summary, null, 2), 'utf-8');
console.log(`✓ Summary written to ./pattern-comparison-summary.json\n`);
