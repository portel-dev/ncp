# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
```bash
npm run build          # Compile TypeScript to dist/
npm run dev           # Build and start application
npm start             # Run compiled application
npm run build:if-dev  # Conditional build for development environments
```

### Testing
```bash
npm test                    # Run all tests
npm run test:critical      # Run critical MCP protocol tests only
npm run test:coverage      # Run tests with coverage reports
npm run test:watch         # Run tests in watch mode
npm run test:pre-publish   # Pre-publication test suite
npm run test:package       # Test packaged version locally
```

### Release and Publishing
```bash
npm run release           # Create new release with release-it
npm run release:dry      # Dry run release process
npm run prepack          # Pre-package validation (auto-runs build + tests)
npm run prepublishOnly   # Pre-publish validation (auto-runs build + tests)
```

## High-Level Architecture

### Dual Functionality Design
NCP operates in two distinct modes:
1. **CLI Tool**: User-facing commands for managing MCP configurations (`ncp add`, `ncp find`, etc.)
2. **MCP Server**: Acts as a unified interface that AI assistants connect to, exposing exactly 2 tools (`mcp__ncp__find` and `mcp__ncp__run`)

### Core Components

#### Entry Point Flow
- `src/index.ts` � `src/cli/index.ts`: Single entry point that routes to CLI interface
- When invoked by AI assistants via MCP protocol, the CLI detects STDIO mode and switches to server mode
- `src/server/mcp-server.ts`: Handles MCP JSON-RPC protocol communication

#### Orchestration Layer
- `src/orchestrator/ncp-orchestrator.ts`: Central orchestrator managing multiple MCP server connections
- Implements non-blocking initialization to prevent protocol timeouts
- Handles background indexing with progress tracking
- Maintains health monitoring for all connected MCPs

#### Discovery System Architecture
- `src/discovery/engine.ts`: Main discovery interface using RAG-powered semantic search
- `src/discovery/rag-engine.ts`: Vector similarity search using @xenova/transformers
- `src/discovery/semantic-enhancement-engine.ts`: Enhances search queries for better tool matching
- `src/discovery/search-enhancer.ts`: Query preprocessing and enhancement
- Fallback chain: RAG � keyword matching � pattern matching � exact name matching

#### Cache and Performance
- `src/cache/cache-patcher.ts`: Incremental cache updates (MCP-by-MCP patching)
- Avoids full re-indexing by using SHA256 hashing of MCP configurations
- Enables fast startup times by detecting changed MCPs only
- Cache versioning prevents stale data issues

#### Profile and Configuration
- `src/profiles/profile-manager.ts`: Manages MCP configurations per profile/project
- `src/utils/config-manager.ts`: Handles configuration import/export, validation
- Supports project-local configuration (`.ncp/profiles/` directory detection)
- Global fallback to `~/.ncp/profiles/` when no local config exists

### Key Architectural Principles

#### Token Efficiency Strategy
- **Problem**: Each MCP server exposes 5-20 tools with verbose schemas, consuming massive context
- **Solution**: NCP presents exactly 2 unified tools to AI assistants, reducing token usage by 37-62%
- **Implementation**: All tool schemas cached locally; AI sees only discovery and execution interfaces

#### Non-Blocking Server Operations
- MCP server initialization is non-blocking to prevent connection timeouts
- Background indexing with progress reporting
- Immediate response to `tools/list` requests even during indexing
- Critical for integration with Claude Desktop and other MCP clients

#### Health Monitoring and Resilience
- `src/utils/health-monitor.ts`: Tracks MCP server health, auto-disables failing servers
- Error aggregation and intelligent retry mechanisms
- Routing around broken MCPs to maintain system availability

### Testing Strategy

#### Critical Path Testing
- `test/mcp-server-protocol.test.ts`: MCP protocol compliance and timeout prevention
- `test/mcp-timeout-scenarios.test.ts`: Large profile simulation and race conditions
- Pre-publication testing ensures protocol compatibility before releases

#### Component Testing
- RAG engine testing with real tool definitions
- Cache optimization and performance benchmarks
- User story validation for discovery accuracy
- Health monitoring integration tests

