## PRE-COMMIT CHECKLIST - MANDATORY FOR ALL CHANGES

Before committing ANY changes to server code, verify ALL of these:

- [ ] Did I run the test suite? (`npm run test`)
- [ ] Did I test both CLI and DXT entry points? (`npm run test:integration` AND `npm run test:integration:dxt`)
- [ ] Did all integration tests pass?
- [ ] Did I run the comprehensive DXT test? (`npm run build && node tests/integration/comprehensive-dxt-test.cjs`)
- [ ] Did all 5 comprehensive tests pass?
- [ ] If I added a feature, did I add tests for it?
- [ ] If I'm touching `src/index-mcp.ts`, did I verify `await server.run()` is present?
- [ ] If I'm adding MCP protocol handlers, did I test with `notifications/initialized`?

**If ANY checkbox is unchecked, DO NOT COMMIT. Fix the issue first.**

## Server Architecture - Single SDK-Based Implementation

**We use ONE official SDK-based server implementation:**

### Server Implementation
- `src/server/mcp-server.ts` (MCPServer) - Uses official @modelcontextprotocol/sdk
  - Used by CLI entry point (dist/index.js)
  - Used by DXT entry point (dist/index-mcp.js)
  - Fully async initialization with background indexing
  - Immediate protocol responses (no blocking)

### Why We Use the Official SDK

**Historical Context**: We previously had TWO implementations (custom MCPServer and SDK-based MCPServerSDK) which caused recurring bugs:
- Features added to one but forgotten in the other
- Tests only covered CLI entry point, missing DXT bugs
- Every release had bugs discovered by users in production

**Solution**: Eliminated duplication by using ONLY the official @modelcontextprotocol/sdk:
- Single source of truth for all MCP protocol handling
- Official SDK ensures protocol compliance
- No feature divergence possible
- All tests cover the same implementation

## MCP Protocol Requirements

- **NEVER block the event loop**: MCP clients (Claude Desktop, Cursor) will timeout and reject connections if protocol responses are delayed
- **Background initialization is mandatory**: Server must respond to protocol handshakes immediately, run heavy initialization in background promises
- **NO synchronous file operations**: Always use async file APIs (`readFile`, `writeFile`, `access`) instead of sync versions (`readFileSync`, `writeFileSync`, `existsSync`)
- **Cache operations must be async**: Any disk I/O during initialization must not block - use `await` consistently
- **Test with production scenarios**: If building for MCP server mode, test as MCP server, not just CLI
- **ALWAYS await async initialization**: src/index-mcp.ts MUST await server.run() - wrap in async IIFE if needed:
  ```typescript
  (async () => {
    const server = new MCPServer(profileName);
    await server.run();  // REQUIRED - process exits without await
  })();
  ```
- **Send notifications/initialized**: After initialize response, send notification to trigger oninitialized callback:
  ```javascript
  // After receiving initialize response
  test.sendNotification('notifications/initialized', {});
  ```

## Performance & Optimization

- **Incremental caching is critical**: When one MCP changes, only re-index that MCP, not all 37
- **Track what actually changed**: Use sets/maps to track newly indexed items, only save those to cache
- **Avoid redundant writes**: Before writing to cache, check if data actually changed
- **Profile hash comparison**: Use config hashes to detect changes, not timestamps

## Caching Architecture

- **Dual cache system**: CSV cache for fast loading, metadata cache for schemas
- **Per-MCP patching**: Use `patchAddMCP()` for individual MCP updates, not full cache rewrites
- **Schema preservation**: Tool schemas MUST be saved to metadata cache during indexing
- **Cache migration**: Detect missing metadata and auto-trigger re-indexing for backward compatibility
- **Metadata validation**: Always check if schemas exist before loading from cache

## Testing & Debugging

### Test Coverage Requirements

**CRITICAL**: Tests MUST match production environment

1. **Test BOTH entry points**:
   ```bash
   npm run test:integration       # CLI entry (dist/index.js)
   npm run test:integration:dxt   # DXT entry (dist/index-mcp.js)
   ```

