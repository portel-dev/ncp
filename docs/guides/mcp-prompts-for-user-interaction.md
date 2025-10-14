# MCP Prompts for User Interaction

## 🎯 **Problem Solved**

How can AI safely perform management operations (add/remove MCPs, change config) while getting user approval?

## ✅ **Solution: MCP Prompts Capability**

The MCP protocol includes a **prompts** capability that allows servers to request user input/approval through the client UI. This works even in .mcpb bundles running in Claude Desktop!

---

## 🏗️ **Architecture**

```
┌─────────────────┐
│   Claude (AI)   │
│                 │
│  "Add GitHub    │
│   MCP server"   │
└────────┬────────┘
         │
         │ 1. Calls tool: add_mcp
         ▼
┌─────────────────┐
│   NCP Server    │
│                 │
│  Receives add   │
│  request with   │
│  parameters     │
└────────┬────────┘
         │
         │ 2. Requests prompt
         ▼
┌─────────────────┐
│ Claude Desktop  │
│                 │
│ Shows dialog:   │
│ "Add GitHub     │
│  MCP server?"   │
│                 │
│ [YES]  [NO]     │
└────────┬────────┘
         │
         │ 3. User clicks YES
         ▼
┌─────────────────┐
│   NCP Server    │
│                 │
│  Receives user  │
│  confirmation   │
│  → Adds MCP     │
└────────┬────────┘
         │
         │ 4. Returns success
         ▼
┌─────────────────┐
│   Claude (AI)   │
│                 │
│  "GitHub MCP    │
│   added!"       │
└─────────────────┘
```

---

## 📝 **How It Works**

### 1. **Declare Prompts in Capabilities**

```typescript
// src/server/mcp-server.ts
private handleInitialize(request: MCPRequest): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        prompts: {} // ← Enables prompt capability
      },
      serverInfo: {
        name: 'ncp',
        version: '1.0.4'
      }
    }
  };
}
```

### 2. **Define Available Prompts**

```typescript
// src/server/mcp-prompts.ts
export const NCP_PROMPTS: Prompt[] = [
  {
    name: 'confirm_add_mcp',
    description: 'Request user confirmation before adding MCP',
    arguments: [
      {
        name: 'mcp_name',
        description: 'Name of the MCP server to add',
        required: true
      },
      {
        name: 'command',
        description: 'Command to execute',
        required: true
      }
    ]
  },
  {
    name: 'confirm_remove_mcp',
    description: 'Request user confirmation before removing MCP',
    arguments: [
      {
        name: 'mcp_name',
        description: 'Name of the MCP to remove',
        required: true
      }
    ]
  }
];
```

### 3. **Implement Prompt Generation**

