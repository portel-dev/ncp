# Product Requirements Document (PRD)
# NCP Cache Architecture Optimization

## 1. Executive Summary

### Current State
NCP currently experiences performance issues with cache management:
- Full re-indexing of all 1070+ MCPs on startup when cache validation fails
- CLI `find` command takes 2+ minutes on first run after cache changes
- No incremental update mechanism - any change triggers complete rebuild
- Cache building happens at runtime, causing slow startup times

### Proposed Solution
Implement an **incremental, MCP-by-MCP cache patching system** that builds and maintains caches during add/remove operations rather than at runtime, ensuring instant startup and fast discovery.

## 2. Architecture Overview

### 2.1 Cache Layer Hierarchy

```
Layer 1: Tool Metadata Cache (Source of Truth)
├── ~/.ncp/cache/all-tools.json (2MB)
├── Complete tool schemas, parameters, descriptions
├── MCP server information and versions
└── Config hashes for validation

Layer 2: Vector Embeddings Cache (Derived Index)
├── ~/.ncp/embeddings.json (29MB)
├── Pre-computed vector representations
├── Generated from Layer 1 metadata
└── Enables semantic search

Layer 3: Live MCP Connections (Execution Only)
├── Lazy initialization on tool.run()
├── Connection pooling with TTL
└── Never needed for discovery
```

### 2.2 Data Flow

```
Add/Remove Command → Update Profile → Discover Tools → Patch Caches → Ready
                                            ↓
                                     (Only affected MCP)

Runtime Startup → Load Profile → Validate Hash → Load Caches → Ready
                                       ↓              ↓
                                  (If changed)    (250ms)
                                       ↓
                                  Diff & Patch
```

## 3. Detailed Requirements

### 3.1 Cache Building During Add Command

**Current Implementation:**
```typescript
// src/cli/index.ts (line 316-395)
.action(async (name, command, args, options) => {
  // Currently only updates profile.json
  await manager.addMCPToProfile(profileName, name, config);
})
```

**Required Implementation:**
```typescript
.action(async (name, command, args, options) => {
  // 1. Update profile
  await manager.addMCPToProfile(profileName, name, config);

  // 2. Discover tools from this MCP only
  const tools = await discoverSingleMCP(name, command, args);

  // 3. Patch both caches
  await Promise.all([
    patchToolMetadataCache(name, tools),
    patchEmbeddingsCache(name, tools)
  ]);

  // 4. Update profile hash
  await updateProfileHash(profileName);
})
```

### 3.2 Cache Structure Updates

**Tool Metadata Cache Structure:**
```typescript
interface ToolMetadataCache {
  version: string;
  profileHash: string;        // SHA256 of entire profile
  lastModified: number;
  mcps: {
    [mcpName: string]: {
      configHash: string;      // SHA256 of command+args+env
      discoveredAt: number;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: any;
      }>;
      serverInfo: {
        name: string;
        version: string;
        description?: string;
      };
    }
  }
}
```

**Embeddings Cache Structure:**
```typescript
interface EmbeddingsCache {
  version: string;
  modelVersion: string;        // all-MiniLM-L6-v2
  lastModified: number;
  vectors: {
    [toolId: string]: number[];  // toolId = "mcpName:toolName"
  };
  metadata: {
    [toolId: string]: {
      mcpName: string;
      generatedAt: number;
      enhancedDescription: string;  // Used for generation
    }
  }
}
```

### 3.3 Surgical Patching Operations

**Files to Modify:**
1. `src/orchestrator/ncp-orchestrator.ts` - Add patching methods
2. `src/discovery/rag-engine.ts` - Add incremental indexing
3. `src/profiles/profile-manager.ts` - Add hash management

**New Class: CachePatcher**
```typescript
// src/cache/cache-patcher.ts (NEW FILE)
export class CachePatcher {
  async patchAddMCP(mcpName: string, tools: Tool[]): Promise<void>;
  async patchRemoveMCP(mcpName: string): Promise<void>;
  async patchUpdateMCP(mcpName: string, tools: Tool[]): Promise<void>;

  private async loadCache<T>(path: string): Promise<T>;
  private async saveCache<T>(path: string, data: T): Promise<void>;
  private async atomicReplace(tmpPath: string, finalPath: string): Promise<void>;
}
```

### 3.4 Profile Change Detection

**Current Implementation:**
```typescript
// src/orchestrator/ncp-orchestrator.ts (line 578-582)
// Only checks cache age (24 hours)
if (Date.now() - cache.timestamp > 24 * 60 * 60 * 1000) {
  logger.info('Cache expired, will refresh tools');
  return false;
}
```

**Required Implementation:**
```typescript
// Profile hash validation
const currentHash = this.generateProfileHash(profile);
const cachedHash = cache.profileHash;

if (currentHash !== cachedHash) {
  // Detect what changed
  const diff = await this.detectProfileChanges(profile, cache);

  // Patch only affected MCPs
  for (const mcp of diff.added) {
    await this.patchAddMCP(mcp);
  }
  for (const mcp of diff.removed) {
    await this.patchRemoveMCP(mcp);
  }
  for (const mcp of diff.modified) {
    await this.patchUpdateMCP(mcp);
  }
}
```

### 3.5 Startup Optimization

