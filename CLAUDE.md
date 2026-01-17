# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference - Common Commands

### Development Workflow
```bash
# Build the project
npm run build

# Run tests
npm run test                    # Unit tests
npm run test:integration        # CLI entry point integration tests
npm run test:integration:dxt    # DXT entry point integration tests
npm run test:critical           # Critical protocol and timeout tests
npm run test:e2e               # End-to-end tests

# Development mode
npm run dev                    # Build and start CLI

# DXT build
npm run build:dxt              # Build DXT package (uses build-dxt-clean.sh)
npm run build:dxt:patched      # Build with build directory patches
npm run test:dxt               # Test DXT package
```

### Single Test Execution
```bash
# Jest single test file
npx jest tests/path/to/test.test.ts

# Debug specific test
NODE_OPTIONS=--experimental-vm-modules npx jest tests/your-test.test.ts --verbose --detectOpenHandles
```

### CLI Commands (after npm run build)
```bash
# Tool discovery
node dist/index.js find "search query"
node dist/index.js find                    # List all tools

# Tool execution
node dist/index.js run mcp:tool --params '{"key": "value"}'
node dist/index.js run mcp:tool --dry-run  # Preview without executing

# Configuration
node dist/index.js list                    # List all MCPs
node dist/index.js add mcp-name npx @package/name
node dist/index.js remove mcp-name
```

## Project Architecture - Entry Points and Core Components

### Dual Entry Point Architecture

NCP has two entry points serving different use cases:

1. **CLI Entry** (`src/index.ts` → `src/cli/index.ts`)
   - Purpose: Command-line tools (`ncp find`, `ncp add`, `ncp list`, etc.)
   - Installation: `npm install -g @portel/ncp`
   - Build output: `dist/index.js`
   - Includes: Full CLI functionality + MCP server

2. **MCP Server Entry** (`src/index-mcp.ts`)
   - Purpose: DXT package (.mcpb), runs as MCP server only
   - Installation: Claude Desktop and other MCP clients
   - Build output: `dist/index-mcp.js`
   - Includes: MCP server only (no CLI to minimize bundle size)

**Important**: Both entry points use the SAME `MCPServer` class from `src/server/mcp-server.ts`. This ensures consistent behavior across CLI and DXT environments.

### Core Component Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                                │
│  (Claude Desktop, Cursor, VS Code, or CLI commands)          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCPServer                               │
│  (src/server/mcp-server.ts)                                  │
│  - MCP protocol handling (uses official @modelcontextprotocol/sdk) │
│  - Request routing (find/run/code)                           │
│  - Tool definition exposure                                  │
│  - Prompts/Resources handling                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    NCPOrchestrator                           │
│  (src/orchestrator/ncp-orchestrator.ts)                      │
│  - Core orchestration logic                                  │
│  - MCP connection management                                 │
│  - Tool discovery and execution                              │
│  - Health monitoring                                         │
└───┬───────────────┬───────────────┬───────────────┬─────────┘
    │               │               │               │
    ▼               ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐
│Discovery│   │  Internal│   │    Code  │   │    Photon    │
│ Engine  │   │    MCP   │   │ Executor │   │    Runtime   │
└─────────┘   └──────────┘   └──────────┘   └──────────────┘
    │               │               │               │
    ▼               ▼               ▼               ▼
 Vector search    Internal MCP    TypeScript    .photon.ts files
 Tool discovery    (schedule,     Sandbox        Dynamic loading
                   skills, etc.)  Worker Threads  and execution
