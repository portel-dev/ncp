# Story-Driven Documentation Strategy

## 🎯 **Core Principle**

**Stories explain WHY → HOW → WHAT** (not the other way around)

Each feature becomes a narrative that:
1. **Starts with pain** (relatable problem)
2. **Shows the journey** (how we solve it)
3. **Delivers benefits** (why it matters)
4. **Optionally dives deep** (technical details for curious readers)

---

## 📚 **The Six Core Stories**

### **Story 1: The Dream-and-Discover Story** 🌟
*Why AI doesn't see your tools upfront*

**The Pain:**
Your AI is drowning in 50+ tool schemas. It reads them all, gets confused, picks the wrong one, and wastes your time.

**The Journey:**
Instead of showing all tools at once, NCP lets your AI **dream** of the perfect tool. It describes what it needs in plain language. NCP's semantic search finds the exact tool that matches that dream.

**The Magic:**
- **AI thinks clearly** - No cognitive overload from 50 schemas
- **Computer stays cool** - MCPs load on-demand, not all at once
- **You save money** - 97% fewer tokens burned on tool schemas
- **Work flows faster** - Sub-second tool discovery vs 8-second analysis

**Technical Deep-Dive:** [Link to semantic search implementation]

---

### **Story 2: The Secrets-in-Plain-Sight Story** 🔐
*How your API keys stay invisible to AI*

**The Pain:**
"Add GitHub MCP with token ghp_abc123..." → Your secret just entered the AI chat. It's in logs. It's in training data. It's everywhere.

**The Journey:**
NCP uses a **clipboard handshake**:
1. AI shows you a prompt: "Copy your config to clipboard BEFORE clicking YES"
2. You copy `{"env":{"TOKEN":"secret"}}`
3. You click YES
4. NCP reads clipboard *server-side*
5. AI sees: "MCP added with credentials" (NOT your token!)

**The Magic:**
- **AI never sees secrets** - Not in chat, not in logs, not anywhere
- **You stay in control** - Explicit consent, you know what happens
- **Audit trail clean** - "YES" is logged, tokens aren't

