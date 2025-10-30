# Elicitation Testing Guide

## ⚠️ UPDATE: Native Dialog Fallback Implemented

**As of build b9fbb54d (2025-10-17):** Since Claude Desktop doesn't currently support MCP elicitation (responds with error -32601 "Method not found"), NCP now automatically falls back to **native OS dialog boxes** when elicitation isn't supported.

**What this means for testing:**
- ✅ Confirmation dialogs WILL appear as **native macOS system dialogs** (not Claude Desktop UI dialogs)
- ✅ Dialogs appear OUTSIDE Claude Desktop window as system-level popups
- ✅ Security is maintained - all dangerous operations still require user approval
- 🔄 When Claude Desktop adds elicitation support in the future, code will automatically use it

See `NATIVE-DIALOG-FALLBACK.md` for full implementation details.

---

## ⚠️ CRITICAL: Where Elicitations Work

**Elicitations (dialog boxes, confirmations, credential collection) ONLY work in MCP CLIENT mode:**

### ✅ Elicitations WORK Here:
- **Claude Desktop** with NCP installed as extension (.dxt) - **NOW USES NATIVE DIALOGS**
- **Claude Desktop** with NCP configured as MCP server - **NOW USES NATIVE DIALOGS**
- **Cursor/Cline/Continue** with NCP configured as MCP server (if they support elicitation)
- Any MCP client that supports elicitation capability

### ❌ Elicitations DO NOT WORK Here:
- **Terminal/CLI** (`node dist/index.js`, `ncp` command)
- **Direct Node.js execution**
- **Automated tests** without MCP client mock

**Why?** Elicitation is a CLIENT-SIDE feature. The server requests a dialog, but only the CLIENT (Claude Desktop, Cursor, etc.) can show it. **However, NCP now falls back to native OS dialogs when elicitation isn't supported.**

---

## Testing Elicitations in Claude Desktop

### Prerequisites

1. **Build the .dxt bundle:**
   ```bash
   npm run build:dxt:signed
   ```

2. **Install in Claude Desktop:**
   - Open Claude Desktop Settings
   - Go to Extensions
   - Install from .dxt file
   - Select `ncp.dxt`

3. **Verify installation:**
   - Look for "NCP - Natural Context Provider" in Extensions
   - Check that it's enabled
   - Verify settings appear (Profile Name, Confirm Modifications Before Run, etc.)

### Test 1: Add MCP Confirmation

**What it tests:** Server-side mandatory confirmation for `ncp:add`

**Steps:**
1. Open Claude Desktop
2. Start a new conversation
3. Say: "Can you add the time MCP for me?"

**Expected behavior:**
- ✅ A **native macOS dialog** appears (OUTSIDE Claude Desktop window, as a system dialog)
- ✅ Dialog shows:
  - Title: "NCP: Confirm MCP Installation"
  - MCP name being added
  - Command and arguments
  - Warning about code execution
  - Buttons: Approve / Cancel
- ✅ If you click Cancel: Operation is cancelled, MCP not added
- ✅ If you click Approve: MCP is added to your profile

**Important:** The dialog is a **native macOS system dialog**, NOT a Claude Desktop UI dialog. It will appear in front of all windows with macOS native styling.

**If dialog doesn't appear:**
- Check Claude Desktop extension is enabled
- Check "Confirm Modifications Before Run" setting is ON
- Check macOS permissions (System Preferences → Security → Automation → Claude)
- Look at logs: `~/Library/Logs/NCP/ncp-*.log` for "falling back to native OS dialog"
- Verify you're using the latest .dxt build (b9fbb54d or newer)

### Test 2: Remove MCP Confirmation

**What it tests:** Server-side mandatory confirmation for `ncp:remove`

**Steps:**
1. First add an MCP (approve the add confirmation)
2. Say: "Can you remove the time MCP?"

**Expected behavior:**
- ✅ **Native macOS dialog** appears asking to confirm removal
- ✅ Shows title: "NCP: Confirm MCP Removal"
- ✅ Shows MCP name being removed
- ✅ Shows which profile it's in
- ✅ Cancel button prevents removal
- ✅ Approve button removes the MCP

**Important:** Like the add confirmation, this is a native macOS system dialog, not a Claude Desktop UI dialog.

### Test 3: Credential Collection (Future)

**What it tests:** Elicitation for collecting API keys/tokens

**Note:** Currently credentials are collected via clipboard pattern, not elicitation dialogs. Future enhancement may add elicitation-based credential collection.

---

