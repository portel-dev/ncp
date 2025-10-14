# Extension User Configuration - Major Discovery! 🎉

## What We Found

Claude Desktop extensions support a **`user_config`** field in `manifest.json` that enables:

1. ✅ **Declarative configuration** - Extensions declare what config they need
2. ✅ **Type-safe inputs** - String, number, boolean, directory, file
3. ✅ **Secure storage** - Sensitive values stored in OS keychain
4. ✅ **Runtime injection** - Values injected via `${user_config.KEY}` template literals
5. ✅ **Validation** - Required fields, min/max constraints, default values

**This opens MASSIVE possibilities for NCP!**

---

## Complete Specification

### **Supported Configuration Types**

| Type | Description | Example Use Case |
|------|-------------|------------------|
| `string` | Text input | API keys, URLs, usernames |
| `number` | Numeric input | Port numbers, timeouts, limits |
| `boolean` | Checkbox/toggle | Enable/disable features |
| `directory` | Directory picker | Allowed paths, workspace folders |
| `file` | File picker | Config files, credentials |

### **Configuration Properties**

```typescript
interface UserConfigOption {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string;           // Display name in UI
  description?: string;    // Help text
  required?: boolean;      // Must be provided (default: false)
  default?: any;          // Default value (supports variables)
  sensitive?: boolean;    // Mask input + store in keychain
  multiple?: boolean;     // Allow multiple selections (directory/file)
  min?: number;          // Minimum value (number type)
  max?: number;          // Maximum value (number type)
}
```

### **Variable Substitution**

Supports these built-in variables:
- `${HOME}` - User home directory
- `${DESKTOP}` - Desktop folder
- `${__dirname}` - Extension directory

### **Template Injection**

Reference user config in `mcp_config`:
```json
{
  "user_config": {
    "api_key": { "type": "string", "sensitive": true }
  },
  "server": {
    "mcp_config": {
      "env": {
        "API_KEY": "${user_config.api_key}"  // ← Injected at runtime
      }
    }
  }
}
```

---

## Real-World Examples

### **Example 1: GitHub Extension**

```json
{
  "name": "github",
  "user_config": {
    "github_token": {
      "type": "string",
      "title": "GitHub Personal Access Token",
      "description": "Token with repo and workflow permissions",
      "sensitive": true,
      "required": true
    },
    "default_owner": {
      "type": "string",
      "title": "Default Repository Owner",
      "description": "Your GitHub username or organization",
      "default": ""
    },
    "max_search_results": {
      "type": "number",
      "title": "Maximum Search Results",
      "description": "Limit number of results returned",
      "default": 10,
      "min": 1,
      "max": 100
    }
  },
  "server": {
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "GITHUB_TOKEN": "${user_config.github_token}",
        "DEFAULT_OWNER": "${user_config.default_owner}",
        "MAX_RESULTS": "${user_config.max_search_results}"
      }
    }
  }
}
```

### **Example 2: Filesystem Extension**

```json
{
  "name": "filesystem",
  "user_config": {
    "allowed_directories": {
      "type": "directory",
      "title": "Allowed Directories",
      "description": "Directories the server can access",
      "multiple": true,
      "required": true,
      "default": ["${HOME}/Documents", "${HOME}/Desktop"]
    },
    "read_only": {
      "type": "boolean",
      "title": "Read-only Mode",
      "description": "Prevent write operations",
      "default": false
    }
  },
  "server": {
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "ALLOWED_DIRECTORIES": "${user_config.allowed_directories}",
        "READ_ONLY": "${user_config.read_only}"
      }
    }
  }
}
```

### **Example 3: Database Extension**

```json
{
  "name": "postgresql",
  "user_config": {
    "connection_string": {
      "type": "string",
      "title": "PostgreSQL Connection String",
      "description": "Database connection URL",
      "sensitive": true,
      "required": true
    },
    "max_connections": {
      "type": "number",
      "title": "Maximum Connections",
      "default": 10,
      "min": 1,
      "max": 50
    },
    "ssl_enabled": {
      "type": "boolean",
      "title": "Use SSL",
      "default": true
    },
    "ssl_cert_path": {
      "type": "file",
      "title": "SSL Certificate",
      "description": "Path to SSL certificate file"
    }
  },
  "server": {
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "DATABASE_URL": "${user_config.connection_string}",
        "MAX_CONNECTIONS": "${user_config.max_connections}",
        "SSL_ENABLED": "${user_config.ssl_enabled}",
        "SSL_CERT": "${user_config.ssl_cert_path}"
      }
    }
  }
}
```

