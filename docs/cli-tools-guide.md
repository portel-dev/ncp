# CLI Tools for NCP

## Overview

NCP can integrate any CLI tool for discovery, making command-line utilities searchable alongside MCP servers. This solves a critical problem: **AI has shell access but can't discover what tools are available**.

## How It Works

### The Problem
- AI can execute CLI commands but doesn't know what tools exist
- `find("convert video")` won't suggest ffmpeg unless it's indexed
- Every user's machine has different CLI tools installed

### The Solution: Discovery + Suggestions
NCP provides a **two-tier system**:

1. **Tool Catalog** - Knowledge of popular CLI tools (no installation required)
2. **Tool Indexing** - Makes installed tools discoverable

## User Workflow

### 1. **Discovery Phase** (No Installation Required)

User needs to convert a video:

```javascript
// AI searches for capability
find("convert video")
// Returns existing MCP tools (if any)

// AI suggests CLI tools that could help
run("cli:suggest", { query: "convert video" })
```

**Output:**
```
💡 CLI Tool Suggestions for "convert video":

**ffmpeg** - Complete solution to record, convert and stream audio and video
   Install: `brew install ffmpeg`
   Learn more: https://ffmpeg.org
   Add to NCP: run("ncp:add", { mcp_name: "cli:ffmpeg" })
```

### 2. **Verification Phase**

Check if tool is already installed:

```javascript
run("cli:check", { tool_name: "ffmpeg" })
```

**If Installed:**
```
✅ ffmpeg is installed
   Version: ffmpeg version 8.0
Add to NCP: run("ncp:add", { mcp_name: "cli:ffmpeg" })
```

**If Not Installed:**
```
❌ ffmpeg is not installed

Install with:
   brew install ffmpeg

Learn more: https://ffmpeg.org
```

### 3. **Installation** (User Action)

User runs installation command:
```bash
brew install ffmpeg
```

### 4. **Indexing Phase**

Add tool to NCP for discovery:

```javascript
run("ncp:add", { mcp_name: "cli:ffmpeg" })
```

**Output:**
```
✅ Added CLI tool: ffmpeg
   Indexed 16 operations for discovery

You can now use find() to discover ffmpeg operations:
   find("ffmpeg")
   find("convert video")
```

### 5. **Usage Phase**

Now the tool appears in searches:

```javascript
find("convert video")
```

**Returns:**
```
• ffmpeg:convert - Convert video/audio to different format (0.82)
• ffmpeg:compress - Compress/reduce video file size (0.47)
• ffmpeg:resize - Resize/scale video dimensions (0.45)
...
```

AI can now execute with context:
```bash
ffmpeg -i input.mp4 -c:v libx264 output.mp4
```

## Tool Catalog

Browse available CLI tools:

```javascript
// List all categories
run("cli:catalog")

// Browse specific category
run("cli:catalog", { category: "media" })
```

**Categories:**
- **media** - ffmpeg, imagemagick, yt-dlp
- **data** - jq (JSON processing)
- **documents** - pandoc (document conversion)
- **development** - git (version control)
- **network** - curl (HTTP requests)
- **search** - ripgrep (fast text search)

## Adding New Tools

### Quick Add (Auto-Parse)

```javascript
// Add any CLI tool by name
run("ncp:add", { mcp_name: "cli:jq" })
```

NCP will:
1. Verify the tool exists
2. Parse `--help` output
3. Extract operations and parameters
4. Create searchable index
5. Generate embeddings for semantic search

### Pre-Defined Tools

Some tools (like ffmpeg) have pre-defined operation sets for better UX:

- **ffmpeg**: 16 operations (convert, extract_audio, compress, resize, cut, merge, etc.)
- Others use generic auto-parsing

## Benefits

### For Users
- ✅ **No pre-installation required** - suggestions work without tools installed
- ✅ **Platform-specific install commands** - correct for macOS/Linux/Windows
- ✅ **Check before install** - verify what's already available
- ✅ **Browse capabilities** - explore what tools can do
- ✅ **Semantic search** - find tools by describing what you need

### For AI
- ✅ **Discovers CLI capabilities** - knows ffmpeg can convert videos
- ✅ **Gets command templates** - knows how to structure commands
- ✅ **Validates availability** - won't suggest unavailable tools
- ✅ **Unified search** - CLI tools + MCP servers in one query

## Architecture

