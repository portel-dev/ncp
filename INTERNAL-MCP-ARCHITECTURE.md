# Internal MCP Architecture - Complete! 🎉

## ✅ **What Was Implemented**

We've successfully implemented an **internal MCP architecture** where NCP exposes management tools as if they were regular MCPs, but they're handled internally without external processes.

---

## 🏗️ **Architecture Overview**

### **Before: Direct Exposure** ❌
```
NCP MCP Server
├── find (top-level)
├── run (top-level)
├── add_mcp (top-level)     ← Exposed directly!
└── remove_mcp (top-level)  ← Exposed directly!
```

### **After: Internal MCP Pattern** ✅
```
NCP MCP Server
├── find (top-level)  ← Search tools in configured MCPs
└── run (top-level)   ← Execute ANY tool (external or internal)

Internal MCPs (discovered via find, executed via run):
└── ncp (internal MCP)
    ├── add       ← ncp:add
    ├── remove    ← ncp:remove
    ├── list      ← ncp:list
    ├── import    ← ncp:import (clipboard/file/discovery)
    └── export    ← ncp:export (clipboard/file)
```

---

## 🔑 **Key Concepts**

### **1. The "Inception" Pattern**

| Tool | Purpose | Analogy |
|------|---------|---------|
| **`find`** (top-level) | Find tools in **configured** MCPs | "What can I do with what I have?" |
| **`ncp:import`** (internal) | Find **new MCPs** from registry | "What else can I add?" (inception!) |

### **2. Internal vs External MCPs**

| Aspect | External MCPs | Internal MCPs |
|--------|---------------|---------------|
| **Process** | Separate process (node, python, etc.) | No process (handled internally) |
| **Discovery** | Same (appears in `find` results) | Same (appears in `find` results) |
| **Execution** | Via MCP protocol (stdio transport) | Direct method call |
| **Configuration** | Needs command, args, env | Hardcoded in NCP |
| **Examples** | github, filesystem, brave-search | ncp (management tools) |

---

## 📁 **Files Created**

### **1. Internal MCP Types** (`src/internal-mcps/types.ts`)
```typescript
export interface InternalTool {
  name: string;
  description: string;
  inputSchema: { /* JSON Schema */ };
}

export interface InternalMCP {
  name: string;
  description: string;
  tools: InternalTool[];
  executeTool(toolName: string, parameters: any): Promise<InternalToolResult>;
}
```

### **2. NCP Management MCP** (`src/internal-mcps/ncp-management.ts`)

Implements all management tools:

```typescript
export class NCPManagementMCP implements InternalMCP {
  name = 'ncp';
  description = 'NCP configuration management tools';

  tools = [
    {
      name: 'add',
      description: 'Add single MCP (with clipboard security)',
      inputSchema: { mcp_name, command, args?, profile? }
    },
    {
      name: 'remove',
      description: 'Remove MCP',
      inputSchema: { mcp_name, profile? }
    },
    {
      name: 'list',
      description: 'List configured MCPs',
      inputSchema: { profile? }
    },
    {
      name: 'import',
      description: 'Bulk import MCPs',
      inputSchema: {
        from: 'clipboard' | 'file' | 'discovery',
        source?: string  // file path or search query
      }
    },
    {
      name: 'export',
      description: 'Export configuration',
      inputSchema: {
        to: 'clipboard' | 'file',
        destination?: string,  // file path
        profile?: string
      }
    }
  ];
}
```

### **3. Internal MCP Manager** (`src/internal-mcps/internal-mcp-manager.ts`)

Manages all internal MCPs:

```typescript
export class InternalMCPManager {
  private internalMCPs: Map<string, InternalMCP> = new Map();

  constructor() {
    // Register internal MCPs
    this.registerInternalMCP(new NCPManagementMCP());
  }

  initialize(profileManager: ProfileManager): void {
    // Initialize each internal MCP with ProfileManager
  }

  async executeInternalTool(mcpName: string, toolName: string, params: any) {
    // Route to appropriate internal MCP
  }

  isInternalMCP(mcpName: string): boolean {
    // Check if MCP is internal
  }
}
```

---

## 🔄 **Integration with Orchestrator**

### **Changes to `NCPOrchestrator`**

**1. Added InternalMCPManager:**
```typescript
private internalMCPManager: InternalMCPManager;

constructor() {
  // ...
  this.internalMCPManager = new InternalMCPManager();
}
```

