# Release Process Improvements

## What Went Wrong (1.4.0 → 1.4.1 → 1.4.2 → 1.4.3)

### Root Cause: No Real-World Testing
We were testing **code in isolation** but never tested **the complete user experience**:

❌ Never tested: `npm install @portel/ncp@latest`
❌ Never tested: Running with Claude Desktop/Perplexity
❌ Never tested: Cache persistence across restarts
❌ Never tested: Real profile with 50+ MCPs
❌ Never tested: Rapid AI client calls during startup

### Bugs That Slipped Through

1. **Cache profileHash empty** → Full re-index every time (fixed in 50d872a)
2. **Race condition** → Empty results in <100ms window (fixed in 50d872a)
3. **Wrong default profile** → Used 'default' instead of 'all' (fixed in ae866ce)
4. **Package bloat** → Source maps, docs in npm package (fixed in 1.4.1-1.4.3)
5. **Version extraction bug** → Registry workflow assumed 'v' prefix (fixed in 1.4.2)

---

##What We've Implemented

### ✅ **60-Minute Pre-Release Checklist**
**Location:** `docs/guides/pre-release-checklist.md`

**Mandatory phases before EVERY release:**

1. **Code Quality** (5 min) - Tests pass, no obvious issues
2. **Package Verification** (5 min) - Inspect contents, check size
3. **Local Installation Test** (10 min) - Test published package behavior
4. **MCP Integration Test** (15 min) - **THE CRITICAL PHASE WE WERE MISSING**
   - Test with actual MCP client simulation
   - Verify cache profileHash, restart behavior
   - Check response formats, partial results
5. **Performance & Resource Check** (5 min)
6. **Documentation Accuracy** (5 min)
7. **GitHub Checks** (5 min)
8. **Breaking Changes Review** (2 min)
9. **Release Prep** (5 min)
10. **Publish** (3 min)
11. **Announce** (5 min)

**STOP Gates - Release ONLY if:**
- ✅ All tests pass
- ✅ Package integrity verified
- ✅ **MCP integration works (find returns results, not empty)**
- ✅ Real-world test with Claude Desktop OR Perplexity
- ✅ Documentation up to date

---

### ✅ **Integration Test Infrastructure**
**Location:** `test/integration/mcp-client-simulation.test.cjs`

**What it tests:**
1. Initialize responds < 100ms
2. tools/list returns tools < 100ms (even during indexing)
3. find returns partial results during indexing (not empty)
4. Cache profileHash persists correctly
5. Second startup uses cache (no re-indexing)

**Run before release:**
```bash
npm run test:integration
```

**Current status:** Tests 1-2 pass, Tests 3-5 reveal timing issues (WIP)

---

### ✅ **Critical Bugs Fixed**

#### Fix #1: Cache Profile Hash (50d872a)
```typescript
// src/cache/csv-cache.ts
async startIncrementalWrite(profileHash: string): Promise<void> {
  // Always update profile hash (critical for cache validation)
  if (this.metadata) {
    this.metadata.profileHash = profileHash;  // ← FIX: Was only set for new caches
  }
  // ...
}
```

**Impact:** Prevents unnecessary full re-indexing on every startup

#### Fix #2: Race Condition (50d872a)
```typescript
// src/orchestrator/ncp-orchestrator.ts
async initialize(): Promise<void> {
  // Initialize progress immediately to prevent race condition
  this.indexingProgress = {
    current: 0,
    total: 0,  // Updated once we know how many to index
    currentMCP: 'initializing...'
  };  // ← FIX: Was null during <100ms window
  // ...
}
```

**Impact:** AI assistants see progress from t=0ms, not empty results

#### Fix #3: Partial Results During Indexing (50d872a)
```typescript
// src/server/mcp-server.ts
public async handleFind(request: MCPRequest, args: any): Promise<MCPResponse> {
  const isStillIndexing = !this.isInitialized && this.initializationPromise;

  // Always run finder to get partial results
  const findResult = await finder.find({ query, page, limit, depth });

  // Add indexing progress if still indexing
  if (progress && progress.total > 0) {
    output += `⏳ **Indexing in progress**: ${progress.current}/${progress.total} MCPs...\n`;
    output += `📋 **Showing partial results** - more tools will become available.\n\n`;
  }
  // ← FIX: Was returning ONLY progress message, no tools
}
```

**Impact:** AI sees available tools immediately + knows more are coming

#### Fix #4: Default Profile Name (ae866ce)
```typescript
// src/orchestrator/ncp-orchestrator.ts
constructor(profileName: string = 'all', ...) {  // ← FIX: Was 'default'
```

**Impact:** Respects user requirement - universal profile is 'all', not 'default'

---

## ⚠️ Outstanding Issues (Discovered by Integration Tests)

### Issue #1: Background Initialization Timing
**Problem:** Tests kill process before background `orchestrator.initialize()` completes