---

## How Claude Desktop Handles This

### **1. Configuration UI**
When user enables extension:
- Claude Desktop reads `user_config` from manifest
- Renders configuration dialog with appropriate inputs
- Shows titles, descriptions, validation rules
- Validates input before allowing extension to activate

### **2. Secure Storage**
For sensitive fields:
- Values stored in **OS keychain** (not in JSON config)
- macOS: Keychain Access
- Windows: Credential Manager
- Linux: Secret Service API

### **3. Runtime Injection**
When spawning MCP server:
- Reads user config from secure storage
- Replaces `${user_config.KEY}` with actual values
- Injects into environment variables or args
- MCP server receives final config

---

## HUGE Possibilities for NCP!

### **Current Problem**

When NCP auto-imports extensions:
```json
{
  "github": {
    "command": "node",
    "args": ["/path/to/extension/index.js"],
    "env": {}  // ← EMPTY! No API key configured
  }
}
```

Extension won't work without configuration!

### **Solution 1: Configuration Detection + Prompts**

**Flow:**
```
1. NCP auto-imports extension
   ↓
2. Reads manifest.json → Detects user_config requirements
   ↓
3. AI calls prompt: "configure_extension"
   Shows: "GitHub extension needs: GitHub Token (required)"
   ↓
4. User copies config to clipboard:
   {"github_token": "ghp_..."}
   ↓
5. User clicks YES
   ↓
6. NCP reads clipboard (server-side)
   ↓
7. NCP stores config securely
   ↓
8. When spawning: Injects ${user_config.github_token} → env.GITHUB_TOKEN
   ↓
9. Extension works perfectly!
```

### **Solution 2: Batch Configuration via ncp:import**

**Discovery mode with configuration:**
```
User: "Find GitHub MCPs"
AI: Shows numbered list with config requirements

1. ⭐ server-github (requires: API Token)
2. ⭐ github-actions (requires: Token, Repo)

User: "Import 1"
AI: Shows prompt with clipboard instructions
User: Copies {"github_token": "ghp_..."}
User: Clicks YES
AI: Imports with configuration
```

### **Solution 3: Interactive Configuration via ncp:configure**

New internal tool:
```typescript
ncp:configure {
  mcp_name: "github",
  // User copies full config to clipboard before calling
}
```

Shows what's needed, collects via clipboard, stores securely.

---

## Implementation Plan

### **Phase 1: Detection**

**Add to client-importer:**
```typescript
// When importing .mcpb extensions
const manifest = JSON.parse(manifestContent);

// Extract user_config requirements
const userConfigSchema = manifest.user_config || {};
const userConfigRequired = Object.entries(userConfigSchema)
  .filter(([key, config]) => config.required)
  .map(([key, config]) => ({
    key,
    title: config.title,
    type: config.type,
    sensitive: config.sensitive
  }));

// Store in imported config
mcpServers[mcpName] = {
  command,
  args,
  env: mcpConfig.env || {},
  _source: '.mcpb',
  _userConfigSchema: userConfigSchema,      // ← NEW
  _userConfigRequired: userConfigRequired,  // ← NEW
  _userConfig: {}  // Will be populated later
};
```

### **Phase 2: Prompt Definition**

**Add new prompt:** `configure_extension`

```typescript
{
  name: 'configure_extension',
  description: 'Collect configuration for MCP extension',
  arguments: [
    { name: 'mcp_name', description: 'Extension name', required: true },
    { name: 'config_schema', description: 'Configuration requirements', required: true }
  ]
}
```

**Prompt message:**
```
Extension "${mcp_name}" requires configuration:

${config_schema.map(field => `
• ${field.title} (${field.type})
  ${field.description}
  ${field.required ? 'REQUIRED' : 'Optional'}
  ${field.sensitive ? '⚠️ Sensitive - will be stored securely' : ''}
`).join('\n')}

📋 Copy configuration to clipboard in JSON format:
{
  "${field.key}": "your_value"
}

Then click YES to save configuration.
```

### **Phase 3: Storage**

**Secure user config storage:**
```typescript
// Separate file for user configs
~/.ncp/user-configs/{profile-name}.json

{
  "github": {
    "github_token": "ghp_...",  // Will move to OS keychain later
    "default_owner": "myorg"
  },
  "filesystem": {
    "allowed_directories": ["/Users/me/Projects"]
  }
}
```

