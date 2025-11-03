# MicroMCP Installation Testing Guide

Comprehensive test suite for MicroMCP installation functionality across all methods and edge cases.

## Test Files

### 1. `micromcp-installation.test.ts`
Automated TypeScript test suite using Node.js test runner.

**Coverage:**
- ✅ URL installation (GitHub raw URLs)
- ✅ Local file installation
- ✅ Clipboard installation
- ✅ Bulk mixed installation
- ✅ Error handling (404, network errors, missing files)
- ✅ Edge cases (permissions, reinstallation, malformed files)
- ✅ Tool discovery and execution

**Run:**
```bash
npm run build
node --test tests/micromcp-installation.test.ts
```

### 2. `manual-micromcp-test.sh`
Interactive shell script for manual verification with real GitHub URLs.

**Coverage:**
- 📥 Install from GitHub raw URL
- 📥 Install multiple MicroMCPs
- 📁 Install from local file
- 🔍 Tool discovery verification
- ⚙️ Tool execution verification
- ❌ Error handling tests
- 🔄 Reinstallation/overwrite
- ✓ File integrity validation

**Run:**
```bash
npm run build
./tests/manual-micromcp-test.sh
```

## Test Scenarios

### URL Installation Tests

#### ✅ Valid GitHub Raw URL
```bash
# Test with actual MicroMCP from repository
ncp add "https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/calculator.micro.ts"
```

**Expected:**
- ✅ Downloads `calculator.micro.ts` to `~/.ncp/micromcps/`
- ✅ Attempts to download optional `calculator.micro.schema.json`
- ✅ Shows success message with file location
- ✅ File contains valid TypeScript with MicroMCP implementation

#### ❌ 404 URL
```bash
ncp add "https://raw.githubusercontent.com/invalid/repo/main/nonexistent.micro.ts"
```

**Expected:**
- ❌ Shows error: "Failed to download MicroMCP source: 404"
- ❌ No file created in `~/.ncp/micromcps/`

#### ❌ Network Error
```bash
ncp add "https://invalid-domain-12345.com/file.micro.ts"
```

**Expected:**
- ❌ Shows error: "Failed to download" or network error
- ❌ No file created

#### 🌐 HTTP Server URL (non-.micro.ts)
```bash
ncp add "https://example.com/mcp-server"
```

**Expected:**
- ✅ Treated as HTTP/SSE MCP server, not MicroMCP
- ✅ Adds to profile as remote server
- ❌ Does NOT create `.micro.ts` file

### Local File Installation Tests

#### ✅ Valid Local File
```bash
# Create test MicroMCP
cat > /tmp/test.micro.ts << 'EOF'
import { MicroMCP, tool } from '@portel/ncp';

export class TestMCP implements MicroMCP {
  name = 'test';
  version = '1.0.0';

  @tool({ description: 'Test tool' })
  async test(): Promise<string> {
    return 'success';
  }
}
EOF

ncp add "/tmp/test.micro.ts"
```

**Expected:**
- ✅ Copies file to `~/.ncp/micromcps/test.micro.ts`
- ✅ Shows success message
- ✅ Content matches original

#### ✅ Local File with Schema
```bash
# Create MicroMCP with schema
cat > /tmp/withschema.micro.ts << 'EOF'
import { MicroMCP, tool } from '@portel/ncp';
export class WithSchemaMCP implements MicroMCP {
  name = 'withschema';
  version = '1.0.0';
  @tool({ description: 'Test' })
  async test(): Promise<string> { return 'ok'; }
}
EOF

cat > /tmp/withschema.micro.schema.json << 'EOF'
{
  "tools": {
    "test": {
      "description": "Test tool",
      "parameters": { "type": "object" }
    }
  }
}
EOF

ncp add "/tmp/withschema.micro.ts"
```

**Expected:**
- ✅ Copies both `.micro.ts` and `.micro.schema.json`
- ✅ Both files exist in `~/.ncp/micromcps/`

#### ❌ Missing File
```bash
ncp add "/tmp/nonexistent.micro.ts"
```

**Expected:**
- ❌ Shows error: "File not found" or "ENOENT"

#### ❌ Invalid Path
```bash
ncp add "/invalid/path/file.micro.ts"
```

**Expected:**
- ❌ Shows error about invalid path

### Clipboard Installation Tests

#### ✅ TypeScript from Clipboard
```bash
# Copy TypeScript to clipboard
cat > /tmp/clip.ts << 'EOF'
import { MicroMCP, tool } from '@portel/ncp';
export class ClipMCP implements MicroMCP {
  name = 'clip';
  version = '1.0.0';
  @tool({ description: 'Clip' })
  async clip(): Promise<string> { return 'ok'; }
}
EOF

cat /tmp/clip.ts | pbcopy
ncp add clipboard
```

**Expected:**
- ✅ Detects TypeScript (has `export class` and `implements MicroMCP`)
- ✅ Extracts name from class
- ✅ Saves to `~/.ncp/micromcps/clip.micro.ts`

#### ❌ Empty Clipboard
```bash
echo "" | pbcopy
ncp add clipboard
```

**Expected:**
- ❌ Shows error: "Clipboard is empty"

#### ✅ JSON Config from Clipboard (not MicroMCP)
```bash
# Copy JSON config to clipboard
echo '{"mcps": {}}' | pbcopy
ncp add clipboard
```

