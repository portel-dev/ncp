# Pre-Release Checklist

This checklist MUST be completed before ANY release to npm. Skipping items leads to broken releases and user trust erosion.

## ✅ Phase 1: Code Quality (5 minutes)

### 1.1 Tests Pass
```bash
npm run build                    # TypeScript compiles
npm test                         # All tests pass
npm run test:critical            # MCP protocol tests pass
```

### 1.2 No Obvious Issues
```bash
npm run lint                     # ESLint passes (if configured)
git status                       # No uncommitted changes
git log --oneline -5            # Review recent commits
```

---

## ✅ Phase 2: Package Verification (5 minutes)

### 2.1 Inspect Package Contents
```bash
npm pack --dry-run

# Verify:
✓ dist/ folder included
✓ package.json, README.md, LICENSE included
✓ src/ excluded (TypeScript source)
✓ *.map files excluded (source maps)
✓ test/ excluded
✓ docs/ excluded (except essential ones)
✓ .env, tokens, secrets excluded
```

### 2.2 Check Package Size
```bash
# Should be < 500KB typically
# If > 1MB, investigate what's bloating it
ls -lh *.tgz
```

---

## ✅ Phase 3: Local Installation Test (10 minutes)

### 3.1 Test Published Package Locally
```bash
# Pack and install locally
npm pack
cd /tmp
npm install /path/to/ncp-production-clean/portel-ncp-*.tgz

# Verify CLI works
npx @portel/ncp --version
npx @portel/ncp find "list files"

# Expected: Version shown, tools listed
```

### 3.2 Test with Profile
```bash
cd /tmp/test-ncp
npx @portel/ncp add filesystem --command npx --args @modelcontextprotocol/server-filesystem

# Expected: MCP added to ~/.ncp/profiles/all.json
cat ~/.ncp/profiles/all.json  # Verify it's there
```

---

## ✅ Phase 4: MCP Integration Test (15 minutes) **[CRITICAL - THIS WAS MISSING]**

### 4.1 Create Test Claude Desktop Config
```bash
# Create temporary Claude config for testing
mkdir -p ~/test-claude-desktop
cat > ~/test-claude-desktop/config.json << 'EOF'
{
  "mcpServers": {
    "ncp": {
      "command": "npx",
      "args": ["@portel/ncp@local-test"]
    }
  }
}
EOF
```

### 4.2 Test MCP Server Directly (Without Claude Desktop)
```bash
# Create test script to simulate AI client
cat > /tmp/test-mcp-client.js << 'EOF'
const { spawn } = require('child_process');

async function testMCPServer() {
  console.log('Starting NCP MCP server...');

  const ncp = spawn('npx', ['@portel/ncp'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, NCP_MODE: 'mcp' }
  });

  // Test 1: Initialize
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };

  ncp.stdin.write(JSON.stringify(initRequest) + '\n');

  // Test 2: tools/list (should respond < 100ms)
  setTimeout(() => {
    const listRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    };
    ncp.stdin.write(JSON.stringify(listRequest) + '\n');
  }, 10);

  // Test 3: find (should not return empty during indexing)
  setTimeout(() => {
    const findRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'find',
        arguments: { description: 'list files' }
      }
    };
    ncp.stdin.write(JSON.stringify(findRequest) + '\n');
  }, 50);

  // Collect responses
  let responseBuffer = '';
  ncp.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    const lines = responseBuffer.split('\n');

    lines.slice(0, -1).forEach(line => {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('Response:', JSON.stringify(response, null, 2));

          // Validate response
          if (response.id === 2) {
            if (!response.result?.tools || response.result.tools.length === 0) {
              console.error('❌ FAIL: tools/list returned no tools');
              process.exit(1);
            }
            console.log('✓ tools/list OK');
          }

          if (response.id === 3) {
            const text = response.result?.content?.[0]?.text || '';
            if (text.includes('No tools found') && !text.includes('Indexing')) {
              console.error('❌ FAIL: find returned empty without indexing message');
              process.exit(1);
            }
            console.log('✓ find OK (partial results or indexing message shown)');

            // Success
            setTimeout(() => {
              console.log('✅ All MCP tests passed');
              ncp.kill();
              process.exit(0);
            }, 100);
          }
        } catch (e) {
          // Ignore parse errors for partial JSON
        }
      }
    });

    responseBuffer = lines[lines.length - 1];
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.error('❌ FAIL: Test timeout');
    ncp.kill();
    process.exit(1);
  }, 10000);
}

testMCPServer();
EOF

node /tmp/test-mcp-client.js

# Expected output:
# ✓ tools/list OK
# ✓ find OK (partial results or indexing message shown)
# ✅ All MCP tests passed
```

