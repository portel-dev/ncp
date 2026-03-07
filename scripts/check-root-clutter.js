#!/usr/bin/env node

/**
 * Validates that the repository root is clean and doesn't contain development files.
 * Runs before commits to prevent clutter from accumulating.
 *
 * Usage: npm run check:root
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_AT_ROOT = new Set([
  // Package files
  'package.json',
  'package-lock.json',

  // Configuration
  'tsconfig.json',
  'tsconfig.test.json',
  'jest.config.js',
  '.release-it.json',
  'manifest.json',
  'server.json',  // MCP registry metadata

  // Documentation (keep at root)
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'ncp.svg',  // Logo referenced in README

  // Hidden directories/files
  '.git',
  '.github',
  '.gitignore',
  '.npmignore',
  '.dockerignore',
  '.dxtignore',
  '.mcpbignore',
  '.claude',
  '.ncp',
  '.DS_Store',
  '.gitkeep-md',

  // Source directories
  'src',
  'dist',
  'tests',
  'docs',
  'examples',
  'assets',
  'node_modules',
  'coverage',
  'scripts',
  '_internal'
]);

const root = path.join(__dirname, '..');
const files = fs.readdirSync(root);

// Find files that shouldn't be at root
const offenders = files.filter(f => {
  // Skip hidden files (already checked above)
  if (f.startsWith('.')) return false;

  // Check against allowed list
  return !ALLOWED_AT_ROOT.has(f);
});

if (offenders.length > 0) {
  console.error('❌ Repository root contains files that should be in _internal/:');
  offenders.forEach(f => {
    const fullPath = path.join(root, f);
    const stat = fs.statSync(fullPath);
    const type = stat.isDirectory() ? '[dir]' : '[file]';
    console.error(`  ${type} ${f}`);
  });

  console.error('\n📝 Solution: Move these to _internal/ organized by type:');
  console.error('   - Scripts → _internal/scripts/');
  console.error('   - Planning docs → _internal/planning/');
  console.error('   - Schemas/examples → _internal/schemas/');
  console.error('   - Archives/backups → _internal/archives/');
  console.error('   - Build artifacts → _internal/artifacts/');
  console.error('\n📖 See .claude/cleanup-plan.md for details.\n');
  process.exit(1);
}

console.log('✅ Repository root is clean');
process.exit(0);
