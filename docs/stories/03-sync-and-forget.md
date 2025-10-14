# 🔄 Story 3: Sync and Forget

*Why you never configure the same MCP twice - ever*

**Reading time:** 2 minutes

---

## 😤 The Pain

You spent an hour setting up 10 MCPs in Claude Desktop. Perfect configuration:

- GitHub with your token ✅
- Filesystem with correct paths ✅
- Database with connection strings ✅
- All working beautifully ✅

Now you want those same MCPs in NCP.

**Your options:**

**Option A: Manual Re-configuration** 😫
```bash
ncp add github npx @modelcontextprotocol/server-github
[Wait, what were the args again?]

ncp add filesystem npx @modelcontextprotocol/server-filesystem
[What path did I use? ~/Documents or ~/Dev?]

ncp add database...
[This is taking forever. There must be a better way.]
```

**Option B: Copy-Paste Hell** 🤮
```bash
# Open claude_desktop_config.json
# Copy MCP config for github
# Edit NCP profile JSON
# Paste, fix formatting
# Repeat 9 more times
# Fix JSON syntax errors
# Start over because you broke something
```

**You just want your MCPs. Why is this so hard?**

Worse: Next week you install a new .mcpb extension in Claude Desktop. Now NCP is out of sync again. Manual sync required. Forever.

---

## 🔄 The Journey

NCP takes a radically simpler approach: **It syncs automatically. On every startup. Forever.**

Here's what happens when you install NCP (via .mcpb bundle):

### **First Startup:**

```
[You double-click ncp.mcpb]
[Claude Desktop installs it]

NCP starts up:
  1. 🔍 Checks: "Is Claude Desktop installed?"
  2. 📂 Reads: ~/Library/.../claude_desktop_config.json
  3. 📂 Reads: ~/Library/.../Claude Extensions/
  4. ✨ Discovers:
     - 8 MCPs from config file
     - 3 MCPs from .mcpb extensions
  5. 💾 Imports all 11 into NCP profile
  6. ✅ Ready! All your MCPs available through NCP
```

**Time elapsed: 2 seconds.**

No manual configuration. No copy-paste. No JSON editing. Just... works.

### **Next Week: You Install New MCP**

```
[You install brave-search.mcpb in Claude Desktop]
[You restart Claude Desktop]

NCP starts up:
  1. 🔍 Checks Claude Desktop config (as always)
  2. 🆕 Detects: New MCP "brave-search"
  3. 💾 Auto-imports into NCP profile
  4. ✅ Ready! Brave Search now available through NCP
```

**You did nothing.** NCP just knew.

### **Next Month: You Update Token**

```
[You update GITHUB_TOKEN in claude_desktop_config.json]
[You restart Claude Desktop]

NCP starts up:
  1. 🔍 Reads latest config (as always)
  2. 🔄 Detects: GitHub config changed
  3. 💾 Updates NCP profile with new token
  4. ✅ Ready! GitHub MCP using latest credentials
```

**NCP stays in sync. Automatically. Forever.**

---

## ✨ The Magic

What you get with continuous auto-sync:

### **⚡ Zero Manual Configuration**
- Install NCP → All Claude Desktop MCPs imported instantly
- No CLI commands to run
- No JSON files to edit
- No copy-paste required

### **🔄 Always In Sync**
- Install new MCP in Claude Desktop → NCP gets it on next startup
- Update credentials in config → NCP picks up changes
- Remove MCP from Claude Desktop → NCP removes it too
- **One source of truth:** Claude Desktop config

### **🎯 Works with Everything**
- MCPs in `claude_desktop_config.json` ✅
- .mcpb extensions from marketplace ✅
- Mix of both ✅
- Even future MCP installation methods ✅

### **🧠 Smart Merging**
- Config file MCPs take precedence over extensions
- Preserves your customizations in NCP profile
- Only syncs what changed (fast!)
- Logs what was imported (transparency)

### **🚀 Set It and Forget It**
- Configure once in Claude Desktop
- NCP follows automatically
- No maintenance required
- No drift between systems

---

## 🔍 How It Works (The Technical Story)

NCP's auto-sync runs on **every startup** (not just first time):

### **Step 1: Detect Client**

```typescript
// NCP checks: Am I running as Claude Desktop extension?
if (process.env.NCP_MODE === 'extension') {
  // Yes! Let's sync from Claude Desktop
  syncFromClaudeDesktop();
}
```

### **Step 2: Read Configuration**

```typescript
// Read claude_desktop_config.json
const configPath = '~/Library/Application Support/Claude/claude_desktop_config.json';
const config = JSON.parse(fs.readFileSync(configPath));
const mcpsFromConfig = config.mcpServers; // Object with MCP configs

// Read .mcpb extensions directory
const extensionsDir = '~/Library/Application Support/Claude/Claude Extensions/';
const mcpsFromExtensions = await scanExtensionsDirectory(extensionsDir);
```

### **Step 3: Merge & Import**

```typescript
// Merge (config takes precedence)
const allMCPs = {
  ...mcpsFromExtensions,  // Extensions first
  ...mcpsFromConfig       // Config overrides
};

// Import using internal add command (for cache coherence)
for (const [name, config] of Object.entries(allMCPs)) {
  await internalAdd(name, config);
}
```

### **Step 4: Log Results**

```typescript
console.log(`Auto-imported ${count} MCPs from Claude Desktop`);
console.log(`  - From config: ${configCount}`);
console.log(`  - From extensions: ${extensionCount}`);
```

**Key insight:** Uses internal `add` command (not direct file writes) so NCP's cache stays coherent. Smart!

---

## 🎨 The Analogy That Makes It Click