```
┌─────────────────────────────────────────┐
│         User Search Query               │
│       "convert video to gif"            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│     NCP Discovery Engine                │
│   (Semantic Search + Embeddings)        │
└──┬──────────────────────────────────┬───┘
   │                                  │
   │                                  │
   ▼                                  ▼
┌──────────────────┐      ┌──────────────────┐
│  MCP Servers     │      │   CLI Tools      │
│  (connected)     │      │   (indexed)      │
└──────────────────┘      └──────────────────┘
   │                                  │
   │                                  │
   ▼                                  ▼
┌──────────────────┐      ┌──────────────────┐
│  MCP Tools       │      │ ffmpeg:create_gif│
│  video:encode    │      │ (confidence: 0.8)│
│  (confidence: 0.6)│      └──────────────────┘
└──────────────────┘
```

## Implementation Details

### Cache Structure

**Metadata Cache** (`~/.ncp/cache/all-tools.json`):
```json
{
  "mcps": {
    "ffmpeg": {
      "configHash": "...",
      "tools": [
        {
          "name": "convert",
          "description": "Convert video/audio to different format",
          "inputSchema": {
            "type": "object",
            "properties": {
              "command_template": {
                "default": "ffmpeg -i {input} {output}"
              }
            }
          }
        }
      ]
    }
  }
}
```

**Embeddings Cache** (`~/.ncp/embeddings.json`):
```json
{
  "vectors": {
    "ffmpeg:convert": [0.023, -0.145, 0.892, ...]
  },
  "metadata": {
    "ffmpeg:convert": {
      "mcpName": "ffmpeg",
      "enhancedDescription": "convert: Convert video/audio..."
    }
  }
}
```

### CLI Tool Marker

CLI tools are marked in the profile to skip MCP connection:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "ffmpeg",
      "args": [],
      "env": {
        "NCP_CLI_TOOL": "true"  // Marker: load from cache only
      }
    }
  }
}
```

## Best Practices

### For Tool Authors

1. **Provide good --help output** - Clear descriptions, examples
2. **Consistent flag structure** - Standard patterns like `-i input -o output`
3. **Include examples** - Helps users understand usage

### For Users

1. **Start with suggestions** - `run("cli:suggest", { query: "..." })`
2. **Check before installing** - `run("cli:check", { tool_name: "..." })`
3. **Browse catalog** - Discover tools you didn't know existed
4. **Add after install** - Only index tools you actually have

### For Developers

1. **Extend the catalog** - Add new tools to `cli-catalog.ts`
2. **Add custom parsers** - For complex tools (like ffmpeg)
3. **Improve capabilities** - Better keyword matching

## Limitations

- **Execution is manual** - AI still uses shell, not a protocol wrapper
- **No streaming output** - Command runs to completion
- **No interactive prompts** - CLI tools must accept all args upfront
- **Platform differences** - Help output varies by OS

## Future Enhancements

- [ ] Auto-detect installed CLI tools on startup
- [ ] Parse man pages for better documentation
- [ ] Support for tool aliases (e.g., `convert` → `imagemagick`)
- [ ] Integration with package managers (brew, apt, etc.)
- [ ] Tool usage analytics
- [ ] Community-contributed tool definitions

## Examples

### Example 1: Video Conversion

```javascript
// User: "I need to convert this MP4 to WebM"

// Step 1: AI searches
find("convert video")
// No indexed tools found

// Step 2: AI asks for suggestions
run("cli:suggest", { query: "convert video" })
// Suggests: ffmpeg

// Step 3: User installs
// $ brew install ffmpeg

// Step 4: User adds to NCP
run("ncp:add", { mcp_name: "cli:ffmpeg" })

// Step 5: AI can now discover and use
find("convert video")
// Returns: ffmpeg:convert

// Step 6: AI executes
// $ ffmpeg -i input.mp4 -c:v libvpx output.webm
```

### Example 2: JSON Processing

```javascript
// User: "Extract email from this JSON"

// AI suggests
run("cli:suggest", { query: "process json" })
// Suggests: jq

// User has it installed
run("ncp:add", { mcp_name: "cli:jq" })

// AI can now use
// $ cat data.json | jq '.email'
```

## Conclusion

NCP's CLI tool integration solves the discovery problem while respecting user choice. Tools aren't pre-installed or pre-indexed, but users can easily discover, verify, and add the tools they need. This creates a flexible, user-controlled ecosystem where CLI tools and MCP servers work seamlessly together.
