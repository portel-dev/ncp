# NCP Brand Positioning & Logo Design Brief

## Brand Core

### Single-line promise
> "The only MCP orchestrator that turns 1,215+ servers from mysterious failures into production-ready tools"

### Three adjectives (current voice)
1. **Systematic** - Health monitors, CSV caching, error parsers—everything is methodical
2. **Pragmatic** - Solves real problems with data (12% failure rate), not hype
3. **Technical** - Speaks in protocols, types, and precise terminology

### Three off-limits
1. ~~Aspirational~~ - No "revolutionary" or "magical"
2. ~~Corporate~~ - No "synergy" or "leverage"
3. ~~Playful~~ - This is serious developer infrastructure

---

## Audience Clarity

### Primary buyer vs real user

**Buyer**: Tech leads/engineering managers scaling MCP adoption across teams
- **Success metric**: Reduced integration failures, fewer support tickets

**User**: Individual developers integrating MCPs into their workflow
- **Success metric**: Time to first successful connection, clarity when things break

### High-friction moment removed

That moment when `npx @modelcontextprotocol/server-filesystem` fails with `Connection closed -32000` and you have **NO IDEA** what configuration it needs. You're left reading READMEs, parsing stderr, and trial-and-error editing JSON files.

**NCP removes this by:** Detecting requirements automatically, prompting interactively, validating before connection.

---

## Positioning Edge

### Adjacent category refused
NCP deliberately **refuses to compete with MCP clients** (Claude Desktop, Cline, Cursor)

**Why:** NCP is the infrastructure/orchestration layer, not the end-user application. Think "npm for MCPs" not "VSCode for MCPs."

### What users hire instead
1. **Manual configuration** - Editing JSON files, trial-and-error
2. **Documentation hunting** - Reading scattered READMEs
3. **Error log forensics** - Parsing stderr to guess what went wrong

**Trade-offs they accept:** Hours wasted, frustration, giving up on MCPs entirely

---

## Proof and Credibility

### Two strongest proof points

1. **Quantitative:** "Analyzed 1,215 MCPs in the wild. Found 12% fail purely from configuration issues. NCP's error parser and repair system reduces this to near-zero."

2. **Narrative:** "When error parsing couldn't solve configuration detection completely, we didn't hack around it—we proposed an MCP spec extension (PR #1583) now under community review."

### Boldest opinion that filters the audience

> "MCP servers without configuration schemas are broken by design. If your server can't declare what it needs upfront, you're shipping developer hostility, not developer experience."

- **Ideal users nod:** Developers tired of cryptic `-32000` errors
- **Non-ideal users opt out:** MCP authors who don't care about DX

---

## Experience and Tone

### Workflow step to obsess over

**The first 60 seconds after `ncp add <server-name>`**

Either:
- ✅ It works immediately, or
- ✅ NCP explains EXACTLY what's missing and HOW to fix it

**Never:** "Check the docs", "Connection failed", "See logs"

### Minimum viable style guide

| Dimension | Rule |
|-----------|------|
| **Sentence length** | Short. Technical clarity > literary flourish. Max 20 words in docs. |
| **Metaphor use** | Sparingly, only when it clarifies. ✅ "CSV cache is a resume button" ❌ "NCP is your AI copilot" |
| **Technical-to-plain ratio** | **70/30** - Be precise about protocols/types/errors. Be plain about what to do next. |

---

## Logo Design Direction

Given this positioning, here's what the NCP logo should convey:

### Core concepts to visualize
1. **Orchestration** - Multiple things working in harmony
2. **Clarity from chaos** - Turning 1,215 unknowns into knowns
3. **Infrastructure** - Foundation layer, not end-user app
4. **Reliability** - Health monitoring, systematic approach

### Visual language
- **Clean, technical** - Not playful or abstract
- **Structured** - Grid-based, systematic feel
- **Confident** - Bold, not tentative
- **Developer-first** - CLI aesthetic, monospace-friendly

### Avoid
- Cutesy mascots
- Gradient explosions
- "AI brain" clichés
- Soft, rounded "friendly" shapes

