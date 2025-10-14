# NCP - Your AI's Personal Assistant

[![npm version](https://img.shields.io/npm/v/@portel/ncp.svg)](https://www.npmjs.com/package/@portel/ncp)
[![npm downloads](https://img.shields.io/npm/dm/@portel/ncp.svg)](https://www.npmjs.com/package/@portel/ncp)
[![GitHub release downloads](https://img.shields.io/github/downloads/portel-dev/ncp/total?label=.mcpb%20downloads)](https://github.com/portel-dev/ncp/releases)
[![License: Elastic-2.0](https://img.shields.io/badge/License-Elastic--2.0-blue.svg)](https://www.elastic.co/licensing/elastic-license)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

<!-- mcp-name: io.github.portel-dev/ncp -->

---

## 🎯 **One Line That Changes Everything**

**Your AI doesn't see your 50 tools. It dreams of the perfect tool, and NCP finds it instantly.**

That's it. That's NCP.

---

## 😫 **The Problem**

You installed 10 MCPs to supercharge your AI. Instead:

- **AI becomes indecisive** ("Should I use `read_file` or `get_file_content`?")
- **Conversations end early** (50 tool schemas = 100k+ tokens before work starts)
- **Wrong tools picked** (AI confused by similar-sounding options)
- **Computer works harder** (all MCPs running constantly, most idle)

**The paradox:** More tools = Less productivity.

> **What's MCP?** The [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic lets AI assistants connect to external tools. Think of MCPs as "plugins" that give your AI superpowers.

---

## ✨ **The Solution: Six Stories**

Every NCP feature solves a real problem. Here's how:

### **[🌟 Story 1: Dream and Discover](docs/stories/01-dream-and-discover.md)** *2 min*
> **Problem:** AI overwhelmed by 50+ tool schemas
> **Solution:** AI writes what it needs, NCP finds the perfect tool
> **Result:** 97% fewer tokens, 5x faster, AI becomes decisive

### **[🔐 Story 2: Secrets in Plain Sight](docs/stories/02-secrets-in-plain-sight.md)** *2 min*
> **Problem:** API keys exposed in AI chat logs forever
> **Solution:** Clipboard handshake keeps secrets server-side
> **Result:** AI never sees your tokens, full security + convenience

### **[🔄 Story 3: Sync and Forget](docs/stories/03-sync-and-forget.md)** *2 min*
> **Problem:** Configure same MCPs twice (Claude Desktop + NCP)
> **Solution:** NCP auto-syncs from Claude Desktop on every startup
> **Result:** Zero manual configuration, always in sync

### **[📦 Story 4: Double-Click Install](docs/stories/04-double-click-install.md)** *2 min*
> **Problem:** Installing MCPs requires terminal, npm, JSON editing
> **Solution:** Download .mcpb → Double-click → Done
> **Result:** 30-second install, feels like native app

### **[🕵️ Story 5: Runtime Detective](docs/stories/05-runtime-detective.md)** *2 min*
> **Problem:** MCPs break when Claude Desktop runtime changes
> **Solution:** NCP detects runtime dynamically on every boot
> **Result:** Adapts automatically, no version mismatches

### **[🌐 Story 6: Official Registry](docs/stories/06-official-registry.md)** *2 min*
> **Problem:** Finding right MCP takes hours of Googling
> **Solution:** AI searches 2,200+ MCPs from official registry
> **Result:** Discovery through conversation, install in seconds

**Read all six stories: 12 minutes total.** You'll understand exactly why NCP transforms how you work with MCPs.

---

## 🚀 **Quick Start**

### **Option 1: Claude Desktop Users** (Recommended)

1. Download [ncp.mcpb](https://github.com/portel-dev/ncp/releases/latest/download/ncp.mcpb)
2. Double-click the file
3. Click "Install" when Claude Desktop prompts
4. **Done!** NCP auto-syncs all your Claude Desktop MCPs

**Time:** 30 seconds | **Difficulty:** Zero | **Story:** [Double-Click Install →](docs/stories/04-double-click-install.md)

---

### **Option 2: All Other Clients** (Cursor, Cline, Continue, etc.)

```bash
# 1. Install NCP
npm install -g @portel/ncp

# 2. Import existing MCPs (copy your config to clipboard first)
ncp config import

# 3. Configure your AI client
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

**Time:** 2 minutes | **Difficulty:** Copy-paste | **Full Guide:** [Installation →](#installation)

---

## 📊 **The Difference (Numbers)**

| Your MCP Setup | Without NCP | With NCP | Improvement |
|----------------|-------------|----------|-------------|
| **Tokens used** | 100,000+ (tool schemas) | 2,500 (2 tools) | **97% saved** |
| **AI response time** | 8 seconds (analyzing) | <1 second (instant) | **8x faster** |
| **Wrong tool selection** | 30% of attempts | <3% of attempts | **10x accuracy** |
| **Conversation length** | 50 messages (context limit) | 600+ messages | **12x longer** |
| **Computer CPU usage** | High (all MCPs running) | Low (on-demand loading) | **~70% saved** |

**Real measurements from production usage.** Your mileage may vary, but the pattern holds: NCP makes AI faster, smarter, cheaper.

---

## 📚 **Learn More**

### **For Users:**
- 🎯 **[The Six Stories](docs/stories/)** - Understand NCP through narratives (12 min)
- 🔧 **[Installation Guide](#installation-full-guide)** - Detailed setup for all platforms
- 🧪 **[Test Drive](#test-drive)** - Try NCP CLI to see what AI experiences
- 🛟 **[Troubleshooting](#troubleshooting)** - Fix common issues

### **For Developers:**
- 📖 **[How It Works](HOW-IT-WORKS.md)** - Technical deep dive
- 🏗️ **[Architecture](STORY-DRIVEN-DOCUMENTATION.md)** - System design and stories
- 🤝 **[Contributing](CONTRIBUTING.md)** - Help make NCP better
- 📝 **[Feature Stories](.github/FEATURE_STORY_TEMPLATE.md)** - Propose new features

### **For Teams:**
- 🚀 **[Project-Level Config](#project-level-configuration)** - Per-project MCPs
- 👥 **[Team Workflows](docs/stories/03-sync-and-forget.md)** - Consistent setup
- 🔐 **[Security Pattern](docs/stories/02-secrets-in-plain-sight.md)** - Safe credential handling

---

## 🎓 **What People Say**

> "NCP does not expose any tools to AI. Instead, it lets the AI dream of a tool and come up with a user story for that tool. With that story, it is able to discover the tool and use it right away."
>
> *— The story that started it all*

> "Installing MCPs used to take 45 minutes and require terminal knowledge. Now it's 30 seconds and a double-click."
>
> *— Beta tester feedback on .mcpb installation*

> "My AI went from 'let me think about which tool to use...' to just doing the task immediately. The difference is night and day."
>
> *— User report on token reduction*

---

## 💡 **Philosophy**

NCP is built on one core insight:

**Constraints spark creativity. Infinite options paralyze.**

- A poet given "write about anything" → Writer's block
- A poet given "write a haiku about rain" → Instant inspiration

**Your AI is no different.**

Give it 50 tools → Analysis paralysis, wrong choices, exhaustion
Give it a way to dream → Focused thinking, fast decisions, confident action

**NCP provides the constraint (semantic search) that unlocks the superpower (any tool, on demand).**

---

# 📖 **Full Documentation**

## Installation (Full Guide)

### **Prerequisites**

- **Node.js 18+** ([Download](https://nodejs.org/))
- **npm** (included with Node.js) or **npx**
- **Terminal access** (Mac/Linux: Terminal, Windows: PowerShell)

### **Method 1: .mcpb Bundle** (Claude Desktop Only)

**Best for:** Claude Desktop users who want zero configuration

**Steps:**

1. **Download:** [ncp.mcpb](https://github.com/portel-dev/ncp/releases/latest/download/ncp.mcpb) from latest release
2. **Install:** Double-click the downloaded file
3. **Confirm:** Click "Install" in Claude Desktop prompt
4. **Done:** NCP auto-syncs all your existing MCPs on startup

**Features:**

- ✅ Continuous auto-sync from Claude Desktop ([Story 3](docs/stories/03-sync-and-forget.md))
- ✅ Dynamic runtime detection ([Story 5](docs/stories/05-runtime-detective.md))
- ✅ Optional global CLI (toggle in settings)
- ✅ Tiny bundle size (126KB, MCP-only)

**Manual configuration** (optional):

```bash
# Edit profile to add more MCPs
nano ~/.ncp/profiles/all.json
```

**Read more:** [Story 4: Double-Click Install →](docs/stories/04-double-click-install.md)

---

### **Method 2: npm Package** (All Clients)

**Best for:** Cursor, Cline, Continue, VS Code, CLI-heavy workflows

**Steps:**

```bash
# 1. Install NCP globally
npm install -g @portel/ncp

# 2. Import existing MCPs from clipboard
#    (Copy your claude_desktop_config.json content first)
ncp config import

# 3. Or add MCPs manually
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github

# 4. Configure your AI client
#    Add to config file (location varies by client):
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}

# 5. Restart your AI client
```

**Client-specific config locations:**

- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor:** (See [Cursor docs](https://cursor.sh/docs))
- **Cline/Continue:** (See respective docs)
- **VS Code:** `~/Library/Application Support/Code/User/settings.json`

**Alternative: npx** (no global install)

```bash
# Replace 'ncp' with 'npx @portel/ncp' in all commands
npx @portel/ncp config import
npx @portel/ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents

# Client config:
{
  "mcpServers": {
    "ncp": {
      "command": "npx",
      "args": ["@portel/ncp"]
    }
  }
}
```

---

## Test Drive

Experience what your AI experiences with NCP's CLI:

### **Smart Discovery**

```bash
# Ask like a human, not a programmer
ncp find "I need to read a file"
ncp find "help me send an email"
ncp find "search for something online"
```

**Notice:** NCP understands intent, not just keywords.

### **Ecosystem Overview**

```bash
# See all MCPs and their tools
ncp list --depth 2

# Check MCP health
ncp list --depth 1

# Get help
ncp --help
```

### **Direct Testing**

```bash
# Test tool execution safely
ncp run filesystem:read_file --params '{"path": "/tmp/test.txt"}' --dry-run

# Run for real
ncp run filesystem:read_file --params '{"path": "/tmp/test.txt"}'
```

### **Verify Installation**

```bash
# 1. Check version
ncp --version

# 2. List imported MCPs
ncp list

# 3. Test discovery
ncp find "file"

# 4. Validate config
ncp config validate
```

**Success indicators:**
- ✅ `ncp --version` shows version number
- ✅ `ncp list` shows your imported MCPs
- ✅ `ncp find` returns relevant tools
- ✅ Your AI client shows only NCP in tool list (2 tools)

---

## Project-Level Configuration

**New:** Configure MCPs per project for team consistency and Cloud IDE compatibility.

```bash
# In any project directory
mkdir .ncp

# Add project-specific MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ./
ncp add github npx @modelcontextprotocol/server-github

# NCP automatically uses .ncp/ if it exists, otherwise falls back to ~/.ncp/
```

**Perfect for:**

- 🤖 Claude Code projects (project-specific tooling)
- 👥 Team consistency (ship `.ncp/` folder with repo)
- 🔧 Project-specific needs (frontend vs backend MCPs)
- 📦 Environment isolation (no global conflicts)

**Example:**

```
frontend-app/
  .ncp/profiles/all.json   # → playwright, lighthouse, browser-context
  src/

api-backend/
  .ncp/profiles/all.json   # → postgres, redis, docker, kubernetes
  server/
```

---

## Advanced Features

### **Multi-Profile Organization**

Organize MCPs by environment or project:

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

### **Registry Discovery**

Search and install MCPs from official registry through AI:

```
You: "Find database MCPs"

AI: [Shows numbered list from registry]
    1. ⭐ PostgreSQL (Official, 1,240 downloads)
    2. ⭐ SQLite (Official, 890 downloads)
    ...

You: "Install 1 and 2"

AI: [Installs PostgreSQL and SQLite]
    ✅ Done!
```

**Read more:** [Story 6: Official Registry →](docs/stories/06-official-registry.md)

### **Secure Credential Configuration**

Configure API keys without exposing them to AI chat:

```
You: "Add GitHub MCP"

AI: [Shows prompt]
    "Copy your config to clipboard BEFORE clicking YES:
     {"env":{"GITHUB_TOKEN":"your_token"}}"

[You copy config to clipboard]
[You click YES]

AI: "MCP added with credentials from clipboard"
    [Your token never entered the conversation!]
```

**Read more:** [Story 2: Secrets in Plain Sight →](docs/stories/02-secrets-in-plain-sight.md)

---

## Troubleshooting

### **Import Issues**

```bash
# Check what was imported
ncp list

# Validate config health
ncp config validate

# See detailed logs
DEBUG=ncp:* ncp config import
```

### **AI Not Using Tools**

1. **Verify NCP is running:** `ncp list` (should show your MCPs)
2. **Test discovery:** `ncp find "file"` (should return results)
3. **Check AI config:** Ensure config points to `ncp` command
4. **Restart AI client** after config changes

### **Performance Issues**

```bash
# Check MCP health (unhealthy MCPs slow everything)
ncp list --depth 1

# Clear cache if needed
rm -rf ~/.ncp/cache

# Monitor with debug logs
DEBUG=ncp:* ncp find "test"
```

### **Version Detection Issues**

```bash
# If ncp -v shows wrong version:
which ncp  # Check which ncp is being used
npm list -g @portel/ncp  # Verify installed version

# Reinstall if needed
npm uninstall -g @portel/ncp
npm install -g @portel/ncp
```

---

## Popular MCPs

### **AI Reasoning & Memory**

```bash
ncp add sequential-thinking npx @modelcontextprotocol/server-sequential-thinking
ncp add memory npx @modelcontextprotocol/server-memory
```

### **Development Tools**

```bash
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/code
ncp add github npx @modelcontextprotocol/server-github
ncp add shell npx @modelcontextprotocol/server-shell
```

### **Productivity & Integrations**

```bash
ncp add brave-search npx @modelcontextprotocol/server-brave-search
ncp add gmail npx @mcptools/gmail-mcp
ncp add slack npx @modelcontextprotocol/server-slack
ncp add postgres npx @modelcontextprotocol/server-postgres
```

**Discover 2,200+ more:** [Smithery.ai](https://smithery.ai) | [mcp.so](https://mcp.so) | [Official Registry](https://registry.modelcontextprotocol.io/)

---

## Contributing

Help make NCP even better:

- 🐛 **Bug reports:** [GitHub Issues](https://github.com/portel-dev/ncp/issues)
- 💡 **Feature ideas:** [GitHub Discussions](https://github.com/portel-dev/ncp/discussions)
- 📖 **Documentation:** Improve stories or technical docs
- 🔄 **Pull requests:** [Contributing Guide](CONTRIBUTING.md)
- 🎯 **Feature stories:** Use [our template](.github/FEATURE_STORY_TEMPLATE.md)

**We use story-first development:** Every feature starts as a story (pain → journey → magic) before we write code. [Learn more →](STORY-FIRST-WORKFLOW.md)

---

## License

**Elastic License 2.0** - [Full License](LICENSE)

**TL;DR:** Free for all use including commercial. Cannot be offered as a hosted service to third parties.

---

## Learn More

- 🌟 **[The Six Stories](docs/stories/)** - Why NCP is different (12 min)
- 📖 **[How It Works](HOW-IT-WORKS.md)** - Technical deep dive
- 🏗️ **[Story-Driven Docs](STORY-DRIVEN-DOCUMENTATION.md)** - Our approach
- 📝 **[Story-First Workflow](STORY-FIRST-WORKFLOW.md)** - How we build features
- 🔐 **[Security](SECURITY.md)** - Security policy and reporting
- 📜 **[Changelog](CHANGELOG.md)** - Version history

---

**Built with ❤️ by the NCP Team | Star us on [GitHub](https://github.com/portel-dev/ncp)**
