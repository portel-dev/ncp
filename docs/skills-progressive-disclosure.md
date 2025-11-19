# Skills Progressive Disclosure

## Overview

Anthropic Agent Skills use a three-level progressive disclosure architecture that loads context on-demand, making them infinitely scalable without bloating the context window.

NCP implements this through the `skills:find` internal MCP tool, which provides progressive access to skill information through the `depth` parameter.

## Three-Level Progressive Disclosure

```
Level 1: Metadata (always lightweight)
    ↓
Level 2: SKILL.md content (AI learns the skill)
    ↓
Level 3: File tree (discover available resources)
    ↓
Level 4: Read specific files (skills:read_resource)
```

## Usage

### CLI Usage

```bash
# Level 1: Browse available skills (metadata only)
ncp run "skills:find"

# Level 2: Learn a specific skill (full SKILL.md content)
ncp run "skills:find query=pdf depth=2"

# Level 3: See all available files
ncp run "skills:find query=pdf depth=3"

# Level 4: Read a specific resource file
ncp run "skills:read_resource skill_name=pdf file_path=resources/forms.md"
```

### Code-Mode Usage

```javascript
// Level 1: Browse skills
const skills = await ncp.run('skills:find', { depth: 1 });
// Returns: Metadata only (name, description, version, tools)

// Level 2: Learn a skill (CRITICAL - this is where AI "learns"!)
const pdfSkill = await ncp.run('skills:find', { query: 'pdf', depth: 2 });
// Returns: Full SKILL.md content
// 🎯 KEY: This content is now in chat history - AI has learned the skill!

// Level 3: Explore files
const files = await ncp.run('skills:find', { query: 'pdf', depth: 3 });
// Returns: Full content + file tree (scripts/, resources/, templates/)

// Level 4: Read specific file
const formsDocs = await ncp.run('skills:read_resource', {
  skill_name: 'pdf',
  file_path: 'resources/forms.md'
});
```

## How It Works

### Level 1: Discovery (Metadata Only)

**Purpose**: Browse available skills efficiently without loading full content.

**Returns**:
- Skill name
- Description (used for matching tasks)
- Version
- Author
- Tools list

**Example Output**:
```markdown
## Skills Search Results (1 total)

### 📚 pdf-processor
**Description:** Extract text and fill forms in PDF files using Python scripts
**Version:** 1.0.0
**Author:** NCP Team
**Tools:** extract_text, fill_form, validate_form
```

**Use Case**: "What skills are available?"

---

### Level 2: Learning (+ SKILL.md Content)

**Purpose**: AI reads full instructions and learns HOW to use the skill.

**Returns**:
- Everything from Level 1
- **Full SKILL.md body** (instructions, workflows, examples)

**Example Output**:
```markdown
### 📚 pdf-processor
**Description:** Extract text and fill forms in PDF files...
**Version:** 1.0.0

**Full Content:**

```markdown
# PDF Processor Skill

## When to Use This Skill
- User asks to extract text from PDF files
- User needs to fill out PDF forms programmatically

## Instructions

### 1. Extract Text from PDF
Use the `extract_text.py` script:

\```bash
python ~/.ncp/skills/pdf-processor/scripts/extract_text.py input.pdf
\```

### 2. Fill PDF Forms
...
\```
```

**🎯 CRITICAL**: Once AI calls `skills:find` with `depth=2`, the full SKILL.md content enters the chat history. The AI has now "learned" this skill and can use it for the rest of the conversation!

**Use Case**: "How do I work with PDF files?"

---

### Level 3: Exploration (+ File Tree)

**Purpose**: Discover what additional resources are available (scripts, templates, docs).

**Returns**:
- Everything from Levels 1 & 2
- **Complete file tree** listing all files in skill directory

**Example Output**:
```markdown
**Available Files:**
- resources/form-types.md
- resources/validation-rules.md
- scripts/extract_text.py
- scripts/fill_form.py
- templates/form-data.json

💡 Use `skills:read_resource` to read specific files.
```

**Use Case**: "What resources are available in this skill?"

---

### Level 4: File Access (skills:read_resource)

