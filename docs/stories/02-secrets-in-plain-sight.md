# 🔐 Story 2: Secrets in Plain Sight

*How your API keys stay invisible to AI - even when configuring MCPs through conversation*

**Reading time:** 2 minutes

---

## 😱 The Pain

You're excited. You just learned AI can help you configure MCPs through natural conversation. You tell it:

> "Add GitHub MCP with my token ghp_abc123xyz456..."

**Your secret just entered the AI conversation.**

Where does it go?

- ✅ AI's context window → Will stay there for the entire session
- ✅ Conversation logs → Saved forever for debugging
- ✅ AI training data → Potentially used to improve models
- ✅ Your screen → Anyone walking by sees it
- ✅ Screenshots → Captured if you share your workflow

**You just turned a private secret into public knowledge.**

Even if you trust the AI provider, do you trust:
- Every employee with log access?
- Every contractor debugging issues?
- Every person who sees your screen share?
- Every future policy change about data retention?

**This isn't theoretical.** Secrets in AI chats is how credentials leak. It's why security teams ban AI tools.

---

## 🤝 The Journey

NCP solves this with a **clipboard handshake** - a pattern where secrets flow server-side, never through the AI conversation.

Here's the magic:

### **Act 1: The Setup**

You: "Add GitHub MCP with my token"

AI: [Calls NCP to show a prompt]

**Prompt appears:**
```
Do you want to add the MCP server "github"?

Command: npx @modelcontextprotocol/server-github

📋 SECURE SETUP (Optional):
To include API keys/tokens WITHOUT exposing them to this conversation:
1. Copy your config to clipboard BEFORE clicking YES
2. Example: {"env":{"GITHUB_TOKEN":"your_secret_here"}}
3. Click YES - NCP will read from clipboard

Or click YES without copying for basic setup.
```

### **Act 2: The Secret Handshake**

You (in terminal, outside AI chat):
```bash
# Copy to clipboard (secrets stay local)
echo '{"env":{"GITHUB_TOKEN":"ghp_abc123xyz456"}}' | pbcopy
```

You click: **YES** on the prompt

### **Act 3: The Magic**

What happens behind the scenes:

```
1. AI sends: "User clicked YES"
2. NCP (server-side): Reads clipboard content
3. NCP: Parses {"env":{"GITHUB_TOKEN":"ghp_..."}}
4. NCP: Merges with base config
5. NCP: Saves to profile
6. AI receives: "MCP added with credentials from clipboard"
```

**AI never sees your token.** It only sees "User approved" and "Config complete."

Your secret traveled:
- Your clipboard → NCP process (server-side) → Profile file

**It never touched the AI.**

---

## ✨ The Magic

What you get with clipboard handshake:

### **🛡️ Secrets Stay Secret**
- AI conversation: "MCP added with credentials" ✅
- Your logs: "User clicked YES on prompt" ✅
- Your token: `ghp_abc123...` ❌ (not in logs!)

### **✋ Informed Consent**
- Prompt tells you exactly what will happen
- You explicitly copy config to clipboard
- You explicitly click YES
- No sneaky background clipboard reading

### **📝 Clean Audit Trail**
- Security team reviews logs: "User approved MCP addition"
- No secrets in audit trail
- Compliance-friendly (GDPR, SOC2, etc.)

### **🔄 Works with AI Conversation**
- Still feels natural (AI helps you configure)
- Still conversational (no manual JSON editing)
- Just adds one extra step (copy → YES)

### **⚡ Optional for Non-Secrets**
- No secrets? Just click YES without copying
- NCP uses base config (command + args only)
- Clipboard step is optional, not mandatory

---

## 🔍 How It Works (The Technical Story)

Let's trace the flow with actual code paths:

### **Step 1: AI Wants to Add MCP**

```typescript
// AI calls internal tool
ncp:add({
  mcp_name: "github",
  command: "npx",
  args: ["@modelcontextprotocol/server-github"]
})
```

### **Step 2: NCP Shows Prompt**

```typescript
// NCP (src/server/mcp-prompts.ts)
const prompt = generateAddConfirmation("github", "npx", [...]);

// Prompt includes clipboard instructions
// Returns to AI client (Claude Desktop, etc.)
```

### **Step 3: User Sees Prompt & Acts**

```bash
# User copies (outside AI chat)
echo '{"env":{"GITHUB_TOKEN":"ghp_..."}}' | pbcopy

# User clicks YES in prompt dialog
```

### **Step 4: AI Sends Approval**

```typescript
// AI sends user's response
prompts/response: "YES"
```

### **Step 5: NCP Reads Clipboard (Server-Side)**

```typescript
// NCP (src/server/mcp-prompts.ts)
const clipboardConfig = await tryReadClipboardConfig();
// Returns: { env: { GITHUB_TOKEN: "ghp_..." } }

// Merge with base config
const finalConfig = mergeWithClipboardConfig(baseConfig, clipboardConfig);
// Result: { command: "npx", args: [...], env: { GITHUB_TOKEN: "ghp_..." } }
```

### **Step 6: Save & Respond**

```typescript
// Save to profile (secrets in file, not chat)
await profileManager.addMCP("github", finalConfig);

// Return to AI (no secrets!)
return {
  success: true,
  message: "MCP added with credentials from clipboard"
};
```

**Key:** Clipboard read happens in NCP's process (Node.js), not in AI's context. The AI conversation never contains the token.

---

## 🎨 The Analogy That Makes It Click

**Traditional Approach = Shouting Passwords in a Crowded Room** 📢

