# Anthropic Agent Skills Management Guide

Anthropic Agent Skills extend Claude's capabilities with specialized tools, prompts, and resources. This guide covers discovery, installation, and usage of skills in NCP.

## Table of Contents

1. [Skills Fundamentals](#skills-fundamentals)
2. [Official Marketplace](#official-marketplace)
3. [Skills Tools Reference](#skills-tools-reference)
4. [Marketplace Configuration](#marketplace-configuration)
5. [Directory Structure](#directory-structure)
6. [SKILL.md Format](#skillmd-format)
7. [Vector Search Discovery](#vector-search-discovery)
8. [Progressive Disclosure](#progressive-disclosure)
9. [Code Mode Integration](#code-mode-integration)
10. [Advanced Topics](#advanced-topics)

---

## 1. Skills Fundamentals

### What are Anthropic Agent Skills?

Anthropic Agent Skills are modular, reusable extensions that enhance Claude's capabilities. Each skill is a self-contained package containing:

- **SKILL.md**: Metadata and documentation
- **resources/**: Optional templates, forms, or data files
- **scripts/**: Optional executable scripts or utilities
- **templates/**: Optional reusable templates for specific use cases

### Use Cases

Skills are ideal for:

- **Domain-specific tools**: Canvas design, PDF manipulation, document generation
- **Workflow automation**: Repeated processes with templates and scripts
- **Custom integrations**: Specialized knowledge and tools for specific domains
- **Template libraries**: Reusable components and patterns
- **Plugin extensions**: Extend Claude's capabilities within a domain

### Difference Between Skills and MCPs

| Aspect | Skills | MCPs |
|--------|--------|------|
| **Purpose** | Packaged knowledge & templates | External system integration |
| **Installation** | `~/.ncp/skills/` | `~/.ncp/mcps.json` |
| **Update Model** | Manual via `skills:add` | Profile-based configuration |
| **Use in Code** | Called via code examples | Invoked as `tool.method()` |
| **Discovery** | `skills:find`, `skills:list` | `find`, detailed descriptions |

### Skill Lifecycle

```
Discover → Install → Use → Update → Remove
```

1. **Discover**: Search using `skills:find` with semantic search
2. **Install**: Add to your system via `skills:add skillName`
3. **Use**: Available immediately for code mode execution
4. **Update**: Re-install to get latest version
5. **Remove**: Clean up with `skills:remove skillName`

---

## 2. Official Marketplace

### Anthropic Official Skills

The official Anthropic skills marketplace is hosted at:
- **Repository**: [`anthropics/skills`](https://github.com/anthropics/skills)
- **Manifest**: [`.claude-plugin/marketplace.json`](https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json)

### Available Official Skills

Official skills are maintained by Anthropic and regularly updated. Current offerings include:

- **canvas-design**: Visual design and canvas manipulation
- **pdf**: PDF document creation and manipulation
- **docx**: Word document generation and editing
- And more being added regularly...

To see all available skills:

```bash
ncp skills:list    # List installed skills
ncp skills:find    # Search all available skills
```

---

## 3. Skills Tools Reference

### skills:find - Semantic Search & Discovery

**Purpose**: Search and discover skills with vector-powered semantic search

**Parameters**:
- `query` (string, optional): Search terms using semantic understanding
- `depth` (number 1-3, default: 1): Progressive disclosure level
- `page` (number, default: 1): Pagination for results
- `limit` (number, default: 10): Results per page

**Depth Levels**:

- **Level 1**: Metadata only (name, description, version, author)
- **Level 2**: + Full SKILL.md content (AI learns the skill)
- **Level 3**: + File tree listing (scripts/, resources/, templates/)

**Code Examples**:

```typescript
// List all available skills
const allSkills = await skills.find();

// Search for canvas/design skills
const designSkills = await skills.find({
  query: "canvas design"
});

// Get full skill documentation for learning
const detailed = await skills.find({
  query: "pdf",
  depth: 2
});

// See all files in skills (for reading with skills:read_resource)
const complete = await skills.find({
  query: "docx",
  depth: 3
});

// Pagination
const page2 = await skills.find({
  page: 2,
  limit: 5
});
```

**Vector Search**: Uses semantic similarity to find skills by intent, not just keyword matching:
- `"image generation"` → finds canvas-design skill
- `"document processing"` → finds pdf and docx skills
- `"visual art"` → finds design-related skills

### skills:list - Installed Skills

**Purpose**: List all installed skills (alias for `skills:find()` with no parameters)

**Code Example**:

```typescript
// List installed skills
const installed = await skills.list();
```

**Equivalent to**: `await skills.find({})`

### skills:add - Install Skill

**Purpose**: Install a skill from the official marketplace

**Parameters**:
- `skill_name` (string, required): Name of the skill to install

**Installation Location**: `~/.ncp/skills/{skill_name}/SKILL.md`

**Code Examples**:

```typescript
// Install canvas design skill
const result1 = await skills.add({
  skill_name: "canvas-design"
});

// Install PDF skill
const result2 = await skills.add({
  skill_name: "pdf"
});

// Error handling
try {
  await skills.add({ skill_name: "nonexistent" });
} catch (error) {
  console.error("Installation failed:", error);
}
```

**Auto-Loading**: Installed skills are automatically loaded on NCP startup

### skills:remove - Uninstall Skill

**Purpose**: Remove an installed skill

**Parameters**:
- `skill_name` (string, required): Name of the skill to remove

**Code Examples**:

```typescript
// Remove a skill
const result = await skills.remove({
  skill_name: "canvas-design"
});

// Effects take place after NCP restart
```

### skills:read_resource - Read Skill Files

**Purpose**: Read additional files from an installed skill

**Parameters**:
- `skill_name` (string, required): Name of installed skill
- `file_path` (string, required): Relative path (e.g., "resources/forms.md")

**Security**: Path traversal (`../`) is prevented

**Code Examples**:

```typescript
// Read a resource file from canvas-design skill
const forms = await skills.read_resource({
  skill_name: "canvas-design",
  file_path: "resources/form-templates.md"
});

// Read a template
const template = await skills.read_resource({
  skill_name: "pdf",
  file_path: "templates/invoice.json"
});

// Discover available files with depth: 3
const skillInfo = await skills.find({
  query: "pdf",
  depth: 3
});
```

---

## 4. Marketplace Configuration

### Official Marketplace (Default)

The official marketplace is built-in and enabled by default:

```json
{
  "name": "anthropics/skills",
  "repo": "anthropics/skills",
  "url": "https://raw.githubusercontent.com/anthropics/skills/main",
  "sourceType": "github",
  "source": "anthropics/skills",
  "enabled": true
}
```

### Custom Marketplaces

Configure additional skill marketplaces in `~/.ncp/skills-marketplaces.json`:

```json
{
  "marketplaces": [
    {
      "name": "company-skills",
      "url": "https://raw.githubusercontent.com/mycompany/skills-repo/main",
      "sourceType": "github",
      "source": "mycompany/skills-repo",
      "enabled": true
    },
    {
      "name": "local-skills",
      "url": "file:///home/user/my-skills",
      "sourceType": "local",
      "source": "/home/user/my-skills",
      "enabled": true
    }
  ]
}
```

### Marketplace Caching

- **Cache Location**: `~/.ncp/.cache/skills-marketplaces/`
- **TTL**: 24 hours
- **Auto-refresh**: Automatic refresh after TTL expires
- **Manual refresh**: Reinstall a skill to update from marketplace

---

## 5. Directory Structure

Installation locations and structure:

```
~/.ncp/
├── skills/
│   ├── canvas-design/
│   │   ├── SKILL.md              # Metadata + full documentation
│   │   ├── resources/            # Optional: Templates, forms, assets
│   │   │   ├── form-templates.md
│   │   │   └── color-palette.json
│   │   ├── scripts/              # Optional: Utility scripts
│   │   │   └── color-converter.py
│   │   └── templates/            # Optional: Reusable templates
│   │       └── banner-template.json
│   ├── pdf/
│   │   ├── SKILL.md
│   │   ├── resources/
│   │   └── templates/
│   ├── docx/
│   │   └── SKILL.md
│   └── [other-skills]/
│
├── skills-marketplaces.json       # Custom marketplace config
└── .cache/
    └── skills-marketplaces/       # Cached manifests (24hr TTL)
        ├── anthropics-skills.json
        └── company-skills.json
```

---

## 6. SKILL.md Format

Each skill has a `SKILL.md` file with YAML frontmatter and markdown content:

### Frontmatter (YAML)

```yaml
---
name: canvas-design
version: 1.0.0
description: Tools for visual design, canvas manipulation, and image generation
author: Anthropic
license: MIT
tags:
  - design
  - visual
  - canvas
  - graphics
tools:
  - canvas.create
  - canvas.draw
  - canvas.export
plugin: canvas-design-plugin
---
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill identifier (lowercase, hyphenated) |
| `version` | string | Yes | Semantic version (X.Y.Z) |
| `description` | string | Yes | Short description for discovery |
| `author` | string | Yes | Skill creator/maintainer |
| `license` | string | Yes | License type (MIT, Apache-2.0, etc.) |
| `tags` | array | No | Tags for discovery (max 5) |
| `tools` | array | No | Related tool identifiers |
| `plugin` | string | No | Claude Code plugin name |

### Content

Full markdown documentation that Claude learns from. Include:

- Use cases and capabilities
- Examples and tutorials
- API documentation
- Best practices
- Troubleshooting

**Example**:

```markdown
# Canvas Design Skill

## Overview

Create beautiful visual designs using canvas manipulation tools.

## Quick Start

```typescript
const canvas = await canvas.create({ width: 800, height: 600 });
await canvas.drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
const image = await canvas.export({ format: 'png' });
```

## Use Cases

- Web design mockups
- Social media graphics
- Data visualization
- Logo generation

## API Reference

### canvas.create(options)
...
```

---

## 7. Vector Search Discovery

### How Semantic Search Works

Skills are discovered using semantic understanding, not just keyword matching:

**Multi-level Matching**:

1. **Exact Name Match** (highest confidence)
   - Query: `"pdf"` → Finds `pdf` skill at 100% confidence

2. **Name Contains Query**
   - Query: `"document"` → Finds `pdf`, `docx` at 90% confidence

3. **Description Match**
   - Query: `"create documents"` → Matches skill descriptions

4. **Tag Match**
   - Query: `"design"` → Matches skills tagged with `design`

5. **Word-Level Similarity**
   - Query: `"visual art generation"` → Finds related skills

### Query Examples

```typescript
// Specific search
await skills.find({ query: "pdf manipulation" });      // Finds: pdf
await skills.find({ query: "document editing" });      // Finds: docx, pdf
await skills.find({ query: "create images" });         // Finds: canvas-design
await skills.find({ query: "image generation" });      // Finds: canvas-design
await skills.find({ query: "visual design" });         // Finds: canvas-design

// Broad search
await skills.find({ query: "design" });                // Finds: all design-related
await skills.find({ query: "documents" });             // Finds: pdf, docx
```

### Confidence Scores

Results are ranked by relevance:
- `1.0`: Perfect match
- `0.9`: Name-level match
- `0.7`: Description-level match
- `0.6`: Tag match
- `< 0.5`: Partial word match

---

## 8. Progressive Disclosure

### Token Efficiency

Progressive disclosure levels reduce token usage while allowing deeper learning:

| Depth | Data Included | Tokens | Use Case |
|-------|---------------|--------|----------|
| **1** | Name, description, version, author | 500-1000 | Quick discovery |
| **2** | + Full SKILL.md content | 5000-10000 | Learning the skill |
| **3** | + File tree and available resources | 7000-15000 | Full context |

### When to Use Each Level

**Depth 1 (Default)**:
```typescript
// Just need to know what skills are available
const skills = await skills.find({ query: "design" });
```

**Depth 2**:
```typescript
// Want to learn how to use a skill before installing
const details = await skills.find({
  query: "pdf",
  depth: 2
});
```

**Depth 3**:
```typescript
// Need to access specific resources and files
const full = await skills.find({
  query: "canvas-design",
  depth: 3
});

// Then read specific files
const forms = await skills.read_resource({
  skill_name: "canvas-design",
  file_path: "resources/templates.md"
});
```

### Token Usage Tips

- Use `depth: 1` for discovery
- Use `depth: 2` for learning before install
- Use `depth: 3` only when accessing resources
- Most use cases work fine with default `depth: 1`

---

## 9. Code Mode Integration

### Direct Invocation

Skills are callable directly in code mode without `ncp.run()` wrapper:

```typescript
// ✅ Correct - Direct invocation (elegant)
const installed = await skills.list();
const results = await skills.find({ query: "pdf" });
await skills.add({ skill_name: "canvas-design" });

// ❌ Avoid - Wrapping in ncp.run()
// const installed = await ncp.run('skills:list');
```

### Workflow Example

```typescript
// 1. Discover skills
const results = await skills.find({ query: "design" });

// 2. Show results to user
console.log(results);

// 3. Install if not present
const installed = await skills.list();
const hasCanvas = installed.find(s => s.name === "canvas-design");

if (!hasCanvas) {
  await skills.add({ skill_name: "canvas-design" });
}

// 4. Learn from skill depth 2
const full = await skills.find({
  query: "canvas-design",
  depth: 2
});
```

### Integration with Code Tool

Skills are auto-loaded and available whenever NCP starts:

```typescript
// Skills available immediately after install
async function designBanner() {
  // Use skill right away
  const canvas = await canvas.create({ width: 800, height: 200 });
  // ... design operations ...
}
```

---

## 10. Advanced Topics

### Creating Custom Skills

Custom skills follow the same structure as official skills:

1. Create `SKILL.md` with proper frontmatter
2. Add `resources/`, `scripts/`, or `templates/` directories as needed
3. Host on GitHub or local directory
4. Configure in `skills-marketplaces.json`
5. Install with `skills:add`

### Publishing Skills

To publish to the official Anthropic marketplace:

1. Fork [`anthropics/skills`](https://github.com/anthropics/skills)
2. Create skill directory: `skills/{your-skill-name}/`
3. Add `SKILL.md` with documentation
4. Add resources, scripts, or templates
5. Submit pull request with clear description
6. Anthropic team reviews and merges

### Marketplace Structure

Official marketplace structure:

```
anthropics/skills/
├── .claude-plugin/
│   └── marketplace.json          # Manifest of all skills
├── skills/
│   ├── canvas-design/
│   ├── pdf/
│   ├── docx/
│   └── [other-skills]/
└── README.md
```

### Skill Dependencies

Skills can depend on other skills or MCPs:

```yaml
---
name: advanced-canvas
description: Advanced canvas design with filters
dependencies:
  - skills: ["canvas-design"]
  - mcps: ["image-processor"]
---
```

### Version Management

Skills use semantic versioning:
- **1.0.0**: Initial release
- **1.1.0**: Minor update (new features)
- **2.0.0**: Major update (breaking changes)

Update manually with `skills:add` to get latest version.

---

## Summary

**Key Points**:

1. **Discovery**: Use `skills:find` with semantic search
2. **Installation**: Install with `skills:add skillName`
3. **Usage**: Call directly in code mode: `await skills.method()`
4. **Marketplace**: Official + custom marketplace support
5. **Progressive**: Learn skills at your own pace with depth levels
6. **Vector Search**: Intelligent discovery based on intent
7. **Direct Access**: Elegant interface without `ncp.run()` wrapper
8. **File Access**: Read resources with `skills:read_resource`
9. **Auto-Loading**: Installed skills ready immediately after restart

---

## Related Documentation

- [NCP README](./README.md)
- [Discovery Tools](./README.md#discovery)
- [Code Mode Guide](./README.md#code-mode)
- [MCPs Documentation](./README.md#model-context-protocol-mcps)
- [Official Skills Repository](https://github.com/anthropics/skills)
