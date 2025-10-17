# Graceful Dialog Failure Handling

## Overview

When NCP's confirmation dialog system fails due to platform limitations or missing dependencies, instead of blocking operations, NCP provides clear manual installation instructions to help users complete their desired actions.

## Problem Statement

NCP requires user confirmation before adding/removing MCPs for security. Confirmation is attempted through:
1. **MCP elicitation** (if client supports it)
2. **Native OS dialogs** (fallback for clients without elicitation)

However, native dialogs can fail due to:
- **Linux**: Missing zenity or kdialog packages
- **Windows**: PowerShell execution restrictions
- **macOS**: AppleScript permissions denied
- **Other**: Platform-specific issues

**Previous behavior**: When dialog failed, NCP blocked the operation with a generic error, leaving users unable to proceed.

**Problem**: This blocks legitimate user actions due to our limitation, not user choice.

## Solution: Manual Installation Instructions

When the dialog system fails, NCP now provides comprehensive manual installation instructions instead of just blocking.

### Example Response for Failed Installation

```
⚠️  Cannot show confirmation dialog: Neither zenity nor kdialog is available

For security, NCP requires user confirmation before installing MCPs.

Since the dialog system isn't working on your system, you can install manually:

1. Open your profile configuration file:
   /Users/username/.ncp/profiles/default.json

2. Add this to the "mcpServers" section:
   "github": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-github"]
   }

3. Save the file

4. Restart NCP or your MCP client

⚙️  Full command for reference: npx -y @modelcontextprotocol/server-github

💡 If this MCP requires API keys/credentials, add them to the "env" field in the config.
```

### Example Response for Failed Removal

```
⚠️  Cannot show confirmation dialog: Neither zenity nor kdialog is available

For security, NCP requires user confirmation before removing MCPs.

Since the dialog system isn't working on your system, you can remove manually:

1. Open your profile configuration file:
   /Users/username/.ncp/profiles/default.json

2. Find and delete the "github" entry from the "mcpServers" section

3. Save the file

4. Restart NCP or your MCP client

💡 Make sure to preserve valid JSON format (watch for trailing commas).
```

## Benefits

### 1. Security Maintained ✅
- User confirmation still required (manual edit confirms intent)
- No automatic installation of untrusted code
- Transparent about what's being added/removed

### 2. User Goals Achieved ✅
- Users can still get what they want
- AI can guide them through manual process
- Clear, actionable steps provided

### 3. Transparency ✅
- Explains the limitation clearly
- Shows exact configuration to add
- Reveals the underlying command being executed

### 4. Better UX ✅
- Doesn't dead-end the user
- AI remains helpful despite our limitation
- User learns about NCP configuration format

## Implementation Details

### Code Location
`src/internal-mcps/ncp-management.ts`

