# Testing Summary: Configuration Schema Integration

## Overview

This document provides a comprehensive testing guide for the newly implemented configuration schema functionality in NCP.

## What Was Implemented

### Core Features
1. **SchemaCache** (`src/cache/schema-cache.ts`)
   - Persists configuration schemas to `~/.ncp/cache/schemas/`
   - Enables reuse across `add`, `repair`, and `import` commands

2. **Schema Detection in `ncp add`** (`src/cli/index.ts`)
   - Discovers MCP server before adding to profile
   - Detects `configurationSchema` from server capabilities
   - Prompts interactively for required configuration
   - Falls back gracefully if schema not present

3. **Integration with Existing Services**
   - ConfigSchemaReader: Parses schema from InitializeResult
   - ConfigPrompter: Interactive, validated user input
   - CachePatcher: Updates cache with discovered tools

## Testing Resources

### 📄 Documentation
- **TEST-PLAN.md**: Comprehensive test scenarios and expected outcomes
- **MANUAL-TEST-GUIDE.md**: Step-by-step manual testing instructions
- **This file**: Quick reference and testing summary

### 🧪 Test Artifacts
- **test/mcp-with-schema.js**: Mock MCP server with configuration schema
- **test/run-integration-tests.sh**: Automated test runner

## Quick Testing Guide

### 1. Build and Prepare
```bash
# Build the project
npm run build

# Link for local testing (optional)
npm link

# Verify basic functionality
node dist/index.js --version
node dist/index.js list
```

### 2. Run Automated Tests
```bash
# Execute automated test suite
chmod +x test/run-integration-tests.sh
./test/run-integration-tests.sh
```

### 3. Manual Testing

#### Test A: Schema Detection with Mock Server
```bash
# Add test MCP with schema
node dist/index.js add test-schema node test/mcp-with-schema.js

# Expected: Prompts for TEST_TOKEN (required, masked)
# Verify schema cached
cat ~/.ncp/cache/schemas/test-schema.schema.json | jq .
```

#### Test B: Legacy MCP (No Schema)
```bash
# Add MCP without schema support
node dist/index.js add simple npx -y @modelcontextprotocol/server-everything

# Expected: No prompts, standard add flow
# Verify it works
node dist/index.js list | grep simple
```

#### Test C: Real-world MCP
```bash
# Test with actual MCP (if it supports schema)
node dist/index.js add github npx @modelcontextprotocol/server-github

# Follow prompts if schema is detected
# Verify functionality
node dist/index.js find "github"
```

## Regression Testing

Verify existing functionality remains intact:

```bash
# Core commands
node dist/index.js list
node dist/index.js find "file"
node dist/index.js run <mcp> <tool> '{}'

# Configuration management
node dist/index.js config import <file>
node dist/index.js config validate

# Repair functionality
node dist/index.js repair
```

## Expected Behavior

### ✅ With Configuration Schema

**During `ncp add`:**
```
🔍 Discovering tools and configuration requirements...
✅ Found 2 tools in 150ms

📋 Configuration required

Environment Variables:
  TEST_TOKEN: (required) [sensitive]
    Test API token for validation

Enter TEST_TOKEN: ********

✓ Configuration for test-schema:
  Environment Variables:
    TEST_TOKEN=********

✓ Configuration schema cached

✅ Added test-schema to profile: all
   Tools discovered:
   • echo: Echo back the input message
   • get_config: Show current configuration status
✅ Cache updated for test-schema
```

**Schema Cache File** (`~/.ncp/cache/schemas/test-schema.schema.json`):
```json
{
  "mcpName": "test-schema",
  "schema": {
    "environmentVariables": [
      {
        "name": "TEST_TOKEN",
        "description": "Test API token",
        "type": "string",
        "required": true,
        "sensitive": true
      }
    ]
  },
  "cachedAt": "2025-10-02T...",
  "version": "1.0"
}
```

### ✅ Without Configuration Schema (Legacy)

**During `ncp add`:**
```
🔍 Discovering tools and configuration requirements...
✅ Found 10 tools in 120ms

✅ Added simple to profile: all
   Tools discovered:
   • tool1: description
   • tool2: description
   ...
✅ Cache updated for simple
```

**No prompts, no schema cache created.**