**2. Initialize internal MCPs after ProfileManager:**
```typescript
private async loadProfile() {
  if (!this.profileManager) {
    this.profileManager = new ProfileManager();
    await this.profileManager.initialize();

    // Initialize internal MCPs with ProfileManager
    this.internalMCPManager.initialize(this.profileManager);
  }
}
```

**3. Add internal MCPs to tool discovery:**
```typescript
async initialize() {
  // ... index external MCPs ...

  // Add internal MCPs to discovery
  this.addInternalMCPsToDiscovery();
}

private addInternalMCPsToDiscovery() {
  const internalMCPs = this.internalMCPManager.getAllInternalMCPs();

  for (const mcp of internalMCPs) {
    // Add to definitions
    this.definitions.set(mcp.name, { /* ... */ });

    // Add tools to allTools
    for (const tool of mcp.tools) {
      this.allTools.push({ name: tool.name, description: tool.description, mcpName: mcp.name });
      this.toolToMCP.set(`${mcp.name}:${tool.name}`, mcp.name);
    }

    // Index in discovery engine
    this.discovery.indexMCPTools(mcp.name, discoveryTools);
  }
}
```

**4. Route internal tool execution:**
```typescript
async run(toolName: string, parameters: any) {
  // Parse tool name
  const [mcpName, actualToolName] = toolName.split(':');

  // Check if internal MCP
  if (this.internalMCPManager.isInternalMCP(mcpName)) {
    return await this.internalMCPManager.executeInternalTool(
      mcpName,
      actualToolName,
      parameters
    );
  }

  // Otherwise, execute as external MCP
  // ...
}
```

---

## 🎯 **Tool Definitions**

### **`ncp:add`**
```typescript
{
  from: 'clipboard' | 'file' | 'discovery',
  source?: string
}

// Examples:
ncp:add { mcp_name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] }
// User can copy {"env":{"GITHUB_TOKEN":"secret"}} to clipboard before approving
```

### **`ncp:remove`**
```typescript
{
  mcp_name: string,
  profile?: string
}

// Example:
ncp:remove { mcp_name: "github" }
```

### **`ncp:list`**
```typescript
{
  profile?: string
}

// Example:
ncp:list { }  // Lists all MCPs in 'all' profile
```

### **`ncp:import`** (Unified bulk import)
```typescript
{
  from: 'clipboard' | 'file' | 'discovery',
  source?: string
}

// Mode 1: From clipboard
ncp:import { }  // Reads JSON from clipboard

// Mode 2: From file
ncp:import { from: "file", source: "~/configs/my-mcps.json" }

// Mode 3: From discovery (registry)
ncp:import { from: "discovery", source: "github automation" }
// Shows numbered list → User selects → Prompts for each → Imports all
```

### **`ncp:export`**
```typescript
{
  to: 'clipboard' | 'file',
  destination?: string,
  profile?: string
}

// Example 1: To clipboard
ncp:export { }  // Exports to clipboard

// Example 2: To file
ncp:export { to: "file", destination: "~/backups/ncp-config.json" }
```

---

## 🚀 **User Experience**

### **Scenario: Add GitHub MCP**

**User:** "Add GitHub MCP"

**AI workflow:**
1. Calls `prompts/get confirm_add_mcp` → Shows dialog
2. User copies `{"env":{"GITHUB_TOKEN":"ghp_..."}}` → Clicks YES
3. AI calls `run` with `ncp:add` → Tool executes internally
4. Returns success (secrets never seen by AI!)

### **Scenario: Bulk Import from Clipboard**

**User:** "Import MCPs from my clipboard"

**AI workflow:**
1. User copies JSON config to clipboard:
   ```json
   {
     "mcpServers": {
       "github": { "command": "npx", "args": [...] },
       "filesystem": { "command": "npx", "args": [...] }
     }
   }
   ```
2. AI calls `run` with `ncp:import { }`
3. NCP reads clipboard → Imports all MCPs
4. Returns: "✅ Imported 2 MCPs from clipboard"

### **Scenario: Discovery Mode** (Future)

**User:** "Find MCPs for GitHub automation"

**AI workflow:**
1. Calls `run` with `ncp:import { from: "discovery", source: "github automation" }`
2. NCP queries registry → Returns numbered list:
   ```
   1. github - Official GitHub MCP
   2. github-actions - Trigger workflows
   3. octokit - Full GitHub API
   ```