```typescript
// src/server/mcp-prompts.ts
export function generateAddConfirmation(
  mcpName: string,
  command: string,
  args: string[],
  profile: string = 'all'
): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Do you want to add the MCP server "${mcpName}" to profile "${profile}"?\n\nCommand: ${command} ${args.join(' ')}\n\nThis will allow Claude to access the tools provided by this MCP server.`
      }
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Please respond with YES to confirm or NO to cancel.'
      }
    }
  ];
}
```

### 4. **Handle Prompt Requests**

```typescript
// src/server/mcp-server.ts
private async handleGetPrompt(request: MCPRequest): Promise<MCPResponse> {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'confirm_add_mcp':
      const messages = generateAddConfirmation(
        args.mcp_name,
        args.command,
        args.args || [],
        args.profile || 'all'
      );

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          description: 'Confirm adding MCP server',
          messages
        }
      };
    //... other cases
  }
}
```

### 5. **Create Management Tools That Use Prompts**

```typescript
// Example: add_mcp tool (future implementation)
{
  name: 'add_mcp',
  description: 'Add a new MCP server to NCP (requires user approval)',
  inputSchema: {
    type: 'object',
    properties: {
      mcp_name: { type: 'string', description: 'Name for the MCP server' },
      command: { type: 'string', description: 'Command to execute' },
      args: { type: 'array', items: { type: 'string' } },
      profile: { type: 'string', default: 'all' }
    },
    required: ['mcp_name', 'command']
  }
}
```

---

## 🎬 **User Experience**

### **Scenario: AI wants to add GitHub MCP**

**User says:** "Add the GitHub MCP server so you can access my repositories"

**Claude (AI) calls tool:**
```json
{
  "name": "add_mcp",
  "arguments": {
    "mcp_name": "github",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"]
  }
}
```

**NCP triggers prompt:**
```json
{
  "method": "prompts/get",
  "params": {
    "name": "confirm_add_mcp",
    "arguments": {
      "mcp_name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

**Claude Desktop shows dialog:**
```
┌────────────────────────────────────────────────┐
│  Do you want to add the MCP server "github"   │
│  to profile "all"?                             │
│                                                 │
│  Command: npx -y @modelcontextprotocol/        │
│           server-github                         │
│                                                 │
│  This will allow Claude to access the tools    │
│  provided by this MCP server.                  │
│                                                 │
│  Please respond with YES to confirm or NO to   │
│  cancel.                                        │
│                                                 │
│              [ YES ]    [ NO ]                 │
└────────────────────────────────────────────────┘
```

**User clicks YES**

**NCP receives confirmation:**
```json
{
  "response": "YES"
}
```

**NCP adds the MCP and returns success:**
```json
{
  "success": true,
  "message": "MCP server 'github' added to profile 'all'",
  "tools_count": 5
}
```

**Claude tells user:** "I've added the GitHub MCP server. I can now access 5 new tools for working with GitHub repositories!"

---

## 🔒 **Security Benefits**

1. **User Approval Required**: AI cannot modify configuration without explicit user consent
2. **Transparency**: User sees exactly what will be added/changed
3. **Audit Trail**: All confirmations logged
4. **Reversible**: Easy to undo changes if approved by mistake

---

## 💡 **Types of Prompts**

### **1. Confirmation Prompts** (Yes/No)
- Add MCP server
- Remove MCP server
- Clear all MCPs
- Reset configuration

### **2. Input Prompts** (User provides value)
- GitHub token
- API keys
- Database credentials
- File paths

### **3. Selection Prompts** (Choose from options)
- Select profile to add to
- Choose MCP version
- Pick authentication method

---

## 🚀 **Implementation Roadmap**

### **Phase 1: Foundation** ✅ (Current)
- [x] Prompts capability enabled
- [x] NCP_PROMPTS defined
- [x] Prompt generation functions
- [x] handleGetPrompt implemented

### **Phase 2: Add Management Tools** (Next)
- [ ] `add_mcp` tool with prompt integration
- [ ] `remove_mcp` tool with prompt integration
- [ ] `configure_mcp` tool for env vars
- [ ] Parse user responses and execute operations

### **Phase 3: Advanced Features** (Future)
- [ ] Multi-step wizards (collect multiple inputs)
- [ ] Rich formatting (code blocks, tables)
- [ ] Image prompts (show MCP logos)
- [ ] Validation prompts (test before adding)

---

## 📖 **Example: Full Add Flow**

### **1. AI calls add_mcp tool**
```typescript
await callTool('add_mcp', {
  mcp_name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me'],
  env: { DEBUG: 'true' }
});
```

### **2. NCP handler triggers prompt**
```typescript
async function handleAddMCP(args: any) {
  // Step 1: Request confirmation
  const confirmation = await requestPrompt('confirm_add_mcp', args);

  if (!parseConfirmationResponse(confirmation)) {
    return { success: false, message: 'User cancelled' };
  }

  // Step 2: Add to profile
  await profileManager.addMCPToProfile(
    args.profile || 'all',
    args.mcp_name,
    {
      command: args.command,
      args: args.args || [],
      env: args.env || {}
    }
  );

  // Step 3: Verify it works
  const discovery = await discoverSingleMCP(args.mcp_name, config);

  return {
    success: true,
    message: `MCP server '${args.mcp_name}' added successfully`,
    tools_count: discovery?.tools.length || 0,
    tools: discovery?.tools.slice(0, 3) // Show first 3 tools
  };
}
```

### **3. User sees:**
```
┌─────────────────────────────────────────┐
│ Do you want to add "filesystem" MCP?   │
│                                         │
│ Command:                                │
│   npx -y @modelcontextprotocol/        │
│   server-filesystem /Users/me           │
│                                         │
│ Environment:                            │
│   DEBUG=true                            │
│                                         │
│          [ YES ]    [ NO ]             │
└─────────────────────────────────────────┘
```

---

## 🎯 **Key Advantages**

| Approach | Pro | Con |
|----------|-----|-----|
| **No prompts** (just do it) | Fast | Dangerous - AI modifies config freely |
| **CLI only** (no AI access) | Safe | Limited - AI can't help manage MCPs |
| **Prompts** (ask user) | ✅ Safe + Flexible | Requires user interaction |

**Prompts strike the perfect balance**: AI can help manage MCPs, but user stays in control.

---

## 🔧 **Testing Prompts**

### **Via MCP Inspector**
```bash
# List available prompts
echo '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' | npx ncp

# Get specific prompt
echo '{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"confirm_add_mcp","arguments":{"mcp_name":"test","command":"echo"}}}' | npx ncp
```

### **Via Claude Desktop**
1. Start NCP as MCP server
2. Say: "Show me what prompts are available"
3. Claude will list NCP_PROMPTS
4. Say: "Show me the add MCP confirmation"
5. Claude will trigger the prompt

---

## 🎨 **UI in Different Clients**

| Client | Prompt UI |
|--------|-----------|
| **Claude Desktop** | Native dialog boxes |
| **VS Code** | Quick pick / input box |
| **Cursor** | IDE notifications |
| **CLI** | Terminal prompts (if supported) |

**For .mcpb**: Always uses Claude Desktop's native UI! 🎉

---

## 🚀 **Next Steps**

Want to enable management via AI? Here's the roadmap:

1. **Review this implementation** - Prompts foundation is ready
2. **Add management tools** - `add_mcp`, `remove_mcp`, etc.
3. **Test in Claude Desktop** - Verify prompts show correctly
4. **Document for users** - "How to let AI manage your MCPs"
5. **Ship it!** - Release with prompt-based management

**The foundation is ready. Just need to add the management tools!** ✅
