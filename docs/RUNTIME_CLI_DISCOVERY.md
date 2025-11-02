# Runtime CLI Discovery - Zero Maintenance

## Overview

Instead of maintaining a static catalog of CLI tools, NCP now **automatically discovers** what's installed on your system at runtime. This approach:

- ✅ **Zero maintenance** - No hardcoded tool definitions
- ✅ **Always current** - Parses actual `--help` output
- ✅ **User-specific** - Only shows what YOU have installed
- ✅ **Version-agnostic** - Works with any tool version

## Architecture

### 1. CLI Scanner (`src/services/cli-scanner.ts`)

**Discovers tools at runtime:**
```typescript
const scanner = new CLIScanner();
const tools = await scanner.scanSystem();
// Returns: All useful CLI tools installed on this system
```

**How it works:**
1. Use `compgen -c` to list all available commands
2. Filter to likely useful tools (exclude shell built-ins)
3. Test each tool with `--help` flags
4. Parse help output to extract:
   - Description
   - Capabilities (keywords)
   - Category (media, data, network, etc.)

**Smart filtering:**
- Excludes: `cd`, `echo`, `test` (shell built-ins)
- Includes: Tools with useful keywords (convert, process, search, etc.)
- Categorizes: Based on description and capabilities

### 2. CLI Suggestions MCP (`src/internal-mcps/cli-suggestions.ts`)

**New tools available:**

#### `cli:scan`
Scan system for all available CLI tools

```javascript
run("cli:scan")
```

**Output:**
```
🔍 System Scan Complete

Found **42** CLI tools

media (12 tools)
   ffmpeg, ffprobe, imagemagick, yt-dlp ...

data (5 tools)
   jq, yq, csvkit ...

development (8 tools)
   git, node, npm, docker ...
```

#### `cli:search`
Search for tools by capability

```javascript
run("cli:search", { query: "convert video" })
```

**Output:**
```
🔍 CLI Tools for "convert video":

**ffmpeg** - Complete solution to record, convert and stream audio and video
   Category: media
   Path: /opt/homebrew/bin/ffmpeg
   Capabilities: convert, video, audio, encode, mp4, webm
   Add to NCP: run("ncp:add", { mcp_name: "cli:ffmpeg" })

**handbrake** - Video transcoder
   Category: media
   Path: /usr/local/bin/HandBrakeCLI
   ...
```

#### `cli:check`
Check if a specific tool is installed

```javascript
run("cli:check", { tool_name: "ffmpeg" })
```

**Output:**
```
✅ ffmpeg is installed

Description: Complete solution to record, convert and stream audio and video
Category: media
Path: /opt/homebrew/bin/ffmpeg
Capabilities: convert, video, audio, encode, decode, mp4, webm, avi

Add to NCP: run("ncp:add", { mcp_name: "cli:ffmpeg" })
```

#### `cli:browse`
Browse tools by category

```javascript
run("cli:browse", { category: "media" })
```

**Output:**
```
📚 media tools (12 found):

**ffmpeg** - Complete solution to record, convert and stream audio and video
   /opt/homebrew/bin/ffmpeg
   Add: run("ncp:add", { mcp_name: "cli:ffmpeg" })

**imagemagick** - Create, edit, compose digital images
   /usr/local/bin/convert
   Add: run("ncp:add", { mcp_name: "cli:imagemagick" })
...
```

## User Workflow (Zero Knowledge Required)

### Scenario: User needs to convert a video

```javascript
// 1. User asks AI to convert video
// AI searches for capability
find("convert video")
// → No indexed tools found

// 2. AI scans system for what's available
run("cli:scan")
// → Discovers ffmpeg, handbrake, etc. are installed

// 3. AI searches for relevant tools
run("cli:search", { query: "convert video" })
// → Returns ffmpeg, handbrake with descriptions

// 4. AI adds most relevant tool
run("ncp:add", { mcp_name: "cli:ffmpeg" })
// → ffmpeg now indexed

// 5. AI can now discover and use
find("convert video")
// → Returns: ffmpeg:convert (0.82 confidence)
```

## Benefits vs. Static Catalog