```

### Key Service Components

- **ToolDiscoveryService** (`src/orchestrator/services/tool-discovery.ts`)
  - Tool search and discovery logic
  - Vector similarity matching
  - Multi-query support

- **CacheService** (`src/orchestrator/services/cache-service.ts`)
  - CSV cache management for fast loading
  - Schema cache for tool metadata
  - Incremental cache updates

- **ConnectionPoolManager** (`src/orchestrator/services/connection-pool.ts`)
  - MCP connection pool management
  - Health checks and reconnection
  - Transport factory (stdio, SSE, HTTP)

- **SkillsService** (`src/orchestrator/services/skills-service.ts`)
  - Skills discovery and management
  - Marketplace integration
  - Resource loading

- **PhotonService** (`src/orchestrator/services/photon-service.ts`)
  - Photon loading and execution
  - Custom MCP support via .photon.ts files
  - Dynamic adapter creation

## Directory Structure Overview

```
src/
├── cli/                    # CLI command-line interface
│   ├── index.ts           # CLI entry point router
│   └── commands/          # CLI command implementations (add, find, list, etc.)
├── server/                # MCP server
│   ├── mcp-server.ts     # Main server implementation (SDK-based)
│   └── mcp-prompts.ts    # Prompt definitions for user interactions
├── orchestrator/          # Core orchestration logic
│   ├── ncp-orchestrator.ts  # Main orchestrator class
│   └── services/         # Orchestrator services
│       ├── tool-discovery.ts
│       ├── cache-service.ts
│       ├── connection-pool.ts
│       ├── skills-service.ts
│       └── photon-service.ts
├── internal-mcps/         # Internal MCP implementations
│   ├── scheduler.ts      # Scheduling MCP (cron jobs)
│   ├── skills.ts         # Skills management MCP
│   ├── analytics.ts      # Usage analytics MCP
│   ├── ncp-management.ts # NCP management (add/remove/list)
│   ├── code.ts           # Code execution MCP
│   ├── marketplace.ts    # MCP registry client
│   ├── *.photon.ts       # Photon runtime files (intelligence, shell)
│   ├── internal-mcp-manager.ts  # Internal MCP coordinator
│   └── photon-loader.ts  # Photon file loader
├── code-mode/            # Code execution mode
│   ├── code-executor.ts  # Main code execution engine
│   ├── code-worker.ts    # Worker thread implementation
│   ├── sandbox/          # Sandbox implementations
│   │   ├── index.ts      # Sandbox selection (4-tier)
│   │   └── subprocess-sandbox.ts
│   ├── validation/       # Code security validation
│   │   ├── code-analyzer.ts      # AST-based static analysis
│   │   └── semantic-validator.ts # Pattern-based validation
│   └── network-policy.ts # Network permission manager
├── discovery/            # Tool discovery engine
│   ├── engine.ts         # Main discovery engine
│   ├── rag-engine.ts     # Vector search engine
│   └── semantic-enhancement-engine.ts
├── cache/                # Caching system
│   ├── csv-cache.ts      # CSV cache for tool metadata
│   ├── schema-cache.ts   # Schema cache for tool definitions
│   ├── cache-patcher.ts  # Incremental cache updates
│   └── version-aware-validator.ts
├── auth/                 # Authentication handling
│   ├── oauth-device-flow.ts      # OAuth 2.0 Device Flow
│   ├── oauth-auth-code-flow.ts   # OAuth 2.1 Auth Code + PKCE
│   ├── mcp-oauth-provider.ts     # OAuth provider integration
│   ├── token-store.ts            # Secure token storage
│   └── secure-credential-store.ts
├── services/             # Various services
│   ├── tool-finder.ts    # Tool finding and search
│   ├── cli-*.ts          # CLI-related services
│   └── ...
├── profiles/             # Profile management
│   └── profile-manager.ts
├── utils/                # Utility functions
│   ├── logger.ts
│   ├── ncp-paths.ts
│   └── ...
├── index.ts              # CLI entry point
└── index-mcp.ts          # MCP server entry point
```

## Photon Runtime

Photon is NCP's custom TypeScript MCP system that allows users to write `.photon.ts` files to extend NCP functionality without publishing npm packages.

### Photon Loading Flow

1. **Discovery**: Scan `~/.ncp/photons/` and project-local `.ncp/photons/` directories
2. **Load**: Dynamic import of `.photon.ts` files using ES modules
3. **Adapt**: Convert Photon to internal MCP using `PhotonAdapter`
4. **Expose**: Photon tools exposed via `find`/`run` to AI clients

### Photon File Structure

```typescript
// ~/.ncp/photons/my-tool.photon.ts

// Manifest (required)
export const manifest = {
  name: 'my-tool',
  version: '1.0.0',
  description: 'My custom tool',
  author: 'Your Name'
};

// Tool functions (exported async functions become MCP tools)
export async function myFunction(params: { input: string }) {
  return { result: `Processed: ${params.input}` };
}

