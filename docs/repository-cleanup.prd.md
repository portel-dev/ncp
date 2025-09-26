# Product Requirements Document (PRD)
# Repository Cleanup & Organization Strategy

## 1. Executive Summary

The NCP repository has become cluttered with AI-generated files, test files, documentation drafts, and temporary work files scattered throughout the project structure. This PRD defines a comprehensive cleanup strategy using **sub-extensions** for categorization and automated exclusion patterns.

## 2. File Categorization Strategy

### 2.1 Sub-Extension System

All markdown and temporary files will use descriptive sub-extensions:

| Sub-Extension | Purpose | Example | Git Status |
|--------------|---------|---------|------------|
| `.txt` | Exported chat histories | `2025-09-26-chat-export.txt` | ❌ Ignored |
| `.prd.md` | Product Requirements Documents | `cache-architecture.prd.md` | ❌ Ignored |
| `.draft.md` | Draft documentation | `api-design.draft.md` | ❌ Ignored |
| `.ai.md` | AI-generated content | `analysis.ai.md` | ❌ Ignored |
| `.notes.md` | Personal notes/brainstorming | `ideas.notes.md` | ❌ Ignored |
| `.temp.md` | Temporary documentation | `meeting.temp.md` | ❌ Ignored |
| `.test.js` | Test scripts (not Jest tests) | `validate.test.js` | ❌ Ignored |
| `.script.js` | One-off scripts | `migration.script.js` | ❌ Ignored |
| `.local.*` | Local configuration | `config.local.json` | ❌ Ignored |
| `.backup.*` | Backup files | `profile.backup.json` | ❌ Ignored |

**Production documentation keeps standard extension:**
- `README.md` ✅ Tracked
- `CONTRIBUTING.md` ✅ Tracked
- `CHANGELOG.md` ✅ Tracked
- `LICENSE` ✅ Tracked

## 3. Repository Structure

### 3.1 Target Directory Structure

```
ncp-production-clean/
├── .github/                  # GitHub specific files
│   └── workflows/           # CI/CD workflows
├── src/                     # Source code only
│   ├── cache/              # Cache management (NEW)
│   ├── cli/                # CLI implementation
│   ├── discovery/          # Discovery engine
│   ├── orchestrator/       # MCP orchestration
│   ├── profiles/           # Profile management
│   ├── server/             # MCP server
│   ├── testing/            # Testing utilities
│   └── utils/              # Utilities
├── test/                    # Jest tests only
│   └── fixtures/           # Test fixtures
├── docs/                    # Production documentation
│   ├── api/                # API documentation
│   ├── guides/             # User guides
│   └── *.prd.md            # PRDs (gitignored)
├── scripts/                 # Build & maintenance scripts
│   ├── build/              # Build scripts
│   ├── cleanup/            # Cleanup utilities (NEW)
│   └── *.script.js         # One-off scripts (gitignored)
├── .gitignore              # Git ignore rules
├── .npmignore              # NPM ignore rules
├── package.json            # Package configuration
├── tsconfig.json           # TypeScript config
├── jest.config.js          # Jest configuration
├── README.md               # Main documentation
├── CHANGELOG.md            # Release history
├── CONTRIBUTING.md         # Contribution guide
└── LICENSE                 # License file
```

### 3.2 Files to Remove/Relocate

**Files in root to remove:**
```
❌ 2025-09-24-how-to-make-ncp-popular.txt → move to ../ncp-dev-workspace (AI generated)
❌ MCP_EXPANSION_SUMMARY.md → docs/expansion.draft.md
❌ mcp-expansion-strategy.md → docs/strategy.draft.md
❌ HOW-IT-WORKS.md → docs/guides/how-it-works.md
❌ TESTING.md → docs/guides/testing.md
❌ test-domain-analyzer.js → Delete
❌ test-enhancement.js → Delete
❌ test-integration.sh → scripts/test-integration.sh
❌ smithery.yaml → Delete (if not used)
❌ CLAUDE.local.md → .claude.local.md (gitignored)
```

**Scripts folder cleanup:**
```
❌ *.md files → Move to docs/ with appropriate sub-extensions
❌ *.js files → Review and categorize:
  - Build scripts → Keep in scripts/build/
  - Test scripts → Convert to .script.js
  - One-off scripts → Delete or archive
```

## 4. Gitignore Patterns

### 4.1 Enhanced .gitignore

```gitignore
# Dependencies
node_modules/
dist/
coverage/

# Local configuration
.env
.env.local
*.local.*
.claude.local.md

# Cache and temp files
.ncp/
*.cache
*.tmp
*.temp
*.backup.*

# AI and draft content
*.prd.md
*.draft.md
*.ai.md
*.notes.md
*.temp.md

# Test and script files
*.test.js
*.script.js
!jest.config.js
!test/**/*.test.ts

# IDE
.idea/
.vscode/
*.swp
*.swo
*~
.DS_Store

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

### 4.2 Enhanced .npmignore

```npmignore
# Source files (only dist/ is published)
src/
test/
scripts/
docs/
coverage/
.github/

# Configuration files
.gitignore
.npmignore
tsconfig.json
jest.config.js
.release-it.json

# Documentation (except essentials)
*.prd.md
*.draft.md
*.ai.md
*.notes.md
*.temp.md
CONTRIBUTING.md
CHANGELOG.md

# Local files
.ncp/
*.local.*
.env*

