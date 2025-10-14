# 🕵️ Story 5: Runtime Detective

*How NCP automatically uses the right Node.js - even when you toggle Claude Desktop settings*

**Reading time:** 2 minutes

---

## 😵 The Pain

You installed NCP as a .mcpb extension in Claude Desktop. It works perfectly! Then...

**Scenario 1: The Mystery Crash**

```
[You toggle "Use Built-in Node.js for MCP" setting in Claude Desktop]
[Restart Claude Desktop]
[NCP starts loading your MCPs...]
[Filesystem MCP: ❌ FAILED]
[GitHub MCP: ❌ FAILED]
[Database MCP: ❌ FAILED]

You: "What broke?! It was working 5 minutes ago!"
```

**The Problem:** Your .mcpb extensions were using Claude Desktop's bundled Node.js (v20). You toggled the setting. Now they're trying to use your system Node.js (v18). Some Node.js 20 features don't exist in v18. Everything breaks.

**Scenario 2: The Path Confusion**

```
[NCP installed globally via npm]
[Uses system Node.js /usr/local/bin/node]
[.mcpb extensions installed in Claude Desktop]
[Expect Claude's bundled Node.js]

NCP spawns extension:
  command: "node /path/to/extension/index.js"

Which node???
  - System node (/usr/local/bin/node)? Wrong version!
  - Claude's bundled node? Don't know the path!
  - Extension breaks silently
```

**The Root Problem:** Node.js runtime is a **moving target**:

- Claude Desktop ships its own Node.js (predictable version)
- Your system has different Node.js (unpredictable version)
- Users toggle settings (changes which runtime to use)
- Extensions need to match the runtime NCP is using
- **Getting it wrong = everything breaks**

---

## 🕵️ The Journey

NCP acts as a **runtime detective** - it figures out which runtime it's using, then ensures all MCPs use the same one.

### **How Detection Works:**

**On Every Startup** (not just once):

```typescript
// Step 1: Check how NCP itself was launched
const myPath = process.execPath;
// Example: /Applications/Claude.app/.../node

// Step 2: Is this Claude Desktop's bundled runtime?
if (myPath.includes('/Claude.app/') ||
    myPath.includes('/Claude/resources/')) {
  // Yes! I'm running via Claude's bundled Node.js
  runtime = 'bundled';
  nodePath = '/Applications/Claude.app/.../node';
  pythonPath = '/Applications/Claude.app/.../python3';
} else {
  // No! I'm running via system runtime
  runtime = 'system';
  nodePath = 'node';    // Use system node
  pythonPath = 'python3'; // Use system python
}

// Step 3: Log what we detected (for debugging)
console.log(`Runtime detected: ${runtime}`);
console.log(`Node path: ${nodePath}`);
```

**Why Every Startup?** Because the runtime can change!

- User toggles "Use Built-in Node.js" → Runtime changes
- User switches between .mcpb and npm install → Runtime changes
- User updates Claude Desktop → Bundled runtime path changes

**Static detection (at install time) would break. Dynamic detection (at runtime) adapts.**

### **How MCP Spawning Works:**

When NCP needs to start an MCP:

```typescript
// MCP config from manifest.json
const mcpConfig = {
  command: "node",  // Generic command
  args: ["${__dirname}/dist/index.js"]
};

// Runtime detector translates to actual runtime
const actualCommand = getRuntimeForCommand(mcpConfig.command);
// If detected bundled: "/Applications/Claude.app/.../node"
// If detected system: "node"

// Spawn MCP with correct runtime
spawn(actualCommand, mcpConfig.args);
```

**Result:** MCPs always use the same runtime NCP is using. No mismatches. No breaks.

---

## ✨ The Magic

What you get with dynamic runtime detection:

### **🎯 Just Works**
- Install NCP any way (npm, .mcpb, manual)
- NCP detects runtime automatically
- MCPs use correct runtime automatically
- Zero configuration required

### **🔄 Adapts to Settings**
- Toggle "Use Built-in Node.js" → NCP adapts on next startup
- Switch between Claude Desktop and system → NCP adapts
- Update Claude Desktop → NCP finds new runtime path

### **🐛 No Version Mismatches**
- NCP running via Node 20 → MCPs use Node 20
- NCP running via Node 18 → MCPs use Node 18
- **Always matched.** No subtle version bugs.

