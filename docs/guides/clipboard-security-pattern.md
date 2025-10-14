# Clipboard Security Pattern: AI-Assisted Setup Without Exposing Secrets

## 🎯 **The Problem**

**Traditional approach:**
```
AI: "I need your GitHub token"
User: "ghp_abc123xyz456..."
AI: [sees token in conversation] ❌
Logs: [token stored forever] ❌
```

**Secrets exposed to:**
- ❌ AI conversation history
- ❌ Anthropic's servers
- ❌ Conversation logs
- ❌ Chat transcripts

---

## ✅ **The Solution: Clipboard Security Pattern**

**New approach:**
```
AI: "I need to add GitHub MCP"
        ↓
Prompt: "Copy config to clipboard BEFORE clicking YES"
        ↓
User copies: {"env":{"GITHUB_TOKEN":"ghp_secret"}}
        ↓
User clicks: YES
        ↓
NCP reads clipboard (server-side only)
        ↓
AI only sees: "User approved" ✅
Token NEVER in conversation! ✅
```

---

## 🔐 **Why This is Secure**

### **Explicit User Consent**

| Approach | Security |
|----------|----------|
| Read clipboard **silently** | ❌ INSECURE - sneaky |
| Read clipboard **after telling user & getting YES** | ✅ SECURE - informed consent |

**Key differences:**
1. ✅ User is **explicitly told** what will happen
2. ✅ User **consciously copies** the data
3. ✅ User **clicks YES** knowing clipboard will be read
4. ✅ **Informed consent** - not background spying

### **Audit Trail Benefits**

**What gets logged:**
```json
{
  "user": "Do you want to add GitHub MCP?",
  "ai_response": "YES"
}
```

**NOT logged:**
```
ghp_abc123xyz456... ← Token NEVER appears!
```

**Tomorrow user can't say:** "You added this without my permission!"

**You can show:** "You clicked YES on [timestamp]. Here's proof."

---

## 🎬 **User Experience**

### **Scenario 1: Simple Setup (No Secrets)**

**User:** "Add the filesystem MCP"

**Prompt appears:**
```
┌───────────────────────────────────────────┐
│ Add filesystem MCP server?                │
│                                           │
│ Command: npx @modelcontextprotocol/      │
│          server-filesystem                │
│                                           │
│ 📋 TIP: Copy config to clipboard first   │
│    if you want to include custom args    │
│                                           │
│           [ YES ]    [ NO ]              │
└───────────────────────────────────────────┘
```

**User clicks:** YES (without copying anything)

**Result:** MCP added with default config ✅

---

### **Scenario 2: Advanced Setup (With Secrets)**

**User:** "Add the GitHub MCP"

**Prompt appears:**
```
┌───────────────────────────────────────────┐
│ Add GitHub MCP server?                    │
│                                           │
│ Command: npx @modelcontextprotocol/      │
│          server-github                    │
│                                           │
│ 📋 SECURE SETUP (Optional):              │
│    To include API keys WITHOUT exposing   │
│    them to this conversation:             │
│                                           │
│    1. Copy config to clipboard:          │
│       {"env":{"GITHUB_TOKEN":"ghp_..."}} │
│                                           │
│    2. Click YES - NCP reads clipboard    │
│                                           │
│    Or click YES without copying for       │
│    basic setup.                           │
│                                           │
│           [ YES ]    [ NO ]              │
└───────────────────────────────────────────┘
```

**User:**
1. Copies to clipboard:
   ```json
   {
     "env": {
       "GITHUB_TOKEN": "ghp_abc123xyz456789"
     }
   }
   ```
2. Clicks: YES

**NCP:**
- Reads clipboard (server-side)
- Merges with base config
- Adds MCP with token

**AI sees:** "User approved" (no token!) ✅

**Result:** GitHub MCP added with token, AI never saw it! ✅

---

## 💻 **Implementation**

### **Step 1: Prompt with Instructions**

```typescript
// src/server/mcp-prompts.ts
export function generateAddConfirmation(
  mcpName: string,
  command: string,
  args: string[]
): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Do you want to add "${mcpName}"?

Command: ${command} ${args.join(' ')}

📋 SECURE SETUP (Optional):
To include API keys WITHOUT exposing them to this conversation:
1. Copy config to clipboard: {"env":{"API_KEY":"secret"}}
2. Click YES - NCP reads from clipboard

Or click YES without copying for basic setup.`
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

### **Step 2: Read Clipboard After YES**

```typescript
// src/server/mcp-prompts.ts
export async function tryReadClipboardConfig(): Promise<{
  env?: Record<string, string>;
  args?: string[];
} | null> {
  try {
    const clipboardy = await import('clipboardy');
    const clipboardContent = await clipboardy.default.read();

    if (!clipboardContent?.trim()) {
      return null; // Empty - user didn't copy
    }

    const config = JSON.parse(clipboardContent.trim());

    // Extract only env and args
    const result: any = {};
    if (config.env) result.env = config.env;
    if (config.args) result.args = config.args;

    return result.env || result.args ? result : null;
  } catch {
    return null; // Not JSON or clipboard error
  }
}
```