You: "Hey assistant, my password is abc123!"
[100 people hear it]
[Security cameras record it]
[Everyone's phone captures it]

**NCP Clipboard Handshake = Passing a Note Under the Table** 📝

You: "I have credentials"
[You write secret on paper]
[You hand paper directly to assistant under table]
[Nobody else sees it]
[No cameras capture it]
Assistant: "Got it, thanks!"

**The room (AI conversation) never sees the secret.**

---

## 🧪 See It Yourself

Try this experiment:

### **Bad Way (Secrets in Chat):**

```
You: Add GitHub MCP. Command: npx @modelcontextprotocol/server-github
     Token: ghp_abc123xyz456

AI: [Adds MCP]
    ✅ Works!
    ❌ Your token is now in conversation history
    ❌ Token logged in AI provider's systems
    ❌ Token visible in screenshots
```

### **NCP Way (Clipboard Handshake):**

```
You: Add GitHub MCP

AI: [Shows prompt]
    "Copy config to clipboard BEFORE clicking YES"

[You copy: {"env":{"GITHUB_TOKEN":"ghp_..."}} to clipboard]
[You click YES]

AI: MCP added with credentials from clipboard
    ✅ Works!
    ✅ Token never entered conversation
    ✅ Logs show "user approved" not token
    ✅ Screenshots show prompt, not secret
```

**Check your conversation history:** Search for "ghp_" - you won't find it!

---

## 🚀 Why This Changes Everything

**Security teams used to say:**
> "Don't use AI for infrastructure work - secrets will leak"

**Now they can say:**
> "Use NCP's clipboard handshake - secrets stay server-side"

**Benefits:**

| Concern | Without NCP | With NCP Clipboard |
|---------|-------------|-------------------|
| Secrets in chat | ❌ Yes | ✅ No |
| Secrets in logs | ❌ Yes | ✅ No |
| Training data exposure | ❌ Possible | ✅ Impossible |
| Screen share leaks | ❌ High risk | ✅ Shows prompt only |
| Audit compliance | ❌ Hard | ✅ Easy |
| Developer experience | ✅ Convenient | ✅ Still convenient! |

**You don't sacrifice convenience for security. You get both.**

---

## 🔒 Security Deep Dive

### **Is This Actually Secure?**

**Q: What if AI can read my clipboard?**

A: AI doesn't read clipboard. NCP (running on your machine) reads it. The clipboard content never goes to AI provider's servers.

**Q: What if someone sees my clipboard?**

A: Clipboard is temporary. As soon as you click YES, you can copy something else to overwrite it. Window of exposure: seconds, not forever.

**Q: What about clipboard managers with history?**

A: Good point! Best practice: Copy a fake value after clicking YES to clear clipboard history. Or use a clipboard manager that supports "sensitive" mode.

**Q: Could malicious MCP read clipboard?**

A: NCP reads clipboard *before* starting the MCP. The MCP never gets clipboard access. It only receives env vars through its stdin (standard MCP protocol).

**Q: What about keyloggers?**

A: Keyloggers are system-level threats. If you have a keylogger, all config methods are compromised. NCP's clipboard handshake protects against *conversation logging*, not *system compromise*.

### **Threat Model**

NCP clipboard handshake protects against:
- ✅ AI conversation logs containing secrets
- ✅ AI training data including secrets
- ✅ Screen shares leaking secrets
- ✅ Accidental secret exposure in screenshots
- ✅ Audit logs containing credentials

NCP cannot protect against:
- ❌ Compromised system (keylogger, malware)
- ❌ User copying secrets to shared clipboard
- ❌ Clipboard manager saving history indefinitely

---

## 🎯 Best Practices

### **Do:**
1. ✅ Copy config right before clicking YES
2. ✅ Copy something else after (to clear clipboard)
3. ✅ Use password manager to generate config JSON
4. ✅ Review prompt to ensure it's NCP's official prompt
5. ✅ Verify MCP is added before trusting it worked

### **Don't:**
1. ❌ Type secret in AI chat ("My token is...")
2. ❌ Leave secret in clipboard forever
3. ❌ Share screen while secret is in clipboard
4. ❌ Ignore clipboard security warnings
5. ❌ Assume all "clipboard read" is malicious (NCP uses it ethically)

---

## 📚 Deep Dive

Want the full technical implementation and security audit?

- **Clipboard Security Pattern:** [docs/guides/clipboard-security-pattern.md]
- **Prompt Implementation:** [docs/technical/mcp-prompts.md]
- **Security Architecture:** [docs/technical/security-model.md]
- **Threat Modeling:** [SECURITY.md]

---

## 🔗 Next Story

**[Story 3: Sync and Forget →](03-sync-and-forget.md)**

*Why you never configure the same MCP twice across different clients*

---

## 💬 Questions?

**Q: Do I HAVE to use clipboard for secrets?**

A: No! For non-secret configs, just click YES without copying anything. NCP will use base config. Clipboard is optional for secrets only.

**Q: Can I use file instead of clipboard?**

A: Yes! You can pre-create a profile JSON file with secrets and NCP will use it. Clipboard is for convenience during AI conversation.

**Q: What if I forget to copy before clicking YES?**

A: NCP will add the MCP with base config (no env vars). You can edit the profile JSON manually later to add secrets.

**Q: Does this work with ALL MCP clients?**

A: Only clients that support MCP prompts (Claude Desktop, Cursor with prompts enabled, etc.). For others, use manual profile editing.

---

**[← Previous Story](01-dream-and-discover.md)** | **[Back to Story Index](../README.md#the-six-stories)** | **[Next Story →](03-sync-and-forget.md)**
