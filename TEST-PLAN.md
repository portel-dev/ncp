# Configuration Schema Testing Plan

## Overview
Test both new schema-based configuration and verify existing functionality remains intact.

## Test Categories

### 1. Schema-Based Configuration (NEW)

#### Test 1.1: MCP with Configuration Schema
**Goal**: Verify schema detection and interactive prompting

**Setup**:
- Create test MCP server that returns `configurationSchema` in experimental capabilities
- Schema should require at least one environment variable

**Test Steps**:
```bash
# 1. Add test MCP
ncp add test-schema node test-mcp-with-schema.js

# Expected behavior:
# - Discovery succeeds
# - Schema is detected
# - Prompts for required env vars
# - Saves configuration
# - Caches schema
```

**Expected Output**:
```
🔍 Discovering tools and configuration requirements...
✅ Found X tools in Xms

📋 Configuration required

Environment Variables:
  TEST_TOKEN: (required) [sensitive]
    Test API token for validation

Enter TEST_TOKEN: [user input masked]

✓ Configuration for test-schema:
  Environment Variables:
    TEST_TOKEN=********

✓ Configuration schema cached

✅ Added test-schema to profile: all
```

**Verification**:
- [ ] Schema detected and displayed
- [ ] Interactive prompt appears
- [ ] Configuration saved to profile with env vars
- [ ] Schema cached in `~/.ncp/cache/schemas/test-schema.schema.json`

---

#### Test 1.2: MCP without Configuration Schema (Legacy)
**Goal**: Verify backward compatibility - existing MCPs without schema still work

**Test Steps**:
```bash
# Add MCP that doesn't support configurationSchema
ncp add simple-mcp npx -y @modelcontextprotocol/server-everything
```

**Expected Output**:
```
🔍 Discovering tools and configuration requirements...
✅ Found X tools in Xms

✅ Added simple-mcp to profile: all
   Tools discovered:
   • tool1: description
   ...
✅ Cache updated for simple-mcp
```

**Verification**:
- [ ] No schema prompting
- [ ] MCP added successfully
- [ ] Tools discovered and cached
- [ ] No errors in console

---

#### Test 1.3: Schema Cache Persistence
**Goal**: Verify schemas are saved and can be loaded

**Test Steps**:
```bash
# 1. Add MCP with schema (from Test 1.1)
# 2. Check cache directory
ls -la ~/.ncp/cache/schemas/

# 3. Verify schema file exists and has valid JSON
cat ~/.ncp/cache/schemas/test-schema.schema.json | jq .
```

**Expected**:
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

**Verification**:
- [ ] Schema file created
- [ ] Valid JSON structure
- [ ] Contains correct schema data
- [ ] Timestamp present

---

### 2. Existing Functionality (REGRESSION TESTS)

#### Test 2.1: Basic ncp add (No Schema, No Errors)
**Goal**: Verify standard add flow works

```bash
ncp add filesystem npx -y @modelcontextprotocol/server-filesystem /tmp
```

**Verification**:
- [ ] MCP added to profile
- [ ] Tools discovered
- [ ] Cache updated
- [ ] No unexpected prompts

---

#### Test 2.2: ncp add with Environment Variables
**Goal**: Verify existing --env flag still works

```bash
ncp add test-env npx some-server --env API_KEY=test123 --env DEBUG=true
```

**Expected**:
- Environment variables saved to profile
- No schema detection interferes

**Verification**:
- [ ] Env vars in profile config
- [ ] MCP works with provided env vars

---

#### Test 2.3: ncp list
**Goal**: Verify list command unaffected

```bash
ncp list
```

**Verification**:
- [ ] Shows all profiles
- [ ] Shows all MCPs
- [ ] Tool counts displayed
- [ ] No errors

---

#### Test 2.4: ncp find
**Goal**: Verify tool discovery works

```bash
ncp find "file"
```

**Verification**:
- [ ] Returns relevant tools
- [ ] Shows MCP sources
- [ ] Performance unchanged

---

#### Test 2.5: ncp run
**Goal**: Verify tool execution works

