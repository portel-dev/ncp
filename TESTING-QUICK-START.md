# Testing Quick Start

## TL;DR - Run This Now

```bash
# 1. Build
npm run build

# 2. Run automated tests
./test/run-integration-tests.sh

# 3. Test schema detection manually
node dist/index.js add test-schema node test/mcp-with-schema.js
# Follow prompts for TEST_TOKEN

# 4. Verify existing functionality
node dist/index.js list
node dist/index.js find "echo"
```

## What To Look For

### ✅ Good Signs
- Build completes without errors
- Test script shows mostly green checkmarks
- Schema prompts appear when adding test-schema
- Input is masked for sensitive fields
- File created: `~/.ncp/cache/schemas/test-schema.schema.json`
- All existing commands (list, find, run) work normally

### ❌ Red Flags
- TypeScript compilation errors
- Test script shows red X marks
- No schema detection prompt
- Crashes or unhandled exceptions
- Existing commands broken
- Profile or cache JSON is malformed

## Three-Tier Testing Approach

### Tier 1: Automated (5 minutes)
```bash
./test/run-integration-tests.sh
```
Tests existing functionality automatically.

### Tier 2: Schema Features (10 minutes)
```bash
# Test with mock MCP
node dist/index.js add test-schema node test/mcp-with-schema.js

# Verify caching
cat ~/.ncp/cache/schemas/test-schema.schema.json | jq .

# Test without schema
node dist/index.js add simple npx -y @modelcontextprotocol/server-everything
```

### Tier 3: Real-world (15 minutes)
```bash
# Test with actual MCP
node dist/index.js add github npx @modelcontextprotocol/server-github

# Test repair
node dist/index.js repair

# Test import
node dist/index.js config import ~/path/to/claude_desktop_config.json
```

## Common Issues & Fixes

| Issue | Quick Fix |
|-------|-----------|
| "ncp not found" | `npm link` or use `node dist/index.js` |
| Build fails | Check `npm run build 2>&1 \| grep error` |
| Schema not detected | Verify test MCP: `node test/mcp-with-schema.js` |
| Tests fail | Check permissions: `chmod +x test/*.sh` |

## Success Checklist

- [ ] `npm run build` - No errors
- [ ] `./test/run-integration-tests.sh` - All pass
- [ ] Schema prompts appear for test-schema
- [ ] Schema cached in `~/.ncp/cache/schemas/`
- [ ] `ncp list` works
- [ ] `ncp find` works
- [ ] `ncp run` works
- [ ] No crashes or exceptions

## Files to Review

- `TEST-PLAN.md` - Comprehensive test scenarios
- `test/MANUAL-TEST-GUIDE.md` - Step-by-step manual tests
- `test/TESTING-SUMMARY.md` - Complete testing overview
- `test/run-integration-tests.sh` - Automated test runner

## Need Help?

1. Check build output: `npm run build 2>&1 | less`
2. Check test logs: `./test/run-integration-tests.sh 2>&1 | tee test-results.log`
3. Review changes: `git diff src/cli/index.ts`
4. Verify files exist:
   - `src/cache/schema-cache.ts`
   - `src/services/config-schema-reader.ts`
   - `src/services/config-prompter.ts`

## One-Liner Health Check

```bash
npm run build && echo "Build: ✓" && node dist/index.js list > /dev/null && echo "List: ✓" && node dist/index.js find "test" > /dev/null && echo "Find: ✓" && echo "All basic checks passed!"
```

---

**Start testing now**: `./test/run-integration-tests.sh`