### Add Operation (lines 272-298)
```typescript
} catch (nativeError: any) {
  // Dialog system failed - provide manual installation instructions
  logger.error(`Native dialog failed: ${nativeError.message}`);

  const profilePath = await this.profileManager!.getProfilePath(profile);
  const argsStr = commandArgs.length > 0 ? commandArgs.join(' ') : '';
  const configToAdd = {
    command,
    args: commandArgs
  };

  return {
    success: false,
    error: `⚠️  Cannot show confirmation dialog: ${nativeError.message}\n\n` +
           `For security, NCP requires user confirmation before installing MCPs.\n\n` +
           `Since the dialog system isn't working on your system, you can install manually:\n\n` +
           `1. Open your profile configuration file:\n` +
           `   ${profilePath}\n\n` +
           `2. Add this to the "mcpServers" section:\n` +
           `   "${mcpName}": ${JSON.stringify(configToAdd, null, 2).split('\n').join('\n   ')}\n\n` +
           `3. Save the file\n\n` +
           `4. Restart NCP or your MCP client\n\n` +
           `⚙️  Full command for reference: ${command} ${argsStr}\n\n` +
           `💡 If this MCP requires API keys/credentials, add them to the "env" field in the config.`
  };
}
```

### Remove Operation (lines 443-461)
```typescript
} catch (nativeError: any) {
  // Dialog system failed - provide manual removal instructions
  logger.error(`Native dialog failed: ${nativeError.message}`);

  const profilePath = await this.profileManager!.getProfilePath(profile);

  return {
    success: false,
    error: `⚠️  Cannot show confirmation dialog: ${nativeError.message}\n\n` +
           `For security, NCP requires user confirmation before removing MCPs.\n\n` +
           `Since the dialog system isn't working on your system, you can remove manually:\n\n` +
           `1. Open your profile configuration file:\n` +
           `   ${profilePath}\n\n` +
           `2. Find and delete the "${mcpName}" entry from the "mcpServers" section\n\n` +
           `3. Save the file\n\n` +
           `4. Restart NCP or your MCP client\n\n` +
           `💡 Make sure to preserve valid JSON format (watch for trailing commas).`
  };
}
```

## User Scenarios

### Scenario 1: Extension User Without Global CLI

**Context**: User running NCP as Claude Desktop extension (.dxt), global CLI not enabled

**What Happens**:
1. AI tries to add MCP via `ncp:add`
2. Elicitation times out (5s)
3. Native dialog fallback fails (platform issue)
4. NCP detects: Extension mode + global CLI disabled

**NCP Response**:
```
⚠️  Cannot show confirmation dialog: [error message]

For security, NCP requires user confirmation before installing MCPs.

📌 EASIEST OPTION: Enable the global NCP command

1. Edit your Claude Desktop extension settings (.dxt file)
2. Set: "enableGlobalCLI": true
3. Restart Claude Desktop
4. Use command: ncp add github npx -y @modelcontextprotocol/server-github

────────────────────────────────────────

📝 OR: Install manually by editing configuration

1. Open your profile configuration file:
   /Users/username/.ncp/profiles/all.json

2. Add this to the "mcpServers" section:
   "github": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-github"]
   }

[...]
```

**User Action**: Either:
- **Option 1** (Easier): Enables global CLI in extension settings, then uses `ncp add` command
- **Option 2**: Opens profile JSON and adds MCP config manually

**Result**: ✅ User gets the MCP they want via the easiest path

### Scenario 2: Linux User Without Zenity

**Context**: User on Ubuntu without zenity installed (standalone NCP or extension with global CLI enabled)

**What Happens**:
1. AI tries to add MCP via `ncp:add`
2. Elicitation times out (5s)
3. Native dialog fallback attempts zenity → fails
4. Native dialog fallback attempts kdialog → fails
5. Error thrown: "Neither zenity nor kdialog is available"

**NCP Response**:
```
⚠️  Cannot show confirmation dialog: Neither zenity nor kdialog is available

[Manual installation instructions with exact JSON to add]
```

**User Action**: Opens `~/.ncp/profiles/default.json`, adds the MCP config manually, saves, restarts

**Result**: ✅ User gets the MCP they want, security maintained

### Scenario 3: Windows User with PowerShell Restrictions

**Context**: Corporate Windows machine with PowerShell execution policy restrictions

**What Happens**:
1. AI tries to add MCP via `ncp:add`
2. Elicitation times out (5s)
3. Native dialog fallback attempts PowerShell MessageBox → fails with execution policy error
4. Error thrown: "PowerShell dialog failed: execution policy"

**NCP Response**:
```
⚠️  Cannot show confirmation dialog: PowerShell dialog failed: execution policy

[Manual installation instructions with exact JSON to add]
```

**User Action**: Opens profile JSON, adds MCP config manually

**Result**: ✅ User gets the MCP they want despite PowerShell restrictions

### Scenario 4: macOS User with AppleScript Denied

**Context**: macOS user who denied AppleScript permissions in System Preferences

**What Happens**:
1. AI tries to add MCP via `ncp:add`
2. Elicitation times out (5s)
3. Native dialog fallback attempts AppleScript → permission denied
4. Error thrown: "AppleScript permission denied"

**NCP Response**:
```
⚠️  Cannot show confirmation dialog: AppleScript permission denied