## Important Implementation Notes

### MCP Protocol Compliance
- Strict adherence to JSON-RPC 2.0 specification
- Immediate response to `initialize` and `tools/list` requests
- Background processing for tool indexing and discovery

### Vector Search Dependencies
- Uses @xenova/transformers for client-side semantic embeddings
- No external API dependencies for tool discovery
- Embedding models cached locally for offline operation

### Project-Local Configuration
- Automatic detection of `.ncp` directory in current working directory
- Falls back to global `~/.ncp` configuration
- Enables team consistency and project-specific tooling

### Release Process Critical Requirements
Before any release:
1. Verify package contents with `npm pack --dry-run`
2. Test published functionality: install from NPM and verify core operations
3. Run `npm run test:critical` to ensure MCP protocol compliance
4. Make atomic releases (avoid incremental packaging fixes)

## Critical Lessons Learned

### Pre-Release Due Diligence (CRITICAL)
**Never rush releases.** The following checklist MUST be completed before any NPM publication:

1. **Package Content Verification**:
   ```bash
   npm pack --dry-run  # Review EVERY file that will be published
   ```
   - Verify only essential files are included: `dist/`, `README.md`, `LICENSE`, `package.json`
   - Confirm `.npmignore` excludes development files, documentation, source maps
   - Check that `CLAUDE.md` and other private files are excluded

2. **Ignore File Validation**:
   - Ensure `.npmignore` excludes: `*.js.map`, `*.d.ts.map`, development docs
   - Ensure `.gitignore` excludes: `CLAUDE.md`, `*.local.*`, private configuration
   - Test patterns work: `git status` and `npm pack --dry-run` should show minimal files

3. **Published Package Testing**:
   ```bash
   cd /tmp && npm install @portel/ncp@latest
   npx @portel/ncp --version
   npx @portel/ncp find "test query"  # Verify core functionality works
   ```

4. **Atomic Release Principle**:
   - One release = One complete feature/fix
   - Never release multiple versions for packaging configuration fixes
   - Fix packaging issues BEFORE the first release, not after

### Common Anti-Patterns to Avoid

1. **Iterative Public Releases**:
   - ❌ v1.3.1 (hotfix) → v1.3.2 (remove docs) → v1.3.3 (remove source maps)
   - ✅ v1.3.1 (hotfix with proper packaging from the start)

2. **Package Bloat**:
   - ❌ Including `CODE_OF_CONDUCT.md`, `HOW-IT-WORKS.md`, `.dockerignore` in NPM package
   - ❌ Including source maps (`*.js.map`, `*.d.ts.map`) that double package size
   - ✅ Only runtime essentials in published package

3. **Configuration Exposure**:
   - ❌ `CLAUDE.md` committed to git and published to NPM
   - ✅ `CLAUDE.md` excluded from both git and NPM via ignore files

4. **Rush Testing**:
   - ❌ Assuming `npm run build` success means package works
   - ✅ Actually installing published package and testing CLI functionality

### Emergency Hotfix Protocol
When critical bugs require immediate fixes:

1. **Staging Area**: Use `/tmp` directory to test published package immediately
2. **Validation**: Verify the specific bug is fixed with real NPM installation
3. **Single Release**: Bundle ALL necessary changes (bug fix + packaging) into one version
4. **No Shortcuts**: Still follow full pre-release checklist even under pressure

### Memory for Future Sessions
This file (`CLAUDE.md`) serves as persistent memory across Claude Code sessions. Always:
- Review these lessons before any release activity
- Update this file when new patterns or anti-patterns are discovered
- Apply due diligence even for "simple" changes

### Communication Context
The user often uses speech-to-text for providing instructions. Important context:
- When user refers to "cloud desktop" they likely mean "Claude Desktop" (Anthropic's desktop app)
- Speech-to-text may not capture technical terms like "Claude Desktop" correctly
- Be aware of potential speech-to-text misinterpretations in technical discussions
- Claude Desktop is a major MCP client that supports resources, prompts, and subscription capabilities