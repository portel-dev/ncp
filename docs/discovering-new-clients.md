# Discovering New MCP Clients

This guide explains how to add support for new MCP clients to NCP's auto-import feature.

## Overview

To support a new MCP client, we need two key pieces of information:
1. **Client Name**: What `clientInfo.name` the client sends during MCP handshake
2. **Config Path**: Where the client stores its MCP server configurations

## Step 1: Capture Client Name

### Method A: Use the MCP Client Sniffer (Recommended)

The sniffer is a minimal MCP server that logs initialization requests.

1. **Add sniffer to client config**:

   ```json
   {
     "mcpServers": {
       "client-sniffer": {
         "command": "node",
         "args": ["/path/to/ncp/scripts/mcp-client-sniffer.cjs"]
       }
     }
   }
   ```

2. **Restart the client** or reload MCP connections

3. **Check the output**:
   - Console will show: `✨ CLIENT DETECTED!`
   - Details saved to: `client-info-log.json`

4. **Review captured data**:
   ```bash
   cat client-info-log.json
   ```

   Example output:
   ```json
   [
     {
       "timestamp": "2025-10-31T12:00:00.000Z",
       "clientInfo": {
         "name": "cursor",
         "version": "0.42.0"
       },
       "protocolVersion": "2024-11-05"
     }
   ]
   ```

### Method B: Check Client Documentation

Some clients document their `clientInfo.name`:
- Claude Desktop: `claude-desktop` or `claude-ai`
- Cursor: `cursor`
- Cline: `cline`
- Continue: `continue`

### Method C: Monitor MCP Logs

If the client creates logs, check for initialization messages:

```bash
# Example: Check Windsurf logs
find ~/Library/Application\ Support/Windsurf/logs -name "*mcp*" | head -5
```

## Step 2: Find Config Path

### Search Strategy

1. **Check home directory**:
   ```bash
   ls -la ~ | grep -i <client-name>
   ```

2. **Check .config directory**:
   ```bash
   ls -la ~/.config | grep -i <client-name>
   ```

3. **Check Application Support** (macOS):
   ```bash
   ls -la ~/Library/Application\ Support/ | grep -i <client-name>
   ```

4. **Check AppData** (Windows):
   ```powershell
   ls $env:APPDATA | Select-String <client-name>
   ```

5. **Search for MCP-related files**:
   ```bash
   find ~ -name "*mcp*.json" 2>/dev/null | grep -i <client-name>
   ```

### Common Patterns

| Location | Example |
|----------|---------|
| Home dotfiles | `~/.cursor/mcp.json` |
| .config | `~/.config/enconvo/mcp_config.json` |
| Application Support | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| VSCode-like | `~/Library/Application Support/<IDE>/User/globalStorage/<extension>/settings/*.json` |

### Verify Config Format

Once you find the config file:

```bash
cat <config-path> | jq '.mcpServers'
```

Check:
- ✅ Is it JSON or TOML?
- ✅ Where are MCP servers stored? (root level? nested path?)
- ✅ What's the structure? (object with MCP names as keys?)

Example structures:

**Standard format** (Claude Desktop, Cursor):
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

**Nested format** (Continue):
```json
{
  "experimental": {
    "modelContextProtocolServers": {
      "filesystem": { ... }
    }
  }
}
```

**Array format** (Perplexity):
```json
{
  "servers": [
    { "name": "filesystem", "command": "..." }
  ]
}
```

## Step 3: Add to Client Registry

Update `src/utils/client-registry.ts`:

```typescript
'<client-id>': {
  displayName: '<Client Name>',
  configPaths: {
    darwin: '~/path/to/config.json',           // macOS
    win32: '%APPDATA%/path/to/config.json',    // Windows
    linux: '~/.config/path/to/config.json'     // Linux
  },
  configFormat: 'json',  // or 'toml'
  mcpServersPath: 'mcpServers'  // JSON path to servers object
}
```

### Important Notes

1. **Client ID normalization**: NCP normalizes client names by:
   - Converting to lowercase
   - Removing spaces and dashes
   - Example: `"Claude Desktop"` → `"claudedesktop"`

2. **Add all aliases**: Some clients send different names:
   ```typescript
   'claude-desktop': { ... },
   'claude-ai': { ... },  // Alias pointing to same paths
   ```

3. **Platform-specific paths**: Only include paths for supported platforms

## Step 4: Test Auto-Import

### Build and Verify