2. **Comprehensive DXT test** (tests/integration/comprehensive-dxt-test.cjs):
   - ✅ Server initialization with clientInfo
   - ✅ Auto-import detects and imports extensions
   - ✅ Tool discovery (find) works
   - ✅ Tool execution (run) works
   - ✅ Multiple sequential requests without crashes

3. **Use correct profile paths in tests**:
   - DXT uses local `.ncp/` directory (process.cwd())
   - CLI uses global `~/.ncp/` directory
   - Tests must match the environment they're testing

4. **Follow MCP protocol completely**:
   ```javascript
   // 1. Send initialize request
   const id = test.sendRequest('initialize', {
     protocolVersion: '2024-11-05',
     clientInfo: { name: 'claude-desktop', version: '0.14.0' }
   });

   // 2. Wait for response
   await test.waitForResponse(id);

   // 3. Send initialized notification (REQUIRED to trigger oninitialized)
   test.sendNotification('notifications/initialized', {});
   ```

### General Testing Rules

- **Test all CLI commands**: When asked to test, actually run every command listed (find, run, list, etc.)
- **Test with actual installations**: Use `npm link` and test from different directories
- **No hardcoded fallbacks**: Fallback values hide real errors - fail fast to surface issues
- **Verify schema display**: Tool discovery showing `[no parameters]` means schemas weren't saved
- **Check logs**: When debugging, grep for specific operations like "Patching tool metadata" or "Saving.*MCP"
- **Test with JSON-RPC directly**: Don't involve AI in tests - use direct JSON-RPC communication
- **Verify auto-import**: Check that profile file is updated with new MCPs after initialization

## Code Quality

- **Complete the root cause fix**: Don't just fix symptoms, understand and fix the underlying issue
- **Verify incremental changes work**: When optimizing caching, test that partial updates work correctly
- **Old cache migration**: New features must handle users with old cache format gracefully
- **Document assumptions**: If code assumes something (like all MCPs have schemas), validate it

## DXT Build Process

**CRITICAL**: Always use `npm run build:dxt` which runs `scripts/build-dxt-clean.sh`. Never use manual build steps.

### Known Issue: mcpb excludes build/ directories
- **Problem**: `@anthropic-ai/mcpb` bundler excludes `build/` directories from node_modules by default
- **Impact**: Dependencies like `human-signals` require `build/src/main.js` to work - missing causes immediate crash
- **Symptoms**: "ERR_MODULE_NOT_FOUND: Cannot find module '.../build/src/main.js'" in logs
- **Root Cause**: mcpb treats build/ as build artifacts to exclude, even when they're published package code
- **Solution**: `build-dxt-clean.sh` automatically patches missing build directories after mcpb packing

### Build Process Steps (automated in scripts/build-dxt-clean.sh)
1. Build TypeScript (`npm run build`)
2. Create clean temp directory with production files only
3. Fresh `npm install --omit=dev` in clean directory (no mixed dev/prod dependencies)
4. Pack with mcpb (creates initial zip)
5. **Workaround**: Extract DXT (unzip), manually add missing build directories, re-pack (zip)
6. **Critical**: Use `unzip`/`zip` commands - DXT is ZIP format, NOT tar.gz!
7. **Auto-test**: Verify zip format, dependencies, and test server startup
8. Output size and SHA256 hash for verification

### DXT Testing Requirements
- **Dependency verification**: Check critical build directories exist (human-signals/build)
- **MCP spec timing**: Initialize < 5000ms, tools/list < 2000ms (tested automatically)
- **No crashes**: Server must stay up during initialize → tools/list sequence
- **Test unpacked DXT**: Always unpack and test before distributing to catch packaging issues early

### Error Handling in Production
- **Global error handlers**: `index-mcp.ts` has uncaughtException and unhandledRejection handlers
- **stderr logging**: All errors log to stderr with `[NCP FATAL]` or `[NCP ERROR]` prefix
- **Stack traces**: Full stack traces included for debugging in Claude Desktop logs
- **Explicit exit**: Process exits with code 1 on fatal errors (no silent failures)

## Release Process

- **No release until user confirms**: Build and test, but wait for explicit confirmation before releasing
- **Test incrementally**: After each fix, rebuild and verify it works before moving to next issue
- **Always use build:dxt**: Never manually run mcpb - use the tested build script
