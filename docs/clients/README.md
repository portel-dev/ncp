# NCP Installation Guides by Client

Choose your MCP client below for detailed installation instructions.

---

## 🎯 Supported Clients

### 🖥️ [Claude Desktop](./claude-desktop.md)
**Installation Methods:** Extension (.dxt) + JSON Config

**Features:**
- ✅ One-click extension installation
- ✅ Auto-import of existing MCPs
- ✅ Auto-sync on every startup
- ✅ Both CLI and extension modes supported

**Best for:** Most users, production use

[→ Read Claude Desktop Guide](./claude-desktop.md)

---

### 🔍 [Perplexity](./perplexity.md)
**Installation Methods:** JSON Config only

**Features:**
- ✅ Manual JSON configuration
- ⚠️ No auto-import yet (coming soon)
- ⚠️ .dxt extension support coming soon

**Best for:** Perplexity Mac app users

[→ Read Perplexity Guide](./perplexity.md)

---

### 💻 [Cursor IDE](./cursor.md)
**Installation Methods:** JSON Config only

**Features:**
- ✅ JSON configuration via Cline settings
- ✅ Works with Cursor's AI features
- ✅ Standard MCP integration

**Best for:** Cursor IDE users

[→ Read Cursor Guide](./cursor.md)

---

### 🔧 [Cline (VS Code)](./cline.md)
**Installation Methods:** JSON Config only

**Features:**
- ✅ VS Code extension integration
- ✅ JSON configuration
- ✅ Works with Claude API

**Best for:** VS Code + Cline users

[→ Read Cline Guide](./cline.md)

---

### ⚡ [Continue (VS Code)](./continue.md)
**Installation Methods:** JSON Config only

**Features:**
- ✅ VS Code extension integration
- ✅ Nested experimental config format
- ✅ Works with multiple AI models

**Best for:** VS Code + Continue users

[→ Read Continue Guide](./continue.md)

---

## 🆚 Installation Method Comparison

| Client | Extension (.dxt) | JSON Config | Auto-Import |
|--------|-----------------|-------------|-------------|
| **Claude Desktop** | ✅ Recommended | ✅ Available | ✅ Yes |
| **Perplexity** | ⏳ Coming Soon | ✅ Available | ⏳ Coming Soon |
| **Cursor** | ❌ Not Supported | ✅ Available | ❌ No |
| **Cline** | ❌ Not Supported | ✅ Available | ❌ No |
| **Continue** | ❌ Not Supported | ✅ Available | ❌ No |

---

## 📋 Quick Start by Client

### Claude Desktop (Recommended)
```bash
# Download and drag-drop ncp.dxt
# OR use JSON config:
npm install -g @portel/ncp
ncp config import
# Edit claude_desktop_config.json to use NCP
```

### All Other Clients
```bash
# 1. Install NCP
npm install -g @portel/ncp

# 2. Add your MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github

# 3. Configure your client's JSON config
# (See client-specific guide for config file location)

# 4. Restart your client
```

---

## 🎯 Which Installation Method Should I Use?

### Use Extension (.dxt) Installation If:
- ✅ You're using Claude Desktop
- ✅ You want one-click installation
- ✅ You want automatic MCP detection
- ✅ You want auto-sync on startup

### Use JSON Configuration If:
- ✅ Your client doesn't support .dxt yet
- ✅ You prefer manual control
- ✅ You need custom profile setups
- ✅ You're testing or developing

---

## 🔮 Future Support

Clients we're tracking for future .dxt support:
- 🔜 **Perplexity** - Testing .dxt drag-and-drop
- 🔜 **Cursor** - Investigating extension support
- 🔜 **Windsurf** - Monitoring for MCP support
- 🔜 **Zed** - Awaiting official MCP integration

Want to see NCP support for another client? [Open a feature request](https://github.com/portel-dev/ncp/issues/new?template=feature_request.yml)

---

## 🤝 Contributing Client Guides

Found an issue or want to improve a guide?

1. **Report issues:** [GitHub Issues](https://github.com/portel-dev/ncp/issues)
2. **Suggest improvements:** [GitHub Discussions](https://github.com/portel-dev/ncp/discussions)
3. **Submit PR:** [Contributing Guide](../../CONTRIBUTING.md)

---

## 📚 Additional Resources

- **[Main README](../../README.md)** - Overview and features
- **[How It Works](../guides/how-it-works.md)** - Technical architecture
- **[Testing Guide](../guides/testing.md)** - Verification steps
- **[Troubleshooting](../../README.md#-troubleshooting)** - Common issues

---

## 📍 Quick Links

### Configuration File Locations

**Claude Desktop:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Cursor/Cline:**
- macOS: `~/Library/Application Support/[Client]/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%/[Client]/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/[Client]/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**Continue:**
- All platforms: `~/.continue/config.json`

**Perplexity:**
- macOS: `~/Library/Containers/ai.perplexity.mac/Data/Documents/mcp_servers`

**NCP Profiles:**
- All platforms: `~/.ncp/profiles/`

---

**Questions?** Ask in [GitHub Discussions](https://github.com/portel-dev/ncp/discussions)
