# 🌐 Story 6: Official Registry

*How AI discovers 2,200+ MCPs without you lifting a finger*

**Reading time:** 2 minutes

---

## 😤 The Pain

You need a database MCP. Here's what you have to do today:

**The Manual Discovery Process:**

```
Step 1: Google "MCP database"
→ Find blog post from 3 months ago
→ List is outdated

Step 2: Visit Smithery.ai
→ Browse through categories
→ 2,200+ MCPs to wade through
→ No way to preview without installing

Step 3: Find promising MCP
→ Click to GitHub repo
→ Read README (hopefully it's good)
→ Find npm package name
→ Hope it's maintained

Step 4: Copy installation command
→ npm install -g @someone/mcp-postgres
→ Still not sure if it's the right one

Step 5: Configure it
→ Add to config file
→ Restart Claude Desktop
→ Test it
→ Realize it's not what you needed

Step 6: Remove and try another
→ Repeat steps 3-5 multiple times
→ 2 hours wasted
```

**Questions you can't easily answer:**
- Which database MCPs are **official** vs community?
- Which are **actively maintained**?
- Which are **most popular**?
- What **env vars** do they need?
- How do I install them **correctly**?

**You're on your own. Good luck.**

---

## 🌐 The Journey

NCP connects to the **Official MCP Registry** - Anthropic's central directory of vetted MCPs. Your AI can search it directly.

### **Discovery Through Conversation:**

**You:** "Find database MCPs"

**AI:** [Calls `ncp:import` with discovery mode]

```typescript
ncp:import({
  from: "discovery",
  source: "database"
})
```

**NCP:** [Searches registry.modelcontextprotocol.io]

**AI shows you:**

```
Found 8 database MCPs from official registry:

1. ⭐ @modelcontextprotocol/server-postgres
   PostgreSQL database integration
   Status: Official | Downloads: 1,240

2. 📦 @modelcontextprotocol/server-sqlite
   SQLite database integration
   Status: Official | Downloads: 890

3. 📦 @modelcontextprotocol/server-mongodb
   MongoDB database integration
   Status: Community | Downloads: 456

4. 📦 mcp-mysql-server
   MySQL database integration
   Status: Community | Downloads: 234

[... 4 more ...]

Which would you like to install?
```

**You:** "Install 1 and 2"

**AI:** [Calls import with selection]

```typescript
ncp:import({
  from: "discovery",
  source: "database",
  selection: "1,2"
})
```

**NCP:** [Imports PostgreSQL and SQLite MCPs with correct configs]

**Result:**
```
✅ Installed @modelcontextprotocol/server-postgres
✅ Installed @modelcontextprotocol/server-sqlite

Both MCPs ready to use! If they require credentials, use clipboard
security pattern (Story 2) to configure API keys safely.
```

**Total time: 30 seconds.** (vs 2 hours manually)

---

## ✨ The Magic

What you get with registry integration:

### **🔍 AI-Powered Discovery**
- **Search by intent:** "Find file tools" not "grep filesystem npm"
- **Semantic matching:** Registry understands what you need
- **Natural language:** No technical keywords required
- **Conversational:** Back-and-forth with AI to refine results

### **⭐ Curated Results**
- **Official badge:** Shows Anthropic-maintained MCPs
- **Download counts:** See what's popular and trusted
- **Status indicators:** Official vs Community vs Experimental
- **Version info:** Always get latest stable version

### **📦 One-Click Install**
- **Select by number:** "Install 1, 3, and 5"
- **Range selection:** "Install 1-5"
- **Install all:** "Install *"
- **Batch import:** Multiple MCPs installed in parallel

### **✅ Correct Configuration**
- **Registry knows the command:** `npx` or `node` or custom
- **Registry knows the args:** Package identifier, required flags
- **Registry knows env vars:** Shows what credentials you need
- **No guessing:** NCP gets it right the first time

### **🔒 Safe Credentials**
- **Registry shows:** "This MCP needs GITHUB_TOKEN"
- **You provide:** Via clipboard security pattern (Story 2)
- **AI never sees:** Your actual token
- **Works seamlessly:** Discovery + secure config in one flow

---

## 🔍 How It Works (The Technical Story)

### **Registry API:**

```typescript
// NCP talks to official MCP Registry
const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0';

// Search endpoint
GET /v0/servers?limit=50
→ Returns: List of all MCPs with metadata

// Details endpoint
GET /v0/servers/{encoded_name}
→ Returns: Full details including env vars, packages, etc.
```