```bash
# 1. Build
npm run build

# 2. Check detection
node scripts/verify-client-configs.js

# Expected output:
# ✅ INSTALLED CLIENTS (Can Test Auto-Import)
# 📦 <Your Client>
#    Client ID: <client-id>
#    Config: /actual/path/to/config.json
```

### Manual Test

```bash
# 1. Clear NCP profile
rm ~/.ncp/profiles/all.json

# 2. Start NCP with client's name
# (or configure client to use NCP and restart)

# 3. Check if MCPs were imported
cat ~/.ncp/profiles/all.json | jq '.mcpServers'
```

### Integration Test

Add test to `tests/integration/comprehensive-dxt-test.cjs`:

```javascript
const id = test.sendRequest('initialize', {
  protocolVersion: '2024-11-05',
  clientInfo: {
    name: '<client-id>',
    version: '1.0.0'
  }
});
```

## Step 5: Document

Update docs:
1. **docs/testing-client-auto-import.md** - Add config path reference
2. **README.md** - Add client to supported list
3. **docs/clients/<client>.md** - Create setup guide (optional)

## Examples

### Example 1: Cursor

**Discovery**:
```bash
# Found config
ls ~/.cursor/
# Output: mcp.json

# Verified format
cat ~/.cursor/mcp.json
# Shows: { "mcpServers": { ... } }
```

**Captured clientInfo** (using sniffer):
```json
{
  "clientInfo": {
    "name": "cursor",
    "version": "0.42.0"
  }
}
```

**Added to registry**:
```typescript
'cursor': {
  displayName: 'Cursor',
  configPaths: {
    darwin: '~/.cursor/mcp.json',
    win32: '%USERPROFILE%/.cursor/mcp.json',
    linux: '~/.cursor/mcp.json'
  },
  configFormat: 'json',
  mcpServersPath: 'mcpServers'
}
```

### Example 2: Enconvo

**Discovery**:
```bash
# Search for config
find ~ -name "*enconvo*" -type d
# Found: ~/.config/enconvo

# Check contents
ls ~/.config/enconvo/
# Found: mcp_config.json

# Verify format
cat ~/.config/enconvo/mcp_config.json
# Shows: { "mcpServers": {} }
```

**Added to registry**:
```typescript
'enconvo': {
  displayName: 'Enconvo',
  configPaths: {
    darwin: '~/.config/enconvo/mcp_config.json'
  },
  configFormat: 'json',
  mcpServersPath: 'mcpServers'
}
```

## Troubleshooting

### Client not detected

1. **Check client name normalization**:
   ```javascript
   // In src/utils/client-registry.ts
   export function normalizeClientName(name: string): string {
     return name.toLowerCase().replace(/[\s-]/g, '');
   }
   ```

2. **Verify config exists**:
   ```bash
   ls -la <config-path>
   ```

3. **Check NCP logs**:
   ```bash
   export NCP_DEBUG=true
   cat ~/.ncp/debug.log | grep -i "client"
   ```

### MCPs not imported

1. **Check mcpServersPath**: Verify JSON path is correct
   ```bash
   cat <config> | jq '.<mcpServersPath>'
   ```

2. **Test config parsing**:
   ```javascript
   import { importFromClient } from './dist/utils/client-importer.js';
   const result = await importFromClient('<client-id>');
   console.log(result);
   ```

### Config format issues

1. **TOML support**: Use `configFormat: 'toml'` and install parser
2. **Custom format**: Add custom parser in `client-importer.ts`
3. **Array format**: Update `mcpServersPath` to handle arrays

## Tools Reference

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/mcp-client-sniffer.cjs` | Capture clientInfo from any MCP client |
| `scripts/verify-client-configs.js` | Check which clients are installed and detectable |
| `scripts/capture-client-info.js` | Advanced monitoring with NCP server |

### Files to Update

| File | What to Add |
|------|-------------|
| `src/utils/client-registry.ts` | Client definition with paths |
| `src/utils/client-importer.ts` | Custom parsers (if needed) |
| `docs/testing-client-auto-import.md` | Testing instructions |
| `tests/integration/comprehensive-dxt-test.cjs` | Integration test |

## Best Practices

1. **Test on actual installations** - Don't guess paths
2. **Document platform differences** - Note any OS-specific quirks
3. **Handle edge cases** - Client might not have MCPs configured yet
4. **Validate data** - Ensure MCPs have required `command` field
5. **Preserve user data** - Don't overwrite existing configs during import
