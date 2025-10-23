# Screenshots Needed for Claude Desktop Guide

This directory should contain the following screenshots for the Claude Desktop documentation.

## Required Screenshots

### 1. `dxt-install-dialog.png`
**What to capture:** Claude Desktop's .dxt installation dialog
- Shows the installation prompt when double-clicking ncp.dxt
- Should show extension name, version, and Install/Cancel buttons
- **Dimensions:** ~800x600px recommended

### 2. `tool-list-after-install.png`
**What to capture:** Claude showing only NCP's 2 tools
- Ask Claude: "What tools do you have access to?"
- Should show only `find` and `run` tools
- **Dimensions:** Full conversation width

### 3. `extension-settings-panel.png`
**What to capture:** NCP extension settings in Claude Desktop
- Navigate to: Settings → Extensions → NCP
- Should show all configuration toggles (profile, auto-import, scheduler, etc.)
- **Dimensions:** ~1000x800px recommended

### 4. `auto-sync-demo.png`
**What to capture:** Terminal showing `ncp list` output after auto-sync
- Run: `ncp list` after adding MCPs to Claude Desktop
- Should show imported MCPs with health status
- **Dimensions:** Terminal screenshot, ~800x400px

### 5. `import-success.png`
**What to capture:** Terminal showing successful config import
- Run: `ncp config import`
- Should show success message and imported MCP count
- **Dimensions:** Terminal screenshot, ~800x300px

### 6. `semantic-search.png`
**What to capture:** Claude using find tool with natural language
- Ask Claude something like: "I need to read a file"
- Should show Claude using the `find` tool automatically
- **Dimensions:** Full conversation width

### 7. `health-status.png`
**What to capture:** `ncp list --depth 1` showing health indicators
- Run: `ncp list --depth 1`
- Should show MCPs with ✅/❌ health indicators
- **Dimensions:** Terminal screenshot, ~800x600px

## Screenshot Guidelines

- **Format:** PNG (preferred) or JPG
- **Quality:** High resolution, readable text
- **Annotations:** Add arrows/highlights if needed to emphasize key elements
- **Consistency:** Use same Claude Desktop theme across screenshots
- **Privacy:** Remove any personal data (usernames, API keys, file paths)

## Tools for Screenshots

- **macOS:** Cmd+Shift+4 (select area) or Cmd+Shift+5 (screenshot tool)
- **Windows:** Win+Shift+S (Snipping Tool)
- **Linux:** Spectacle, Flameshot, or built-in screenshot tool

## Contributing

When adding screenshots:
1. Name files exactly as specified above
2. Place directly in this directory
3. Verify images are clear and readable
4. Update this README to mark completed screenshots

## Completion Checklist

- [ ] dxt-install-dialog.png
- [ ] tool-list-after-install.png
- [ ] extension-settings-panel.png
- [ ] auto-sync-demo.png
- [ ] import-success.png
- [ ] semantic-search.png
- [ ] health-status.png
