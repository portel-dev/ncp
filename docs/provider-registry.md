# Provider Registry - Simplified MCP Setup

## Overview

The Provider Registry makes adding popular MCP servers incredibly easy. Instead of manually configuring commands and authentication, users can simply run `ncp add <provider>` and NCP handles the rest.

## User Experience

### Before (Complex):
```bash
# User had to figure out:
# 1. What transport to use (stdio vs HTTP)
# 2. What command to run
# 3. How to authenticate
# 4. All the configuration details

$ ncp add canva npx -y @canva/cli@latest mcp
# But wait, need to authenticate first...
$ npx @canva/cli@latest login
# Now try again...
$ ncp add canva npx -y @canva/cli@latest mcp
# 😞 Too complicated!
```

### After (Simple):
```bash
$ ncp add canva

🌐 Canva MCP
   Design and creative tools
   Website: https://www.canva.com

   ✓ Recommended transport: stdio

   Authenticate with Canva CLI
   Command: npx @canva/cli@latest login

   Run authentication now? (y/n): y

   🔐 Running authentication...
   # Browser opens automatically
   ✅ Authentication complete!

   Adding Canva to profile...
   ✅ Added Canva to profile: all

💡 Next steps:
  • Test: ncp find <query>
  • View profiles: ncp list
```

## Supported Providers

### Currently in Registry:

| Provider | Recommended | Auth Method | Status |
|----------|-------------|-------------|--------|
| **Canva** | stdio | Canva CLI | ✅ Ready |
| **Slack** | stdio | Slack CLI | ✅ Ready |
| **GitHub** | stdio | GitHub CLI | ✅ Ready |
| **Notion** | http | API Key | ✅ Ready |
| **Linear** | http | API Key | ✅ Ready |

## Commands

### Simple Provider Add
```bash
# Auto-detects and guides through setup
ncp add canva
ncp add slack
ncp add github
```

### Force Transport Type
```bash
# Use HTTP instead of stdio
ncp add canva --transport http

# Use stdio (if available)
ncp add notion --transport stdio
```

### Manual Add (Advanced)
```bash
# For custom/unknown stdio providers
ncp add my-server npx @my/cli mcp

# For HTTP/SSE: use manual config edit
# (Manual HTTP URLs not supported via CLI)
```

## How It Works

### 1. Provider Registry
Located at `src/registry/providers.json`, contains configuration for popular providers:

```json
{
  "canva": {
    "id": "canva",
    "name": "Canva",
    "description": "Design and creative tools",
    "recommended": "stdio",
    "stdio": {
      "setup": {
        "description": "Authenticate with Canva CLI",
        "command": "npx @canva/cli@latest login",
        "needsSetup": true
      },
      "command": "npx",
      "args": ["-y", "@canva/cli@latest", "mcp"]
    },
    "http": {
      "url": "https://mcp.canva.com/mcp",
      "auth": "oauth",
      "docs": "https://www.canva.dev/docs/connect/mcp-server/"
    }
  }
}
```

### 2. Auto-Detection Flow

```
User: ncp add canva
    ↓
Check registry → Found: canva
    ↓
Recommended transport: stdio
    ↓
Setup needed? Yes
    ↓
Prompt: Run authentication?
    ↓
If yes → Execute: npx @canva/cli@latest login
    ↓
Add to profile with stdio config
    ↓
Done!
```

### 3. Fallback for Unknown Providers

```
User: ncp add custom-mcp npx @custom/cli mcp
    ↓
Check registry → Not found
    ↓
Use manual configuration
    ↓
Add with provided command/args
    ↓
Done!
```

## Adding New Providers

### For Users
Submit a provider request:
1. Open issue: https://github.com/portel/ncp/issues
2. Include: Provider name, documentation URL, setup instructions
3. We'll add it to the registry!

### For Contributors

**1. Add to `src/registry/providers.json`:**

```json
{
  "newprovider": {
    "id": "newprovider",
    "name": "New Provider",
    "description": "What this provider does",
    "website": "https://newprovider.com",
    "recommended": "stdio",  // or "http"
    "stdio": {
      "setup": {
        "description": "Authenticate with Provider CLI",
        "command": "npx @provider/cli login",
        "needsSetup": true
      },
      "command": "npx",
      "args": ["-y", "@provider/cli", "mcp"]
    }
  }
}
```

**2. Test:**
```bash
npm run build
ncp add newprovider
```

**3. Submit PR:**
- Include test results
- Link to provider's documentation
- Verify authentication flow works

## Benefits

### For Users:
✅ **Simple setup** - Just one command
✅ **Guided authentication** - NCP handles it
✅ **No documentation needed** - Built-in knowledge
✅ **Works out of the box** - No configuration

### For Provider Authors:
✅ **Easy adoption** - Lower barrier to entry
✅ **Consistent UX** - All providers setup the same way
✅ **Built-in discovery** - Users find your MCP easily

### For NCP Project:
✅ **Better onboarding** - New users succeed quickly
✅ **Community contributions** - Easy to add providers
✅ **Scalable** - Registry grows with ecosystem

## Future Enhancements

### Planned Features:
- [ ] `ncp providers list` - Show all available providers
- [ ] `ncp providers search <query>` - Search providers
- [ ] `ncp providers info <provider>` - Show provider details
- [ ] Auto-update registry from remote source
- [ ] Community provider submissions via API
- [ ] Provider verification/trust badges

## Technical Details

### File Structure:
```
src/registry/
├── providers.json          # Provider definitions
└── provider-registry.ts    # Loader and utilities
```

### TypeScript Interfaces:
```typescript
interface Provider {
  id: string;
  name: string;
  description: string;
  website: string;
  recommended: 'stdio' | 'http';
  stdio?: ProviderStdioConfig;
  http?: ProviderHttpConfig;
}
```

### Registry Functions:
```typescript
loadProviderRegistry()  // Load all providers
getProvider(id)        // Get specific provider
listProviders()        // Get all providers
searchProviders(query) // Search providers
```

## Migration Guide

### Existing Users

Manual stdio commands still work:
```bash
# Manual stdio still supported:
ncp add canva npx -y @canva/cli@latest mcp
```

Simplified registry-based commands recommended:
```bash
# Registry-based (auto-detects transport):
ncp add canva
ncp add notion
```

**Note:** The old `add-http` and `add-stdio` subcommands have been unified into a single `add` command that auto-detects the transport type from the registry.

### Updating Profiles

Profiles created with old commands work fine. No migration needed!

## FAQ

**Q: What if a provider isn't in the registry?**
A: Use manual commands: `ncp add <name> <command> [args...]`

**Q: Can I override registry settings?**
A: Yes! Specify command manually: `ncp add canva custom-command`

**Q: How often is the registry updated?**
A: With each NCP release. Check `ncp --version` for updates.

**Q: Can I use HTTP for a provider that recommends stdio?**
A: Yes: `ncp add canva --transport http`

**Q: What if authentication fails?**
A: NCP provides the command to run manually. You can retry after.

**Q: Are there community providers?**
A: Coming soon! We'll enable community submissions.

---

**Making MCP setup delightful, one provider at a time.** 🚀
