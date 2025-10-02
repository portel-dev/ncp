# Repository Cleanup Plan

## Overview
This document outlines the strategy for cleaning up development artifacts, misplaced files, and sensitive data from the repository.

## Pre-Cleanup: Backup Strategy

### Step 1: Create Full Backup
```bash
# Create timestamped backup
cd /Users/arul/Projects
tar -czf ncp-production-clean-backup-$(date +%Y%m%d-%H%M%S).tar.gz ncp-production-clean/

# Verify backup
tar -tzf ncp-production-clean-backup-*.tar.gz | head -20
```

### Step 2: Document Current State
```bash
cd ncp-production-clean
git status > cleanup-git-status.txt
git log --oneline -20 > cleanup-recent-commits.txt
ls -laR > cleanup-file-listing.txt
```

---

## Files to Remove (Not Needed in Repository)

### 1. Sensitive Files (CRITICAL - Remove Immediately)
```bash
# These should NEVER be committed
rm .mcpregistry_github_token
rm .mcpregistry_registry_token
rm server.json  # May contain sensitive config

# Add to .gitignore
echo ".mcpregistry_*" >> .gitignore
echo "server.json" >> .gitignore
```

### 2. Session/Development Documentation
```bash
# These are session-specific docs, not needed in main repo
rm IMPLEMENTATION-COMPLETE.md
rm SESSION-SUMMARY.md
rm TEST-PLAN.md
rm TESTING-QUICK-START.md
rm TESTING-RESULTS.md
rm ncp-logo.md  # Design notes
```

### 3. Misplaced Documentation
```bash
# Move to docs/ instead of root
mv HOW-IT-WORKS.md docs/how-it-works.md

# Or remove if redundant with other docs
# rm HOW-IT-WORKS.md
```

### 4. Test Directory Cleanup
```bash
# Move documentation out of test/
mv test/MANUAL-TEST-GUIDE.md docs/testing/manual-test-guide.md
mv test/TESTING-SUMMARY.md docs/testing/testing-summary.md

# run-integration-tests.sh can stay in test/ (it IS a test file)
# but move if it's documentation rather than runnable
```

### 5. Mock Test Fixtures
```bash
# Evaluate if these are needed or just development artifacts
# Keep if they're actual test fixtures used by automated tests
# Remove if they were just for manual testing

# Check if any tests import these:
grep -r "mock-smithery-mcp" test/*.test.ts test/*.test.js

# If no test uses them, consider removing:
# rm -rf test/mock-smithery-mcp/
```

---

## Files to Keep (Essential)

### Core Source
- `src/` - All TypeScript source code
- `dist/` - Compiled output (generated, but needed for npm)
- `package.json`, `package-lock.json` - Dependencies
- `tsconfig.json`, `jest.config.js` - Config

### Documentation (Essential)
- `README.md` - Main documentation
- `CHANGELOG.md` - Version history
- `LICENSE` - Legal
- `CODE_OF_CONDUCT.md` - Community guidelines
- `CONTRIBUTING.md` - Contributor guide
- `SECURITY.md` - Security policy
- `CLAUDE.md` - Development guidance (or move to docs/)
- `docs/` - All documentation

### Infrastructure
- `.github/` - GitHub Actions, issue templates
- `.gitignore`, `.npmignore` - Ignore rules
- `.dockerignore` - Docker ignore (if using Docker)
- `.release-it.json` - Release automation
- `scripts/` - Build and utility scripts

### Testing
- `test/` - Test files (*.test.ts, *.test.js)
- `coverage/` - Generated test coverage (could be gitignored)

---

## Git History Considerations

### Option 1: Simple Cleanup (Recommended)
Just remove files going forward. Keep git history as-is.

**Pros**:
- Simple, safe
- Preserves history
- No risk of breaking branches

**Cons**:
- Sensitive files remain in history
- Larger repository size

**Steps**:
```bash
# Remove files
rm .mcpregistry_github_token .mcpregistry_registry_token server.json
rm IMPLEMENTATION-COMPLETE.md SESSION-SUMMARY.md TEST-PLAN.md
rm TESTING-QUICK-START.md TESTING-RESULTS.md ncp-logo.md

# Update .gitignore
echo ".mcpregistry_*" >> .gitignore
echo "server.json" >> .gitignore
echo "*-backup-*.tar.gz" >> .gitignore

# Commit cleanup
git add -A
git commit -m "chore: remove development artifacts and sensitive files"
```

### Option 2: History Rewrite (Advanced - If Sensitive Data Leaked)
If `.mcpregistry_*` files contain real tokens that were pushed to GitHub:

```bash
# DANGEROUS - Only if absolutely necessary
# This rewrites git history - all collaborators must re-clone

# Use BFG Repo-Cleaner or git-filter-repo
git filter-repo --path .mcpregistry_github_token --invert-paths
git filter-repo --path .mcpregistry_registry_token --invert-paths
git filter-repo --path server.json --invert-paths

# Force push (if remote exists)
git push origin --force --all
git push origin --force --tags

# Invalidate leaked tokens immediately!
```

