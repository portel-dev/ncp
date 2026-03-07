# NCP Skills Management Documentation Plan

## Overview
This document outlines the comprehensive guide for Anthropic Agent Skills management in NCP, including official marketplace integration, custom marketplaces, and vector search discovery.

## Documentation Structure

### 1. **Skills Fundamentals** (SKILLS.md - Part 1)
- What are Anthropic Agent Skills?
- Use cases and benefits
- Difference between Skills and MCPs
- Skill lifecycle (discovery → install → use → remove)

### 2. **Official Marketplace Integration** (SKILLS.md - Part 2)
- Default marketplace: `anthropics/skills`
- Repository structure
- Manifest format (`.claude-plugin/marketplace.json`)
- SKILL.md format and metadata
- Available official skills (from anthropics/skills repo)

### 3. **Skills Tools Reference** (SKILLS.md - Part 3)

#### skills:find (Vector Search)
- **Description**: Search and discover skills using vector search
- **Similar to**: Main `find` tool for MCPs
- **Parameters**:
  - `query` (string, optional): Search query using semantic understanding
  - `depth` (number, 1-3): Progressive disclosure level
    - 1: Metadata only (name, description, version, author)
    - 2: + Full SKILL.md content (AI learns the skill)
    - 3: + File tree listing (resources/, scripts/, templates/)
  - `page` (number): Pagination (default: 1)
  - `limit` (number): Results per page (default: 10)
- **Code Examples**:
  ```typescript
  // Search with semantic understanding
  const results = await skills.find({ query: "canvas design" });

  // Get full skill content for AI to learn
  const detailed = await skills.find({ query: "pdf", depth: 2 });

  // See all available files
  const full = await skills.find({ query: "docx", depth: 3 });
  ```

#### skills:list (Alias for skills:find)
- **Description**: List all installed skills
- **Equivalent to**: `skills:find()` with no parameters
- **Code Examples**:
  ```typescript
  // List all skills (no search)
  const all = await skills.list();
  ```

#### skills:add
- **Description**: Install skill from official or custom marketplace
- **Parameters**:
  - `skill_name` (string, required): Name of skill to install
- **Sources**: Fetches from configured marketplaces
- **Installation**: Saves to `~/.ncp/skills/{skill_name}/`
- **Code Examples**:
  ```typescript
  const result = await skills.add({ skill_name: "canvas-design" });
  ```

#### skills:remove
- **Description**: Remove installed skill
- **Parameters**:
  - `skill_name` (string, required): Name of skill to remove
- **Code Examples**:
  ```typescript
  const result = await skills.remove({ skill_name: "canvas-design" });
  ```

#### skills:read_resource
- **Description**: Read additional files from installed skill
- **Parameters**:
  - `skill_name` (string, required): Name of installed skill
  - `file_path` (string, required): Relative path (e.g., "resources/forms.md")
- **Use Case**: Get additional documentation, scripts, templates from skill
- **Code Examples**:
  ```typescript
  const docs = await skills.read_resource({
    skill_name: "canvas-design",
    file_path: "resources/examples.md"
  });
  ```

### 4. **Marketplace Configuration** (SKILLS.md - Part 4)

#### Official Marketplace (Default)
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

#### Custom Marketplaces
- **Config File**: `~/.ncp/skills-marketplaces.json`
- **Format**:
  ```json
  {
    "marketplaces": [
      {
        "name": "custom-skills",
        "url": "https://raw.githubusercontent.com/myorg/skills-repo/main",
        "sourceType": "github",
        "source": "myorg/skills-repo",
        "enabled": true
      },
      {
        "name": "local-skills",
        "url": "file:///path/to/local/skills",
        "sourceType": "local",
        "source": "/path/to/local/skills",
        "enabled": true
      }
    ]
  }
  ```