### Static Catalog (Old Approach)
❌ Requires manual maintenance
❌ Gets outdated when tools change
❌ Shows tools user doesn't have
❌ Hardcoded knowledge of specific versions
❌ Missing new/uncommon tools

### Runtime Discovery (New Approach)
✅ Zero maintenance required
✅ Always reflects current tool version
✅ Only shows installed tools
✅ Works with any tool version
✅ Discovers ALL installed tools

## Implementation Details

### Scanning Algorithm

```typescript
1. Get all commands: compgen -c
2. Filter candidates:
   - Exclude shell built-ins (cd, echo, etc.)
   - Include tools with useful keywords
   - Limit to ~100 for performance

3. For each candidate:
   - Check if executable: which <tool>
   - Try help flags: --help, -h, help
   - Parse help output:
     * Extract description (first meaningful line)
     * Extract capabilities (verbs, file types)
     * Categorize (media, data, network, etc.)

4. Cache results (1 hour TTL)
5. Return discovered tools
```

### Performance

- **Initial scan**: ~2-5 seconds for 100 tools
- **Cached results**: <10ms
- **Cache TTL**: 1 hour
- **Force refresh**: Available via `force_refresh` parameter

### Smart Categorization

Tools are auto-categorized based on keywords:

```typescript
'media':      video, audio, image, ffmpeg, mp4, mp3
'data':       json, xml, csv, parse, jq
'documents':  pdf, markdown, pandoc, docx
'development': git, npm, docker, build
'network':    http, api, curl, download
'search':     grep, find, search
'archive':    zip, tar, compress
'security':   encrypt, hash, crypto
'utilities':  (fallback)
```

## Example: ffmpeg Discovery

```javascript
// Scan discovers ffmpeg
{
  name: "ffmpeg",
  path: "/opt/homebrew/bin/ffmpeg",
  description: "Complete solution to record, convert and stream audio and video",
  category: "media",
  capabilities: [
    "ffmpeg",
    "convert",
    "process",
    "encode",
    "decode",
    "video",
    "audio",
    "mp4",
    "webm",
    "avi",
    "mp3",
    "aac"
  ]
}

// User searches: "convert video"
// Match score: HIGH (contains "convert" and "video")
// Returned as top result

// After adding via ncp:add:
// - CLI parser extracts operations from ffmpeg --help
// - 16 operations indexed (convert, extract_audio, etc.)
// - Available via find("convert video")
```

## Comparison

### Before (Static Catalog)

**Problem:** ffmpeg 6.0 changes syntax, catalog is outdated

```javascript
run("cli:suggest", { query: "convert video" })
// Returns: ffmpeg with hardcoded v5.0 knowledge
// User installs ffmpeg 7.0
// Suggestions are wrong!
```

### After (Runtime Discovery)

**Solution:** Parse actual current version

```javascript
run("cli:scan")
// Runs: ffmpeg --help (whatever version is installed)
// Parses: Current syntax, current options
// Always correct!
```

## Migration Path

Old static catalog can coexist during transition:

1. **Phase 1**: Add runtime scanner (this PR)
2. **Phase 2**: Use scanner for discovery, catalog for installation hints
3. **Phase 3**: Remove static catalog completely

## Testing

```javascript
// Test scanning
const scanner = new CLIScanner();
const tools = await scanner.scanSystem();
console.log(`Found ${tools.length} tools`);

// Test search
const results = await scanner.searchTools("convert video");
console.log(results.map(t => t.name));

// Test categorization
const mediaTools = await scanner.getToolsByCategory("media");
console.log(mediaTools);
```

## Future Enhancements

- [ ] Parallel scanning for speed
- [ ] Parse man pages for richer descriptions
- [ ] Tool usage analytics (most used tools)
- [ ] Auto-suggest based on file types in context
- [ ] Integration with package managers (brew, apt)
- [ ] Tool version compatibility warnings

## Conclusion

Runtime CLI discovery eliminates maintenance burden while providing more accurate, user-specific tool suggestions. The system discovers what's actually installed and parses current help output, ensuring recommendations are always correct and up-to-date.