### **Search Flow:**

```typescript
// User: "Find database MCPs"
// AI calls: ncp:import({ from: "discovery", source: "database" })

// Step 1: Search registry
const results = await fetch(`${REGISTRY_BASE}/servers?limit=50`);
const allServers = await results.json();

// Step 2: Filter by query
const filtered = allServers.servers.filter(s =>
  s.server.name.toLowerCase().includes('database') ||
  s.server.description?.toLowerCase().includes('database')
);

// Step 3: Format as numbered list
const candidates = filtered.map((server, index) => ({
  number: index + 1,
  name: server.server.name,
  displayName: extractShortName(server.server.name),
  description: server.server.description,
  status: server._meta?.['io.modelcontextprotocol.registry/official']?.status,
  downloads: getDownloadCount(server), // From registry metadata
  version: server.server.version
}));

// Return to AI for display
```

### **Import Flow:**

```typescript
// User: "Install 1 and 3"
// AI calls: ncp:import({ from: "discovery", source: "database", selection: "1,3" })

// Step 1: Parse selection
const selected = parseSelection("1,3", candidates);
// Returns: [candidates[0], candidates[2]]

// Step 2: Get detailed info for each
for (const candidate of selected) {
  const details = await fetch(`${REGISTRY_BASE}/servers/${encodeURIComponent(candidate.name)}`);
  const server = await details.json();

  // Extract install config
  const pkg = server.server.packages[0];
  const config = {
    command: pkg.runtimeHint || 'npx',
    args: [pkg.identifier],
    env: {} // User provides via clipboard if needed
  };

  // Import using internal add command
  await internalAdd(candidate.displayName, config);
}
```

### **Caching:**

```typescript
// Registry responses cached for 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// First search: Hits network (~200ms)
ncp:import({ from: "discovery", source: "database" })

// Repeat search within 5 min: Hits cache (0ms)
ncp:import({ from: "discovery", source: "database" })

// After 5 min: Cache expires, fetches fresh data
```

---

## 🎨 The Analogy That Makes It Click

**Manual Discovery = Library Without Card Catalog** 📚

```
You walk into library with 2,200 books.
No organization. No search system. No librarian.
You wander the aisles hoping to find what you need.
Read book spines one by one.
Pull out books to check if they're relevant.
3 hours later: Found 2 books, not sure if they're the best.
```

**Registry Discovery = Amazon Search** 🔍

```
You open Amazon.
Type: "database book"
See: Reviews, ratings, bestsellers, "customers also bought"
Filter: By rating, by relevance, by date
Click: Buy recommended book
5 minutes later: Book on the way, confident it's what you need.
```

**Registry gives MCPs the search/discovery experience of modern marketplaces.**

---

## 🧪 See It Yourself

Try this experiment:

### **Test 1: Search Registry**

```bash
# Manual way (old)
[Open browser]
[Go to smithery.ai]
[Search "filesystem"]
[Read through results]
[Copy npm command]
[Run in terminal]
[Total time: 5 minutes]

# Registry way (new)
You: "Find filesystem MCPs"
AI: [Shows numbered list from registry]
You: "Install 1"
AI: [Installs in seconds]
[Total time: 30 seconds]
```

### **Test 2: Compare Official vs Community**

```
You: "Find GitHub MCPs"

AI shows:
1. ⭐ @modelcontextprotocol/server-github [Official]
2. 📦 github-mcp-enhanced [Community]
3. 📦 mcp-github-toolkit [Community]

You can see at a glance which is official/supported!
```

### **Test 3: Batch Install**

```
You: "Find AI reasoning MCPs"

AI shows:
1. sequential-thinking
2. memory
3. thinking-protocol
4. context-manager

You: "Install all"
AI: [Installs 1-4 in parallel]

Done in seconds!
```

---

## 🚀 Why This Changes Everything

### **Before Registry (Fragmented Discovery):**

**The ecosystem was scattered:**
- Some MCPs on Smithery.ai
- Some on GitHub awesome lists
- Some only documented in blog posts
- No central source of truth
- No quality indicators
- No official vs community distinction

**Finding MCPs was hard. Choosing the right one was harder.**

### **After Registry (Unified Discovery):**

**The ecosystem is organized:**
- ✅ All MCPs in central registry (registry.modelcontextprotocol.io)
- ✅ Clear official vs community badges
- ✅ Download counts show popularity
- ✅ Correct install commands included
- ✅ AI can search and install directly
- ✅ One source of truth for all MCPs

