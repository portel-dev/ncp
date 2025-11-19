# Anthropic Agent Skills Implementation - Issues Found

## 🔴 Critical Issues

### **1. Format Mismatch (CRITICAL BUG)**

**Problem**: Two conflicting skill formats in the codebase.

**Current State**:
```
SkillsMarketplaceClient (CORRECT):
- Downloads: SKILL.md files from anthropics/skills
- Saves to: ~/.ncp/skills/<skill-name>/SKILL.md
- Format: Anthropic's official format ✅

SkillsManager (INCORRECT):
- Expects: *.zip files with skill.json
- Looks for: ~/.ncp/skills/*.zip
- Format: Custom ZIP format (doesn't exist) ❌
```

**Result**: **Skills are downloaded but never loaded!**

**Evidence**:
```typescript
// skills-marketplace-client.ts:289 - Downloads SKILL.md
const skillFile = path.join(skillDir, 'SKILL.md');
await fs.writeFile(skillFile, content, 'utf-8');

// skills-manager.ts:60-61 - Looks for *.zip
const files = await fs.readdir(this.skillsDir);
const zipFiles = files.filter(f => f.endsWith('.zip'));  // ❌ WRONG!
```

---

### **2. Wrong Tool Schema Mapping**

**Problem**: Orchestrator integration assumes wrong data structure.

**Current Code** (ncp-orchestrator.ts:1059-1063):
```typescript
tools: skill.metadata.tools.map((tool: any) => ({
  name: tool.name,              // ❌ tool is a string, not object!
  description: tool.description, // ❌ doesn't exist
  inputSchema: tool.inputSchema  // ❌ doesn't exist
}))
```

**Actual SKILL.md YAML format**:
```yaml
---
name: canvas-design
description: Create and manipulate HTML canvas designs
tools:
  - create_canvas    # ← Just strings, not objects!
  - draw_shape
  - export_design
---
```

**What happens**:
- Runtime error: `Cannot read property 'name' of undefined`
- Skills fail to register as tools

---

### **3. Wrong Execution Model**

**Problem**: SkillsManager tries to execute skills as code.

**Current Implementation**:
```typescript
// skills-manager.ts:125-146
async executeSkillTool(skillName: string, toolName: string, params: any): Promise<any> {
  // Load and execute handler
  const handlerPath = path.join(skill.extractedPath, tool.handler);
  const handler = await import(handlerPath);  // ❌ Skills aren't code!
  return await handler.default(params);
}
```

**Reality**: Anthropic skills are **prompts/instructions**, not executable code. They enhance Claude's capabilities through context, not through running JavaScript.

---

## ✅ What's Implemented Correctly

1. **SkillsMarketplaceClient** (`src/services/skills-marketplace-client.ts`)
   - ✅ Fetches from official anthropics/skills repo
   - ✅ Parses SKILL.md YAML frontmatter correctly
   - ✅ Installs to ~/.ncp/skills/<name>/SKILL.md

2. **SkillsManagementMCP** (`src/internal-mcps/skills.ts`)
   - ✅ Provides tools: `skills:add`, `skills:list`, `skills:remove`
   - ✅ Uses SkillsMarketplaceClient (which is correct)

3. **Infrastructure**
   - ✅ Integration hooks in orchestrator (lines 1040-1092)
   - ✅ Directory structure created (`~/.ncp/skills/`)

---

## 🔧 How to Fix

### **Fix 1: Replace SkillsManager**

Replace `src/services/skills-manager.ts` with `src/services/skills-manager-fixed.ts`:

**Key changes**:
```typescript
// OLD (wrong):
const zipFiles = files.filter(f => f.endsWith('.zip'));

// NEW (correct):
const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
const skillDirs = entries.filter(e => e.isDirectory());
// Then load SKILL.md from each directory
```

**File already created**: `src/services/skills-manager-fixed.ts` ✅

---

### **Fix 2: Update Orchestrator Integration**

**Current (broken)**:
```typescript
tools: skill.metadata.tools.map((tool: any) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema
}))
```

