# Dynamic Runtime Detection - Implementation Summary

## Critical Change

**Before:** Runtime detection happened at **import time** (static)
**After:** Runtime detection happens at **spawn time** (dynamic)

**Why?** The "Use Built-in Node.js for MCP" setting can be toggled at any time by the user.

---

## How It Works Now

### **Every Time NCP Boots:**

1. **Detect how NCP itself is running**
   ```typescript
   const runtime = detectRuntime();
   // Checks process.execPath to see if running via:
   //   - Claude Desktop's bundled Node → type: 'bundled'
   //   - System Node → type: 'system'
   ```

2. **Store original commands in config**
   ```json
   {
     "github": {
       "command": "node",  // Original command, not resolved path
       "args": ["/path/to/extension/index.js"]
     }
   }
   ```

3. **Resolve runtime when spawning child processes**
   ```typescript
   const resolvedCommand = getRuntimeForExtension("node");
   // If NCP running via bundled: "/Applications/Claude.app/.../node"
   // If NCP running via system: "node"

   spawn(resolvedCommand, args);
   ```

---

## Files Created

### **`src/utils/runtime-detector.ts`** (NEW)

**Exports:**
- `detectRuntime()` - Detects bundled vs system by checking `process.execPath`
- `getRuntimeForExtension(command)` - Resolves `node`/`python3` to correct runtime
- `logRuntimeInfo()` - Debug logging for runtime detection

**Logic:**
```
Is process.execPath inside /Claude.app/?
  YES → Use bundled runtimes from client-registry
  NO  → Use system runtimes (node, python3)
```

---

## Files Modified

### **`src/utils/client-registry.ts`**

**Added:**
- `bundledRuntimes` field to ClientDefinition (Node.js and Python paths)
- `getBundledRuntimePath()` function

### **`src/utils/client-importer.ts`**

**Changed:**
- **REMOVED** runtime resolution at import time
- **STORES** original commands (`node`, `python3`)
- **REMOVED** unused imports and parameters

### **`src/orchestrator/ncp-orchestrator.ts`**

**Added:**
- Import of `getRuntimeForExtension` and `logRuntimeInfo`
- Runtime logging in `initialize()` (debug mode)
- Runtime resolution before spawning in 4 locations:
  1. `probeAndDiscoverMCP()` - Discovery
  2. `getOrCreatePersistentConnection()` - Execution
  3. `getResourcesFromMCP()` - Resources
  4. `getPromptsFromMCP()` - Prompts

**Pattern:**
```typescript
// Before spawning
const resolvedCommand = getRuntimeForExtension(config.command);

// Use resolved command
const wrappedCommand = mcpWrapper.createWrapper(
  mcpName,
  resolvedCommand,  // Dynamically resolved
  config.args || []
);
```

---

## Key Benefits

### **1. Dynamic Adaptation**
```
Day 1: User enables "Use Built-in Node.js"
  → Claude Desktop launches NCP with bundled Node
  → NCP detects bundled runtime
  → Spawns extensions with bundled Node

Day 2: User disables "Use Built-in Node.js"
  → Claude Desktop launches NCP with system Node
  → NCP detects system runtime
  → Spawns extensions with system Node
```

### **2. Portable Configs**
```json
// Config is clean and portable
{
  "github": { "command": "node", "args": [...] }
}

// NOT polluted with absolute paths like:
{
  "github": { "command": "/Applications/Claude.app/.../node", "args": [...] }
}
```

### **3. Always Correct Runtime**
```
NCP running via bundled Node?
  → Extensions run via bundled Node

NCP running via system Node?
  → Extensions run via system Node

ALWAYS MATCHES!
```

---

## Testing

### **Test Dynamic Detection**

1. **Enable bundled runtime in Claude Desktop**
   - Settings → Extensions → "Use Built-in Node.js for MCP" → ON

2. **Restart Claude Desktop**
   - NCP will be launched with bundled Node

3. **Check runtime detection** (with `NCP_DEBUG=true`)
   ```
   [Runtime Detection]
     Type: bundled
     Node: /Applications/Claude.app/.../node
     Python: /Applications/Claude.app/.../python3
     Process execPath: /Applications/Claude.app/.../node
   ```

4. **Verify extensions work**
   - Run `ncp run github:create_issue` (or any .mcpb extension tool)
   - Should work with bundled runtime

5. **Toggle setting**
   - Settings → Extensions → "Use Built-in Node.js for MCP" → OFF
   - Restart Claude Desktop

6. **Check runtime detection again**
   ```
   [Runtime Detection]
     Type: system
     Node: node
     Python: python3
     Process execPath: /usr/local/bin/node
   ```

7. **Verify extensions still work**
   - Run `ncp run github:create_issue`
   - Should work with system runtime

---

## Debugging

### **Enable Debug Logging**

```bash
# Set environment variable
export NCP_DEBUG=true

# Or in Claude Desktop config
{
  "mcpServers": {
    "ncp": {
      "command": "npx",
      "args": ["-y", "@portel/ncp"],
      "env": {
        "NCP_DEBUG": "true"
      }
    }
  }
}
```

### **Check Runtime Detection**

Look for these log lines on startup:
```
[Runtime Detection]
  Type: bundled | system
  Node: <path to node>
  Python: <path to python>
  Process execPath: <how NCP was launched>
```

### **Verify Resolution**

When spawning an extension, you should see:
- Original command from config: `"node"`
- Resolved command for spawn: `/Applications/Claude.app/.../node` (if bundled)

---

## Edge Cases Handled

✅ Bundled runtime path doesn't exist → Falls back to system runtime
✅ Unknown `process.execPath` → Assumes system runtime
✅ Non-standard commands (full paths) → Returns as-is
✅ Python variations (`python`, `python3`) → Handles both
✅ Setting toggled between boots → Detects fresh on next boot

---

## Migration Path

### **Existing Configs**

No migration needed! Existing configs with `"command": "node"` will:
1. Be detected as original commands
2. Work with dynamic runtime resolution
3. Adapt to setting changes automatically

### **No Breaking Changes**

- Configs created before this change: ✅ Work
- Configs created after this change: ✅ Work
- Toggling Claude Desktop setting: ✅ Works

---

## Summary

**What changed:**
- Runtime detection moved from import time to spawn time
- Configs store original commands, not resolved paths
- NCP detects how it's running and uses same runtime for extensions

**Why it matters:**
- User can toggle "Use Built-in Node.js" setting anytime
- NCP adapts on next boot automatically
- No config changes needed, everything just works

**Result:**
- ✅ Disabled .mcpb extensions work via NCP
- ✅ Runtime compatibility guaranteed
- ✅ Setting changes respected dynamically
- ✅ Clean, portable configs

🎉 **The optimal .mcpb workflow is fully supported with dynamic runtime detection!**