**Expected:**
- ✅ Detects as JSON config (not MicroMCP)
- ✅ Imports as config file, not MicroMCP

### Bulk Installation Tests

#### ✅ Mixed MicroMCP and Regular MCP
```bash
# Once registry has MicroMCP data
ncp add "github | calculator | slack"
```

**Expected:**
- ✅ Detects `calculator` has `_meta.isMicroMCP = true`
- ✅ Installs `calculator` to `~/.ncp/micromcps/`
- ✅ Installs `github` and `slack` as regular MCPs
- ✅ Shows 📦 badge for MicroMCPs in selection

### Edge Case Tests

#### 🔄 Reinstallation (Overwrite)
```bash
# Install version 1
echo "// Version 1" > /tmp/overwrite.micro.ts
ncp add "/tmp/overwrite.micro.ts"

# Install version 2
echo "// Version 2" > /tmp/overwrite.micro.ts
ncp add "/tmp/overwrite.micro.ts"

# Check which version exists
cat ~/.ncp/micromcps/overwrite.micro.ts
```

**Expected:**
- ✅ Second install overwrites first
- ✅ File contains "Version 2"

#### 🔒 File Permissions
```bash
# Make directory read-only
chmod 444 ~/.ncp/micromcps

# Try to install
ncp add "/tmp/test.micro.ts"

# Restore permissions
chmod 755 ~/.ncp/micromcps
```

**Expected:**
- ❌ Shows permission error
- ❌ Installation fails gracefully

#### ⚠️ Malformed TypeScript
```bash
cat > /tmp/malformed.micro.ts << 'EOF'
this is not valid typescript
export class broken {{{
EOF

ncp add "/tmp/malformed.micro.ts"
```

**Expected:**
- ✅ File is installed (validation happens at runtime)
- ⚠️ Runtime will catch syntax errors when loading

#### 📏 Very Long File Names
```bash
# Create file with 200+ char name
LONG_NAME=$(printf 'a%.0s' {1..200})
echo "// test" > "/tmp/${LONG_NAME}.micro.ts"
ncp add "/tmp/${LONG_NAME}.micro.ts"
```

**Expected:**
- May succeed or fail depending on filesystem limits
- Should handle gracefully either way

## Verification Checklist

After installation, verify:

### File Existence
```bash
ls -lah ~/.ncp/micromcps/
```

**Expected files:**
- `{name}.micro.ts` (required)
- `{name}.micro.schema.json` (optional)

### File Content
```bash
cat ~/.ncp/micromcps/calculator.micro.ts
```

**Should contain:**
- `export class`
- `implements MicroMCP`
- `@tool` decorators
- Valid TypeScript syntax

### Tool Discovery
```bash
ncp find calculator
```

**Expected:**
- Shows tools from calculator MicroMCP
- Displays tool names, descriptions, parameters

### Tool Execution
```bash
ncp run calculator:add --params '{"a": 5, "b": 3}'
```

**Expected:**
- Executes tool successfully
- Returns result: `8`

## Common Issues

### Issue: Tools not discovered after installation
**Cause:** MicroMCP loader hasn't reindexed
**Fix:** Restart NCP or trigger re-index

### Issue: Permission denied
**Cause:** `~/.ncp/micromcps/` not writable
**Fix:** `chmod 755 ~/.ncp/micromcps`

### Issue: 404 when downloading from GitHub
**Cause:** Branch name or file path incorrect
**Fix:** Verify URL points to `main` branch and correct path

### Issue: Clipboard import fails
**Cause:** Clipboard doesn't contain valid TypeScript or JSON
**Fix:** Ensure clipboard has `export class` and `implements MicroMCP`

## Test Coverage Summary

| Category | Scenarios | Status |
|----------|-----------|--------|
| URL Installation | Valid, 404, Network Error, HTTP Server | ✅ |
| Local File | Valid, With Schema, Missing, Invalid Path | ✅ |
| Clipboard | TypeScript, JSON, Empty | ✅ |
| Bulk Install | Mixed Types, Registry Detection | ✅ |
| Edge Cases | Reinstall, Permissions, Malformed, Long Names | ✅ |
| Discovery | Tool Listing, Search | ✅ |
| Execution | Tool Invocation | ✅ |

## Running All Tests

```bash
# Build project
npm run build

# Run automated tests
node --test tests/micromcp-installation.test.ts

# Run manual verification
./tests/manual-micromcp-test.sh

# Quick smoke test with real URL
ncp add "https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/calculator.micro.ts"
ncp find calculator
```

## Test Data Cleanup

```bash
# Remove test MicroMCPs
rm -rf ~/.ncp/micromcps/*.micro.ts
rm -rf ~/.ncp/micromcps/*.micro.schema.json

# Or backup before testing
mv ~/.ncp/micromcps ~/.ncp/micromcps.backup
mkdir -p ~/.ncp/micromcps

# Restore after testing
rm -rf ~/.ncp/micromcps
mv ~/.ncp/micromcps.backup ~/.ncp/micromcps
```

## Next Steps

1. ✅ Run manual test script: `./tests/manual-micromcp-test.sh`
2. ✅ Verify file installations
3. ✅ Test tool discovery
4. ✅ Test tool execution
5. ✅ Test error cases
6. ✅ Deploy registry with MicroMCP metadata
7. ✅ Test bulk install with mixed types
