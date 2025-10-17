# NCP Testing Guide

## Test Categories

### 1. Unit Tests (CLI - Automated)

These test internal logic without requiring Claude Desktop:

| Test | Command | What It Tests |
|------|---------|---------------|
| **Pattern Matching** | `node tests/confirm-pattern/test-confirm-pattern-fast.js` | Which tools match "modifier" patterns |
| **Unified Discovery** | `node tests/test-unified-discovery.js` | Registry parsing, transport detection |
| **MCP URL Validation** | `node tests/validate-mcp-url.js <url>` | HTTP/SSE endpoint validation |

**Run these in:** Terminal/CLI ✅

**What they DON'T test:**
- ❌ Elicitation dialogs (requires Claude Desktop)
- ❌ User confirmations (requires MCP client)
- ❌ Credential collection UI (requires MCP client)

---

### 2. Integration Tests (Claude Desktop Required)

These test user-facing features that require Claude Desktop:

| Feature | Test Location | Requirements |
|---------|---------------|--------------|
| **Add MCP Confirmation** | See `ELICITATION-TESTING-GUIDE.md` | Claude Desktop + .dxt installed |
| **Remove MCP Confirmation** | See `ELICITATION-TESTING-GUIDE.md` | Claude Desktop + .dxt installed |
| **Credential Collection** | See `ELICITATION-TESTING-GUIDE.md` | Claude Desktop + .dxt installed |

**Run these in:** Claude Desktop ✅

**Cannot run in:** Terminal/CLI ❌

---

## Quick Start

### Testing in CLI (Limited Scope)

```bash
# Test pattern matching logic
node tests/confirm-pattern/test-confirm-pattern-fast.js

# Test registry discovery
node tests/test-unified-discovery.js

# Validate an HTTP/SSE MCP URL
node tests/validate-mcp-url.js https://example.com/mcp/sse
```

**Remember:** These tests DO NOT validate elicitations! They only test backend logic.

### Testing in Claude Desktop (Full Scope)

1. **Build and install:**
   ```bash
   npm run build:dxt:signed
   # Install ncp.dxt in Claude Desktop Settings → Extensions
   ```

2. **Test elicitations:**
   - Follow steps in `ELICITATION-TESTING-GUIDE.md`
   - LOOK FOR dialog boxes in Claude Desktop UI
   - Test both Cancel and Approve buttons

3. **Verify:**
   - Did you see dialog boxes? (Required!)
   - Did Cancel prevent operations? (Required!)
   - Did Approve allow operations? (Required!)

---

## Understanding Test Output

### ✅ This Means PASSED (Correctly):

```
Pattern Matching Tests
✅ Detected 42 modifier tools out of 156 total
✅ Pattern confidence scores in range 35%-86%
```

**Interpretation:** The pattern matching logic works correctly.

**Does NOT mean:** Elicitation dialogs work (that requires Claude Desktop testing)

### ❌ This is MISLEADING:

```
✅ ALL TESTS PASSED
✅ Clipboard pattern working
✅ Confirmations working
```

**If you tested in CLI:** This is WRONG! Elicitations can't work in CLI.

**Reality:** Tests only checked if code doesn't crash, not if dialogs appear.

**To verify elicitations work:** You MUST see dialog boxes in Claude Desktop.

---

## Test Files Explained

### `/tests/confirm-pattern/`

**Purpose:** Test semantic pattern matching for "confirm before run" feature

**Tests:**
- Which tools are classified as "modifiers" (dangerous)
- Confidence scores for pattern matches
- Pattern variations and optimization

**Run:** CLI ✅

**Tests elicitation UI:** NO ❌

### `/tests/test-unified-discovery.js`

**Purpose:** Test registry search and transport detection

**Tests:**
- HTTP/SSE vs stdio transport detection
- Registry entry parsing
- Config building for both transport types

**Run:** CLI ✅

**Tests elicitation UI:** NO ❌

### `/tests/validate-mcp-url.js`

**Purpose:** Validate that a URL is a real MCP server

**Tests:**
- URL reachability
- MCP protocol compliance
- Tool discovery

**Run:** CLI ✅

**Tests elicitation UI:** NO ❌

### `/tests/ELICITATION-TESTING-GUIDE.md`

**Purpose:** Guide for testing elicitation features

**Tests:**
- Add MCP confirmations
- Remove MCP confirmations
- Credential collection

**Run:** Claude Desktop ONLY ✅

**Tests elicitation UI:** YES ✅

---

## Common Testing Mistakes

### Mistake 1: "All tests passed, so elicitations work"

```bash
node tests/confirm-pattern/test-confirm-pattern-fast.js
# Output: ✅ ALL TESTS PASSED

# ❌ WRONG ASSUMPTION: Elicitations work
```

**Reality:** This only tested pattern matching logic, not UI dialogs.

**Fix:** Test elicitations in Claude Desktop by following `ELICITATION-TESTING-GUIDE.md`

### Mistake 2: "I tested in terminal, didn't see dialogs, but tests passed"

```bash
ncp add time-mcp
# No dialog appeared, but operation seemed to succeed

# ❌ WRONG: Elicitations are broken
```

**Reality:** Elicitations can't work in terminal. If no dialogs appeared, it means elicitations were skipped.

**Fix:** Install .dxt in Claude Desktop and test there.

### Mistake 3: "The test prompt said to test via 'AI interface'"

**Old misleading prompts said:**
- "Test via AI interface"
- "Clipboard pattern should work"
- "Secrets should not appear in chat"

**Reality:** These prompts didn't clarify this means "Claude Desktop with NCP installed", not "terminal".

**Fix:** Use `ELICITATION-TESTING-GUIDE.md` which explicitly states requirements.

---

## The Golden Rule

**If you didn't see a dialog box pop up in Claude Desktop, elicitations are NOT working.**

Test output saying "✅ passed" is irrelevant if you're testing elicitations in CLI - they can't work there!

---

## Next Steps

1. **For CLI testing:** Run pattern matching and discovery tests
2. **For elicitation testing:** Follow `ELICITATION-TESTING-GUIDE.md`
3. **For production deployment:** Test in Claude Desktop first, verify dialogs appear

---

## Questions?

**Q: Why don't elicitations work in CLI?**
A: Elicitation requires a UI to show dialog boxes. CLI has no UI, so elicitations fail silently.

**Q: Can I test elicitations in automated tests?**
A: Only with a mock MCP client. Real dialog testing requires Claude Desktop.

**Q: Why did tests say "passed" when elicitations don't work?**
A: CLI tests only check backend logic (pattern matching, parsing), not UI dialogs.

**Q: How do I know if elicitations work?**
A: You must SEE dialog boxes appear in Claude Desktop UI. If no dialogs = elicitations broken.
