# Manual Testing Guide

Quick reference for manually testing the configuration schema integration.

## Quick Start

### 1. Build and Link
```bash
npm run build
npm link
```

### 2. Run Automated Tests
```bash
./test/run-integration-tests.sh
```

### 3. Manual Schema Test
```bash
# Test with mock MCP server
ncp add test-schema node test/mcp-with-schema.js

# Expected prompts:
# - TEST_TOKEN (required, sensitive)
# - TEST_OPTION (optional)
# - data-dir (argument, optional)
```

## Detailed Test Scenarios

### Scenario 1: MCP with Schema (GitHub example)

**Requires**: GitHub personal access token

```bash
# 1. Add GitHub MCP (if it supports configurationSchema)
ncp add github npx @modelcontextprotocol/server-github

# Expected:
# - Should detect schema if available
# - Prompt for GITHUB_TOKEN
# - Mask input (password-style)
# - Cache schema

# 2. Verify it works
ncp find "github"
ncp list | grep github

# 3. Test execution
ncp run github search_repositories '{"query": "model-context-protocol"}'

# 4. Check cached schema
cat ~/.ncp/cache/schemas/github.schema.json | jq .
```

### Scenario 2: Legacy MCP (No Schema)

```bash
# Add MCP that doesn't support configurationSchema
ncp add filesystem npx -y @modelcontextprotocol/server-filesystem /tmp

# Expected:
# - No schema detection
# - No prompts
# - Standard add flow
# - Works normally

# Verify
ncp list | grep filesystem
ncp find "read"
```

### Scenario 3: Schema + Manual Env Vars

```bash
# Add MCP with both schema AND manual env vars
ncp add test-both node test/mcp-with-schema.js --env EXTRA_VAR=value

# Expected:
# - Schema prompts appear
# - Manual env vars are preserved
# - Both merged in final config

# Verify
cat ~/.ncp/profiles/all.json | jq '.mcpServers["test-both"]'
# Should show both TEST_TOKEN (from schema) and EXTRA_VAR (from flag)
```

### Scenario 4: Discovery Failure

```bash
# Add non-existent MCP
ncp add broken npx nonexistent-package-xyz

# Expected:
# - Discovery fails gracefully
# - Error message shown
# - MCP still added to profile (for manual fixing later)
# - No crash or corruption
```

### Scenario 5: Multiple Profiles

```bash
# Add to specific profile
ncp add test-prof node test/mcp-with-schema.js --profiles work

# Verify
ncp list --profile work
cat ~/.ncp/profiles/work.json | jq .
```

## Regression Tests (Existing Functionality)

### Test: ncp list
```bash
ncp list
ncp list --depth 3
ncp list --profile all
```
**Expected**: Works normally, shows all MCPs with tool counts

### Test: ncp find
```bash
ncp find "file"
ncp find "search" --limit 5
```
**Expected**: Returns tools, no schema-related errors

### Test: ncp run
```bash
ncp run filesystem read_file '{"path": "/tmp/test.txt"}'
```
**Expected**: Executes tool correctly

### Test: ncp config import
```bash
# Create test config
cat > /tmp/test-import.json << 'EOF'
{
  "test-import": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-everything"]
  }
}
EOF

ncp config import /tmp/test-import.json
```
**Expected**: Imports successfully, runs discovery

### Test: ncp repair
```bash
# First break an MCP by removing required env var
# Edit ~/.ncp/profiles/all.json and remove an env var

ncp repair

# Expected: Detects failed MCP, offers to fix
```

## Verification Checklist

After running tests, verify:

### Files & Directories
- [ ] `~/.ncp/cache/schemas/` directory exists
- [ ] Schema JSON files are valid
- [ ] Profiles in `~/.ncp/profiles/` are valid JSON
- [ ] Cache in `~/.ncp/cache/all-tools.json` is valid

### Console Output
- [ ] No TypeScript errors
- [ ] No unhandled exceptions
- [ ] Error messages are clear
- [ ] Success messages are informative

### Functionality
- [ ] Schema detection works when present
- [ ] Prompts appear for required fields
- [ ] Sensitive fields are masked
- [ ] Configuration is saved correctly
- [ ] Legacy MCPs work without schema
- [ ] All existing commands work

## Troubleshooting

### Issue: Schema not detected
**Check**:
```bash
# Verify MCP returns schema in capabilities
node test/mcp-with-schema.js
# Send initialize request and check response
```

### Issue: Prompts don't appear
**Check**:
- Is schema marked as required?
- Check `src/cli/index.ts` line 553: `hasRequiredConfig(schema)`

### Issue: Configuration not saved
**Check**:
```bash
cat ~/.ncp/profiles/all.json | jq '.mcpServers["your-mcp"]'
```

### Issue: Build fails
```bash
npm run build 2>&1 | grep error
# Fix TypeScript errors
```

## Clean Up After Testing

```bash
# Remove test MCPs
rm -rf ~/.ncp/profiles/test-*
rm -rf ~/.ncp/cache/schemas/test-*

# Or full reset
rm -rf ~/.ncp
```

## Success Criteria

All tests pass if:
- ✅ No build errors
- ✅ Schema prompting works
- ✅ Legacy MCPs work
- ✅ All existing commands functional
- ✅ Error handling is graceful
- ✅ Documentation is accurate