**How It Works:** Clipboard is read server-side (in NCP's process), never sent to AI. The AI conversation only contains the approval ("YES"), not the secrets.

**Technical Deep-Dive:** [Link to clipboard security pattern]

---

### **Story 3: The Sync-and-Forget Story** 🔄
*Why you never configure the same MCP twice*

**The Pain:**
You added 10 MCPs to Claude Desktop. Now you want them in NCP. Do you configure everything again? Copy-paste 10 configs? 😫

**The Journey:**
NCP auto-syncs from Claude Desktop **on every startup**:
- Reads your `claude_desktop_config.json`
- Detects all .mcpb extensions
- Imports everything into your chosen NCP profile
- Stays in sync forever (re-checks on each boot)

**The Magic:**
- **Zero manual work** - Add MCP to Claude Desktop → NCP gets it automatically
- **Always in sync** - Install new .mcpb → NCP detects it on next startup
- **One source of truth** - Configure in Claude Desktop, NCP follows

**Why Continuous?** Because users install new MCPs frequently. One-time import would drift out of sync. Continuous sync means NCP always has your latest setup.

**Technical Deep-Dive:** [Link to client-importer and auto-sync implementation]

---

### **Story 4: The Double-Click-Install Story** 📦
*Why installing NCP feels like installing an app*

**The Pain:**
Installing MCPs usually means: read docs → install npm package → edit JSON → restart client → pray it works. Too many steps!

**The Journey:**
1. Download `ncp.mcpb` from releases
2. Double-click it
3. Claude Desktop prompts: "Install NCP extension?"
4. Click "Install"
5. Done. All your MCPs are now unified.

**The Magic:**
- **Feels native** - Just like installing a regular app
- **Zero terminal commands** - No npm, no config editing
- **Auto-imports MCPs** - Syncs from Claude Desktop instantly
- **Optional CLI** - Can enable global `ncp` command if you want it

**What's .mcpb?** Claude Desktop's native extension format. It's a bundled MCP with manifest, pre-built code, and optional user configuration UI.

**Technical Deep-Dive:** [Link to .mcpb architecture and bundling]

---

### **Story 5: The Runtime-Detective Story** 🕵️
*How NCP knows which Node.js to use*

**The Pain:**
Claude Desktop ships its own Node.js. System has a different Node.js. Which one should .mcpb extensions use? Get it wrong → extensions break.

**The Journey:**
NCP detects runtime **dynamically on every boot**:
- Checks `process.execPath` (how NCP itself was launched)
- If launched via Claude's bundled Node → uses that for extensions
- If launched via system Node → uses system runtime
- If user toggles "Use Built-in Node.js for MCP" → adapts automatically

**The Magic:**
- **Zero config** - No manual runtime selection needed
- **Adapts instantly** - Toggle setting → NCP respects it on next boot
- **Extensions work** - Always use correct Node.js/Python
- **Debug-friendly** - Logs show which runtime was detected

**Why Dynamic?** Users toggle settings frequently. Static detection (at install time) would lock you into one runtime. Dynamic detection (at boot time) respects changes immediately.

**Technical Deep-Dive:** [Link to runtime-detector.ts]

---

### **Story 6: The Official-Registry Story** 🌐
*How AI discovers 2,200+ MCPs without you*

**The Pain:**
You: "I need a database MCP"
Old way: Open browser → Search → Find npm package → Copy install command → Configure manually

**The Journey:**
With NCP + Registry integration:
1. You: "Find database MCPs"
2. AI searches official MCP Registry
3. Shows numbered list: "1. PostgreSQL ⭐ 2. MongoDB 📦 3. Redis..."
4. You: "Install 1 and 3"
5. AI imports them with correct commands
6. Done!

**The Magic:**
- **AI browses for you** - Searches 2,200+ MCPs from registry.modelcontextprotocol.io
- **Shows what matters** - Name, description, download count, official status
- **Batch install** - Pick multiple, import all at once
- **Correct config** - Registry knows the right command + args

**What's the Registry?** Anthropic's official MCP directory. It's the npm registry for MCPs - central source of truth for discovery.

**Technical Deep-Dive:** [Link to registry-client.ts and discovery flow]

---

## 🏗️ **How to Structure Documentation**

### **1. User-Facing Docs (README.md)**

```markdown
# NCP - Your AI's Personal Assistant

[Open with Story 1 - Dream and Discover]

## The Six Stories That Make NCP Different

1. 🌟 Dream and Discover - [2 min read]
2. 🔐 Secrets in Plain Sight - [2 min read]
3. 🔄 Sync and Forget - [2 min read]
4. 📦 Double-Click Install - [2 min read]
5. 🕵️ Runtime Detective - [2 min read]
6. 🌐 Official Registry - [2 min read]

## Quick Start
[Installation + verification in 3 steps]

## Need More?
- 📖 Technical Details → [ARCHITECTURE.md]
- 🐛 Troubleshooting → [TROUBLESHOOTING.md]
- 🤝 Contributing → [CONTRIBUTING.md]
```

### **2. Story Pages (docs/stories/)**

Each story gets its own page:
- `docs/stories/01-dream-and-discover.md`
- `docs/stories/02-secrets-in-plain-sight.md`
- `docs/stories/03-sync-and-forget.md`
- `docs/stories/04-double-click-install.md`
- `docs/stories/05-runtime-detective.md`
- `docs/stories/06-official-registry.md`

**Format:**
```markdown
# Story Name

## The Pain [30 seconds]
Describe the problem in human terms

## The Journey [1 minute]
Show how NCP solves it (story format)

## The Magic [30 seconds]
Bullet points - benefits in plain language

## How It Works [optional, 2 minutes]
Light technical explanation for curious readers

## Deep Dive [link]
Link to technical implementation docs
```

### **3. Technical Docs (docs/technical/)**

For developers who want implementation details:
- `docs/technical/semantic-search.md`
- `docs/technical/clipboard-security.md`
- `docs/technical/auto-import.md`
- `docs/technical/mcpb-bundling.md`
- `docs/technical/runtime-detection.md`
- `docs/technical/registry-integration.md`

---

## 🎨 **Writing Guidelines**

### **DO:**
- ✅ Start with pain (make it relatable)
- ✅ Use analogies (child with toys, buffet vs pizza)
- ✅ Show cause-effect ("By doing X, you get Y")
- ✅ Keep paragraphs short (2-3 sentences max)
- ✅ Use active voice ("NCP detects" not "is detected by")
- ✅ Add emojis for visual anchors (🎯 🔐 🔄)

### **DON'T:**
- ❌ Lead with implementation ("NCP uses vector embeddings...")
- ❌ Use jargon without context ("FAISS indexing with cosine similarity")
- ❌ Write walls of text (break it up!)
- ❌ Assume technical knowledge (explain like reader is smart but new)

---

## 📊 **Story Quality Checklist**

Before publishing a story, verify:

- [ ] **Pain is relatable** - Reader nods "yes, I've felt that"
- [ ] **Journey is clear** - Non-technical person understands flow
- [ ] **Benefits are tangible** - "Saves money" "Works faster" not "Better architecture"
- [ ] **Technical truth** - Accurate, not oversimplified to wrongness
- [ ] **Reading time realistic** - Can actually read in stated time
- [ ] **One core idea** - Story focuses on ONE thing, not three

---

## 🚀 **Migration Plan**

### **Phase 1: Create Story Pages**
1. Write 6 story markdown files in `docs/stories/`
2. Keep existing README for now
3. Get feedback on story quality

### **Phase 2: Restructure README**
1. Open with strongest story (Dream and Discover)
2. Add story index with reading times
3. Move installation to "Quick Start" section
4. Link to stories + technical docs

### **Phase 3: Update Technical Docs**
1. Move implementation details to `docs/technical/`
2. Keep COMPLETE-IMPLEMENTATION-SUMMARY.md for internal reference
3. Create ARCHITECTURE.md that links stories → technical details

### **Phase 4: Add Story Navigation**
1. Add "Next Story" links between stories
2. Create visual story map (flowchart showing connections)
3. Add "Story Index" page

---

## 💡 **Example: Before/After**

### **Before (Feature-First):**
```
## Semantic Search

NCP uses FAISS vector similarity search with OpenAI text-embedding-3-small
to match user queries against tool descriptions. The similarity threshold
is 0.3 with cosine distance metric.
```

### **After (Story-First):**
```
## Dream and Discover

Instead of showing your AI 50+ tools upfront, NCP lets it dream:

"I need something that can read files..."

NCP's semantic search understands the *intent* and finds the perfect tool
in milliseconds. No cognitive overload. No wrong tool selection. Just
instant discovery.

*Curious how semantic search works? [Read the technical details →]*
```

---

## 🎯 **Success Metrics**

A story is successful when:

1. **Non-technical person understands benefit** in 2 minutes
2. **Technical person finds depth** if they want it
3. **User can explain to colleague** what NCP does
4. **Feature becomes memorable** ("Oh, the clipboard handshake!")

---

## 📝 **Next Steps**

1. ✅ Review this strategy document
2. ⏳ Write first story (Dream and Discover) as example
3. ⏳ Get feedback and iterate
4. ⏳ Write remaining 5 stories
5. ⏳ Restructure README with story-first approach
6. ⏳ Migrate technical details to separate docs

---

**The goal: Anyone can understand what NCP does and why it matters - in 10 minutes, without a CS degree.** 🎉