## Testing in CLI Mode (Limited)

### What CAN Be Tested in CLI:

✅ **Discovery:**
```bash
ncp find "github tools"
```

✅ **Tool listing:**
```bash
ncp find --depth=2
```

✅ **Config validation:**
```bash
ncp list
```

✅ **Pattern matching logic:**
```bash
node tests/confirm-pattern/test-confirm-pattern-fast.js
```

### What CANNOT Be Tested in CLI:

❌ **Elicitation dialogs** (requires Claude Desktop)
❌ **Confirmation prompts** (requires MCP client)
❌ **Credential collection via elicitation** (requires MCP client)
❌ **User approval flows** (requires MCP client UI)

**Why?** CLI has no UI to show dialog boxes. Elicitation calls will fail silently or timeout.

---

## Common Mistakes

### Mistake 1: Testing Elicitations in Terminal

```bash
# ❌ WRONG - This will NOT show dialog boxes
node dist/index.js
ncp add time-mcp

# Elicitations fail silently, no dialogs shown
```

**Fix:** Install .dxt in Claude Desktop and test there.

### Mistake 2: Assuming CLI Tests Validate Elicitations

```bash
# ❌ WRONG - This only tests pattern matching logic
node tests/confirm-pattern/test-confirm-pattern-fast.js
# Output: "✅ ALL TESTS PASSED"

# This does NOT test if dialogs actually appear!
```

**Fix:** Pattern matching tests are separate from elicitation UI tests.

### Mistake 3: Trusting "Passed" Without Seeing Dialogs

If you ran tests and didn't see ANY dialog boxes pop up in Claude Desktop, the elicitations are NOT working, even if tests report "passed".

**Fix:** Elicitation tests MUST show visible dialog boxes in Claude Desktop UI.

---

## Debugging Elicitations

### If Dialogs Don't Appear:

1. **Verify you're in Claude Desktop:**
   - NOT in terminal
   - NOT in browser
   - In the actual Claude Desktop app

2. **Check extension is loaded:**
   - Settings → Extensions → NCP should be enabled
   - Try disabling and re-enabling

3. **Check setting is enabled:**
   - Settings → Extensions → NCP → "Confirm Modifications Before Run" should be ON

4. **Check logs:**
   ```bash
   # Claude Desktop logs (macOS)
   ~/Library/Logs/Claude/

   # Look for elicitation-related errors
   grep -i "elicit" ~/Library/Logs/Claude/*.log
   ```

5. **Verify server declares elicitation capability:**
   In `src/server/mcp-server.ts:44`, should have:
   ```typescript
   capabilities: {
     tools: {},
     elicitation: {},  // Must be present!
   }
   ```

6. **Check initialization timing:**
   - Elicitation server must be set BEFORE tools are called
   - Check constructor in `src/server/mcp-server.ts:54-60`

---

## Testing Checklist

### Before Testing:
- [ ] Built latest .dxt bundle
- [ ] Installed in Claude Desktop
- [ ] Extension is enabled
- [ ] "Confirm Modifications Before Run" is ON
- [ ] Restarted Claude Desktop after install

### During Testing:
- [ ] I am using Claude Desktop app (not terminal)
- [ ] I will LOOK FOR dialog boxes in the UI
- [ ] I will test both Cancel and Approve buttons
- [ ] I will verify operations are blocked when cancelled

### After Testing:
- [ ] Dialog boxes appeared (visually confirmed)
- [ ] Cancel button prevented operations
- [ ] Approve button allowed operations
- [ ] No secrets appeared in chat history
- [ ] Error messages are clear and helpful

---

## Summary

**Remember:**
- 🖥️ **NEW:** Confirmations now use **native macOS system dialogs** (not Claude Desktop UI)
- 📦 Dialogs appear OUTSIDE Claude Desktop window as system popups
- ⌨️ CLI = NO dialogs possible (still true)
- ✅ Test confirmations = Use Claude Desktop, look for native macOS dialogs
- ❌ Test in terminal = Dialogs won't work
- 🔄 Future: When Claude Desktop adds elicitation support, code will automatically use it

**The Golden Rule:**
If you didn't see a **native macOS dialog box** pop up (outside Claude Desktop window), confirmations aren't working, regardless of what test output says!

**What to look for:**
- macOS native dialog with system styling
- Dialog appears in front of ALL windows (not just Claude Desktop)
- Title bar says "NCP: Confirm MCP Installation" or "NCP: Confirm MCP Removal"
- Buttons use macOS native button style