# Development files
*.test.js
*.script.js
*.backup.*
```

## 5. Cleanup Scripts

### 5.1 Git History Cleaner

Create `scripts/cleanup/remove-from-history.sh`:

```bash
#!/bin/bash
# Battle-tested script to remove files from entire git history

if [ -z "$1" ]; then
  echo "Usage: ./remove-from-history.sh <file-path>"
  exit 1
fi

FILE_TO_REMOVE="$1"

# Create backup
git clone . ../ncp-backup-$(date +%Y%m%d-%H%M%S)

# Remove file from all commits
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch $FILE_TO_REMOVE" \
  --prune-empty --tag-name-filter cat -- --all

# Clean up refs
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d

# Aggressive cleanup
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "✅ Removed $FILE_TO_REMOVE from git history"
echo "⚠️  Run 'git push --force --all' to update remote"
```

### 5.2 Repository Scanner

Create `scripts/cleanup/scan-repository.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PATTERNS = {
  aiGenerated: [
    /\.prd\.md$/,
    /\.draft\.md$/,
    /\.ai\.md$/,
    /\.notes\.md$/,
    /\.temp\.md$/
  ],
  testFiles: [
    /^test-.*\.js$/,
    /\.test\.js$/,
    /\.script\.js$/
  ],
  backups: [
    /\.backup\./,
    /\.old$/,
    /~$/
  ]
};

function scanDirectory(dir, ignore = ['node_modules', 'dist', '.git']) {
  const issues = [];

  function scan(currentPath) {
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
            issues.push({
              category,
              file: relativePath,
              action: 'Should be gitignored or removed'
            });
          }
        }

        // Check for misplaced files
        if (relativePath.startsWith('test/') && !file.endsWith('.test.ts')) {
          issues.push({
            category: 'misplaced',
            file: relativePath,
            action: 'Non-test file in test directory'
          });
        }
      }
    }
  }

  scan(dir);
  return issues;
}

// Run scan
const issues = scanDirectory('.');
if (issues.length > 0) {
  console.log('🔍 Repository Issues Found:\n');
  issues.forEach(issue => {
    console.log(`❌ ${issue.file}`);
    console.log(`   Category: ${issue.category}`);
    console.log(`   Action: ${issue.action}\n`);
  });
  console.log(`Total issues: ${issues.length}`);
} else {
  console.log('✅ Repository is clean!');
}
```

## 6. Implementation Plan

### Phase 1: Setup (Day 1)
- [ ] Create scripts/cleanup directory
- [ ] Add remove-from-history.sh script
- [ ] Add scan-repository.js script
- [ ] Update .gitignore with new patterns
- [ ] Update .npmignore with new patterns

### Phase 2: File Renaming (Day 1-2)
- [ ] Rename all PRDs to .prd.md
- [ ] Rename all drafts to .draft.md
- [ ] Rename test scripts to .script.js
- [ ] Move misplaced documentation to docs/

### Phase 3: Git History Cleanup (Day 2-3)
- [ ] Remove AI-generated files from history
- [ ] Remove test-*.js files from root
- [ ] Remove backup files from history
- [ ] Remove scripts/*.md from history

### Phase 4: Repository Reorganization (Day 3)
- [ ] Move test files to proper locations
- [ ] Consolidate scripts into categories
- [ ] Remove duplicate documentation
- [ ] Update import paths if needed

### Phase 5: Validation (Day 3-4)
- [ ] Run repository scanner
- [ ] Verify gitignore patterns work
- [ ] Test npm pack excludes correctly
- [ ] Update CI/CD if needed

## 7. Files to Remove from Git History

Priority list for git history cleanup:

```bash
# High Priority (Large/Sensitive)
scripts/test-package-locally.cjs
test-domain-analyzer.js
test-enhancement.js
2025-09-24-how-to-make-ncp-popular.txt

# Medium Priority (AI Generated)
scripts/*.md
MCP_EXPANSION_SUMMARY.md
mcp-expansion-strategy.md

# Low Priority (Can stay but gitignore)
*.backup.*
*.local.*
*.prd.md
```

## 8. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Files in root | 35 | 15 |
| AI-generated files tracked | ~20 | 0 |
| Misplaced test files | 8 | 0 |
| Scripts without category | 15 | 0 |
| Repository size | TBD | -30% |
| Git history size | TBD | -40% |

## 9. Maintenance Guidelines

### 9.1 For Developers
1. Use sub-extensions for all non-production markdown
2. Keep test files in test/ directory only
3. Use scripts/cleanup/ for maintenance scripts
4. Review gitignore before committing

### 9.2 For AI Assistants
1. Always use .prd.md for PRDs
2. Use .draft.md for documentation drafts
3. Use .ai.md for analysis documents
4. Never create test files in root

### 9.3 Pre-commit Checks
Add pre-commit hook to prevent accidental commits:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for problematic files
ISSUES=$(node scripts/cleanup/scan-repository.js | grep "❌")

if [ ! -z "$ISSUES" ]; then
  echo "⚠️  Problematic files detected:"
  echo "$ISSUES"
  echo "Please fix these issues before committing."
  exit 1
fi
```

## 10. Rollback Plan

1. Backup entire repository before cleanup
2. Keep list of all removed files
3. Store removed files in archive branch
4. Document all git filter-branch commands
5. Test on fork first

This comprehensive cleanup will transform NCP from a cluttered repository into a professional, well-organized codebase suitable for public consumption and contribution.