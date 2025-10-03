#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATTERNS = {
  aiGenerated: [
    /\.prd\.md$/,
    /\.draft\.md$/,
    /\.ai\.md$/,
    /\.notes\.md$/,
    /\.temp\.md$/,
    /^2025-.*\.txt$/,  // Date-prefixed AI exports
  ],
  testFiles: [
    /^test-.*\.js$/,
    /\.test\.js$/,
    /\.script\.js$/
  ],
  backups: [
    /\.backup\./,
    /\.old$/,
    /~$/,
    /\.disabled$/
  ],
  misplaced: [
    // Files that should be in docs/ but are in root
    /^TESTING\.md$/,
    /^MCP_EXPANSION_SUMMARY\.md$/,
    /^mcp-expansion-strategy\.md$/
  ],
  local: [
    /\.local\./,
    /^\.claude\.local\.md$/,
    /^CLAUDE\.local\.md$/
  ]
};

function scanDirectory(dir, ignore = ['node_modules', 'dist', '.git', '.ncp']) {
  const issues = [];

  function scan(currentPath) {
    try {
      const files = fs.readdirSync(currentPath);

      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const relativePath = path.relative(process.cwd(), fullPath);

        if (ignore.some(i => relativePath.includes(i))) continue;

        if (fs.statSync(fullPath).isDirectory()) {
          scan(fullPath);
        } else {
          // Check against patterns
          for (const [category, patterns] of Object.entries(PATTERNS)) {
            if (patterns.some(p => p.test(file))) {
              // Only flag files in root for certain categories
              const isRoot = path.dirname(relativePath) === '.';

              if (category === 'aiGenerated' || category === 'testFiles' || category === 'misplaced') {
                if (isRoot) {
                  issues.push({
                    category,
                    file: relativePath,
                    action: getRecommendedAction(category, file)
                  });
                }
              } else {
                issues.push({
                  category,
                  file: relativePath,
                  action: getRecommendedAction(category, file)
                });
              }
            }
          }

          // Check for misplaced files in specific directories
          if (relativePath.startsWith('scripts/') && file.endsWith('.md')) {
            issues.push({
              category: 'misplaced',
              file: relativePath,
              action: 'Move to docs/ with appropriate sub-extension'
            });
          }

          // Check test directory for non-test files
          const validTestExtensions = [
            '.test.ts', '.test.js', '.test.cjs', '.test.mjs',
            '.spec.ts', '.spec.js', '.spec.cjs', '.spec.mjs',
            '.ts', '.js', '.cjs', '.mjs',
            '.sh', '.bash',  // Shell test scripts
            '.json', '.yaml', '.yml'  // Config files for mock data
          ];
          const isMockDirectory = relativePath.includes('/mock-') || relativePath.includes('/mocks/');
          const isValidTestFile = validTestExtensions.some(ext => file.endsWith(ext)) || isMockDirectory;

          if (relativePath.startsWith('test/') && !isValidTestFile) {
            issues.push({
              category: 'misplaced',
              file: relativePath,
              action: 'Non-test file in test directory'
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not scan ${currentPath}: ${error.message}`);
    }
  }

  scan(dir);
  return issues;
}

function getRecommendedAction(category, file) {
  switch (category) {
    case 'aiGenerated':
      return 'Should be gitignored (use sub-extension system)';
    case 'testFiles':
      return 'Move to test/ directory or delete if obsolete';
    case 'backups':
      return 'Delete or move to backup location';
    case 'misplaced':
      return 'Move to appropriate directory (docs/)';
    case 'local':
      return 'Should be gitignored (local development only)';
    default:
      return 'Review and categorize appropriately';
  }
}

function generateReport(issues) {
  if (issues.length === 0) {
    console.log('✅ Repository is clean!');
    return;
  }

  console.log('🔍 Repository Cleanup Issues Found:\n');

  // Group issues by category
  const groupedIssues = issues.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {});

  Object.entries(groupedIssues).forEach(([category, categoryIssues]) => {
    console.log(`\n📂 ${category.toUpperCase()} (${categoryIssues.length} issues):`);
    categoryIssues.forEach(issue => {
      console.log(`  ❌ ${issue.file}`);
      console.log(`     → ${issue.action}`);
    });
  });

  console.log(`\n📊 Summary: ${issues.length} total issues found`);

  // Provide cleanup suggestions
  console.log('\n💡 Quick Fix Commands:');
  console.log('   # Remove test files from root:');
  console.log('   rm test-*.js');
  console.log('   # Move documentation to docs:');
  console.log('   mv HOW-IT-WORKS.md docs/how-it-works.md');
  console.log('   mv TESTING.md docs/guides/testing.md');
}

// Run scan if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const issues = scanDirectory('.');
  generateReport(issues);

  // Exit with error code if issues found (for CI/CD)
  process.exit(issues.length > 0 ? 1 : 0);
}

export { scanDirectory, generateReport };