### Consider
- Network topology (nodes connecting)
- Health monitor pulse/heartbeat
- Organized grid becoming orderly from chaos
- Terminal/CLI inspired elements
- Hexagonal patterns (like npm, but distinct)
- Monospace letterforms
- Circuit board aesthetics
- Status indicators (health monitoring visual metaphor)

---

## Logo Concept Ideas

### Concept 1: "Context Network"
A clean, geometric representation of interconnected nodes forming the letters "NCP" or a unified symbol. Shows orchestration and reliability.

**Visual elements:**
- 3-5 circular nodes connected by clean lines
- One central node (the orchestrator)
- Green/blue color scheme suggesting "healthy" status
- Minimal, technical feel

### Concept 2: "Health Pulse"
Typography-focused with a subtle pulse/heartbeat integrated into the letterforms, representing NCP's health monitoring core.

**Visual elements:**
- Bold, monospace-inspired "NCP" wordmark
- Subtle heartbeat/EKG line running through or below
- Single accent color for the pulse
- Clean, systematic grid alignment

### Concept 3: "Orchestration Grid"
A geometric abstraction showing chaos (scattered elements) transforming into order (aligned grid), representing NCP's core value.

**Visual elements:**
- Left side: scattered dots/elements
- Right side: organized grid pattern
- Arrow or flow indicating transformation
- Monochromatic with single accent color

### Concept 4: "Protocol Bridge"
A simplified bridge or connector symbol representing NCP as infrastructure that reliably connects MCPs to applications.

**Visual elements:**
- Clean geometric bridge/connector shape
- Terminal-inspired aesthetic
- Could work as standalone icon or integrated with wordmark
- Emphasis on structure and stability

---

## Color Palette Suggestions

### Primary Options

**Option 1: Terminal Classic**
- Primary: `#00FF41` (Matrix green)
- Background: `#0D1117` (GitHub dark)
- Text: `#C9D1D9` (Terminal gray)
- Accent: `#58A6FF` (Info blue)

**Option 2: Health Monitor**
- Primary: `#22C55E` (Success green)
- Secondary: `#3B82F6` (System blue)
- Warning: `#F59E0B` (Alert orange)
- Background: `#1E293B` (Slate dark)

**Option 3: Infrastructure Neutral**
- Primary: `#64748B` (Slate medium)
- Accent: `#06B6D4` (Cyan)
- Text: `#F1F5F9` (Slate light)
- Background: `#0F172A` (Slate darkest)

---

## Typography Recommendations

### Wordmark
- **Primary choice**: JetBrains Mono (monospace, developer-friendly, clean)
- **Alternative**: IBM Plex Mono (more geometric, slightly friendlier)
- **Bold or Medium weight** for logo
- **ALL CAPS** for authority: "NCP"

### Tagline (if needed)
- **Primary**: Inter or SF Pro (clean sans-serif)
- **Regular or Medium weight**
- **Sentence case**: "Natural Context Provider" or descriptive tagline

---

## File Deliverables Needed

- [ ] Logo primary (full color)
- [ ] Logo monochrome (for terminal use)
- [ ] Logo icon only (square, for avatars)
- [ ] Logo with wordmark
- [ ] Logo reversed (light on dark)
- [ ] Favicon (16x16, 32x32, 64x64)
- [ ] Social media assets (GitHub org avatar, Twitter header)
- [ ] NPM package icon

---

## Usage Guidelines (Brief)

### DO
- Use on dark backgrounds primarily (CLI context)
- Maintain clear space around logo (minimum 2x height)
- Use monochrome version in terminal output
- Scale proportionally

### DON'T
- Add effects (shadows, glows, gradients within logo)
- Rotate or distort
- Change colors arbitrarily
- Place on busy backgrounds

---

## Next Steps

1. Choose 1-2 logo concepts to develop
2. Create rough sketches/mockups
3. Test in context (GitHub repo, npm package, terminal)
4. Refine chosen direction
5. Generate all file formats
6. Update package.json, README, and documentation
