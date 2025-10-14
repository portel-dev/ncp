# Installing NCP on Continue (VS Code Extension)

**Method:** JSON configuration only

---

## 📋 Overview

Continue is a VS Code extension that supports MCP servers via JSON configuration. Use NCP to consolidate all your MCP tools into a unified, intelligent interface.

---

## 🔧 Installation Steps

### 1. Install NCP

```bash
npm install -g @portel/ncp
```

### 2. Import Your Existing MCPs (Optional)

```bash
# If you have MCPs configured elsewhere, copy config to clipboard
# Then run:
ncp config import
```

### 3. Add MCPs to NCP

```bash
# Add your MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
ncp add github npx @modelcontextprotocol/server-github
ncp add memory npx @modelcontextprotocol/server-memory

# Verify
ncp list
```

### 4. Configure Continue

**Config file location:**
- **All platforms:** `~/.continue/config.json`

**Edit the file:**
```bash
nano ~/.continue/config.json
```

**Add NCP to the `experimental.modelContextProtocolServers` section:**
```json
{
  "models": [...],
  "experimental": {
    "modelContextProtocolServers": {
      "ncp": {
        "command": "ncp"
      }
    }
  }
}
```

> **Note:** Continue uses nested configuration under `experimental.modelContextProtocolServers`, not top-level `mcpServers`.

### 5. Restart VS Code

1. Close all VS Code windows
2. Reopen VS Code
3. Open Continue extension
4. Start using NCP

---

## 🎯 Using NCP in Continue

In Continue chat, ask:
- "List all available MCP tools"
- "Find tools for reading files"
- "Use NCP to discover GitHub tools"

---

## 🐛 Troubleshooting

**NCP command not found:**
```bash
npm install -g @portel/ncp
ncp --version
```

**Continue doesn't see NCP:**
1. Verify `~/.continue/config.json` has correct structure
2. Ensure NCP is under `experimental.modelContextProtocolServers`
3. Check JSON syntax is valid
4. Restart VS Code completely
5. Check Continue extension logs

**NCP shows no MCPs:**
```bash
ncp list
# If empty, add MCPs:
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
```

---

## 📝 Continue Config Format Reference

**Correct format:**
```json
{
  "models": [
    {
      "title": "Claude 3.5 Sonnet",
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "apiKey": "..."
    }
  ],
  "experimental": {
    "modelContextProtocolServers": {
      "ncp": {
        "command": "ncp"
      }
    }
  }
}
```

**⚠️ Note the nested structure:**
- `experimental` → `modelContextProtocolServers` → `ncp`

---

## 📚 More Resources

- **[Claude Desktop Guide](./claude-desktop.md)** - For Claude Desktop users
- **[Main README](../../README.md)** - Full documentation
- **[Continue Extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue)** - VS Code Marketplace
- **[Continue Docs](https://docs.continue.dev/)** - Official Continue documentation

---

## 🤝 Need Help?

- **GitHub Issues:** [Report bugs](https://github.com/portel-dev/ncp/issues)
- **GitHub Discussions:** [Ask questions](https://github.com/portel-dev/ncp/discussions)