3. AI shows list to user → User responds "1,3"
4. For each selected:
   - Show `confirm_add_mcp` prompt
   - User copies secrets if needed → Clicks YES
   - Add MCP with clipboard config
5. Returns: "✅ Imported 2 MCPs"

---

## 🔒 **Security Benefits**

### **Clipboard Security Pattern** (From Phase 1)
- ✅ User explicitly instructed to copy before clicking YES
- ✅ Secrets read server-side (never exposed to AI)
- ✅ Audit trail shows approval, not secrets
- ✅ Informed consent (not sneaky background reading)

### **Internal MCP Architecture** (Phase 2)
- ✅ Management tools discoverable like any MCP
- ✅ No direct exposure in top-level tools
- ✅ Consistent interface (find → run)
- ✅ Can be extended with more internal MCPs

---

## 📊 **Before vs After**

### **Before: Direct Exposure**
```
tools/list → 4 tools
  - find
  - run
  - add_mcp      ← Direct exposure!
  - remove_mcp   ← Direct exposure!
```

### **After: Internal MCP Pattern**
```
tools/list → 2 tools
  - find
  - run

find results → Includes internal MCPs
  - ncp:add
  - ncp:remove
  - ncp:list
  - ncp:import
  - ncp:export

run → Routes internal MCPs to InternalMCPManager
```

---

## 🎯 **Benefits**

1. **Clean Separation** - Top-level tools remain minimal (find, run)
2. **Consistency** - Internal MCPs work exactly like external MCPs
3. **Discoverability** - Users find management tools via `find`
4. **Extensibility** - Easy to add more internal MCPs
5. **Security** - Clipboard pattern integrated into management tools
6. **No Process Overhead** - Internal MCPs execute instantly (no stdio transport)

---

## 🧪 **Testing**

### **Test 1: Discover Internal MCPs**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find","arguments":{"description":"ncp"}}}' | npx ncp
```

**Expected:** Returns `ncp:add`, `ncp:remove`, `ncp:list`, `ncp:import`, `ncp:export`

### **Test 2: List Configured MCPs**
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run","arguments":{"tool":"ncp:list"}}}' | npx ncp
```

**Expected:** Returns list of configured MCPs

### **Test 3: Add MCP**
```bash
# First show prompt
echo '{"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"confirm_add_mcp","arguments":{"mcp_name":"test","command":"echo","args":["hello"]}}}' | npx ncp

# Then call add tool
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"run","arguments":{"tool":"ncp:add","parameters":{"mcp_name":"test","command":"echo","args":["hello"]}}}}' | npx ncp
```

**Expected:** MCP added to profile

---

## 🚀 **Next Steps** (Future Phases)

### **Phase 3: Registry Integration** (Pending)
- Implement `ncp:import` discovery mode
- Query MCP registry API
- Show numbered/checkbox list
- Batch prompt + import workflow

### **Phase 4: Advanced Features**
- `ncp:update` - Update MCP configuration
- `ncp:enable` / `ncp:disable` - Toggle MCPs without removing
- `ncp:validate` - Test MCP before adding
- `ncp:clone` - Duplicate MCP with different config

---

## 📝 **Key Implementation Details**

### **Tool ID Format**
```typescript
// External MCPs: "mcpName:toolName"
"github:create_issue"
"filesystem:read_file"

// Internal MCPs: "mcpName:toolName"
"ncp:add"
"ncp:import"
```

### **Tool Routing Logic**
```typescript
if (toolIdentifier.includes(':')) {
  const [mcpName, toolName] = toolIdentifier.split(':');

  if (internalMCPManager.isInternalMCP(mcpName)) {
    // Route to internal MCP
    return internalMCPManager.executeInternalTool(mcpName, toolName, params);
  } else {
    // Route to external MCP via MCP protocol
    return await connection.client.callTool({ name: toolName, arguments: params });
  }
}
```

---

## ✅ **Implementation Complete!**

We've successfully created an elegant internal MCP architecture that:
- ✅ Keeps top-level tools minimal (find, run only)
- ✅ Exposes management tools as an internal MCP (`ncp`)
- ✅ Maintains clipboard security pattern
- ✅ Provides clean parameter design (`from/to` + `source/destination`)
- ✅ Integrates seamlessly with tool discovery
- ✅ Routes execution correctly (internal vs external)

**The foundation is solid. Ready for registry integration (Phase 3)!** 🎉
