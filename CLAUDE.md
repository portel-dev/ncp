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

## Code Execution Architecture

### How Code Execution Works (Critical for Understanding NCP)

**IMPORTANT**: Code execution is NOT just "display code results". It actually EXECUTES TypeScript with full MCP access via Worker Threads.

### Unified Code Execution Path

Both the `code` tool (direct code-mode) and `code:run` tool (scheduled jobs) use the **same mechanism**:

```
User executes code
    ↓
orchestrator.executeCode(code, timeout)
    ↓
CodeExecutor.executeCode()
    ↓
Creates Worker Thread with:
  - Code to execute
  - All 70+ MCP tools (from toolsProvider)
  - Security bindings
    ↓
Worker creates namespaces:
  - schedule.*  (for scheduling)
  - ncp.*       (for discovery)
  - analytics.* (for analytics)
  - mail.*      (for email)
  - github.*    (for GitHub)
  - ... all other MCPs ...
    ↓
Code executes with full MCP access
    ↓
Results returned
```

### MCP Namespace Injection (VERIFIED WORKING)

When code executes, **all MCPs are available as callable namespaces**:

```typescript
// All of these work in code execution:
const jobs = await schedule.list({ limit: 10 });
const tools = await ncp.find({ description: "email" });
const overview = await analytics.overview({});
const mails = await mail({ operation: "unread" });

// Can orchestrate multiple MCPs in one execution:
const emails = await mail({ operation: "list", limit: 5 });
const notes = await notes({ operation: "create", text: "..." });
const msg = await messages({ operation: "send", number: "..." });
```

### Key Characteristics of Code Execution

1. **Worker Thread Isolation**: Code runs in isolated Worker thread with resource limits
   - Memory: 128MB max
   - Execution time: 30s default, 5min max
   - Network: Controlled via NetworkPolicyManager

2. **MCP Namespace Access**: All enabled MCPs available as namespaces
   - Tools passed from `toolsProvider()` which includes:
     - External MCPs (from ~/.ncp/config.json)
     - Internal MCPs (schedule, analytics, skills, code, ncp)
     - Skill tools (from ~/.ncp/skills/)

3. **Tool Executor Callback**: When code calls an MCP method, messages are sent to main thread
   - Tool call: Worker → Main thread
   - Tool result: Main thread → Worker
   - Synchronous from code perspective (via Promise handling)

4. **Security Hardening**:
   - Dangerous patterns blocked (eval, require, import, etc.)
   - Built-in prototypes frozen
   - Direct filesystem/process access blocked
   - Network requests routed through policy enforcement

### Code Tool vs code:run Tool

| Aspect | `code` tool (direct) | `code:run` (scheduled) |
|--------|----------------------|----------------------|
| Entry point | MCP `tools/call` handler | Internal MCP tool |
| Execution | `orchestrator.executeCode()` | `orchestrator.executeCode()` |
| MCP Access | ✅ Full namespace injection | ✅ Full namespace injection |
| Return Format | Formatted text for Claude | JSON result |
| Use Case | Direct in Claude chat | Scheduled job automation |
| Difference | **NONE** - Same mechanism |  |

**This is critical**: When designing scheduled jobs with `code:run`, assume MCPs are available as namespaces. They will be.

### Testing Code Execution

When testing code execution:

1. **Don't test for "no namespace injection"** - it WILL be injected
2. **Test that MCPs are callable** - verify methods execute
3. **Test error handling** - what happens when a method fails
4. **Test multi-MCP orchestration** - do multiple calls work together

Example test:
```typescript
const code = `
const schedule_result = await schedule.list({ limit: 1 });
const ncp_result = await ncp.find({ description: "test" });
const analytics_result = await analytics.overview({});

return {
  schedule_works: !!schedule_result,
  ncp_works: !!ncp_result,
  analytics_works: !!analytics_result
};
`;

// This will return { schedule_works: true, ncp_works: true, analytics_works: true }
```

## Code Quality & Naming Conventions

### TypeScript/JavaScript Naming Standards

**Best Practice: Use camelCase consistently throughout the entire codebase** (code AND configuration files)

- **Variables, functions, methods**: `camelCase` (e.g., `enableCodeMode`, `autoImport`, `maxDebugFiles`)
- **Classes, interfaces, types**: `PascalCase` (e.g., `GlobalSettings`, `MCPServer`, `InternalMCP`)
- **Constants**: `UPPER_CASE` (e.g., `DEFAULT_SETTINGS`, `MAX_RETRIES`)
- **JSON configuration**: `camelCase` for consistency with TypeScript (e.g., manifest.json, settings.json)

**Key Principle**: NEVER mix camelCase and snake_case in the same codebase. Consistency prevents confusion and makes code maintainable. JavaScript/TypeScript systems standardize on camelCase (even for JSON configuration files).

**Application to NCP**:
- manifest.json: Use camelCase for all config keys
  - ✅ `enableCodeMode` (not `enable_code_mode`)
  - ✅ `enableSkills` (not `enable_skills`)
  - ✅ `enableScheduleMcp` (not `enable_schedule_mcp`)
  - ✅ `enablePhotonRuntime` (not `enable_photon_runtime`)
- Environment variables: Use UPPER_SNAKE_CASE (follows convention for env vars)
  - `NCP_ENABLE_CODE_MODE`, `NCP_ENABLE_SKILLS`, etc.
- TypeScript interfaces/code: Use camelCase
  - GlobalSettings.enableCodeMode
  - GlobalSettings.enableSkills

**References**:
- [TypeScript ESLint Naming Convention Rule](https://typescript-eslint.io/rules/naming-convention/)
- [TypeScript Deep Dive Style Guide](https://basarat.gitbook.io/typescript/styleguide)
- [JSON Naming Conventions Stack Overflow](https://stackoverflow.com/questions/5543490/json-naming-convention-snake-case-camelcase-or-pascalcase)
- [JSON Best Practices Blog](https://blog.liquid-technologies.com/json-best-practices-and-conventions-part-2-of-4)

### General Code Quality

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