### 4.3 Test Cache Persistence
```bash
# Clear cache
rm -rf ~/.ncp/cache/*

# Run first time (creates cache)
node /tmp/test-mcp-client.js

# Check cache was created correctly
cat ~/.ncp/cache/all-cache-meta.json | jq .profileHash
# Expected: Non-empty hash (e.g., "d5b54172ea975e47...")

# Run second time (should use cache)
node /tmp/test-mcp-client.js

# Expected: Same profileHash, no re-indexing
```

### 4.4 Test with Real AI Client (If Available)
```bash
# Option A: Test with Claude Desktop
# 1. Update Claude Desktop config to use local package
# 2. Restart Claude Desktop
# 3. Ask: "What MCP tools do you have?"
# 4. Verify: Returns tools within 2 seconds, not empty

# Option B: Test with Perplexity
# (Similar steps)

# Expected: AI sees tools, can use them, no empty results
```

---

## ✅ Phase 5: Performance & Resource Check (5 minutes)

### 5.1 Startup Time
```bash
time npx @portel/ncp find

# Expected: < 3 seconds for cached profile
# Expected: < 30 seconds for 50-MCP profile (first time)
```

### 5.2 Memory Usage
```bash
# Start NCP in background
npx @portel/ncp &
NCP_PID=$!

# Check memory after 10 seconds
sleep 10
ps aux | grep $NCP_PID

# Expected: < 200MB for typical profile
```

### 5.3 Cache Size
```bash
du -sh ~/.ncp/cache/

# Expected: < 10MB for typical profile
```

---

## ✅ Phase 6: Documentation Accuracy (5 minutes)

### 6.1 README Examples Work
```bash
# Copy-paste examples from README.md and verify they work
# Common ones:
npx @portel/ncp add filesystem
npx @portel/ncp find "search files"
npx @portel/ncp run filesystem:read_file --parameters '{"path":"test.txt"}'
```

### 6.2 Version Numbers Match
```bash
# Check version consistency
grep '"version"' package.json
grep 'version' server.json
cat CHANGELOG.md | head -20

# Expected: All show same version (e.g., 1.4.4)
```

---

## ✅ Phase 7: GitHub Checks (5 minutes)

### 7.1 CI/CD Passes
```bash
# Check GitHub Actions status
gh run list --limit 5

# Expected: All green ✓
```

### 7.2 No Secrets in Code
```bash
# Scan for common secret patterns
grep -r "sk-" . --exclude-dir=node_modules
grep -r "ghp_" . --exclude-dir=node_modules
grep -r "AKIA" . --exclude-dir=node_modules

# Expected: No matches (or only in .env.example)
```

---

## ✅ Phase 8: Breaking Changes Review (2 minutes)

### 8.1 API Compatibility
```
Review changes since last release:
- Did we change tool names? (find → search)
- Did we change parameter names?
- Did we remove features?
- Did we change output format?

If YES to any: Bump MINOR version (1.4.x → 1.5.0)
If NO to all: Bump PATCH version (1.4.3 → 1.4.4)
```

### 8.2 Migration Guide
```
If breaking changes:
- Update CHANGELOG.md with migration steps
- Add deprecation warnings (don't just remove)
- Update examples in README
```

---

## ✅ Phase 9: Release Prep (5 minutes)