### **🔍 Debuggable**
- NCP logs detected runtime on startup
- Shows Node path, Python path
- Easy to verify correct runtime selected

### **⚡ Works Across Platforms**
- macOS: Detects `/Applications/Claude.app/...`
- Windows: Detects `C:\...\Claude\resources\...`
- Linux: Detects `/opt/Claude/resources/...`

---

## 🔍 How It Works (The Technical Story)

### **Runtime Detection Algorithm:**

```typescript
// src/utils/runtime-detector.ts

export function detectRuntime(): RuntimeInfo {
  const currentNodePath = process.execPath;

  // Check if we're running via Claude Desktop's bundled Node
  const claudeBundledNode = getBundledRuntimePath('claude-desktop', 'node');
  // Returns: "/Applications/Claude.app/.../node" (platform-specific)

  // If our execPath matches the bundled Node path → bundled runtime
  if (currentNodePath === claudeBundledNode) {
    return {
      type: 'bundled',
      nodePath: claudeBundledNode,
      pythonPath: getBundledRuntimePath('claude-desktop', 'python')
    };
  }

  // Check if execPath is inside Claude.app → probably bundled
  const isInsideClaudeApp = currentNodePath.includes('/Claude.app/') ||
                            currentNodePath.includes('\\Claude\\');

  if (isInsideClaudeApp && existsSync(claudeBundledNode)) {
    return {
      type: 'bundled',
      nodePath: claudeBundledNode,
      pythonPath: getBundledRuntimePath('claude-desktop', 'python')
    };
  }

  // Otherwise → system runtime
  return {
    type: 'system',
    nodePath: 'node',      // Use system node
    pythonPath: 'python3'  // Use system python
  };
}
```

### **Command Translation:**

```typescript
// src/utils/runtime-detector.ts

export function getRuntimeForExtension(command: string): string {
  const runtime = detectRuntime();

  // If command is 'node' → translate to actual runtime
  if (command === 'node' || command.endsWith('/node')) {
    return runtime.nodePath;
  }

  // If command is 'python3' → translate to actual runtime
  if (command === 'python3' || command === 'python') {
    return runtime.pythonPath || command;
  }

  // Other commands → return as-is
  return command;
}
```

### **Client Registry (Platform-Specific Paths):**

```typescript
// src/utils/client-registry.ts

export const CLIENT_REGISTRY = {
  'claude-desktop': {
    bundledRuntimes: {
      node: {
        darwin: '/Applications/Claude.app/.../node',
        win32: '%LOCALAPPDATA%/Programs/Claude/.../node.exe',
        linux: '/opt/Claude/resources/.../node'
      },
      python: {
        darwin: '/Applications/Claude.app/.../python3',
        win32: '%LOCALAPPDATA%/Programs/Claude/.../python.exe',
        linux: '/opt/Claude/resources/.../python3'
      }
    }
  }
};
```

**NCP knows where Claude Desktop hides its runtimes on every platform!**

---

## 🎨 The Analogy That Makes It Click

**Static Runtime (Wrong Approach) = Directions Written on Paper** 🗺️

```
"Go to 123 Main Street"
[Next week: Store moves to 456 Oak Avenue]
[Your paper still says 123 Main Street]
[You arrive at wrong location]
[Confused why nothing works]
```

**Dynamic Runtime (NCP Approach) = GPS Navigation** 📍

```
"Navigate to Store"
[GPS finds current location of store]
[Store moves? GPS updates automatically]
[You always arrive at correct location]
[Never confused, always works]
```

**NCP doesn't remember where runtime was. It detects where runtime IS.**

---

## 🧪 See It Yourself

Try this experiment:

### **Test 1: Detect Current Runtime**

```bash
# Install NCP and check logs
ncp list

# Look for startup logs:
[Runtime Detection]
  Type: bundled
  Node: /Applications/Claude.app/.../node
  Python: /Applications/Claude.app/.../python3
  Process execPath: /Applications/Claude.app/.../node
```

### **Test 2: Toggle Setting and See Adaptation**

```bash
# Before toggle
[Claude Desktop: "Use Built-in Node.js for MCP" = ON]
[Restart Claude Desktop]
[Check logs: Type: bundled]

# Toggle setting
[Claude Desktop: "Use Built-in Node.js for MCP" = OFF]
[Restart Claude Desktop]
[Check logs: Type: system]

# NCP adapted automatically!
```

### **Test 3: Install via npm and Compare**