**Later:** Integrate with OS keychain for sensitive values.

### **Phase 4: Runtime Injection**

**Update orchestrator spawn logic:**
```typescript
// Before spawning
const userConfig = await getUserConfig(mcpName);
const resolvedEnv = resolveTemplates(definition.config.env, {
  user_config: userConfig
});

// Replace ${user_config.KEY} with actual values
const transport = new StdioClientTransport({
  command: resolvedCommand,
  args: resolvedArgs,
  env: resolvedEnv  // ← Injected values
});
```

### **Phase 5: New Internal Tools**

**`ncp:configure`** - Configure extension
```typescript
{
  mcp_name: string,
  // User copies config to clipboard before calling
}
```

**`ncp:list` enhancement** - Show config status
```
✓ github (configured)
  • github_token: ******* (from clipboard)
  • default_owner: myorg

⚠ filesystem (needs configuration)
  Required: allowed_directories
```

---

## Benefits

### **For Users**

✅ **No manual config editing** - AI handles everything via prompts
✅ **Clipboard security** - Secrets never exposed to AI
✅ **Guided configuration** - Shows exactly what's needed
✅ **Validation** - Type checking, required fields, constraints
✅ **Works with disabled extensions** - NCP manages config independently

### **For Extensions**

✅ **Standard configuration** - Same schema as Claude Desktop
✅ **Compatibility** - Works when enabled OR disabled
✅ **Secure storage** - OS keychain integration (future)
✅ **Type safety** - Number/boolean/string/directory/file types

### **For NCP**

✅ **Complete workflow** - Discovery → Import → Configure → Run
✅ **Differentiation** - Only MCP manager with smart config handling
✅ **User experience** - Seamless AI-driven configuration
✅ **Clipboard pattern** - Extends to configuration (not just secrets)

---

## Example End-to-End Workflow

### **User Story: Install GitHub Extension**

```
User: "Find and install GitHub MCP"

AI: [Calls ncp:import discovery mode]
    I found server-github in the registry.

    [Calls ncp:import with selection]
    Imported server-github.

    ⚠️ This extension requires configuration:
    • GitHub Personal Access Token (required, sensitive)
    • Default Repository Owner (optional)

    [Shows configure_extension prompt]

Prompt: "Copy configuration to clipboard in this format:
{
  "github_token": "ghp_your_token_here",
  "default_owner": "your_username"
}

Then click YES to save configuration."

User: [Copies config to clipboard]
User: [Clicks YES]

AI: [NCP reads clipboard, stores config]
    ✅ GitHub extension configured and ready to use!

User: "Create an issue in my repo"

AI: [Calls ncp:run github:create_issue]
    [NCP injects github_token into env]
    [Extension works perfectly!]
```

---

## Next Steps

### **Immediate (Can Do Now)**

1. ✅ Extract `user_config` from manifest.json during import
2. ✅ Store schema with imported MCP config
3. ✅ Show warnings when extensions need configuration

### **Short-term (Phase 1)**

1. Add `configure_extension` prompt
2. Implement clipboard-based config collection
3. Store user configs in separate file
4. Implement template replacement (`${user_config.KEY}`)

### **Medium-term (Phase 2)**

1. Add `ncp:configure` internal tool
2. Enhance `ncp:list` to show config status
3. Add validation (type checking, required fields)
4. Support default values and variable substitution

### **Long-term (Phase 3)**

1. OS keychain integration for sensitive values
2. Config migration between profiles
3. Config export/import
4. Config versioning and updates

---

## Summary

**What we discovered:**
- Extensions declare configuration needs via `user_config` in manifest.json
- Claude Desktop handles UI, validation, secure storage, and injection
- Template literals (`${user_config.KEY}`) replaced at runtime

**What this enables for NCP:**
- AI-driven configuration via prompts + clipboard security
- Auto-detect configuration requirements
- Secure storage separate from MCP config
- Runtime injection when spawning extensions
- Complete discovery → import → configure → run workflow

**This is MASSIVE for the NCP user experience!** 🚀

Users can now:
1. Discover MCPs via AI
2. Import with one command
3. Configure via clipboard (secure!)
4. Run immediately with full functionality

No CLI, no manual JSON editing, no copy-paste of configs - everything through natural conversation!
