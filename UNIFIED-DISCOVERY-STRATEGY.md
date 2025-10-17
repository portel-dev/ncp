# Unified MCP Discovery & Configuration Strategy

## 🎯 Goal

Create ONE discovery system that works for:
- ✅ stdio MCPs (already done)
- ✅ HTTP/SSE MCPs (extend existing)
- ✅ Via AI interaction (already done)
- ⏳ Via CLI (needs alignment)

**Key Principle:** Don't duplicate. Extend what exists.

---

## ✅ What's Already Built

### 1. Registry Discovery (`src/services/registry-client.ts`)

**Capabilities:**
```typescript
interface RegistryServer {
  server: {
    name: string;
    description: string;
    packages: [{
      identifier: string;
      version: string;
      runtimeHint: string;  // "npx", "node", etc.
      environmentVariables: [{
        name: string;
        description: string;
        isRequired: boolean;
        default: string;
      }]
    }]
  }
}
```

**What it does:**
- Search registry by query
- Get detailed server info
- Extract `environmentVariables` metadata
- Returns command, args, required env vars

### 2. Clipboard Security Pattern (`src/server/mcp-prompts.ts`)

**Flow:**
```
1. AI calls confirm_add_mcp prompt
2. Prompt shows user:
   "📋 SECURE SETUP (Optional):
    To include API keys/tokens WITHOUT exposing them:
    1. Copy {"env":{"API_KEY":"secret"}} to clipboard
    2. Click YES"

3. User copies sensitive config → clicks YES

4. tryReadClipboardConfig() reads clipboard server-side

5. mergeWithClipboardConfig() merges secrets

6. Secrets NEVER logged to AI chat
```

**Why it's brilliant:**
- Explicit user consent (copy → approve)
- Server-side only (AI never sees secrets)
- Works in any MCP client (clipboard is universal)

### 3. Internal MCP Tools (`src/internal-mcps/ncp-management.ts`)

**Tools:**
- `ncp:add` - Uses clipboard pattern (lines 196-208)
- `ncp:import` - Supports `discovery` mode with registry
- Workflow:
  1. Search registry
  2. Show numbered list with env vars metadata
  3. User selects MCPs
  4. Uses clipboard for secrets

**Line 461 TODO:**
```typescript
// TODO: Integrate with prompts to show confirm_add_mcp and get clipboard config
```

This is partially done - clipboard is read, but could show more structured config prompts.

---

## 🔧 What Needs Extension

### Problem: HTTP/SSE MCPs Need Discovery Too

**Current state:**
- Registry client works for stdio MCPs (command + args)
- HTTP/SSE MCPs use URLs, not commands
- Registry might support HTTP/SSE (need to check spec)
- If not in registry → need server probing

**Two scenarios:**

#### Scenario A: HTTP/SSE MCP in Registry

```json
{
  "server": {
    "name": "github-mcp-http",
    "packages": [{
      "url": "https://api.github.com/mcp/sse",  // Not command!
      "environmentVariables": [{
        "name": "GITHUB_TOKEN",
        "description": "GitHub personal access token",
        "isRequired": true
      }]
    }]
  }
}
```

**Solution:** Extend registry client to handle `url` field

#### Scenario B: HTTP/SSE MCP NOT in Registry

```
User: "Add https://api.example.com/mcp/sse"
```

**Solution:** Use auth-detector to probe server

```typescript
const authReq = await authDetector.detect(url);
// Returns: { type: 'bearer', fields: [{name: 'token', ...}] }
```

---

## 🎨 Unified Discovery Flow

### High-Level Flow

```
User requests to add MCP (via AI or CLI)
  ↓
1. Check Registry First
   ├─ Found → Extract metadata (env vars, url/command)
   └─ Not found → Probe server (for HTTP/SSE) or use defaults (stdio)
  ↓
2. Build Config Requirements
   - For stdio: command, args, env vars (from registry)
   - For HTTP/SSE: url, auth type, auth fields (from registry OR probe)
  ↓
3. Prompt User for Sensitive Values
   Via AI:  Show clipboard instructions
   Via CLI: Interactive prompts OR clipboard fallback
  ↓
4. Read Config (clipboard for AI, stdin for CLI)
  ↓
5. Merge and Save
  ↓
6. Update Cache
```

### Detailed Implementation

```typescript
// Unified discovery function
async function discoverMCPRequirements(input: string): Promise<MCPRequirements> {
  // Step 1: Determine input type
  const isURL = input.startsWith('http://') || input.startsWith('https://');
  const isRegistryName = input.includes('/'); // e.g., "io.github.foo/bar"

  // Step 2: Try registry first
  if (isRegistryName || !isURL) {
    try {
      const registryClient = new RegistryClient();
      const server = await registryClient.getServer(input);

      return {
        transport: server.server.packages[0].url ? 'http' : 'stdio',
        command: server.server.packages[0].runtimeHint,
        args: [server.server.packages[0].identifier],
        url: server.server.packages[0].url,
        envVars: server.server.packages[0].environmentVariables,
        source: 'registry'
      };
    } catch (e) {
      // Not in registry, continue to probe
    }
  }

  // Step 3: Probe HTTP/SSE server
  if (isURL) {
    const authDetector = new AuthDetector();
    const authReq = await authDetector.detect(input);

    return {
      transport: 'http',
      url: input,
      authType: authReq.type,
      authFields: authReq.fields,
      source: 'probe'
    };
  }

  // Step 4: Stdio with no registry entry
  return {
    transport: 'stdio',
    command: input,
    args: [],
    envVars: [],
    source: 'manual'
  };
}
```