**Fixed**:
```typescript
// Anthropic skills don't provide executable tools
// They're prompts that enhance Claude's context
// Don't add to definitions as MCP tools

// Instead, make skill content available to Code-Mode
// or inject into system prompts
```

---

### **Fix 3: Proper Skill Integration**

Anthropic skills work differently than MCPs:

**How They Should Work**:
1. Skills are loaded from SKILL.md files
2. Skill content is **injected into Claude's context**
3. Claude gains new capabilities through **prompting**, not code execution
4. Skills are **documentation/instructions**, not tools

**Proper Integration**:
```typescript
// Load skills for reference, not execution
const skills = await this.skillsManager.loadAllSkills();

// Make skill content available to Code-Mode
for (const skill of skills) {
  // Store skill prompts for context injection
  this.skillPrompts.set(skill.metadata.name, skill.content);
}

// When Claude Code needs a skill:
// → Inject the SKILL.md content into the prompt
// → Claude follows the instructions in the skill
// → No code execution needed
```

---

## 📝 Testing the Fix

### **Before Fix**:
```bash
$ ncp skills:add canvas-design
✅ Installed: ~/.ncp/skills/canvas-design/SKILL.md

$ ncp skills:list
(Shows canvas-design)

$ ncp find
(canvas-design tools NOT shown - never loaded!)
```

### **After Fix**:
```bash
$ ncp skills:add canvas-design
✅ Installed: ~/.ncp/skills/canvas-design/SKILL.md

$ ncp skills:list
(Shows canvas-design)

$ ncp find
(Skills available in context, not as direct tools)
```

---

## 🎯 Recommended Actions

### **Immediate (Critical)**:
1. ✅ Replace skills-manager.ts with skills-manager-fixed.ts
2. Update orchestrator integration to handle SKILL.md format
3. Remove tool execution logic (skills aren't code)
4. Test with real Anthropic skill from marketplace

### **Short-term**:
1. Document how skills integrate with Code-Mode
2. Add skill content injection to prompts
3. Update skills:list to show proper status
4. Add integration tests

### **Long-term**:
1. Consider full Claude Code plugin integration
2. Support skill dependencies
3. Skill version management
4. Skill marketplace UI

---

## 📊 Impact Assessment

**Severity**: 🔴 **CRITICAL**

**User Impact**:
- ❌ Skills feature completely broken
- ❌ Skills downloaded but never loaded
- ❌ Runtime errors when trying to use skills
- ❌ Misleading success messages

**Business Impact**:
- ❌ Advertised feature doesn't work
- ❌ Incompatible with Anthropic's official skills
- ❌ Users cannot use Claude Code skills ecosystem

**Technical Debt**:
- Medium (wrong abstraction, needs rewrite)
- Well-isolated (only affects skills subsystem)
- Clear fix path (replace one file, update integration)

---

## 💡 Key Insight

**The fundamental misunderstanding**:
- Skills were implemented as if they were **executable MCPs**
- But Anthropic skills are actually **prompts/documentation**
- They enhance Claude's capabilities through **context**, not **code execution**

**Correct mental model**:
```
MCPs: External tools Claude can call
Skills: Instructions/context for Claude to follow
```

Think of skills like "jailbreak prompts" or "system prompts" - they guide Claude's behavior, they don't provide executable functions.

---

## 🔗 References

- Official Anthropic Skills: https://github.com/anthropics/skills
- SKILL.md format: YAML frontmatter + Markdown content
- Example skill: https://github.com/anthropics/skills/tree/main/example-skills

---

## Status

- ✅ Issue identified
- ✅ Root cause analyzed
- ✅ Fix implemented and applied
- ✅ YAML parser enhanced to handle arrays
- ✅ Orchestrator integration updated (skills as prompts, not tools)
- ✅ Tested with SKILL.md format
- ✅ All tests passing

**Fixes Applied**:
1. ✅ Replaced skills-manager.ts with correct SKILL.md loader
2. ✅ Enhanced YAML parser to handle multi-line arrays
3. ✅ Updated orchestrator to treat skills as prompts/context
4. ✅ Removed outdated CLI commands (skills:install)
5. ✅ Updated remaining CLI commands to work with new API

**Result**: Skills implementation now correctly aligns with Anthropic's official format.
