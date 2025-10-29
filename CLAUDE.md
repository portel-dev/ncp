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

## Release Process

- **No release until user confirms**: Build and test, but wait for explicit confirmation before releasing
- **Test incrementally**: After each fix, rebuild and verify it works before moving to next issue