---

## 📋 Configuration Sources Matrix

| Input Type | Registry? | Discovery Method | Config Source |
|------------|-----------|------------------|---------------|
| Registry name | ✅ Yes | Registry API | `environmentVariables` metadata |
| Registry name | ❌ No | Manual | User provides via clipboard/CLI |
| HTTP URL | ✅ Yes | Registry API | URL + `environmentVariables` |
| HTTP URL | ❌ No | Server probe | Auth-detector + clipboard/CLI |
| stdio command | ✅ Yes | Registry API | Command + `environmentVariables` |
| stdio command | ❌ No | Manual | User provides via clipboard/CLI |

---

## 🔄 Interface Alignment

### Via AI (Already Works)

```
User: "Add GitHub MCP"
  ↓
AI calls ncp:import with from=discovery, source="github"
  ↓
Registry returns matches with env var metadata
  ↓
AI shows numbered list
  ↓
AI calls confirm_add_mcp prompt
  ↓
User copies {"env":{"GITHUB_TOKEN":"ghp_..."}} → clicks YES
  ↓
tryReadClipboardConfig() reads secrets
  ↓
MCP added with credentials
```

### Via CLI (Needs Alignment)

**Current (manual):**
```bash
ncp add-http github https://api.github.com/mcp \
  --auth-type bearer \
  --token "ghp_..."  # ❌ Token in shell history!
```

**Proposed (unified):**
```bash
# Option 1: Registry discovery
ncp add github-mcp
🔍 Searching registry...
✅ Found: io.github.modelcontextprotocol/server-github

📋 Configuration needed:
  • GITHUB_TOKEN (required): GitHub personal access token

📎 Clipboard detected: {"env":{"GITHUB_TOKEN":"ghp_..."}}
✅ Using config from clipboard

# Option 2: URL with auto-discovery
ncp add my-api https://api.example.com/mcp
🔍 Detecting authentication...
✅ Server requires: Bearer Token

🔑 Bearer Token: ******** (paste, hidden)
✅ Added my-api

# Option 3: URL with clipboard
ncp add my-api https://api.example.com/mcp
🔍 Detecting authentication...
✅ Server requires: Bearer Token

📎 Copy config to clipboard and press Enter:
   {"auth":{"type":"bearer","token":"sk-..."}}

[User copies → presses Enter]
✅ Using config from clipboard
✅ Added my-api
```

---

## 🛠️ Implementation Tasks

### 1. Extend Registry Client for HTTP/SSE

```typescript
// src/services/registry-client.ts

export interface RegistryPackage {
  identifier?: string;  // For stdio: "@foo/bar"
  url?: string;         // For HTTP/SSE: "https://..."
  runtimeHint?: string; // For stdio: "npx", "node"
  authType?: string;    // For HTTP/SSE: "bearer", "oauth", etc.
  environmentVariables?: Array<{
    name: string;
    description?: string;
    isRequired?: boolean;
    default?: string;
  }>;
}

class RegistryClient {
  // Add method to detect transport type
  async getDetailedInfo(serverName: string): Promise<{
    transport: 'stdio' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    authType?: string;
    envVars?: Array<...>;
  }> {
    const server = await this.getServer(serverName);
    const pkg = server.server.packages?.[0];

    if (pkg.url) {
      // HTTP/SSE server
      return {
        transport: 'http',
        url: pkg.url,
        authType: pkg.authType,
        envVars: pkg.environmentVariables
      };
    } else {
      // stdio server
      return {
        transport: 'stdio',
        command: pkg.runtimeHint || 'npx',
        args: [pkg.identifier],
        envVars: pkg.environmentVariables
      };
    }
  }
}
```

### 2. Create Unified Discovery Service

```typescript
// src/services/mcp-discovery.ts

import { RegistryClient } from './registry-client.js';
import { AuthDetector } from '../auth/auth-detector.js';

export class MCPDiscoveryService {
  async discover(input: string): Promise<DiscoveryResult> {
    // Try registry first
    if (this.looksLikeRegistryName(input)) {
      const result = await this.tryRegistry(input);
      if (result) return result;
    }

    // Probe HTTP/SSE servers
    if (this.looksLikeURL(input)) {
      return await this.probeHTTP(input);
    }

    // Default stdio
    return this.defaultStdio(input);
  }

  private async tryRegistry(name: string): Promise<DiscoveryResult | null> {
    // Use RegistryClient
  }

  private async probeHTTP(url: string): Promise<DiscoveryResult> {
    // Use AuthDetector
  }
}
```