### ✅ Discovery Failure (Graceful Fallback)

**During `ncp add`:**
```
🔍 Discovering tools and configuration requirements...
⚠️ Discovery failed: Package not found
   Proceeding with manual configuration...

✅ Added broken to profile: all
   Profile updated, but cache not built. Run "ncp find <query>" to build cache later.
```

## Verification Checklist

After running tests, verify:

### Build & Execution
- [ ] `npm run build` completes without errors
- [ ] `node dist/index.js --version` returns version
- [ ] No TypeScript compilation errors

### New Features
- [ ] Schema detection works with test MCP
- [ ] Required fields prompt correctly
- [ ] Sensitive fields are masked (password input)
- [ ] Schema is cached in `~/.ncp/cache/schemas/`
- [ ] Cached schema is valid JSON

### Existing Features (Regression)
- [ ] `ncp list` shows all MCPs
- [ ] `ncp find` returns tools
- [ ] `ncp run` executes tools
- [ ] `ncp add` works without schema
- [ ] `ncp config import` functions normally

### Edge Cases
- [ ] Discovery failure handled gracefully
- [ ] MCPs without schema work normally
- [ ] Mixed schema/non-schema MCPs coexist
- [ ] Invalid schemas don't crash
- [ ] User can cancel prompts safely

### File Integrity
- [ ] Profile JSON files are valid
- [ ] Cache JSON files are valid
- [ ] No corrupted configurations

## Troubleshooting

### Issue: Tests fail to run
**Solution**: Ensure project is built and test scripts are executable
```bash
npm run build
chmod +x test/run-integration-tests.sh
chmod +x test/mcp-with-schema.js
```

### Issue: "ncp command not found"
**Solution**: Either link globally or use dist directly
```bash
npm link
# OR
node dist/index.js <command>
```

### Issue: Schema not detected
**Solution**: Verify MCP returns schema in experimental capabilities
```bash
# Check MCP server implementation
cat test/mcp-with-schema.js | grep -A 20 "configurationSchema"
```

### Issue: Existing functionality broken
**Solution**: Compare with git diff to identify changes
```bash
git diff src/cli/index.ts
# Review changes around line 526-617
```

## Success Criteria

**All tests pass if:**
- ✅ Build completes without errors
- ✅ Automated tests pass
- ✅ Manual tests show expected behavior
- ✅ No regression in existing commands
- ✅ Schema caching works correctly
- ✅ Error handling is graceful
- ✅ Documentation is accurate

## Performance Considerations

Schema detection adds minimal overhead:
- **Discovery already happens** in `ncp add` (for tool listing)
- **Schema reading** is a simple object access (~1ms)
- **Schema caching** is one-time per MCP (~5-10ms)
- **Interactive prompting** only for MCPs with required config

**No performance impact on:**
- `ncp list` (reads from cache)
- `ncp find` (reads from cache)
- `ncp run` (direct execution)

## Next Steps

1. **Run Tests**: Execute automated and manual tests
2. **Document Results**: Note any issues or unexpected behavior
3. **Fix Issues**: Address any failing tests
4. **Update Docs**: Ensure user-facing docs reflect new features
5. **Consider Future Work**:
   - Schema integration in `ncp repair` (use cached schemas)
   - Schema integration in `ncp import` (bulk operations)
   - Support top-level `configurationSchema` when MCP SDK updates

## Test Execution Log Template

Use this template to document test execution:

```
Date: YYYY-MM-DD
Tester: [Name]
NCP Version: 1.3.2
Node Version: [version]

Automated Tests:
- [ ] Pre-flight checks passed
- [ ] Regression tests passed
- [ ] Edge case tests passed

Manual Tests:
- [ ] Schema detection with mock MCP
- [ ] Legacy MCP without schema
- [ ] Real-world MCP testing
- [ ] Error handling verification

Issues Found:
1. [Issue description]
   - Severity: [Low/Medium/High]
   - Steps to reproduce: [...]
   - Expected: [...]
   - Actual: [...]

Overall Result: [PASS/FAIL]
Notes: [Additional observations]
```

---

**Ready to test!** Start with `./test/run-integration-tests.sh` and then proceed with manual tests from `MANUAL-TEST-GUIDE.md`.