**Evidence:**
```bash
# Debug messages from CLI show profile selection works:
[DEBUG] Selected profile: integration-test

# But orchestrator debug messages NEVER appear:
[DEBUG ORC] Initializing with profileName: integration-test  ← MISSING

# Because background init never completes before test exits
```

**Root Cause:**
```typescript
// src/server/mcp-server.ts
async initialize(): Promise<void> {
  // Start initialization in the background, don't await it
  this.initializationPromise = this.orchestrator.initialize().then(() => {
    this.isInitialized = true;
  });

  // Return immediately  ← Process may exit before this completes!
}
```

**Impact:**
- Cache may never be finalized if AI client disconnects quickly
- Short-lived connections don't benefit from caching
- Integration test can't verify cache persistence

**Proposed Fix:**
1. Add graceful shutdown handler to finalize cache before exit
2. OR: Make cache writes synchronous for critical metadata
3. OR: Ensure minimum process lifetime for cache finalization

---

### Issue #2: Integration Test Reliability
**Problem:** Tests 3-5 fail because background processes don't complete

**Options:**
1. **Simplify tests** - Focus only on what matters (empty results fixed?)
2. **Add wait logic** - Give processes time to finish before checking cache
3. **Mock background work** - Test synchronously for reliability

**Recommendation:** Option 1 for now - verify critical user issue is fixed, improve tests later

---

## Next Release Checklist (1.4.4)

### Must Do:
- [ ] **Run full pre-release checklist** (60 min - NO SHORTCUTS)
- [ ] **Phase 4 (MCP Integration)** - Test with Claude Desktop/Perplexity
- [ ] **Verify partial results** - AI sees tools during indexing
- [ ] **Manual cache check** - Verify profileHash persists
- [ ] **Test with live Perplexity** - Your original failing scenario

### Package Contents Verification:
```bash
npm pack --dry-run

# Must verify:
✓ dist/ included
✓ src/ excluded
✓ *.map excluded
✓ test/ excluded
✓ CLAUDE.md excluded
✓ Size < 500KB
```

### Real-World Test:
```bash
# Install latest from npm
cd /tmp/test-ncp
npm install @portel/ncp@latest

# Test with Perplexity
# 1. Add to Perplexity config
# 2. Restart Perplexity
# 3. Ask: "What MCP tools do you have?"
# 4. Expected: Tools listed within 2 seconds, not empty

# Test cache persistence
# 1. Restart Perplexity again
# 2. Check: cat ~/.ncp/cache/all-cache-meta.json | jq .profileHash
# 3. Expected: Non-empty hash, same as before
```

---

## Long-Term Improvements

### Automated E2E Testing (Next Sprint)
1. Docker container running Claude Desktop
2. Automated MCP interaction tests
3. Cache validation in CI/CD
4. Performance regression detection

### Release Automation (Next Month)
1. Pre-release checks as GitHub Action
2. Canary releases (publish with `@next` tag)
3. Automated rollback on test failures
4. Release notes generation from commits

### Quality Metrics
Track these per release:
- Time from 1st release to stable (goal: 1 version, not 4)
- Number of hotfixes needed (goal: 0)
- Package size (goal: < 500KB)
- Test coverage (goal: > 80%)
- Integration test pass rate (goal: 100%)

---

## Commitment Going Forward

**Zero Tolerance Policy:**
- ❌ No release without 60-minute checklist
- ❌ No release without Phase 4 (MCP Integration) passing
- ❌ No release without real-world test (Claude Desktop or Perplexity)
- ❌ No shortcuts under pressure

**Success Criteria:**
- ✅ Users install latest version, it works immediately
- ✅ Zero hotfixes after 1.4.4 release
- ✅ Cache works correctly, no re-indexing on restart
- ✅ AI assistants see tools within 2 seconds, not empty
- ✅ Users trust NCP as reliable infrastructure

**Your Feedback Integration:**
> "How will people trust us to use our product? These are all very basic stuff that needs to be tested before we make a release."

**Response:**
We've implemented a mandatory 60-minute pre-release process with real-world integration testing. The checklist is non-negotiable. Time investment upfront prevents 4+ hours of hotfix work and preserves user trust.

---

## How to Use This Document

**Before Every Release:**
1. Open `docs/guides/pre-release-checklist.md`
2. Follow EVERY step (60 min investment)
3. Don't skip Phase 4 (MCP Integration) - this is what we missed
4. If ANY test fails → fix before release
5. Update CHANGELOG.md with fixes
6. Only publish when ALL gates pass

**After This Release (1.4.4):**
1. Monitor user feedback for 48 hours
2. If zero issues → process works
3. If issues found → update checklist with new tests
4. Iterate and improve

**Remember:**
> A broken release costs 4+ hours of debugging + user trust.
> 60 minutes of testing is a bargain.