### 3. Add Clipboard Support to CLI

```typescript
// src/cli/index.ts - add command

program
  .command('add <name-or-url>')
  .description('Add an MCP server (auto-discovers requirements)')
  .option('--no-clipboard', 'Disable clipboard config detection')
  .action(async (nameOrUrl, options) => {
    // 1. Discover requirements
    const disco = new MCPDiscoveryService();
    const requirements = await disco.discover(nameOrUrl);

    // 2. Check clipboard FIRST (like internal MCPs do)
    if (!options.noClipboard) {
      const clipConfig = await tryReadClipboardConfig();
      if (clipConfig) {
        console.log('📎 Using configuration from clipboard');
        // Merge and save
        return;
      }
    }

    // 3. Fallback to interactive prompts
    const prompter = new AuthPrompter();
    const values = await prompter.promptFields(requirements.fields);

    // 4. Save config
  });
```

### 4. Update Internal MCPs to Use Discovery

```typescript
// src/internal-mcps/ncp-management.ts

private async handleAdd(params: any): Promise<InternalToolResult> {
  const input = params.mcp_name || params.url;

  // 1. Discover requirements
  const disco = new MCPDiscoveryService();
  const requirements = await disco.discover(input);

  // 2. Read clipboard (already done!)
  const clipboardConfig = await tryReadClipboardConfig();

  // 3. Merge and validate
  if (requirements.envVars) {
    for (const envVar of requirements.envVars) {
      if (envVar.isRequired && !clipboardConfig?.env?.[envVar.name]) {
        return {
          success: false,
          error: `Missing required env var: ${envVar.name}. ${envVar.description}`
        };
      }
    }
  }

  // 4. Save
  await this.profileManager.addMCPToProfile(...);
}
```

---

## ✅ Benefits of Unified Approach

1. **No Code Duplication:**
   - Registry discovery shared
   - Clipboard pattern shared
   - Auth detection used only when needed

2. **Consistent UX:**
   - AI and CLI work the same way
   - Users learn one pattern
   - Clipboard = secure for both

3. **Extensible:**
   - Add new auth types → works everywhere
   - Registry adds HTTP/SSE → automatic support
   - New transport types → extend discovery service

4. **Secure by Default:**
   - Clipboard for all sensitive values
   - Never in shell history
   - Never in AI chat logs

---

## 🚀 Migration Plan

### Phase 1: Extend Registry Client ✅ Can do now
- Add HTTP/SSE support to types
- Handle `url` field in packages
- Extract auth type from metadata

### Phase 2: Create Discovery Service ✅ Can do now
- Unify registry + probe logic
- Return standardized requirements

### Phase 3: Update CLI ✅ Can do now
- Replace manual flags with discovery
- Add clipboard detection
- Keep old flags for compatibility

### Phase 4: Update Internal MCPs ✅ Can do now
- Use discovery service
- Validate against registry requirements
- Better error messages

### Phase 5: Documentation ⏳ After testing
- Update guides
- Add examples
- Migration guide

---

## ✅ Implementation Status

### Phase 1: Extend Registry Client ✅ **COMPLETE**
- ✅ Added `remotes` field to RegistryServer interface
- ✅ Added `isSecret` flag to environmentVariables
- ✅ Updated `searchForSelection` to detect and return transport type
- ✅ Updated `getDetailedInfo` to return unified config for both stdio and HTTP/SSE
- ✅ Added transport badges (💻=stdio, 🌐=HTTP/SSE) to candidate listings

### Phase 2: Update Internal MCPs ✅ **COMPLETE**
- ✅ Updated `importFromDiscovery` to handle both stdio and HTTP/SSE configs
- ✅ HTTP/SSE servers get `url` + `auth` config instead of `command` + `args`
- ✅ Clipboard pattern works for both transport types
- ✅ Updated `handleList` to show transport type and URL/command accordingly
- ✅ Display shows 💻 for stdio, 🌐 for HTTP/SSE

### Phase 3: CLI Commands ⏳ **IN PROGRESS**
- ✅ Manual `ncp add-http` command exists (fallback)
- ⏳ Need unified `ncp add` command with auto-discovery
- ⏳ Clipboard detection in CLI (like internal MCPs)

### Phase 4: Testing 🔜 **NEXT**
- Via AI: `ncp:import` with HTTP/SSE servers from registry
- Via CLI: `ncp add` with auto-discovery

---

## 🎯 Next Steps

1. **Create unified `ncp add` CLI command**
   - Uses RegistryClient.getDetailedInfo()
   - Checks clipboard for secrets first
   - Falls back to interactive prompts
   - Works for both stdio and HTTP/SSE

2. **Test complete flow**
   - Via AI: Search registry, select HTTP/SSE MCP, use clipboard for auth
   - Via CLI: `ncp add <registry-name>` with clipboard detection

3. **Documentation**
   - Update README with unified discovery examples
   - Document clipboard pattern for both AI and CLI