**Manual Sync = Syncing Music to iPhone via iTunes** 🎵

Remember the old days?
- Manage music library on computer
- Plug in iPhone
- Click "Sync" button
- Wait 10 minutes
- Disconnect iPhone
- Add new song on computer
- Plug in iPhone AGAIN
- Click "Sync" AGAIN
- Endless manual syncing

**Auto-Sync = Apple Music / Spotify** ☁️

Add song on computer → Appears on phone instantly. No cables. No "sync" button. Just... works.

**NCP's auto-sync = Same experience for MCPs.**

Configure in Claude Desktop → Available in NCP instantly. No commands. No manual sync. Just... works.

---

## 🧪 See It Yourself

Try this experiment:

### **Setup:**

```bash
# Install NCP as .mcpb extension in Claude Desktop
[Double-click ncp.mcpb]
[Claude Desktop installs it]
```

### **Test 1: Initial Import**

```bash
# Before starting NCP, check your Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
# Note: You have 5 MCPs configured

# Start Claude Desktop (which starts NCP)
# Ask Claude: "What MCPs do you have access to?"

# Claude will show all 5 MCPs imported automatically!
```

### **Test 2: Add New MCP**

```bash
# Install a new .mcpb extension (e.g., brave-search)
[Install brave-search.mcpb in Claude Desktop]

# Restart Claude Desktop
# Ask Claude: "Do you have access to Brave Search?"

# Claude: "Yes! I can search the web using Brave Search."
# [NCP auto-imported it on startup]
```

### **Test 3: Update Credentials**

```bash
# Edit claude_desktop_config.json
# Change GITHUB_TOKEN to a new value

# Restart Claude Desktop
# NCP will use the new token automatically
```

**You never ran `ncp import` or edited NCP configs manually.** It just synced.

---

## 🚀 Why This Changes Everything

### **Before NCP (Manual Sync):**

```
Day 1: Configure 10 MCPs in Claude Desktop (1 hour)
Day 1: Configure same 10 MCPs in NCP (1 hour)
Day 8: Install new MCP in Claude Desktop
Day 8: Remember to configure in NCP too (15 min)
Day 15: Update token in Claude Desktop
Day 15: Forget to update in NCP
Day 16: NCP fails, spend 30 min debugging
[Repeat forever...]

Total time wasted: Hours per month
```

### **After NCP (Auto-Sync):**

```
Day 1: Configure 10 MCPs in Claude Desktop (1 hour)
Day 1: Install NCP → Syncs automatically (2 seconds)
Day 8: Install new MCP in Claude Desktop
Day 8: Restart Claude Desktop → NCP syncs (2 seconds)
Day 15: Update token in Claude Desktop
Day 15: Restart Claude Desktop → NCP syncs (2 seconds)
[Repeat forever...]

Total time wasted: Zero
```

**You configure once, NCP follows forever.**

---

## 🎯 Why Continuous (Not One-Time)?

**Question:** Why sync on every startup? Why not just once?

**Answer:** Because your MCP setup changes frequently!

**Real-world scenarios:**

1. **New MCPs:** You discover cool new .mcpb extensions weekly
2. **Token Rotation:** Security best practice = rotate credentials monthly
3. **Path Changes:** You reorganize directories, update filesystem paths
4. **Project Changes:** Different projects need different MCPs
5. **Debugging:** You temporarily disable MCPs to isolate issues

**One-time sync = Stale within days.**

**Continuous sync = Always current.**

The cost is negligible (2 seconds on startup). The benefit is massive (zero manual work forever).

---

## 🔒 What About Conflicts?

**Q: What if I customize MCPs in NCP, then Claude Desktop changes them?**

**A: Config file wins.** Claude Desktop is the source of truth.

**Why?** Because:
- ✅ Most users configure in Claude Desktop first (easier UI)
- ✅ .mcpb extensions update automatically (Claude Desktop managed)
- ✅ Tokens typically stored in Claude Desktop config
- ✅ One source of truth = Less confusion

**If you need NCP-specific customizations:**
- Use different profile: `--profile=custom`
- Disable auto-import for that profile
- Manage manually

**But 95% of users want: Configure once in Claude Desktop, NCP follows.**

---

## 📚 Deep Dive

Want the full technical implementation?

- **Client Importer:** [src/utils/client-importer.ts]
- **Client Registry:** [src/utils/client-registry.ts]
- **Auto-Import Logic:** [src/cli/index.ts] (startup sequence)
- **Extension Discovery:** [docs/technical/extension-discovery.md]

---

## 🔗 Next Story

**[Story 4: Double-Click Install →](04-double-click-install.md)**

*Why installing NCP feels like installing a regular app - because it is one*

---

## 💬 Questions?

**Q: Does auto-sync work with Cursor, Cline, etc.?**

A: Currently Claude Desktop only (it has the most mature .mcpb extension support). We're exploring support for other clients.

**Q: What if I don't want auto-sync?**

A: Install via npm (`npm install -g @portel/ncp`) instead of .mcpb bundle. Configure MCPs manually via CLI.

**Q: Can I disable auto-sync but keep .mcpb installation?**

A: Set environment variable: `NCP_AUTO_IMPORT=false` in manifest.json config. NCP will respect it.

**Q: Does auto-sync slow down startup?**

A: Negligible. Config parsing + comparison takes ~50ms. Only imports what changed. You won't notice it.

**Q: What if Claude Desktop config is invalid JSON?**

A: NCP logs the error and skips auto-import. Falls back to existing NCP profile. Your setup doesn't break.

---

**[← Previous Story](02-secrets-in-plain-sight.md)** | **[Back to Story Index](../README.md#the-six-stories)** | **[Next Story →](04-double-click-install.md)**