### 9.1 Update Version
```bash
# Use npm version to update
npm version patch  # or minor, or major

# This updates:
# - package.json
# - package-lock.json
# - Creates git tag
```

### 9.2 Update Changelog
```bash
# Add to CHANGELOG.md
## [1.4.4] - 2025-01-XX

### Fixed
- Cache profileHash now persists correctly across restarts
- Indexing progress shown immediately, preventing race condition
- Partial results returned during indexing (parity with CLI)

### Impact
- Fixes empty results in AI assistants during startup
- Prevents unnecessary re-indexing on every restart
```

### 9.3 Final Commit
```bash
git add -A
git commit -m "chore: release v1.4.4"
git push origin main --tags
```

---

## ✅ Phase 10: Publish (3 minutes)

### 10.1 Publish to npm
```bash
npm publish

# Monitor for errors
# Check: https://www.npmjs.com/package/@portel/ncp
```

### 10.2 Verify Published Package
```bash
# Wait 1 minute for npm to propagate
sleep 60

# Install from npm and test
cd /tmp/verify-release
npm install @portel/ncp@latest
npx @portel/ncp --version

# Expected: Shows new version (1.4.4)
```

### 10.3 Test MCP Integration Post-Publish
```bash
# Update Claude Desktop to use latest
# Restart, verify it works with AI

# If fails: npm unpublish @portel/ncp@1.4.4 (within 72 hours)
```

---

## ✅ Phase 11: Announce (5 minutes)

### 11.1 GitHub Release
```bash
gh release create v1.4.4 \
  --title "v1.4.4 - Critical Fixes" \
  --notes "$(cat CHANGELOG.md | head -20)"
```

### 11.2 Update MCP Registry
```bash
# Trigger registry update workflow if needed
gh workflow run publish-mcp-registry.yml
```

---

## 🚨 STOP Gates - Release Only If:

### Gate 1: Unit Tests
- ✅ All tests pass
- ✅ No skipped tests
- ✅ Coverage > 70%

### Gate 2: Package Integrity
- ✅ Package size < 1MB
- ✅ No source files in dist
- ✅ No secrets in code

### Gate 3: MCP Integration (NEW - CRITICAL)
- ✅ tools/list responds < 100ms
- ✅ find returns results (not empty)
- ✅ Cache profileHash persists
- ✅ No re-indexing on restart

### Gate 4: Real-World Test
- ✅ Works with Claude Desktop OR Perplexity
- ✅ AI can discover and use tools
- ✅ No errors in logs

### Gate 5: Documentation
- ✅ README examples work
- ✅ CHANGELOG updated
- ✅ Version numbers match

---

## Time Estimate: 60 minutes total

**If you can't spend 60 minutes testing, don't release.**

A broken release costs:
- 4+ hours of debugging and hotfixes
- User trust
- Product reputation
- 3-4 version bumps (1.4.0 → 1.4.1 → 1.4.2 → 1.4.3)

---

## Automation Opportunities

### Short-term (Next Week)
1. Create `npm run test:integration` that runs Phase 4 tests
2. Add `npm run test:pre-release` that runs Phases 1-5
3. Create GitHub Action that runs pre-release checks on tags

### Long-term (Next Month)
1. E2E testing with actual Claude Desktop instance
2. Automated cache validation tests
3. Performance regression tests
4. Canary releases (npm publish with tag `next`)

---

## Lessons Learned (2024-01-03)

### What Failed
- Released 1.4.0 without real-world MCP integration testing
- Unit tests passed but didn't catch cache/race condition bugs
- No checklist = inconsistent quality

### What We're Changing
- **Phase 4 is now mandatory** - Test with actual MCP client before release
- **Cache tests are critical** - Verify profileHash, restart behavior
- **No shortcuts** - 60 minutes is non-negotiable

### Success Criteria for Next Release
- Zero hotfixes after 1.4.4
- AI assistants work perfectly on first try
- Users trust NCP as reliable infrastructure
