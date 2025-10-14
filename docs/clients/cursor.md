# Installing NCP on Cursor

**Method:** JSON configuration only

---

## 📋 Overview

Cursor IDE supports MCP servers via JSON configuration. Configure NCP once and access all your MCP tools through a unified interface.

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
ncp add brave-search npx @modelcontextprotocol/server-brave-search

# Verify
ncp list
```

### 4. Configure Cursor

**Config file location:**
- **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows:** `%APPDATA%/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Linux:** `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**Edit the file:**
```bash
# macOS
nano ~/Library/Application\ Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**Replace contents with:**
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp"
    }
  }
}
```

### 5. Restart Cursor

1. Quit Cursor completely (⌘Q on Mac, Alt+F4 on Windows)
2. Reopen Cursor
3. Start using NCP in your AI chat

---

## 🎯 Using NCP in Cursor

Ask your AI assistant:
- "List all available MCP tools"
- "Find tools to read files"
- "Execute filesystem:read_file on /tmp/test.txt"

---

## 🐛 Troubleshooting

**NCP command not found:**
```bash
npm install -g @portel/ncp
ncp --version
```

**Cursor doesn't see NCP:**
1. Verify config file path is correct for your OS
2. Check JSON syntax is valid
3. Restart Cursor completely
4. Check Cursor's developer console for errors

**NCP shows no MCPs:**
```bash
ncp list
# If empty, add MCPs:
ncp add filesystem npx @modelcontextprotocol/server-filesystem ~/Documents
```

---

## 📚 More Resources

- **[Claude Desktop Guide](./claude-desktop.md)** - For Claude Desktop users
- **[Main README](../../README.md)** - Full documentation
- **[Cursor Documentation](https://cursor.sh/docs)** - Official Cursor docs

---

## 🤝 Need Help?

- **GitHub Issues:** [Report bugs](https://github.com/portel-dev/ncp/issues)
- **GitHub Discussions:** [Ask questions](https://github.com/portel-dev/ncp/discussions)