**Current Flow (SLOW):**
```
MCPServer.initialize()
  → NCPOrchestrator.initialize()
    → loadProfile()
    → loadFromCache()
    → discoverMCPTools() [RE-INDEXES ALL 1070 MCPs]
    → indexMCPTools() [SLOW - 2+ minutes]
```

**Required Flow (FAST):**
```
MCPServer.initialize()
  → NCPOrchestrator.initialize()
    → loadProfile()
    → validateProfileHash()
    → loadCaches() [250ms]
    → READY (no MCP connections)
```

## 4. Implementation Plan

### Phase 1: Cache Patching Infrastructure (Week 1)
- [ ] Create `CachePatcher` class
- [ ] Implement atomic file operations
- [ ] Add profile hash generation and validation
- [ ] Create diff detection for profile changes

### Phase 2: Update Commands (Week 1-2)
- [ ] Modify `add` command to patch caches
- [ ] Modify `remove` command to clean caches
- [ ] Add progress feedback during discovery
- [ ] Handle discovery failures gracefully

### Phase 3: Optimize Startup (Week 2)
- [ ] Remove re-indexing from `loadFromCache()`
- [ ] Skip MCP connections for discovery
- [ ] Load pre-built caches directly
- [ ] Add cache validation logging

### Phase 4: Testing & Validation (Week 2-3)
- [ ] Test incremental updates
- [ ] Test manual profile edits
- [ ] Performance benchmarks
- [ ] Edge cases (corrupt cache, missing MCPs)

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| First-run discovery | 2+ min | 250ms |
| Add command time | 1s | 5s (with discovery) |
| Remove command time | 500ms | 1s (with cleanup) |
| Cache rebuild (1070 MCPs) | 5 min | Never (incremental only) |
| Startup time (cached) | 30s+ | 250ms |
| Memory usage | 500MB | 100MB |

## 6. Technical Considerations

### 6.1 Backward Compatibility
- Detect old cache format and migrate automatically
- Support gradual migration (don't break existing installs)
- Preserve existing profile.json structure

### 6.2 Error Handling
- Corrupted cache → Rebuild affected MCP only
- Failed discovery → Mark MCP unhealthy, continue
- Network timeout → Use cached data if available

### 6.3 Concurrency
- File locking for cache writes
- Atomic replacements to prevent corruption
- Support parallel MCP discovery in batches

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cache corruption | High | Atomic writes, checksums, auto-rebuild |
| Breaking changes | High | Extensive testing, gradual rollout |
| Large cache size | Medium | Compression, periodic cleanup |
| Slow initial add | Low | Progress indicators, parallel discovery |

## 8. Future Enhancements

1. **Cache Compression** - Reduce 29MB embeddings to ~10MB
2. **Distributed Cache** - Share caches across installations
3. **Cache Versioning** - Support multiple schema versions
4. **Background Updates** - Refresh caches asynchronously
5. **Smart Invalidation** - Detect MCP updates automatically

## 9. Appendix: Current Code Analysis

### Key Files to Modify:
1. **src/orchestrator/ncp-orchestrator.ts** (Lines 565-640)
   - `loadFromCache()` - Stop re-indexing
   - `saveToCache()` - Add profile hash
   - `initialize()` - Skip MCP connections

2. **src/discovery/rag-engine.ts** (Lines 400-450)
   - `indexMCP()` - Add incremental mode
   - `loadCache()` - Support patching

3. **src/cli/index.ts** (Lines 316-395, 733-784)
   - `add` command - Build cache
   - `remove` command - Clean cache

4. **src/profiles/profile-manager.ts**
   - Add hash management
   - Add diff detection

### Existing Cache Locations:
- `~/.ncp/cache/all-tools.json` - Tool metadata
- `~/.ncp/embeddings.json` - Vector embeddings
- `~/.ncp/embeddings-metadata.json` - Embedding metadata

### Current Performance Baseline:
- **RAG engine initialization**: 203ms (with cached embeddings)
- **Embeddings cache size**: 29MB (2764 vectors)
- **Tool metadata cache size**: 2MB (1070 MCPs)
- **Current startup with re-indexing**: 2+ minutes
- **Target startup with caches**: 250ms

## 10. Implementation Notes

### 10.1 Critical Path for Fast Startup
1. Never call `discoverMCPTools()` on startup
2. Never call `indexMCPTools()` when loading from cache
3. Load caches directly without validation loops
4. Use profile hash for change detection

### 10.2 Add Command Flow
```
ncp add filesystem npx @modelcontextprotocol/server-filesystem /tmp
    ↓
1. Save to profile.json
    ↓
2. Connect to ONLY this MCP (5s timeout)
    ↓
3. Discover tools via tools/list
    ↓
4. Patch tool metadata cache (append)
    ↓
5. Generate embeddings for new tools
    ↓
6. Patch embeddings cache (append)
    ↓
7. Update profile hash
    ↓
✅ Ready - no startup delay!
```

### 10.3 Cache Patch Example
```typescript
// Adding filesystem MCP to existing cache
const cache = loadToolMetadataCache();
cache.mcps['filesystem'] = {
  configHash: 'sha256...',
  discoveredAt: Date.now(),
  tools: [...discoveredTools],
  serverInfo: {...}
};
cache.profileHash = calculateProfileHash();
saveToolMetadataCache(cache);
```

This PRD provides a complete blueprint for transforming NCP's cache architecture from a slow, monolithic rebuild system to a fast, incremental patching system that ensures instant startup and optimal performance.