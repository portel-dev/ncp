#!/usr/bin/env node
/**
 * Test tag/keyword-based patterns with hyphens
 * Testing if pure tags create stronger semantic vectors than prose
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🏷️  Testing Tag-Based Pattern Variations\n');

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

// Tag-based pattern variations
const patterns = [
  {
    name: 'Current (list with connectors)',
    text: 'operations that delete files, remove data permanently, create or write files to disk, send emails or messages, post or publish content online, execute shell commands or scripts, modify database records, deploy or push to production, make HTTP POST PUT or DELETE requests, update or patch existing data, drop or truncate tables, commit or push to git repositories, transfer money or charge payments, revoke access or permissions, or make any changes that cannot be easily undone'
  },
  {
    name: 'Tags: Hyphenated concepts',
    text: 'delete-files remove-data-permanently create-files write-to-disk send-emails send-messages publish-content-online execute-shell-commands run-scripts modify-database-records deploy-to-production push-to-production http-post-requests http-put-requests http-delete-requests update-data patch-data drop-database-tables truncate-tables git-commit git-push transfer-money charge-payments revoke-access revoke-permissions permanent-changes irreversible-changes'
  },
  {
    name: 'Tags: Core actions hyphenated',
    text: 'write-file delete-file modify-file move-file create-file execute-command run-command shell-command database-update database-delete database-modify deploy-code push-code send-message post-content publish-data revoke-permission change-access drop-table commit-code permanent-change'
  },
  {
    name: 'Tags: Minimal hyphens',
    text: 'delete remove write create modify execute deploy publish send post update patch drop truncate commit push transfer charge revoke permanent irreversible file-write file-delete database-update command-execution code-deployment'
  },
  {
    name: 'Tags: Action-object pairs',
    text: 'delete-file delete-data write-file write-data modify-file modify-data execute-command execute-script send-email send-message publish-content deploy-application update-database drop-table commit-repository push-repository revoke-permission change-permission'
  },
  {
    name: 'Tags: Semantic clusters',
    text: 'file-operations: write delete modify move create. database-operations: update delete drop truncate modify. execution-operations: run-command execute-shell run-script. deployment-operations: deploy push publish. communication-operations: send-email send-message post-content. permission-operations: revoke grant modify. financial-operations: transfer-money charge-payment. permanent destructive irreversible'
  },
  {
    name: 'Tags: Single words + key phrases',
    text: 'delete remove write create modify execute deploy publish send post update patch drop truncate commit push transfer charge revoke file disk database command shell script production email message content access permission money payment permanent irreversible'
  },
  {
    name: 'Tags: Dense hyphenated',
    text: 'file-write file-delete file-modify file-create file-move data-delete data-modify data-update data-remove command-execute shell-execute script-run database-update database-drop database-modify deploy production-push code-deploy email-send message-send content-publish permission-revoke access-revoke table-drop repo-commit repo-push payment-charge money-transfer permanent-change irreversible-action'
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
console.log(`Testing ${patterns.length} tag-based variations...\n`);

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
  const thresholds = [0.35, 0.40, 0.45, 0.50, 0.55];
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

console.log('\n📊 Tag Pattern Comparison:\n');

// Show comparison table
console.log('Pattern Performance:');
console.log('─'.repeat(120));
console.log('Pattern                           | Length | Max Score | Avg Score | @0.35 | @0.40 | @0.45 | @0.50 | @0.55');
console.log('─'.repeat(120));

patternResults.forEach(result => {
  const name = result.pattern.name.padEnd(33);
  const length = `${result.pattern.text.length}`.padStart(6);
  const max = `${(result.stats.max * 100).toFixed(1)}%`.padStart(9);
  const avg = `${(result.stats.avg * 100).toFixed(1)}%`.padStart(9);
  const counts = result.thresholdCounts.map(t => `${t.count}`.padStart(5)).join(' |');
  console.log(`${name} | ${length} | ${max} | ${avg} | ${counts}`);
});

console.log('─'.repeat(120));
console.log();

// Find best pattern by peak performance
const bestByPeak = patternResults.reduce((best, current) => {
  return current.stats.max > best.stats.max ? current : best;
});

// Find best pattern by balanced performance (peak * triggered count at 0.40)
const bestBalanced = patternResults.reduce((best, current) => {
  const currentScore = current.stats.max * (current.thresholdCounts.find(t => t.threshold === 0.40)?.count || 0);
  const bestScore = best.stats.max * (best.thresholdCounts.find(t => t.threshold === 0.40)?.count || 0);
  return currentScore > bestScore ? current : best;
});

console.log('🏆 Winner (Highest Peak):\n');
console.log(`  Pattern: "${bestByPeak.pattern.name}"`);
console.log(`  Max Score: ${(bestByPeak.stats.max * 100).toFixed(1)}%`);
console.log(`  Avg Score: ${(bestByPeak.stats.avg * 100).toFixed(1)}%`);
console.log(`  Length: ${bestByPeak.pattern.text.length} characters`);
console.log();

console.log('🎯 Winner (Best Balanced):\n');
console.log(`  Pattern: "${bestBalanced.pattern.name}"`);
console.log(`  Max Score: ${(bestBalanced.stats.max * 100).toFixed(1)}%`);
console.log(`  Tools @ 0.40: ${bestBalanced.thresholdCounts.find(t => t.threshold === 0.40)?.count || 0}`);
console.log(`  Length: ${bestBalanced.pattern.text.length} characters`);
console.log();

// Recommend threshold for best pattern
const recommendedThreshold = bestBalanced.thresholdCounts.find(t =>
  t.count >= bestBalanced.stats.count * 0.05 && t.count <= bestBalanced.stats.count * 0.25
)?.threshold || 0.40;

const triggeredCount = bestBalanced.toolScores.filter(t => t.confidence >= recommendedThreshold).length;
console.log(`  Recommended Threshold: ${recommendedThreshold.toFixed(2)}`);
console.log(`  Would trigger: ${triggeredCount} tools (${(triggeredCount / bestBalanced.stats.count * 100).toFixed(1)}%)`);
console.log();

console.log('🔝 Top 15 Tools with Best Pattern:\n');
bestBalanced.toolScores.slice(0, 15).forEach((tool, idx) => {
  const confidencePercent = (tool.confidence * 100).toFixed(1);
  const wouldTrigger = tool.confidence >= recommendedThreshold ? '✓' : ' ';
  console.log(`  ${wouldTrigger} ${(idx + 1).toString().padStart(2)}. ${tool.toolId.padEnd(40)} ${confidencePercent.padStart(5)}%`);
  if (idx < 10 || tool.confidence >= recommendedThreshold) {
    console.log(`      ${tool.description.substring(0, 75)}${tool.description.length > 75 ? '...' : ''}`);
  }
});

console.log();

// Side-by-side comparison
console.log('🔬 Tag Density Analysis:\n');
patternResults.forEach(result => {
  const words = result.pattern.text.split(/\s+/).length;
  const hyphens = (result.pattern.text.match(/-/g) || []).length;
  const density = words / result.pattern.text.length * 100;

  console.log(`${result.pattern.name}:`);
  console.log(`  Words: ${words} | Hyphens: ${hyphens} | Density: ${density.toFixed(2)}%`);
  console.log(`  Max: ${(result.stats.max * 100).toFixed(1)}% | @ 0.40: ${result.thresholdCounts.find(t => t.threshold === 0.40)?.count || 0} tools`);
  console.log();
});

// Export detailed results
const summary = {
  bestByPeak: {
    name: bestByPeak.pattern.name,
    text: bestByPeak.pattern.text,
    maxScore: bestByPeak.stats.max,
    avgScore: bestByPeak.stats.avg
  },
  bestBalanced: {
    name: bestBalanced.pattern.name,
    text: bestBalanced.pattern.text,
    maxScore: bestBalanced.stats.max,
    avgScore: bestBalanced.stats.avg,
    recommendedThreshold,
    triggeredCount,
    top15: bestBalanced.toolScores.slice(0, 15).map(t => ({
      toolId: t.toolId,
      confidence: t.confidence,
      description: t.description
    }))
  },
  allPatterns: patternResults.map(r => ({
    name: r.pattern.name,
    text: r.pattern.text,
    length: r.pattern.text.length,
    words: r.pattern.text.split(/\s+/).length,
    hyphens: (r.pattern.text.match(/-/g) || []).length,
    maxScore: r.stats.max,
    avgScore: r.stats.avg,
    thresholdCounts: r.thresholdCounts,
    top10: r.toolScores.slice(0, 10).map(t => ({
      toolId: t.toolId,
      confidence: t.confidence
    }))
  }))
};

fs.writeFileSync('./tag-pattern-results.json', JSON.stringify(summary, null, 2), 'utf-8');
console.log(`✓ Full results written to ./tag-pattern-results.json\n`);

console.log('💡 Key Insight:\n');
console.log('  Testing if pure tags (space-separated keywords with hyphens)');
console.log('  create stronger semantic vectors than prose or lists.\n');
console.log('  Hypothesis: Removing connector words increases keyword density\n');