### **Step 3: Merge Configs**

```typescript
// src/server/mcp-prompts.ts
export function mergeWithClipboardConfig(
  baseConfig: { command: string; args?: string[]; env?: Record<string, string> },
  clipboardConfig: { env?: Record<string, string>; args?: string[] } | null
) {
  if (!clipboardConfig) return baseConfig;

  return {
    command: baseConfig.command,
    args: clipboardConfig.args || baseConfig.args,
    env: {
      ...(baseConfig.env || {}),
      ...(clipboardConfig.env || {}) // Clipboard overrides
    }
  };
}
```

### **Step 4: Use in add_mcp Tool**

```typescript
// Future implementation
async function handleAddMCP(args: {
  mcp_name: string;
  command: string;
  args?: string[];
  profile?: string;
}) {
  // 1. Show prompt (tells user about clipboard option)
  const confirmed = await showPrompt('confirm_add_mcp', args);

  if (!confirmed) {
    return { success: false, message: 'User cancelled' };
  }

  // 2. Try to read additional config from clipboard
  const clipboardConfig = await tryReadClipboardConfig();

  // 3. Merge base config with clipboard config
  const baseConfig = {
    command: args.command,
    args: args.args || [],
    env: {}
  };

  const finalConfig = mergeWithClipboardConfig(baseConfig, clipboardConfig);

  // 4. Add MCP with merged config
  await profileManager.addMCPToProfile(
    args.profile || 'all',
    args.mcp_name,
    finalConfig
  );

  // 5. Log success (without revealing secrets)
  const hasSecrets = clipboardConfig?.env ? ' (with credentials)' : '';
  return {
    success: true,
    message: `MCP "${args.mcp_name}" added${hasSecrets}`
  };
}
```

---

## 🚀 **Can We Eliminate CLI?**

**YES!** With this pattern, you can do **everything** through AI + prompts + clipboard:

| Operation | Old (CLI) | New (AI + Clipboard) |
|-----------|-----------|----------------------|
| **Add MCP** | `ncp add github npx ...` | AI asks → User copies config → YES |
| **Add with secrets** | `ncp add ... --env TOKEN=xxx` | User copies `{"env":{"TOKEN":"xxx"}}` → YES |
| **Remove MCP** | `ncp remove github` | AI asks → User clicks YES |
| **Update config** | Edit `~/.ncp/profiles/all.json` | AI asks → User copies new config → YES |
| **Import config** | `ncp config import` | AI asks → User copies full config → YES |

### **What You Still Need CLI For:**

**Realistically:**
- ❓ **Nothing critical!** Everything can be done via AI
- 💡 **Power users might prefer CLI** for scripting/automation
- 🔧 **Emergency fallback** if MCP server fails

**But for normal users:** **AI + prompts + clipboard = complete solution!** ✅

---

## 🎯 **Benefits Summary**

| Benefit | Description |
|---------|-------------|
| **Security** | ✅ Secrets never exposed to AI conversation |
| **Audit trail** | ✅ User approval logged with timestamp |
| **User control** | ✅ Explicit consent required for every action |
| **No CLI needed** | ✅ Everything possible through AI |
| **Works in .mcpb** | ✅ Clipboard works in Claude Desktop |
| **Simple UX** | ✅ Copy → Click YES → Done |

---

## 📊 **Security Comparison**

| Approach | AI Sees Secrets? | Logged? | User Consent? | Verdict |
|----------|------------------|---------|---------------|---------|
| **Prompt input** | ❌ YES | ❌ YES | ✅ YES | ⚠️ UNSAFE |
| **CLI only** | ✅ NO | ✅ NO | ✅ YES | ✅ SAFE but needs CLI |
| **Clipboard pattern** | ✅ NO | ✅ NO | ✅ YES | ✅ SAFE + no CLI needed! |

---

## 🔑 **Key Insights**

1. **Audit trail is GOOD** - Proves user gave permission
2. **Clipboard with consent is SAFE** - User explicitly copies BEFORE clicking YES
3. **Not sneaky reading** - User is told exactly what will happen
4. **AI never sees secrets** - Clipboard read happens server-side
5. **CLI becomes optional** - Everything possible through AI interface

---

## 🎓 **Best Practices**

### **DO:**
✅ Tell user to copy config BEFORE clicking YES
✅ Read clipboard ONLY after user confirms
✅ Show example JSON format in prompt
✅ Make clipboard config optional (can click YES without copying)
✅ Log approval, not secrets

### **DON'T:**
❌ Read clipboard silently without telling user
❌ Require clipboard - always have fallback
❌ Log clipboard contents
❌ Send clipboard data to AI
❌ Assume clipboard has valid JSON

---

## 🚀 **Next Steps**

1. ✅ Implement clipboard reading functions (DONE)
2. ⏳ Add `add_mcp` tool that uses this pattern
3. ⏳ Add `remove_mcp` tool
4. ⏳ Add `update_mcp` tool
5. ⏳ Test in Claude Desktop
6. ⏳ Document for users
7. 🎉 Ship CLI-optional NCP!

---

**This creative solution solves the security problem AND makes CLI optional!** 🎉
