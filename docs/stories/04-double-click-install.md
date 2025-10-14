# 📦 Story 4: Double-Click Install

*Why installing NCP feels like installing a regular app - because it is one*

**Reading time:** 2 minutes

---

## 😫 The Pain

Installing most MCPs feels like being thrown back to the 1990s:

**The Typical MCP Installation:**

```bash
# Step 1: Read the README (5 minutes)
"Install via npm..."
"Requires Node.js 18+"
"Add to your config file..."

# Step 2: Check if you have Node.js
node --version
# ERROR: command not found
# [Ugh, need to install Node.js first]

# Step 3: Install Node.js (15 minutes)
[Download from nodejs.org]
[Run installer]
[Restart terminal]
[Cross fingers]

# Step 4: Install the MCP package
npm install -g @modelcontextprotocol/server-filesystem
# [Wait for npm to download dependencies]
# [Wonder if it worked]

# Step 5: Edit JSON config file (10 minutes)
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
# [Try to remember JSON syntax]
# [Add MCP config]
# [Break JSON with missing comma]
# [Fix syntax error]
# [Save and exit]

# Step 6: Restart Claude Desktop
# [Wait to see if it worked]

# Step 7: Debug when it doesn't work
# [Check logs]
# [Google error message]
# [Repeat steps 4-6]

Total time: 45 minutes (if you're lucky)
```

**For non-developers:** This is terrifying. Terminal commands? JSON editing? Node.js versions?

**For developers:** This is annoying. Why can't it just... work?

---

## 📦 The Journey

NCP via .mcpb makes installation feel like installing any app:

### **The Complete Installation Process:**