export async function anotherTool(params: { x: number; y: number }) {
  return { sum: params.x + params.y };
}
```

### Photon Tool Schema

Photon function parameters are automatically converted to JSON schemas using TypeScript type inference:

- Parameter names → Schema property names
- TypeScript types → JSON Schema types
- JSDoc comments → Schema descriptions

### Enabling Photon Runtime

- **CLI/DXT global**: Set `enablePhotonRuntime: true` in `~/.ncp/settings.json`
- **Environment variable**: `NCP_ENABLE_PHOTON_RUNTIME=true`
- **DXT bundle**: Set env var in client config (DXT ignores settings.json):

```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp-mcp",
      "env": {
        "NCP_ENABLE_PHOTON_RUNTIME": "true"
      }
    }
  }
}
```

### Built-in Photons

NCP includes built-in Photons in `src/internal-mcps/`:

- **intelligence.photon.ts** - AI-powered tool discovery
- **shell.photon.ts** - Shell command execution

These are loaded automatically when Photon runtime is enabled.

### Photon vs Internal MCPs

| Aspect | Photon | Internal MCP |
|--------|--------|--------------|
| Location | `~/.ncp/photons/` or `.ncp/photons/` | `src/internal-mcps/*.ts` |
| Purpose | User extensions | Core NCP functionality |
| Loading | Dynamic import | Built-in compilation |
| Distribution | User-created | Shipped with NCP |
| Examples | Custom tools, integrations | scheduler, skills, analytics |

---

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
4-Tier Sandbox Selection (most secure available):
  1. IsolatedVMSandbox (V8 Isolate via isolated-vm) - Cloudflare Workers tech
  2. SubprocessSandbox (separate Node.js process)
  3. Worker Threads (vm module isolation)
  4. Direct VM (fallback)
    ↓
Sandbox creates namespaces:
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

4. **Security Hardening** (Defense in Depth):

   **Static Analysis (AST-based)**:
   - TypeScript compiler API parses code before execution
   - Blocks dangerous globals: eval, Function, process, require, __dirname, __filename
   - Blocks metaprogramming: Reflect, Proxy, Symbol, WeakRef, FinalizationRegistry
   - Blocks descriptor manipulation: defineProperty, setPrototypeOf, getOwnPropertyDescriptor
   - Detects prototype pollution: __proto__, constructor, prototype access

   **Semantic Validation (Pattern-based)**:
   - Detects malicious intent patterns:
     - Data exfiltration (read credentials + send externally)
     - Credential harvesting (multiple secret/password accesses)
     - Reconnaissance (system enumeration)
     - Persistence mechanisms (cron, startup scripts)
     - Backdoor patterns (reverse shells, remote access)
     - Privilege escalation (sudo, admin, root)
     - Data destruction (delete_all, rm -rf, truncate)
   - Suspicious namespace+method combinations (shell.*, ssh.*, exec.*)

   **Runtime Protection**:
   - Built-in prototypes frozen (Object, Array, Function, RegExp, Error, Promise)
   - Dangerous globals deleted from context
   - Network requests routed through NetworkPolicyManager
   - Memory limits enforced (128MB default)
   - Execution timeout (30s default, 5min max)

   **V8 Isolate Separation** (when isolated-vm available):
   - Completely separate V8 isolate (no shared memory)
   - Memory limits enforced at V8 level
   - Same technology as Cloudflare Workers
   - No access to Node.js APIs by design

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

### Pre-Release Checklist - MANDATORY

Before making ANY release, verify ALL of these:

```bash
# 1. Check all GitHub issues are resolved
gh issue list --state open
# Must return empty - no open issues allowed before release

# 2. Verify CI is passing on all platforms
gh run list --limit 1
# Must show "success" for the latest run

# 3. Run full test suite locally
npm run test:critical
npm run test:e2e
npm run test:integration
npm run test:integration:dxt

# 4. Build and test DXT package
npm run build:dxt:patched
npm run test:dxt
```

**If ANY check fails, DO NOT RELEASE. Fix the issue first.**

### Release Guidelines

- **No release until user confirms**: Build and test, but wait for explicit confirmation before releasing
- **Test incrementally**: After each fix, rebuild and verify it works before moving to next issue
- **Always use build:dxt**: Never manually run mcpb - use the tested build script
- **Verify Windows CI**: Windows tests must pass - check `Run Tests (windows-latest)` job specifically
