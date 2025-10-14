# Feature Story Template

**Use this template to propose new features for NCP.**

Every feature should tell a story BEFORE any code is written. This ensures we're solving real problems and can explain the value clearly.

---

## 📝 **Basic Info**

**Feature Name:** [Short, memorable name]

**Story Number:** [If part of existing story arc, reference parent story]

**Status:** 🟡 Proposed | 🔵 Approved | 🟢 Implemented | 🔴 Rejected

**Proposed By:** [Your name]

**Date:** [YYYY-MM-DD]

---

## 😫 **The Pain** (30 seconds)

**What problem are users experiencing TODAY?**

Write this as if you're the user describing frustration to a friend:
- What's broken or annoying?
- What workaround are they using now?
- How often does this happen?
- What's the cost (time, money, frustration)?

**Good Example:**
> "My MCPs break silently. GitHub MCP lost connection 2 hours ago. My AI keeps trying to use it, gets errors, and I waste 20 minutes debugging every time this happens."

**Bad Example:**
> "There's no health monitoring system for MCP servers."
> (Too technical, doesn't convey user pain)

---

## 💭 **The Journey** (1 minute)

**How does NCP solve this problem?**

Walk through the user experience step-by-step:
- What does user do?
- What does NCP do?
- What does user see/feel?
- What's the "aha!" moment?

Use concrete examples, not abstractions.

**Good Example:**
> "You open NCP dashboard. Immediately see:
> - 🟢 filesystem: Healthy (12 calls today)
> - 🟡 github: Slow (avg 800ms)
> - 🔴 database: FAILED (timeout)
>
> One glance, you know database is broken. Click it, see error details, fix the connection string. Done in 30 seconds instead of 20 minutes."

**Bad Example:**
> "NCP implements a health checking system that monitors MCP availability."
> (Describes implementation, not user experience)

---

## ✨ **The Magic** (30 seconds)

**What benefits does user get?**

List tangible outcomes using bullet points:
- Time saved
- Money saved
- Frustration avoided
- New capabilities unlocked

Be specific! "Faster" is vague, "5x faster" is specific.

**Good Example:**
- ⏱️ Debug time: 20 minutes → 30 seconds
- 🎯 Find broken MCPs before AI hits them
- 🧹 See unused MCPs, remove to save memory
- 📊 Usage stats show which MCPs matter

**Bad Example:**
- Better system reliability
- Improved user experience
(Vague corporate speak)

---

## 🔍 **How It Works** (1 minute - OPTIONAL)

**Light technical explanation for curious readers.**

This section is OPTIONAL. Only include if:
- Technical approach is interesting/novel
- Users might want to understand internals
- Implementation affects user experience

Keep it accessible - explain like teaching a smart friend, not writing a CS paper.

**Good Example:**
> "Dashboard checks MCP health on-demand (when you open it). Sends ping to each MCP, measures response time. Caches results for 30 seconds so repeated opens are instant. No background polling (saves battery)."

**Bad Example:**
> "Implements asynchronous health check workers using Promise.all with timeout handling via AbortController and response time measurement via performance.now()."
> (Too much implementation detail)

---

## 🎨 **The Analogy** (OPTIONAL)

**Compare to something everyone knows.**

Sometimes an analogy makes the feature click instantly:

**Good Example:**
> "MCP Health Dashboard is like your car's dashboard. Glance at gauges, immediately know what's wrong. No need to lift the hood every time."

**Bad Example:**
> "It's like a monitoring system for distributed systems."
> (Doesn't help non-technical users)

---

## 🧪 **See It Yourself** (1 minute - OPTIONAL)

**Show before/after comparison.**

Help reader visualize the difference:

**Good Example:**
```
Before NCP Health Dashboard:
→ AI: "Error accessing GitHub"
→ You: "Ugh, which MCP broke NOW?"
→ You: [20 min debugging]
→ You: "Oh, GitHub token expired"

After NCP Health Dashboard:
→ You: [Opens dashboard]
→ Dashboard: 🔴 github: AUTH_FAILED (token expired)
→ You: [Updates token]
→ Done in 30 seconds
```

---

## 🚧 **What to Avoid**

**What should we NOT include?**

Define boundaries to prevent scope creep:

**Good Example:**
- ❌ Don't add historical graphs (nice-to-have, adds complexity)
- ❌ Don't add email alerts (different feature, separate story)
- ❌ Don't auto-fix failures (dangerous, user should control)
- ✅ DO show current status (core need)
- ✅ DO show error messages (helps debugging)

---

## 📊 **Success Metrics**

**How do we know this feature succeeded?**

Define measurable outcomes:

**Good Example:**
- 80% of users with broken MCPs find them within 1 minute
- Average debugging time drops from 20 min → 2 min
- Users report 5/5 satisfaction with dashboard clarity

**Bad Example:**
- Better health monitoring
- Improved reliability
(Not measurable)

---

## 🔗 **Related Stories**

**What other features connect to this?**

List related stories or features:
- Story that motivates this one
- Stories this enables
- Stories this conflicts with

**Example:**
- 🔗 Story 5: Runtime Detective (health check needs runtime info)
- 🔗 Future: Auto-healing (dashboard enables this)
- ⚠️ Conflicts with: Always-on background monitoring (different approach)

---

## 💬 **Open Questions**

**What needs discussion before building?**

List unknowns or decisions needed:

**Example:**
- Should health check be automatic on MCP start, or on-demand?
- How to handle MCPs that are slow to respond (timeout vs wait)?
- Should dashboard show usage stats (call count) or just health?

---

## 🎯 **Decision**

**[To be filled by team after discussion]**

- [ ] ✅ **Approved** - Build this
- [ ] 🔄 **Revise** - Needs changes (specify what)
- [ ] 📅 **Deferred** - Good idea, wrong time (revisit when?)
- [ ] ❌ **Rejected** - Doesn't fit NCP's vision (why?)

**Decision Notes:**
[Team discussion summary and reasoning]

---

## 📚 **Implementation Checklist** (After Approval)

- [ ] Create story document in `docs/stories/`
- [ ] Write tests based on story scenarios
- [ ] Implement feature (guided by story)
- [ ] Update README to reference story
- [ ] Add CLI help text using story language
- [ ] Create example/demo from story
- [ ] Write release notes using story format

---

## 🎉 **Example: A Complete Story**

See `docs/stories/01-dream-and-discover.md` for a fully realized story.

Key elements:
- Clear pain point anyone can relate to
- Step-by-step journey through solution
- Tangible benefits (numbers!)
- Optional technical depth
- Memorable analogy
- Before/after comparison

---

**Remember: If you can't write the story, you don't understand the feature yet.** ✨