**⚠️ WARNING**: Only use Option 2 if:
- Real tokens were committed and pushed
- You've already invalidated those tokens
- You can coordinate with all team members to re-clone

---

## Cleanup Execution Plan

### Phase 1: Backup (5 minutes)
```bash
cd /Users/arul/Projects
tar -czf ncp-production-clean-backup-$(date +%Y%m%d-%H%M%S).tar.gz ncp-production-clean/
ls -lh ncp-production-clean-backup-*.tar.gz
```

### Phase 2: Review Sensitive Files (10 minutes)
```bash
# Check if tokens are real or just test data
head -c 20 .mcpregistry_github_token
head -c 20 .mcpregistry_registry_token
cat server.json

# If real tokens: INVALIDATE THEM FIRST before cleanup
# GitHub: Settings → Developer settings → Personal access tokens → Revoke
```

### Phase 3: Remove Development Artifacts (5 minutes)
```bash
rm .mcpregistry_github_token .mcpregistry_registry_token server.json
rm IMPLEMENTATION-COMPLETE.md SESSION-SUMMARY.md TEST-PLAN.md
rm TESTING-QUICK-START.md TESTING-RESULTS.md ncp-logo.md
```

### Phase 4: Reorganize Documentation (10 minutes)
```bash
# Create docs subdirectories if needed
mkdir -p docs/testing
mkdir -p docs/guides

# Move files
mv HOW-IT-WORKS.md docs/how-it-works.md
mv test/MANUAL-TEST-GUIDE.md docs/testing/manual-test-guide.md
mv test/TESTING-SUMMARY.md docs/testing/testing-summary.md

# Update any references in README.md or other docs
```

### Phase 5: Update .gitignore (2 minutes)
```bash
cat >> .gitignore << 'EOF'

# Development artifacts
.mcpregistry_*
server.json
*-backup-*.tar.gz
SESSION-*.md
IMPLEMENTATION-*.md
TEST-PLAN*.md
TESTING-*.md

# Local test servers
test-server-*.js
test-mcp-*.js
EOF
```

### Phase 6: Verify and Commit (5 minutes)
```bash
# Review changes
git status
git diff

# Stage all changes
git add -A

# Commit cleanup
git commit -m "chore: cleanup development artifacts and reorganize docs

- Remove sensitive token files
- Remove session-specific documentation
- Move HOW-IT-WORKS.md to docs/
- Move test documentation to docs/testing/
- Update .gitignore to prevent future commits
"

# Optional: Push if remote exists
# git push origin main
```

---

## Post-Cleanup Verification

### Verify Sensitive Files Removed
```bash
# Should show no results
git ls-files | grep -E 'token|server.json'

# If found in history but need to stay there (Option 1):
# Just ensure they're removed from HEAD
git show HEAD:.mcpregistry_github_token  # Should error
```

### Verify Build Still Works
```bash
npm run build
npm test
npm run dev  # Quick smoke test
```

### Verify NPM Package Contents
```bash
npm pack --dry-run | less
# Should NOT include:
# - .mcpregistry_* files
# - SESSION-*.md files
# - Test documentation
```

### Check Repository Size
```bash
# Before and after comparison
du -sh .git
git count-objects -vH
```

---

## Maintenance: Preventing Future Issues

### 1. Pre-commit Hook Enhancement
Already have a cleanup hook that detects misplaced files. Ensure it's active:
```bash
ls -la .git/hooks/pre-commit
# Should exist and be executable
```

### 2. Regular Cleanup Schedule
- Before each release: Run `git status` and review uncommitted files
- Monthly: Review root directory for development artifacts
- Before PRs: Check for test files or session docs

### 3. Team Guidelines
Document in CONTRIBUTING.md:
- Don't commit session notes to main branch
- Use `scratch/` or `notes/` local directory for temporary docs
- All docs go in `docs/`, not root
- Test files with `.test.ts` or `.test.js` extension only

---

## Decision Checklist

Before executing cleanup:
- [ ] Backup created and verified
- [ ] Sensitive files reviewed (real tokens?)
- [ ] Tokens invalidated if real
- [ ] Team notified if using Option 2 (history rewrite)
- [ ] Current work committed (clean working tree)
- [ ] Build passes before cleanup
- [ ] Time allocated (30-45 minutes)

After cleanup:
- [ ] Build still passes
- [ ] Tests still pass
- [ ] NPM pack looks correct
- [ ] Git status clean
- [ ] Sensitive files not in `git ls-files`
- [ ] Documentation links updated

---

## Rollback Plan

If cleanup causes issues:
```bash
# Restore from backup
cd /Users/arul/Projects
tar -xzf ncp-production-clean-backup-TIMESTAMP.tar.gz

# Or use git to revert
cd ncp-production-clean
git reset --hard HEAD~1  # Undo last commit
git status
```

---

## Summary

**Recommended Approach**: Option 1 (Simple Cleanup)
- Low risk
- Quick execution (30 minutes)
- Preserves history
- Addresses current issues

**Execution Time**: ~30-45 minutes total

**Risk Level**: Low (with backup)

**Impact**: Cleaner repository, reduced confusion, better organization
