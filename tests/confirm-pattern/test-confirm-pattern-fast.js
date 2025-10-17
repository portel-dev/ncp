#!/usr/bin/env node
/**
 * Fast confirm-pattern test using cached embeddings
 * Uses existing embeddings from ~/.ncp.backup/embeddings.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load transformer.js
const { pipeline } = await import('@xenova/transformers');

console.log('\n🧪 Testing Confirm-Before-Run Pattern (Fast Mode)\n');

// Load cached embeddings
const embeddingsPath = path.join(process.env.HOME, '.ncp.backup', 'embeddings.json');
console.log(`Loading cached embeddings from: ${embeddingsPath}`);
const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));

const toolCount = Object.keys(embeddings).length;
console.log(`✓ Loaded ${toolCount} cached tool embeddings\n`);

// Load the pattern
const pattern = 'operations that delete files, remove data permanently, create or write files to disk, send emails or messages, post or publish content online, execute shell commands or scripts, modify database records, deploy or push to production, make HTTP POST PUT or DELETE requests, update or patch existing data, drop or truncate tables, commit or push to git repositories, transfer money or charge payments, revoke access or permissions, or make any changes that cannot be easily undone';

console.log(`Pattern: ${pattern.substring(0, 100)}...\n`);

// Create embedding for pattern
console.log('Creating pattern embedding...');
const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
const patternEmbedding = await model(pattern, { pooling: 'mean', normalize: true });
console.log('✓ Pattern embedding created\n');

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

// Test thresholds
const thresholds = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80];
console.log(`Testing ${thresholds.length} threshold levels: ${thresholds.join(', ')}\n`);

// Calculate similarities
console.log('Calculating similarities...');
const results = [];

for (const [toolId, toolData] of Object.entries(embeddings)) {
  const toolEmbedding = new Float32Array(toolData.embedding);
  const confidence = cosineSimilarity(patternEmbedding.data, toolEmbedding);

  results.push({
    toolId,
    toolName: toolData.toolName,
    description: toolData.description || '',
    confidence,
    thresholdResults: thresholds.map(t => confidence >= t ? 'YES' : 'NO')
  });
}

console.log(`✓ Analyzed ${results.length} tools\n`);

// CSV escape helper
function escapeCsv(field) {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Generate CSV
const csvRows = [];
const thresholdHeaders = thresholds.map(t => `Trigger_${t.toFixed(2)}`).join(',');
csvRows.push(`MCP,Tool,Description,Confidence,${thresholdHeaders}`);

for (const result of results) {
  const [mcpName, toolName] = result.toolId.split(':');
  csvRows.push([
    escapeCsv(mcpName || ''),
    escapeCsv(toolName || result.toolId),
    escapeCsv(result.description),
    result.confidence.toFixed(4),
    ...result.thresholdResults
  ].join(','));
}

// Write CSV
const outputPath = './confirm-pattern-results.csv';
fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');
console.log(`✓ Results written to ${outputPath}\n`);

// Display statistics
console.log('📊 Statistics by Threshold:\n');
console.log(`  Total tools: ${results.length}\n`);

thresholds.forEach(thresh => {
  const triggeredCount = results.filter(r => r.confidence >= thresh).length;
  const percentage = (triggeredCount / results.length * 100).toFixed(1);
  console.log(`  Threshold ${thresh.toFixed(2)}: ${triggeredCount} tools triggered (${percentage}%)`);
});

console.log();

// Show top 10
console.log('🔝 Top 10 Most Likely Modifier Operations:\n');
const sorted = results.sort((a, b) => b.confidence - a.confidence).slice(0, 10);

sorted.forEach((t, index) => {
  const confidencePercent = Math.round(t.confidence * 100);
  console.log(`  ${index + 1}. ${t.toolId} ${confidencePercent}%`);
  console.log(`     ${t.description.substring(0, 80)}${t.description.length > 80 ? '...' : ''}`);
});

console.log();

// Recommend threshold
console.log('💡 Threshold Recommendation:\n');
let recommendedThreshold = thresholds[0];
for (const thresh of thresholds) {
  const triggeredCount = results.filter(r => r.confidence >= thresh).length;
  const percentage = triggeredCount / results.length;
  if (percentage >= 0.10 && percentage <= 0.30) {
    recommendedThreshold = thresh;
    break;
  }
}

const recommendedCount = results.filter(r => r.confidence >= recommendedThreshold).length;
const recommendedPercentage = (recommendedCount / results.length * 100).toFixed(1);

console.log(`  Recommended: ${recommendedThreshold.toFixed(2)}`);
console.log(`  Would trigger: ${recommendedCount} tools (${recommendedPercentage}%)`);
console.log(`  Rationale: Balances safety (catches dangerous operations) with usability (avoids too many prompts)\n`);

console.log('💡 Review the CSV file to analyze all results in detail\n');