```bash
# Install NCP globally
npm install -g @portel/ncp

# Run and check detection
ncp list

# Look for startup logs:
[Runtime Detection]
  Type: system
  Node: node
  Python: python3
  Process execPath: /usr/local/bin/node

# Different runtime detected! But MCPs will still use system runtime consistently.
```

---

## 🚀 Why This Changes Everything

### **Before Runtime Detection (Chaos):**

```
User installs .mcpb extension
→ Works with bundled Node.js

User toggles "Use Built-in Node.js" setting
→ MCPs try to use system Node.js
→ Version mismatch
→ Cryptic errors
→ User spends 2 hours debugging

User gives up, uninstalls
```

### **After Runtime Detection (Harmony):**

```
User installs .mcpb extension
→ Works with bundled Node.js

User toggles "Use Built-in Node.js" setting
→ NCP detects change on next startup
→ MCPs automatically switch to system Node.js
→ Everything still works

User: "That was easy! It just works."
```

**The difference:** **Adaptability.**

---

## 🎯 Why Dynamic (Not Static)?

**Question:** Why detect runtime on every startup? Why not cache the result?

**Answer:** Because the runtime isn't stable!

**Things that change runtime:**

1. **User toggles settings** (most common)
2. **User updates Claude Desktop** (bundled runtime path changes)
3. **User updates system Node.js** (system runtime version changes)
4. **User switches installation method** (.mcpb → npm or vice versa)
5. **CI/CD environment** (different runtime per environment)

**Static detection** = Breaks when any of these change (frequent!)

**Dynamic detection** = Adapts automatically (resilient!)

**Cost:** ~5ms on startup to detect runtime.

**Benefit:** Never breaks due to runtime changes.

**Obvious trade-off.**

---

## 🔒 Edge Cases Handled

### **Edge Case 1: Claude Desktop Not Installed**

```typescript
// getBundledRuntimePath returns null if Claude Desktop not found
if (!claudeBundledNode) {
  // Fall back to system runtime
  return { type: 'system', nodePath: 'node', pythonPath: 'python3' };
}
```

### **Edge Case 2: Bundled Runtime Missing**

```typescript
// Check if bundled runtime actually exists
if (claudeBundledNode && existsSync(claudeBundledNode)) {
  // Use it
} else {
  // Fall back to system
}
```

### **Edge Case 3: Running in Test Environment**

```typescript
// In tests, use system runtime (for predictability)
if (process.env.NODE_ENV === 'test') {
  return { type: 'system', nodePath: 'node', pythonPath: 'python3' };
}
```

### **Edge Case 4: Symlinked Global Install**

```typescript
// process.execPath follows symlinks
// /usr/local/bin/ncp (symlink) → /usr/lib/node_modules/ncp/... (real)
const realPath = realpathSync(process.execPath);
// Use real path for detection
```

**NCP handles all the weird scenarios. You don't have to think about it.**

---

## 📚 Deep Dive

Want the full technical implementation?

- **Runtime Detector:** [src/utils/runtime-detector.ts]
- **Client Registry:** [src/utils/client-registry.ts]
- **Command Translation:** [Runtime detection summary]
- **Platform Support:** [docs/technical/platform-detection.md]

---

## 🔗 Next Story

**[Story 6: Official Registry →](06-official-registry.md)**

*How AI discovers 2,200+ MCPs without you lifting a finger*

---

## 💬 Questions?

**Q: What if I want to force a specific runtime?**

A: Set environment variable: `NCP_FORCE_RUNTIME=/path/to/node`. NCP will respect it. (Advanced users only!)

**Q: Can I see which runtime was detected?**

A: Yes! Check NCP startup logs or run `ncp --debug`. Shows detected runtime type and paths.

**Q: What if Claude Desktop's bundled runtime is broken?**

A: NCP will detect it's not working (spawn fails) and log error. You can manually configure system runtime as fallback.

**Q: Does runtime detection work for Python MCPs?**

A: Yes! NCP detects both Node.js and Python bundled runtimes. Same logic applies.

**Q: What about other runtimes (Go, Rust, etc.)?**

A: MCPs in compiled languages (Go, Rust) don't need runtime detection. They're self-contained binaries. NCP just runs them as-is.

---

**[← Previous Story](04-double-click-install.md)** | **[Back to Story Index](../README.md#the-six-stories)** | **[Next Story →](06-official-registry.md)**