**Step 1:** Go to [github.com/portel-dev/ncp/releases/latest](https://github.com/portel-dev/ncp/releases/latest)

**Step 2:** Click "ncp.mcpb" to download

**Step 3:** Double-click the downloaded file

**Step 4:** Claude Desktop shows prompt:
```
Install NCP extension?

Name: NCP - Natural Context Provider
Version: 1.5.2
Description: N-to-1 MCP Orchestration

[Cancel] [Install]
```

**Step 5:** Click "Install"

**Step 6:** Done! ✅

**Total time: 30 seconds.**

No terminal. No npm. No JSON editing. No Node.js to install. Just... works.

### **What Just Happened?**

Behind the scenes, Claude Desktop:

1. **Extracted .mcpb bundle** to extensions directory
2. **Read manifest.json** to understand entry point
3. **Configured itself** to run NCP with correct args
4. **Started NCP** using its own bundled Node.js
5. **Auto-synced** all your existing MCPs (Story 3!)

**You clicked "Install."** Everything else was automatic.

---

## ✨ The Magic

What you get with .mcpb installation:

### **🖱️ Feels Native**
- Download → Double-click → Install
- Same as installing Chrome, Spotify, or any app
- No command line required
- No technical knowledge needed

### **⚡ Instant Setup**
- 30 seconds from download to working
- No dependencies to install manually
- No config files to edit
- Just works out of the box

### **🔄 Auto-Configures**
- Imports all existing Claude Desktop MCPs (Story 3)
- Uses Claude Desktop's bundled Node.js (Story 5)
- Sets up with optimal defaults
- You can customize later if needed

### **🎨 Configuration UI**
- Settings accessible in Claude Desktop
- No JSON editing (unless you want to)
- Visual interface for options:
  - Profile selection
  - Config path
  - Global CLI toggle
  - Auto-import toggle
  - Debug logging

### **🔧 Optional CLI Access**
- .mcpb is MCP-only by default (slim & fast)
- Want CLI tools? Enable "Global CLI Access" in settings
- Creates `ncp` command globally
- Best of both worlds

### **📦 Tiny Bundle**
- Only 126KB (compressed)
- MCP-only runtime (no CLI code)
- Pre-built, ready to run
- Fast startup (<100ms)

---

## 🔍 How It Works (The Technical Story)

### **What's Inside .mcpb?**

A .mcpb bundle is just a ZIP file with special structure:

```
ncp.mcpb (really: ncp.zip)
├── manifest.json          # Metadata + config schema
├── dist/
│   ├── index-mcp.js      # MCP server entry point
│   ├── orchestrator/     # Core NCP logic
│   ├── services/         # Registry, clients
│   └── utils/            # Helpers
├── node_modules/         # Dependencies (bundled)
└── .mcpbignore          # What to exclude
```

### **manifest.json**

Tells Claude Desktop how to run NCP:

```json
{
  "manifest_version": "0.2",
  "name": "ncp",
  "version": "1.5.2",
  "server": {
    "type": "node",
    "entry_point": "dist/index-mcp.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/index-mcp.js"]
    }
  },
  "user_config": {
    "profile": {
      "type": "string",
      "title": "Profile Name",
      "default": "all"
    },
    "enable_global_cli": {
      "type": "boolean",
      "title": "Enable Global CLI Access",
      "default": false
    }
  }
}
```

### **Installation Process**

When you double-click ncp.mcpb:

1. **OS recognizes .mcpb extension** → Opens with Claude Desktop
2. **Claude Desktop reads manifest.json** → Shows install prompt
3. **User clicks "Install"** → Claude extracts to extensions directory
4. **Claude adds to config** → Updates internal MCP registry
5. **Claude starts NCP** → Runs `node dist/index-mcp.js` with args
6. **NCP auto-syncs** → Imports existing MCPs (Story 3)

**Result:** NCP running as if you'd configured it manually, but you didn't.

---

## 🎨 The Analogy That Makes It Click

**Traditional MCP Install = Building Furniture from IKEA** 🛠️

- Read 20-page manual
- Find all the pieces (hope none are missing)
- Assemble with tiny Allen wrench
- Realize you did step 5 wrong
- Disassemble, redo
- 3 hours later: Finished!

**NCP .mcpb Install = Buying Pre-Assembled Furniture** 🎁

- Delivery arrives
- Unwrap
- Place in room
- Done!

**Same end result. 99% less effort.**

---

## 🧪 See It Yourself

Try this experiment:

### **Test: Install NCP the "Old" Way (npm)**

```bash
# Time yourself!
time (
  npm install -g @portel/ncp
  # [Edit claude_desktop_config.json]
  # [Add NCP to mcpServers]
  # [Restart Claude Desktop]
)

# Typical time: 5-10 minutes (if you know what you're doing)
```

### **Test: Install NCP the "New" Way (.mcpb)**

```bash
# Time yourself!
time (
  # Download ncp.mcpb
  # Double-click it
  # Click "Install"
  # Done
)

# Typical time: 30 seconds
```

**10x faster. 100x easier.**

---

## 🚀 Why This Changes Everything

### **Before .mcpb (Technical Barrier):**

**Who could install MCPs:**
- ✅ Developers comfortable with terminal
- ✅ People who know npm, Node.js, JSON
- ❌ Everyone else (90% of potential users)

**Adoption bottleneck:** Technical installation scared away non-developers.

### **After .mcpb (Zero Barrier):**

**Who can install NCP:**
- ✅ Developers (as before)
- ✅ Designers (double-click works!)
- ✅ Product managers (no terminal needed!)
- ✅ Students (just like installing apps)
- ✅ Your non-technical friend (it's that easy)

**Adoption accelerates:** Anyone can install NCP now.

---

## 📊 Comparison: npm vs .mcpb

| Aspect | npm Installation | .mcpb Installation |
|--------|------------------|-------------------|
| **Steps** | 7+ steps | 3 steps |
| **Time** | 10-45 minutes | 30 seconds |
| **Requires terminal** | ✅ Yes | ❌ No |
| **Requires Node.js** | ✅ Must install separately | ❌ Uses bundled runtime |
| **Requires JSON editing** | ✅ Yes | ❌ No (optional UI) |
| **Can break config** | ✅ Easy (syntax errors) | ❌ No (validated) |
| **Bundle size** | ~950KB (full package) | 126KB (MCP-only) |
| **Auto-sync MCPs** | ❌ Manual import | ✅ Automatic |
| **CLI tools** | ✅ Included | ⚙️ Optional (toggle) |
| **For non-developers** | 😰 Scary | 😊 Easy |

---

## 🎯 Why .mcpb is Slim (126KB)

**Question:** How is .mcpb so small compared to npm package?

**Answer:** It only includes MCP server code, not CLI tools!

### **What's Excluded:**

```
npm package (950KB):
├── MCP server code        [✅ In .mcpb]
├── CLI commands           [❌ Excluded]
├── Interactive prompts    [❌ Excluded]
├── Terminal UI            [❌ Excluded]
└── CLI-only dependencies  [❌ Excluded]

.mcpb bundle (126KB):
├── MCP server code        [✅ Included]
└── Core dependencies      [✅ Included]
```

### **Result:**

- **87% smaller** than full npm package
- **Faster to download** (seconds vs minutes on slow connections)
- **Faster to start** (less code to parse)
- **Perfect for production** (MCP server use case)

### **But What About CLI?**

Enable "Global CLI Access" in settings:
- .mcpb creates symlink to `ncp` command
- CLI tools become available globally
- Best of both worlds!

---

## 🔒 Security Considerations

**Q: Is it safe to double-click files from the internet?**

**A: .mcpb is as safe as any software distribution:**

### **Security Measures:**

1. **Official releases only** - Download from github.com/portel-dev/ncp/releases
2. **Checksum verification** - Each release includes SHA256 checksums
3. **Open source** - All code visible at github.com/portel-dev/ncp
4. **Signed releases** - GitHub release artifacts are signed
5. **Claude Desktop validates** - Checks manifest before installing

### **Best Practices:**

- ✅ Download from official GitHub releases
- ✅ Verify checksum (if paranoid)
- ✅ Review manifest.json before installing
- ❌ Don't install .mcpb from unknown sources
- ❌ Don't run if Claude Desktop shows warnings

**Same security model as:**
- Chrome extensions
- VS Code extensions
- macOS App Store apps

---

## 📚 Deep Dive

Want the full technical implementation?

- **.mcpb Architecture:** [MCPB-ARCHITECTURE-DECISION.md]
- **Bundle Creation:** [package.json] (see `build:mcpb` script)
- **Manifest Schema:** [manifest.json]
- **Extension Discovery:** [docs/technical/extension-discovery.md]

---

## 🔗 Next Story

**[Story 5: Runtime Detective →](05-runtime-detective.md)**

*How NCP automatically uses the right Node.js - even when you toggle Claude Desktop settings*

---

## 💬 Questions?

**Q: Can I install both npm and .mcpb versions?**

A: Yes, but don't run both simultaneously. Choose one: .mcpb for convenience, npm for CLI-heavy workflows.

**Q: How do I update NCP installed via .mcpb?**

A: Download new .mcpb, double-click, click "Install". Claude Desktop handles the update. Or enable auto-update in settings (coming soon).

**Q: Can I customize .mcpb configuration?**

A: Yes! Two ways:
1. Use settings UI in Claude Desktop (easy)
2. Edit profile JSON manually (advanced)

**Q: What if I want CLI tools immediately?**

A: Install via npm instead: `npm install -g @portel/ncp`. You get everything, including CLI, but skip the double-click convenience.

**Q: Does .mcpb work on Windows/Linux?**

A: Yes! .mcpb is cross-platform. Download once, works everywhere Claude Desktop runs.

---

**[← Previous Story](03-sync-and-forget.md)** | **[Back to Story Index](../README.md#the-six-stories)** | **[Next Story →](05-runtime-detective.md)**