**Finding MCPs is easy. Choosing the right one is obvious.**

---

## 🎯 Selection Syntax

NCP supports flexible selection formats:

```typescript
// Individual numbers
selection: "1,3,5"
→ Installs: #1, #3, #5

// Ranges
selection: "1-5"
→ Installs: #1, #2, #3, #4, #5

// Mixed
selection: "1,3,7-10"
→ Installs: #1, #3, #7, #8, #9, #10

// All results
selection: "*"
→ Installs: Everything shown

// Just one
selection: "1"
→ Installs: #1 only
```

**Natural syntax. No programming knowledge required.**

---

## 📊 Registry Metadata

What registry provides per MCP:

```typescript
{
  server: {
    name: "io.github.modelcontextprotocol/server-filesystem",
    description: "File system operations",
    version: "0.2.0",
    repository: {
      url: "https://github.com/modelcontextprotocol/servers",
      type: "git"
    },
    packages: [{
      identifier: "@modelcontextprotocol/server-filesystem",
      version: "0.2.0",
      runtimeHint: "npx",
      environmentVariables: [
        {
          name: "ROOT_PATH",
          description: "Root directory for file operations",
          isRequired: true
        }
      ]
    }]
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: "official"  // or "community"
    }
  }
}
```

**Registry tells NCP exactly how to install and configure each MCP.**

---

## 🔒 Security Considerations

**Q: Can malicious MCPs enter the registry?**

**A: Registry has curation process:**

1. **Official MCPs:** Maintained by Anthropic, fully vetted
2. **Community MCPs:** User-submitted, reviewed before listing
3. **Each MCP shows status:** Official vs Community badge visible
4. **Source code linked:** GitHub repo always shown
5. **Download counts:** Popular = more eyes = more security

**Best practices:**

- ✅ Prefer official MCPs when available
- ✅ Check GitHub repo before installing community MCPs
- ✅ Review source code if handling sensitive data
- ✅ Start with high-download-count MCPs (battle-tested)

**Registry doesn't execute code. It's a directory. You're still in control of what runs.**

---

## 📚 Deep Dive

Want the full technical implementation?

- **Registry Client:** [src/services/registry-client.ts]
- **Discovery Mode:** [src/internal-mcps/ncp-management.ts] (import tool)
- **Selection Parser:** [Parse selection format]
- **API Docs:** [https://registry.modelcontextprotocol.io/](https://registry.modelcontextprotocol.io/)

---

## 🔗 Complete the Journey

**[← Back to Story 1: Dream and Discover](01-dream-and-discover.md)**

You've now read all 6 core stories that make NCP special:

1. ✅ **Dream and Discover** - AI searches by intent, not by browsing tools
2. ✅ **Secrets in Plain Sight** - Clipboard handshake keeps credentials safe
3. ✅ **Sync and Forget** - Auto-imports Claude Desktop MCPs forever
4. ✅ **Double-Click Install** - .mcpb makes installation feel native
5. ✅ **Runtime Detective** - Adapts to your Node.js runtime automatically
6. ✅ **Official Registry** - Discovers 2,200+ MCPs through conversation

**Together, these stories explain why NCP transforms how you work with MCPs.**

---

## 💬 Questions?

**Q: How often is registry updated?**

A: Registry is live. New MCPs appear as soon as they're approved. NCP caches results for 5 minutes, then fetches fresh data.

**Q: Can I search for specific features?**

A: Yes! Try: "Find MCPs with email capabilities" or "Find MCPs for web scraping". Semantic search works across name + description.

**Q: What if registry is down?**

A: NCP falls back gracefully. You can still use existing MCPs and install new ones manually via `ncp add`.

**Q: Can I submit my MCP to registry?**

A: Yes! Visit [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/) for submission guidelines. (Process managed by Anthropic)

**Q: What about MCPs not in registry?**

A: You can still install them manually: `ncp add myserver npx my-custom-mcp`. Registry is for discovery convenience, not a requirement.

---

**[← Previous Story](05-runtime-detective.md)** | **[Back to Story Index](../README.md#the-six-stories)**

---

## 🎉 What's Next?

Now that you understand how NCP works through these six stories, you're ready to:

1. **[Install NCP →](../README.md#installation)** - Get started in 30 seconds
2. **[Try the examples →](../README.md#test-drive)** - See it in action
3. **[Read technical docs →](../technical/)** - Deep dive into implementation
4. **[Contribute →](../../CONTRIBUTING.md)** - Help make NCP even better

**Welcome to the NCP community!** 🚀
