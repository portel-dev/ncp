## MCP Protocol Requirements

- **NEVER block the event loop**: MCP clients (Claude Desktop, Cursor) will timeout and reject connections if protocol responses are delayed
- **Background initialization is mandatory**: Server must respond to protocol handshakes immediately, run heavy initialization in background promises
- **NO synchronous file operations**: Always use async file APIs (`readFile`, `writeFile`, `access`) instead of sync versions (`readFileSync`, `writeFileSync`, `existsSync`)
- **Cache operations must be async**: Any disk I/O during initialization must not block - use `await` consistently
- **Test with production scenarios**: If building for MCP server mode, test as MCP server, not just CLI

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

- **Test all CLI commands**: When asked to test, actually run every command listed (find, run, list, etc.)
- **Test with actual installations**: Use `npm link` and test from different directories
- **No hardcoded fallbacks**: Fallback values hide real errors - fail fast to surface issues
- **Verify schema display**: Tool discovery showing `[no parameters]` means schemas weren't saved
- **Check logs**: When debugging, grep for specific operations like "Patching tool metadata" or "Saving.*MCP"

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