```bash
ncp run filesystem read_file '{"path": "/tmp/test.txt"}'
```

**Verification**:
- [ ] Tool executes correctly
- [ ] Returns expected output
- [ ] No schema-related errors

---

#### Test 2.6: ncp config import
**Goal**: Verify import flow works

```bash
ncp config import test-config.json
```

**Verification**:
- [ ] MCPs imported successfully
- [ ] Discovery runs
- [ ] Cache updated

---

### 3. Error Handling & Edge Cases

#### Test 3.1: Discovery Fails (Connection Error)
**Goal**: Verify graceful fallback when discovery fails

```bash
ncp add broken-mcp npx nonexistent-package
```

**Expected**:
```
🔍 Discovering tools and configuration requirements...
⚠️ Discovery failed: [error message]
   Proceeding with manual configuration...

✅ Added broken-mcp to profile: all
   Profile updated, but cache not built...
```

**Verification**:
- [ ] Error handled gracefully
- [ ] MCP still added to profile (for manual fixing)
- [ ] Clear error message shown

---

#### Test 3.2: Schema Exists but Not Required
**Goal**: Verify MCPs with optional-only config don't prompt

**Setup**: MCP with schema but all parameters are optional

**Expected**:
- Schema detected but no prompts
- MCP added normally

---

#### Test 3.3: Malformed Schema
**Goal**: Verify resilience to invalid schemas

**Setup**: MCP returns invalid schema structure

**Expected**:
- Schema parsing fails gracefully
- Falls back to no-schema flow
- MCP still added

---

#### Test 3.4: User Cancels Schema Prompts
**Goal**: Verify handling of prompt cancellation

**Steps**:
1. Start add with schema
2. Cancel prompt (Ctrl+C or empty input)

**Expected**:
- Graceful exit or skip to manual config
- No corrupted profile state

---

### 4. Integration Tests

#### Test 4.1: Full Workflow
```bash
# 1. Clean slate
rm -rf ~/.ncp/cache
rm -rf ~/.ncp/profiles

# 2. Add MCP with schema
ncp add github npx @modelcontextprotocol/server-github
# Provide GITHUB_TOKEN when prompted

# 3. Verify it works
ncp find "github"
ncp run github search_repositories '{"query": "mcp"}'

# 4. Check schema cache
cat ~/.ncp/cache/schemas/github.schema.json

# 5. Add regular MCP
ncp add filesystem npx @modelcontextprotocol/server-filesystem /tmp

# 6. List everything
ncp list

# 7. Import config
ncp config import claude_desktop_config.json
```

**Verification**:
- [ ] All commands execute successfully
- [ ] Schema caching works
- [ ] Mixed schema/non-schema MCPs coexist
- [ ] No interference between flows

---

## Test Execution Checklist

### Pre-testing Setup
- [ ] Build project: `npm run build`
- [ ] Backup existing config: `cp -r ~/.ncp ~/.ncp.backup`
- [ ] Install NCP globally: `npm link`

### Test Execution
- [ ] Run all Test Category 1 (Schema-based)
- [ ] Run all Test Category 2 (Regression)
- [ ] Run all Test Category 3 (Error handling)
- [ ] Run all Test Category 4 (Integration)

### Post-testing
- [ ] Restore config if needed: `cp -r ~/.ncp.backup ~/.ncp`
- [ ] Document any issues found
- [ ] Fix failing tests
- [ ] Re-run failed tests

---

## Test Helpers

### Create Test MCP Server with Schema
See: `test/mcp-with-schema.js` (to be created)

### Quick Sanity Check
```bash
# One-liner to verify basic functionality
ncp add test-quick npx @modelcontextprotocol/server-everything && ncp list && ncp find "test"
```

---

## Success Criteria

**All tests must pass with:**
- ✅ No TypeScript compilation errors
- ✅ No runtime errors in console
- ✅ Schema detection works when present
- ✅ Legacy MCPs work without schema
- ✅ All existing commands functional
- ✅ Cache and profiles remain valid
- ✅ Error messages are clear and helpful