**Purpose**: Read specific resource files (documentation, scripts, templates).

**Returns**: File content with syntax highlighting

**Example Output**:
```markdown
## resources/form-types.md

\```markdown
# Common PDF Form Types

## Text Fields
- Single-line text: name, email, address
- Multi-line text: comments, descriptions

## Choice Fields
- Checkboxes: yes/no, multiple selection
...
\```
```

**Security**: Path traversal protection prevents reading files outside skill directory.

**Use Case**: "Show me the form validation rules documentation"

---

## Why This Architecture?

### 1. Context Window Efficiency

- **Without progressive disclosure**: All skills loaded upfront = massive context
- **With progressive disclosure**: Only metadata loaded initially = minimal context
- **AI loads details only when needed** = scales infinitely

### 2. Chat History as Learning Mechanism

When AI calls `skills:find` with `depth=2`:
1. Full SKILL.md content is returned
2. Content appears in chat history
3. AI can reference this for entire conversation
4. **AI has "learned" the skill** without upfront loading!

### 3. Complements MCP Tools

- **Skills** = Internal knowledge (HOW to do tasks)
- **MCP Tools** = External connections (WHAT to connect to)
- **Skills orchestrate MCP tools** using procedural knowledge

**Example**:
- Skill: "Customer Onboarding Workflow" (teaches process)
- MCP Tools: CRM, email, document storage
- Skill guides AI: "Use CRM tool to create record, then email tool to send welcome..."

---

## Skill Directory Structure

```
~/.ncp/skills/
└── pdf-processor/
    ├── SKILL.md              # Required: Entry point (Level 2)
    ├── resources/            # Level 3+4
    │   ├── form-types.md
    │   └── validation-rules.md
    ├── scripts/              # Level 3+4
    │   ├── extract_text.py
    │   └── fill_form.py
    └── templates/            # Level 3+4
        └── form-data.json
```

---

## Installing Skills

Skills are installed from the Anthropic marketplace:

```bash
# Search marketplace
ncp run "skills:add skill_name=canvas-design"

# List installed
ncp run "skills:list"

# Remove
ncp run "skills:remove skill_name=canvas-design"
```

Skills auto-load on NCP startup from `~/.ncp/skills/`.

---

## Implementation Details

### Internal MCP Tool: skills:find

**Tool Definition**:
```typescript
{
  name: 'find',
  description: 'Search and discover installed Anthropic Agent Skills with progressive detail levels',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },  // Optional search filter
      depth: {
        type: 'number',
        enum: [1, 2, 3],
        default: 1,
        description: '1=metadata, 2=+SKILL.md, 3=+files'
      },
      page: { type: 'number', default: 1 },
      limit: { type: 'number', default: 10 }
    }
  }
}
```

**Implementation**: `src/internal-mcps/skills.ts`

### Security

- **Path traversal protection**: `../` and absolute paths rejected
- **Directory boundary enforcement**: `fs.realpath()` verification
- **Read-only access**: No file modification allowed

---

## Best Practices

### For AI Usage

1. **Start with Level 1** - Browse available skills
2. **Level 2 when task matches** - Load full instructions to "learn"
3. **Level 3 if curious** - See what resources exist
4. **Level 4 for details** - Read specific documentation

### For Skill Authors

1. **SKILL.md is critical** - This is what AI learns from
2. **Description matters** - Used for discovery/matching
3. **Include usage examples** - Show exact commands to run
4. **Reference additional files** - Point to resources/ and scripts/

---

## Comparison: Skills vs Regular Tools

| Feature | Regular MCP Tool | Anthropic Skill |
|---------|------------------|-----------------|
| **Purpose** | Execute action | Provide knowledge |
| **Loading** | All upfront | Progressive |
| **Context** | Schema only | Full instructions |
| **Execution** | Direct | AI follows instructions |
| **Scalability** | Limited by tools/list | Infinite (on-demand) |
| **Use Case** | API calls, data access | Workflows, procedures |

---

## References

- [Anthropic Skills Documentation](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)
- [Skills GitHub Repository](https://github.com/anthropics/skills)
- [NCP Skills Implementation](../src/internal-mcps/skills.ts)