[Manual installation instructions with exact JSON to add]
```

**User Action**: Either:
- Opens profile JSON and adds MCP config manually, OR
- Grants AppleScript permission and retries

**Result**: ✅ User can proceed either way

## Decision Flow

```
User requests: Add/Remove MCP
         ↓
Try elicitation (5s timeout)
         ↓
    Supported? ─── Yes ──→ Show elicitation UI → Get user response → Proceed
         ↓
        No
         ↓
Try native dialog (45s timeout)
         ↓
    Works? ───────── Yes ──→ Show OS dialog → Get user response → Proceed
         ↓
        No
         ↓
Dialog failed (our limitation)
         ↓
Return manual installation instructions
         ↓
AI presents instructions to user
         ↓
User manually edits config
         ↓
✅ User achieves goal, security maintained
```

## Comparison: Before vs After

### Before (Blocking)
```
User: "Add the time MCP"
AI: "I'll add it for you..."
NCP: "⛔ Cannot show confirmation dialog. Installation cancelled for security."
AI: "Sorry, I can't install it because the dialog system isn't working."
User: ❌ Stuck, can't get the MCP
```

### After (Helpful)
```
User: "Add the time MCP"
AI: "I'll add it for you..."
NCP: "⚠️ Cannot show dialog, here are manual installation instructions..."
AI: "The automatic installer isn't working on your system, but I can help you add it manually:
     1. Open ~/.ncp/profiles/default.json
     2. Add this configuration: [shows exact JSON]
     3. Save and restart"
User: ✅ Follows steps, gets the MCP
```

## Security Considerations

### Is This Secure?

**Yes.** Manual installation is just as secure as automated installation with confirmation:

1. **Intent Confirmation**: User must manually edit config (confirms intent)
2. **Transparency**: User sees exact command/config being added
3. **No Auto-Execution**: User must explicitly save and restart
4. **Same Result**: Whether automated or manual, same config gets added

**Key Insight**: The confirmation dialog's purpose is to ensure user intent and transparency. Manual installation achieves both.

### Why Not Just Auto-Install?

We could bypass the dialog and auto-install when dialog fails. **We don't do this** because:

1. **Security**: Users should always know what's being installed
2. **Transparency**: Clear review of command/config before installation
3. **Control**: User can modify config before saving (e.g., add custom args)
4. **Education**: User learns about NCP config format

## Testing

### Test Script
`test-dialog-failure-handling.js`

Simulates dialog failure and demonstrates manual installation instructions.

```bash
node test-dialog-failure-handling.js
```

### Expected Output
- ✅ Dialog fails as expected
- ✅ Manual installation instructions generated
- ✅ Instructions include profile path
- ✅ Instructions include exact JSON to add
- ✅ Clear steps for user to follow

## Related Documentation

- [Native Dialog Cross-Platform Support](./native-dialog-cross-platform.md) - Platform-specific dialog implementations
- [Native Dialog Timeout & Retry](./native-dialog-timeout-retry.md) - Timeout and retry mechanisms
- [MCP Prompts for User Interaction](./mcp-prompts-for-user-interaction.md) - Elicitation-first strategy

## Future Enhancements

### Possible Improvements

1. **One-Click Install Script**: Generate a shell script user can run to add the MCP
2. **Visual Config Editor**: Launch browser-based config editor if dialogs don't work
3. **Clipboard Copy**: Automatically copy JSON to clipboard for easier pasting
4. **Link to Troubleshooting**: Provide link to fix dialog system (install zenity, enable PowerShell, etc.)

### Not Planned

- **Auto-install without confirmation**: Would compromise security
- **Silent fallback**: User should always be informed about limitations

---

## Summary

**Problem**: Dialog failure blocked user actions

**Solution**: Provide manual installation instructions when dialogs fail

**Benefits**:
- ✅ Security maintained (user still confirms via manual edit)
- ✅ User goals achieved (can still install/remove MCPs)
- ✅ Better UX (AI remains helpful despite our limitation)
- ✅ Transparency (user sees exact config)

**Philosophy**: When automation fails, empower users with clear manual steps rather than blocking them.
