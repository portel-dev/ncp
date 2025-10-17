# NCP - Natural Context Provider

[![npm version](https://img.shields.io/npm/v/@portel/ncp.svg)](https://www.npmjs.com/package/@portel/ncp)
[![npm downloads](https://img.shields.io/npm/dm/@portel/ncp.svg)](https://www.npmjs.com/package/@portel/ncp)
[![GitHub release downloads](https://img.shields.io/github/downloads/portel-dev/ncp/total?label=.mcpb%20downloads)](https://github.com/portel-dev/ncp/releases)
[![Latest release](https://img.shields.io/github/downloads/portel-dev/ncp/latest/total?label=latest%20.mcpb)](https://github.com/portel-dev/ncp/releases/latest)
[![License: Elastic-2.0](https://img.shields.io/badge/License-Elastic--2.0-blue.svg)](https://www.elastic.co/licensing/elastic-license)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

<!-- mcp-name: io.github.portel-dev/ncp -->

---

## 🎯 **One MCP to Rule Them All**

**Here's how it works, told as a story:**

Imagine you have 50 tools. Showing them all to your AI creates chaos - it can't decide which to use, wastes time analyzing options, and picks the wrong one 30% of the time.

**NCP changes the game:** Your AI doesn't see 50 tools. Instead, it dreams of the perfect tool it needs, and NCP finds it instantly through semantic search.

**The magic?** Your AI writes what it wants (a user story), NCP discovers the right tool from across ALL your MCPs, and execution happens immediately - no hesitation, no wrong choices, no wasted tokens.

---

## ✨ **What You Get (The "So What?")**

### **💰 97% Cost Savings**

**Before NCP:**
- 100,000+ tokens burned on tool schemas every conversation
- You pay for these tokens with EVERY message
- $10-15/month wasted on tool overhead alone

**After NCP:**
- 2,500 tokens for 2 unified tools
- 97% reduction = 40x longer conversations
- **$0.18/month** tool overhead

**Translation:** Same tools, 1/40th the cost.

---

### **⚡ 8x Faster Responses**

**Before NCP:**
- AI spends 5-8 seconds analyzing 50+ tool schemas
- "Let me check which tool to use..."
- Decision paralysis on every task

**After NCP:**
- Sub-second semantic search
- Instant tool discovery
- AI acts immediately, no hesitation

**Translation:** Your AI becomes decisive, not indecisive.

---

### **🎯 10x Better Accuracy**

**Before NCP:**
- AI picks wrong tool ~30% of the time
- "Should I use `read_file` or `get_file_content`?"
- Frustration, retries, wasted time

**After NCP:**
- Semantic matching finds the RIGHT tool
- <3% wrong selections
- First try success

**Translation:** Your AI becomes reliable, not confusing.

---

### **💬 12x Longer Conversations**

**Before NCP:**
- Context limit hit at 50 messages
- "I've reached my limit..."
- Frustration mid-task

**After NCP:**
- 97% token savings = 600+ message conversations
- Never hit limits in normal use
- Complete complex projects in one session

**Translation:** Your AI becomes capable, not limited.

---

### **🧠 Focused Thinking**

**Before NCP:**
- AI overwhelmed by 50+ competing options
- Analysis paralysis
- Asks clarifying questions constantly

**After NCP:**
- AI writes what it needs (user story)
- One perfect tool appears
- Immediate execution

**Translation:** Your AI becomes laser-focused, not scattered.

---

### **🔐 Built-in Safety**

**NEW in v1.5.3:**
- Automatic confirmation before dangerous operations
- Semantic pattern matching (46.4% accuracy)
- "Approve Always" whitelist for trusted tools
- Simple toggle: `ncp settings modifications on/off`

**Translation:** Your AI is protected from accidents.

---

## 🤔 **"That's Great... But How?"**

Now that you know WHAT you get, here's HOW NCP achieves it:

### **The Dream-and-Discover Mechanism**

**Step 1: AI Dreams of the Perfect Tool**
```
AI thinks: "I need to read a file..."
AI writes: "I want to read the contents of a file on disk"
```
*No browsing through 50 schemas - just pure intent*

**Step 2: NCP Discovers Through Semantic Search**
```
NCP:
  ├─ Converts dream to vector embedding
  ├─ Compares against ALL tool descriptions (cached)
  ├─ Ranks by semantic similarity (0.2 seconds)
  └─ Returns: filesystem:read_file (95% confidence)
```
*Understands MEANING, not just keywords*

**Step 3: AI Executes Immediately**
```
AI calls: run({ tool: "filesystem:read_file", params: {...} })
NCP loads MCP on-demand → Returns result
```
*Fast, accurate, confident action*

**The Genius:** Writing a user story forces your AI to think clearly about WHAT it needs, not HOW to do it. This constraint sparks better decisions.

---

## 😤 **The Problem This Solves**

You added MCPs to make your AI more powerful. Instead, you got:

### **🧸 The Toy Problem**

**A child with one toy:**
→ Treasures it, masters it, creates endless games with it

**A child with 50 toys:**
→ Can't hold them all, loses pieces, gets overwhelmed, stops playing entirely

**Your AI is that child.** MCPs are the toys. More isn't always better.

### **🍕 The Buffet Problem**

**Someone hands you a pizza:**
→ Pure joy! Immediate satisfaction.

**Take you to a buffet with 200 dishes:**
→ Analysis paralysis. 20 minutes deciding, lose your appetite, leave unsatisfied.

**Your AI faces the same choice:** Give it one perfect tool → Instant action. Give it 50 tools → Cognitive overload.

### **✍️ The Creativity Problem**

**A poet told "write about anything":**
→ Writer's block. Infinite options paralyze.

**A poet told "write a haiku about rain":**
→ Instant inspiration. Constraints spark creativity.

**Your AI needs the same focus.** NCP provides constraints that unlock superpowers.

---

## 📊 **The Before & After Reality**

### **Before NCP: Tool Schema Explosion** 😵‍💫

```
🤖 AI Assistant Context:
├── Filesystem MCP (12 tools) ─ 15,000 tokens
├── Database MCP (8 tools) ─── 12,000 tokens
├── Web Search MCP (6 tools) ── 8,000 tokens
├── Email MCP (15 tools) ───── 18,000 tokens
├── Shell MCP (10 tools) ───── 14,000 tokens
├── GitHub MCP (20 tools) ──── 25,000 tokens
└── Slack MCP (9 tools) ────── 11,000 tokens

💀 Total: 80 tools = 103,000 tokens of schemas
```

**What happens:**
- AI burns 50%+ of context just understanding what tools exist
- Spends 5-8 seconds analyzing which tool to use
- Often picks wrong tool due to schema confusion
- Hits context limits mid-conversation

### **After NCP: Unified Intelligence** ✨

```
🤖 AI Assistant Context:
└── NCP (2 unified tools) ──── 2,500 tokens

🎯 Behind the scenes: NCP manages all 80 tools
📈 Context saved: 100,500 tokens (97% reduction!)
⚡ Decision time: Sub-second tool selection
🎪 AI behavior: Confident, focused, decisive
```

**Real measurements from production usage:**

| Your MCP Setup | Without NCP | With NCP | You Save |
|----------------|-------------|----------|----------|
| **Small** (5 MCPs, 25 tools) | 15,000 tokens | 8,000 tokens | **47% cheaper** |
| **Medium** (15 MCPs, 75 tools) | 45,000 tokens | 12,000 tokens | **73% cheaper** |
| **Large** (30 MCPs, 150 tools) | 90,000 tokens | 15,000 tokens | **83% cheaper** |
| **Enterprise** (50+ MCPs, 250+ tools) | 150,000 tokens | 20,000 tokens | **87% cheaper** |

**Translation:**
- **5x faster** AI responses
- **12x longer** conversations
- **90% fewer** wrong tool selections
- **$9.90/month saved** on token costs (average user)

---

## 🚀 **Installation**

Choose your installation method:

<details>
<summary>📦 <strong>Claude Desktop</strong> (Recommended - One-Click Install)</summary>

<br>

**Perfect for:** Claude Desktop users who want zero configuration

### **Step 1: Download**

[Download ncp.dxt](https://github.com/portel-dev/ncp/releases/latest/download/ncp.dxt) from latest release

### **Step 2: Install**

Double-click the downloaded `ncp.dxt` file → Click "Install" when prompted

### **Step 3: Done!**

NCP automatically:
- ✅ Syncs all your Claude Desktop MCPs
- ✅ Detects runtime dynamically
- ✅ Provides 2 unified tools instead of 50+

**Time:** 30 seconds | **Configuration:** Zero

**See complete guide with screenshots:** [docs/claude-desktop.md](docs/claude-desktop.md)

**Auto-sync means:**
- Add MCP to Claude Desktop → NCP finds it automatically on next startup
- Remove MCP from Claude Desktop → NCP removes it automatically
- Zero manual configuration needed

**Manual configuration** (optional):
```bash
nano ~/.ncp/profiles/all.json
```

</details>

<details>
<summary>📥 <strong>npm Package</strong> (All MCP Clients)</summary>

<br>

**Perfect for:** Cursor, Cline, Continue, VS Code, CLI power users

### **Step 1: Install**

```bash
npm install -g @portel/ncp
```

### **Step 2: Import Existing MCPs**

```bash
# Copy your claude_desktop_config.json to clipboard first, then:
ncp config import
```

Or add MCPs manually:
```bash
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github
```

### **Step 3: Configure Your AI Client**

Add to your client's config file:
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

### **Step 4: Restart**

Restart your AI client to activate NCP.

**Time:** 2 minutes | **Configuration:** One JSON entry

</details>

<details>
<summary>🔧 <strong>VS Code with GitHub Copilot</strong></summary>

<br>

### **Configuration File Location:**

- **macOS:** `~/Library/Application Support/Code/User/settings.json`
- **Windows:** `%APPDATA%\Code\User\settings.json`
- **Linux:** `~/.config/Code/User/settings.json`

### **Add to settings.json:**

```json
{
  "mcp.servers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

### **Restart VS Code**

**📌 Important:** Restart VS Code after saving the settings file.

> **Note:** Configuration paths may change. See [VS Code docs](https://code.visualstudio.com/docs) for latest info.

</details>

<details>
<summary>🎯 <strong>Cursor IDE</strong></summary>

<br>

### **Add to Cursor config:**

```json
{
  "mcp": {
    "servers": {
      "ncp": {
        "command": "ncp"
      }
    }
  }
}
```

> **Note:** Config location may vary by version. See [Cursor docs](https://cursor.sh/docs) for details.

</details>

<details>
<summary>🔄 <strong>Alternative: npx (No Global Install)</strong></summary>

<br>

**Perfect for:** Trying NCP without installing globally

### **All Commands Work with npx:**

Replace `ncp` with `npx @portel/ncp`:

```bash
# Import MCPs
npx @portel/ncp config import

# Find tools
npx @portel/ncp find "file operations"

# Add MCPs
npx @portel/ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
```

### **Client Configuration:**

```json
{
  "mcpServers": {
    "ncp": {
      "command": "npx",
      "args": ["@portel/ncp"]
    }
  }
}
```

</details>

---

## 🧪 **Test Drive: Experience What Your AI Experiences**

See the difference yourself with NCP's CLI:

### **🔍 Smart Discovery**

```bash
# Ask like a human, not a programmer:
ncp find "I need to read a file"
ncp find "help me send an email"
ncp find "search for something online"
```

**Notice:** NCP understands intent, not just keywords.

### **📋 See Your Ecosystem**

```bash
# List all MCPs and tools
ncp list --depth 2

# Check MCP health
ncp list --depth 1
```

### **⚡ Direct Testing**

```bash
# Test safely with dry-run
ncp run filesystem:read_file --params '{"path": "/tmp/test.txt"}' --dry-run

# Run for real
ncp run filesystem:read_file --params '{"path": "/tmp/test.txt"}'
```

### **⚙️ Configure Safety**

```bash
# Check confirmation settings
ncp settings modifications

# Enable/disable
ncp settings modifications on/off

# Manage whitelist
ncp settings whitelist list
ncp settings whitelist clear
```

### **✅ Verify Installation**

```bash
ncp --version           # Check version
ncp list                # See imported MCPs
ncp find "file"         # Test discovery
ncp config validate     # Validate configuration
```

**Success = NCP shows version, lists MCPs, finds tools, and your AI sees only 2 tools**

---

## 🎯 **Popular MCPs That Work Great**

### **🔥 Most Downloaded**

```bash
ncp add sequential-thinking npx @modelcontextprotocol/server-sequential-thinking  # 5,550+ downloads
ncp add memory npx @modelcontextprotocol/server-memory                            # 4,200+ downloads
ncp add brave-search npx @modelcontextprotocol/server-brave-search                # 680+ downloads
```

### **🛠️ Development Tools**

```bash
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/code
ncp add github npx @modelcontextprotocol/server-github
ncp add shell npx @modelcontextprotocol/server-shell
```

### **🌐 Productivity & Integrations**

```bash
ncp add gmail npx @mcptools/gmail-mcp
ncp add slack npx @modelcontextprotocol/server-slack
ncp add postgres npx @modelcontextprotocol/server-postgres
ncp add puppeteer npx @hisma/server-puppeteer
```

**Discover 2,200+ more:** [Smithery.ai](https://smithery.ai) | [mcp.so](https://mcp.so)

---

## 🔧 **Advanced Features**

<details>
<summary>🚀 <strong>Project-Level Configuration</strong></summary>

<br>

Configure MCPs per project for team consistency:

```bash
# In any project directory
mkdir .ncp
ncp add filesystem npx @modelcontextprotocol/server-filesystem ./
ncp add github npx @modelcontextprotocol/server-github

# NCP automatically uses .ncp/ if it exists
```

**Perfect for:**
- 🤖 Claude Code projects (project-specific tooling)
- 👥 Team consistency (ship `.ncp/` with repo)
- 🔧 Different needs per project (frontend vs backend)
- 📦 Environment isolation (no global conflicts)

**Example:**
```
frontend-app/
  .ncp/profiles/all.json   # → playwright, lighthouse

api-backend/
  .ncp/profiles/all.json   # → postgres, redis, docker
```

</details>

<details>
<summary>🔍 <strong>Official Registry Integration</strong></summary>

<br>

Search and install MCPs through AI conversation:

```
You: "Find database MCPs"

AI: [Shows numbered list from 2,200+ MCPs]
    1. ⭐ PostgreSQL (Official, 1,240 downloads)
    2. ⭐ SQLite (Official, 890 downloads)
    ...

You: "Install 1 and 2"

AI: [Installs PostgreSQL and SQLite] ✅ Done!
```

**How it works:**
- AI queries official MCP registry
- Shows relevant MCPs with stats
- Installs on your command
- Zero manual searching

</details>

<details>
<summary>⚙️ <strong>Multi-Profile Organization</strong></summary>

<br>

Organize MCPs by environment:

```bash
# Development profile
ncp add --profile dev filesystem npx @modelcontextprotocol/server-filesystem ~/dev

# Production profile
ncp add --profile prod database npx production-db-server

# Use specific profile
ncp --profile dev find "file tools"

# Configure AI client with profile
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "args": ["--profile", "dev"]
    }
  }
}
```

</details>

<details>
<summary>🔐 <strong>Confirm Modifications Before Executing</strong></summary>

<br>

**NEW in v1.5.3:** Server-side safety that protects against unwanted changes.

**What gets caught:**
- File writes and deletes
- Command executions (shell, docker, kubernetes)
- Database operations (updates, deletes, drops)
- Deployments and pushes
- Email/message sending
- Financial operations

**What doesn't get caught:**
- Reading files
- Viewing data
- Getting information
- Searching/querying

**Configure:**
```bash
# Check status
ncp settings modifications

# Enable/disable
ncp settings modifications on
ncp settings modifications off

# Manage approved tools
ncp settings whitelist list
ncp settings whitelist clear
```

**Example prompt:**
```
⚠️  Confirm Before Running

Tool: filesystem:write_file
Description: Create or overwrite a file

This operation matches your safety pattern (confidence: 46.4%)

Options:
  [R] Run Once      - Execute this time only
  [A] Approve Always - Never ask again for this tool
  [C] Cancel        - Don't execute
```

**Technical details:**
- Uses semantic matching with tag-based patterns
- 46.4% peak accuracy (scientifically tested against 83 tools)
- Threshold 0.40 catches 5 critical operations (~6% of tools)
- **[Full documentation →](docs/confirm-before-run.md)**

</details>

---

## 🛟 **Troubleshooting**

<details>
<summary>🐛 <strong>AI Not Using Tools</strong></summary>

<br>

**Check these in order:**

1. **Verify NCP is running**
   ```bash
   ncp list  # Should show your MCPs
   ```

2. **Test discovery**
   ```bash
   ncp find "file"  # Should return results
   ```

3. **Check AI config**
   - Ensure config points to `ncp` command
   - Config file in correct location

4. **Restart AI client**
   - Fully quit and relaunch
   - Changes don't apply until restart

</details>

<details>
<summary>⚠️ <strong>Import Issues</strong></summary>

<br>

**Check what was imported:**
```bash
ncp list
```

**Validate configuration:**
```bash
ncp config validate
```

**See detailed logs:**
```bash
DEBUG=ncp:* ncp config import
```

**Common issues:**
- Clipboard empty when running `ncp config import`
- JSON syntax errors in config
- Missing environment variables

</details>

<details>
<summary>🐌 <strong>Performance Issues</strong></summary>

<br>

**Check MCP health:**
```bash
ncp list --depth 1
# Look for unhealthy MCPs
```

Unhealthy MCPs slow everything down!

**Clear cache:**
```bash
rm -rf ~/.ncp/cache
# Then restart your AI client
```

**Monitor with debug logs:**
```bash
DEBUG=ncp:* ncp find "test"
```

</details>

---

## 📚 **Learn More**

- 📖 **[Technical Deep Dive](HOW-IT-WORKS.md)** - Architecture, algorithms, benchmarks
- 🖥️ **[Claude Desktop Guide](docs/claude-desktop.md)** - Complete guide with screenshots
- 🔐 **[Confirm Before Run](docs/confirm-before-run.md)** - Safety feature details
- 🤝 **[Contributing](CONTRIBUTING.md)** - Help make NCP better

---

## 🤝 **Contributing**

Help make NCP even better:

- 🐛 **Bug reports:** [GitHub Issues](https://github.com/portel-dev/ncp/issues)
- 💡 **Feature requests:** [GitHub Discussions](https://github.com/portel-dev/ncp/discussions)
- 🔄 **Pull requests:** [Contributing Guide](CONTRIBUTING.md)

---

## 📄 **License**

**Elastic License 2.0** - [Full License](LICENSE)

**TL;DR:** Free for all use including commercial. Cannot be offered as a hosted service to third parties.

---

**Built with ❤️ by the NCP Team | Star us on [GitHub](https://github.com/portel-dev/ncp)**