### 5. **Skill Directory Structure** (SKILLS.md - Part 5)
```
~/.ncp/
├── skills/
│   ├── canvas-design/
│   │   ├── SKILL.md              # Metadata + content
│   │   ├── resources/            # Optional: Additional resources
│   │   ├── scripts/              # Optional: Executable scripts
│   │   └── templates/            # Optional: Template files
│   ├── pdf/
│   │   └── SKILL.md
│   └── docx/
│       └── SKILL.md
├── skills-marketplaces.json      # Custom marketplace config
└── .cache/
    └── skills-marketplaces/      # Cached manifests (24hr TTL)
```

### 6. **SKILL.md File Format** (SKILLS.md - Part 6)
- **Structure**: Markdown with YAML frontmatter
- **Frontmatter Fields**:
  - `name`: Skill identifier
  - `description`: Short description
  - `version`: Semantic version
  - `author`: Skill creator
  - `license`: License type
  - `tags`: Array of tags
  - `tools`: Array of related MCP tools
  - `plugin`: Claude Code plugin name (optional)
- **Content**: Full markdown documentation that AI learns

### 7. **Vector Search in skills:find** (SKILLS.md - Part 7)
- **How It Works**: Similar to main `find` tool
  - Uses semantic search to understand intent
  - Indexes skill descriptions and content
  - Returns relevance scores (confidence)
  - Supports synonym matching
- **Query Examples**:
  - "image generation" → finds canvas-design
  - "pdf manipulation" → finds pdf skill
  - "document processing" → finds docx, pdf skills
- **Caching**: Embeddings cached, updates every 24 hours

### 8. **Progressive Disclosure** (SKILLS.md - Part 8)
- **Why Progressive Disclosure?**
  - Reduces token usage for large skill content
  - Allows AI to learn skills progressively
  - Better control over context window
- **Depth Levels**:
  - Level 1: 500-1000 tokens (metadata)
  - Level 2: 5000-10000 tokens (full content)
  - Level 3: Variable tokens (content + file tree)

### 9. **Integration with Code Mode** (SKILLS.md - Part 9)
- Skills callable from code mode directly
- Example workflow:
  ```typescript
  // 1. Search for skill
  const result = await skills.find({ query: "canvas", depth: 2 });

  // 2. Install if not present
  if (!installed) {
    await skills.add({ skill_name: "canvas-design" });
  }

  // 3. Use skill via Claude Code
  // (Skill is now available in context)
  ```

### 10. **Advanced Topics** (SKILLS.md - Part 10)
- Contributing skills to official marketplace
- Creating custom skill packages
- Publishing to GitHub
- Manifest format specification
- Plugin integration

## Implementation Plan

### Phase 1: Refactor skills:find (This Sprint)
1. ✅ Integrate discovery engine with skills
2. ✅ Implement vector search in skills:find
3. ✅ Make skills:list an alias for skills:find()
4. ✅ Test both CLI and MCP interfaces

### Phase 2: Documentation (This Sprint)
1. ✅ Create comprehensive SKILLS.md
2. ✅ Add examples for all tools
3. ✅ Document marketplace structure
4. ✅ Update main README with skills reference

### Phase 3: Testing & Validation (Follow-up)
1. Test with actual anthropics/skills repo
2. Test custom marketplace configuration
3. Test vector search accuracy
4. Test caching behavior

## File Location
- **Main Doc**: `SKILLS.md` (in repository root)
- **Config Reference**: `SKILLS.md` → Section 4
- **Architecture**: `SKILLS.md` → Section 7

## Key Points to Highlight
1. **Vector Search**: skills:find uses same discovery engine as main find
2. **Efficiency**: skills:list is just find() with no parameters
3. **Progressive Learning**: Depth parameter optimizes token usage
4. **Official Support**: Built-in integration with anthropics/skills
5. **Extensibility**: Custom marketplaces via JSON config
6. **Code Mode**: Skills fully callable from TypeScript execution

## Cross-References
- Link to main `find` documentation
- Link to MCP tools documentation
- Link to code mode examples
- Link to marketplace repository
