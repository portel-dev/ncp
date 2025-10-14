# Story-First Development Workflow

**How we build features at NCP: Story → Discussion → Code**

---

## 🎯 **Core Principle**

> "If you can't explain the feature as a story, you don't understand it well enough to build it."

Every feature must answer three questions:
1. **What pain does this solve?** (The Problem)
2. **How does NCP solve it?** (The Journey)
3. **Why does it matter?** (The Magic)

If you can't answer these clearly, the feature isn't ready.

---

## 📋 **The Complete Workflow**

### **Phase 1: Capture the Vision as a Story** ⏱️ 1-2 hours

1. **Open the template:** `.github/FEATURE_STORY_TEMPLATE.md`
2. **Fill in the story:**
   - Start with "The Pain" (the user's frustration)
   - Show "The Journey" (how NCP solves it)
   - List "The Magic" (tangible benefits)
   - Add technical details only if helpful
3. **Be specific:** Use real examples, not abstractions
4. **Be honest:** If pain isn't compelling, feature probably isn't needed

**Deliverable:** Draft story in `docs/stories/drafts/[feature-name].md`

---

### **Phase 2: Team Discussion** ⏱️ 30 minutes

1. **Share the story** in GitHub Discussion or team meeting
2. **Ask questions:**
   - Is the pain real? Have we experienced it?
   - Does the solution match the pain? Or is it over-engineered?
   - Are benefits tangible? Can we measure them?
   - What's missing from the story?
3. **Iterate:** Revise story based on feedback
4. **Make decision:**
   - ✅ Approved → Move to Phase 3
   - 🔄 Revise → Back to Phase 1
   - 📅 Deferred → Add to backlog with reason
   - ❌ Rejected → Document why (prevent rehashing later)

**Deliverable:** Approved story with decision notes

---

### **Phase 3: Story Becomes Spec** ⏱️ 30 minutes

1. **Extract requirements from story:**
   - "The Pain" → Tells you what to fix
   - "The Journey" → Tells you user flow
   - "The Magic" → Tells you success criteria
   - "What to Avoid" → Tells you scope boundaries
2. **Write test cases from story scenarios:**
   - Before/after examples become tests
   - "See It Yourself" section becomes integration test
3. **Define APIs from story language:**
   - Story says "check MCP health" → `ncp health` command
   - Story says "show broken MCPs" → `status: 'failed'` in output

**Deliverable:** Test plan + API design derived from story

---

### **Phase 4: Build Guided by Story** ⏱️ Hours to days

1. **Refer to story constantly:**
   - Does this code solve the pain in the story?
   - Does this match the journey described?
   - Are we delivering the magic promised?
2. **Stop when story is satisfied:**
   - Don't add features not in story
   - Don't over-engineer beyond story needs
   - Ship minimum lovable feature
3. **Update story if needed:**
   - If implementation reveals better approach, update story first
   - Don't let code drift from story

**Deliverable:** Working code that fulfills story

---

### **Phase 5: Story IS the Documentation** ⏱️ 15 minutes

1. **Move story from drafts to published:**
   - `docs/stories/drafts/feature.md` → `docs/stories/XX-feature.md`
2. **Update README to reference story:**
   - Add to story index
   - Link from relevant sections
3. **Write release notes from story:**
   - Use story's pain/magic sections
   - Keep it compelling

**Deliverable:** Published story + updated README

---

### **Phase 6: Story IS the Marketing** ⏱️ 15 minutes

1. **Extract marketing copy from story:**
   - Tweet: Pain + Magic in 280 chars
   - Blog post: Full story with screenshots
   - Release notes: Journey + Magic
2. **Share story link:**
   - "Read the full story: docs/stories/XX-feature.md"
3. **Use story language everywhere:**
   - Support docs
   - Help text
   - Error messages

**Deliverable:** Marketing materials derived from story

---

## ✅ **Quality Checklist**

Before moving to next phase, verify:

### **Story Quality:**
- [ ] Pain is relatable (I've felt this frustration)
- [ ] Journey is clear (non-technical person understands)
- [ ] Benefits are tangible (numbers, not vague claims)
- [ ] Language is simple (no jargon without explanation)
- [ ] Story is memorable (has an "aha!" moment)

### **Technical Quality:**
- [ ] Code fulfills story promise
- [ ] Tests based on story scenarios pass
- [ ] Performance matches story claims (if specified)
- [ ] Error messages use story language
- [ ] Help text references story

### **Documentation Quality:**
- [ ] Story published in `docs/stories/`
- [ ] README links to story
- [ ] Examples match story
- [ ] Screenshots show story journey

---

## 🚫 **Anti-Patterns to Avoid**

### **❌ Building First, Story Later**

**Wrong:**
```
Dev: "I built MCP versioning!"
PM: "Cool, but why?"
Dev: "Uh... it seemed useful?"
```

**Right:**
```
Dev: "Here's the story for MCP versioning..."
PM: "The pain isn't compelling. Let's skip it."
[Saves weeks of wasted work]
```

### **❌ Vague Story Language**

**Wrong:**
> "NCP improves MCP management with enhanced monitoring capabilities."

**Right:**
> "Your MCPs break silently. NCP's dashboard shows what's broken in one glance. Debug time: 20 min → 30 sec."

### **❌ Story Drift**

**Wrong:**
```
Story says: "Show MCP health status"
Code adds: Real-time graphs, email alerts, CSV export, historical data
[Scope explosion]
```

**Right:**
```
Story says: "Show MCP health status"
Code adds: Status list with colors
[Ships fast, matches story]
```

### **❌ Implementation Details in Story**

**Wrong:**
> "Uses Promise.all with AbortController for timeout handling..."

**Right:**
> "Checks each MCP in parallel, waits max 5 seconds per check."

---

## 📊 **Success Metrics**

You know story-first development is working when:

✅ **Features ship faster** (no scope creep, clear requirements)
✅ **Users understand benefits** (story makes value clear)
✅ **Documentation writes itself** (story is the docs)
✅ **Team alignment** (everyone understands "why")
✅ **Marketing is easy** (story gives you the words)
✅ **Less waste** (bad ideas rejected as stories, not built as code)

---

## 🎨 **Examples**

### **Example 1: Health Dashboard**

**Story:**
```markdown
## The Pain
MCPs break silently. You waste 20 min debugging every time.

## The Journey
Open dashboard. See:
- 🟢 filesystem: Healthy
- 🔴 github: FAILED (token expired)
Fix in 30 seconds.

## The Magic
- Debug time: 20 min → 30 sec
- Find failures before AI hits them
```

**What this told us:**
- ✅ Build: Status display with colors
- ✅ Build: Error detail view
- ❌ Skip: Historical graphs (not in story)
- ❌ Skip: Email alerts (different feature)

**Result:** Shipped in 2 days, exactly matches story promise.

---

### **Example 2: Clipboard Security**

**Story:**
```markdown
## The Pain
User: "Add GitHub with token ghp_123..."
[Secret now in AI chat, logs, training data]

## The Journey
1. AI shows: "Copy config to clipboard BEFORE clicking YES"
2. User copies: {"env":{"TOKEN":"secret"}}
3. User clicks YES
4. NCP reads clipboard (server-side)
5. AI never sees secret

## The Magic
- Secrets stay secret (not in chat/logs)
- Still convenient (no manual JSON editing)
```

**What this told us:**
- ✅ Build: Prompt with clipboard instructions
- ✅ Build: Server-side clipboard read
- ✅ Build: Merge clipboard config with base config
- ❌ Skip: Encrypted storage (not in story)
- ❌ Skip: Password manager integration (nice-to-have)

**Result:** Secure, simple, exactly what story promised.

---

## 🔗 **Resources**

- **Template:** `.github/FEATURE_STORY_TEMPLATE.md`
- **Examples:** `docs/stories/01-dream-and-discover.md`
- **Strategy:** `STORY-DRIVEN-DOCUMENTATION.md`

---

## 💬 **FAQs**

**Q: What if feature is too technical for a story?**

A: If you can't explain it to a non-technical user, maybe it's infrastructure (not a feature). Internal refactors don't need stories. User-facing features do.

**Q: Do bug fixes need stories?**

A: Small bugs: No. Major bugs affecting UX: Yes! Example: "Users lose data when NCP crashes" → Story about auto-save.

**Q: What if story changes during implementation?**

A: Update the story! If you discover better approach, revise story first, then build. Keep story and code in sync.

**Q: How long should stories be?**

A: 2-3 minutes reading time. If longer, you're probably describing multiple features. Split into separate stories.

**Q: Can we skip story for small features?**

A: Define "small". If it's user-facing and changes behavior, write the story. It takes 30 minutes and prevents miscommunication.

---

## 🎉 **The Promise**

**Follow this workflow, and you get:**

1. ✅ Features users actually want (pain validated upfront)
2. ✅ Clear requirements (story is the spec)
3. ✅ Great documentation (story is the docs)
4. ✅ Compelling marketing (story is the pitch)
5. ✅ Team alignment (everyone reads story)
6. ✅ Less waste (bad ideas rejected early)

**All from one effort: writing the story.**

---

**Story-first development: The most efficient way to build features users love.** 🚀
