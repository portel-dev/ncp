# Native Dialog Cross-Platform Support

## Overview

NCP's native dialog fallback system provides confirmation dialogs when MCP clients don't support elicitation. Each platform has different capabilities and limitations.

## Platform Support Matrix

| Platform | Technology | Timeout Support | Status | Tested |
|----------|-----------|----------------|--------|--------|
| **macOS** | AppleScript | ✅ Native (45s) | ✅ Working | ✅ Yes |
| **Windows** | PowerShell MessageBox | ⚠️ Wrapper only | ⚠️ Untested | ❌ No |
| **Linux** | zenity / kdialog | ⚠️ Wrapper only | ⚠️ Untested | ❌ No |

## Platform Details

### macOS (darwin)

**Implementation**: `showMacDialog()` - src/utils/native-dialog.ts:186

**Technology**: AppleScript `display dialog` via System Events

**Features**:
- ✅ Native timeout support (`giving up after`)
- ✅ Custom buttons
- ✅ Icons (caution, note, stop)
- ✅ Tested and working

**Timeout Behavior**:
- Dialog automatically closes after 45 seconds
- Returns empty button string when timed out
- No orphaned dialogs

**Command Format**:
```bash
osascript -e 'tell application "System Events" to return button returned of (display dialog "..." with title "..." buttons {"Approve", "Cancel"} default button 1 with icon caution giving up after 45)'
```

**Known Issues**:
- ✅ Fixed: Multi-line AppleScript with `¬` continuation chars don't work with `-e` flag
- Solution: Single-line command format

---

### Windows (win32)

**Implementation**: `showWindowsDialog()` - src/utils/native-dialog.ts:234

**Technology**: PowerShell `System.Windows.Forms.MessageBox`

**Features**:
- ✅ Custom button types (OK, OKCancel, YesNo)
- ✅ Icons (Warning, Information, Error, Question)
- ⚠️ **NO native timeout support**

**Timeout Behavior**:
- Dialog stays open indefinitely
- Our `Promise.race()` wrapper times out after 45 seconds
- ⚠️ **Dialog remains visible** after timeout (orphaned)
- User must manually close the dialog

**Command Format**:
```powershell
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $result = [System.Windows.Forms.MessageBox]::Show('...', '...', [System.Windows.Forms.MessageBoxButtons]::OKCancel, [System.Windows.Forms.MessageBoxIcon]::Warning); Write-Output $result"
```

**Limitations**:
1. **Orphaned Dialogs**: If AI times out, dialog stays open until user closes it
2. **No Auto-Close**: Windows MessageBox API doesn't support timeout
3. **Untested**: Not tested on real Windows systems

**Potential Issues**:
- Multi-line PowerShell scripts might fail with `-Command` flag
- Fixed to single-line format (similar to macOS fix)

---

### Linux

**Implementation**: `showLinuxDialog()` - src/utils/native-dialog.ts:289

**Technology**:
- Primary: `zenity` (GNOME/GTK)
- Fallback: `kdialog` (KDE/Qt)

**Features**:
- ✅ Custom buttons (via --extra-button)
- ✅ Icons (warning, info, error, question)
- ⚠️ **NO native timeout support**

**Timeout Behavior**:
- Same as Windows - dialogs stay open
- Our `Promise.race()` wrapper times out after 45 seconds
- ⚠️ **Dialog remains visible** after timeout
- User must manually close

**Command Formats**:

**Zenity**:
```bash
zenity --question --title="..." --text="..." --icon-name=warning --ok-label="Approve" --cancel-label="Cancel"
```

**KDialog**:
```bash
kdialog --yesno "..." --title "..." --icon warning --yes-label "Approve" --no-label "Cancel"
```

**Limitations**:
1. **Requires Installation**: zenity or kdialog must be installed
2. **Orphaned Dialogs**: Same as Windows - no auto-close
3. **Environment-Specific**: zenity (GNOME) vs kdialog (KDE)
4. **Untested**: Not tested on real Linux systems

**Installation**:
```bash
# Ubuntu/Debian (GNOME)
sudo apt-get install zenity

# Ubuntu/Debian (KDE)
sudo apt-get install kdialog

# Fedora (GNOME)
sudo dnf install zenity

# Fedora (KDE)
sudo dnf install kdialog
```

---

## Timeout Handling Strategy

### How It Works

All platforms use a **two-layer timeout system**:

#### Layer 1: Native Dialog Timeout (macOS only)
```typescript
// macOS: giving up after 45
const script = `... giving up after 45`;
```

#### Layer 2: JavaScript Promise.race Timeout (all platforms)
```typescript
const result = await Promise.race([
  pending.promise,  // Dialog execution
  new Promise<DialogResult>((_, reject) =>
    setTimeout(() => reject(new Error('DIALOG_TIMEOUT')), 45000)
  )
]);
```

### Behavior by Platform

| Platform | Native Closes | JS Times Out | User Sees | Result |
|----------|---------------|--------------|-----------|---------|
| **macOS** | ✅ Yes (45s) | ✅ Yes (45s) | Dialog disappears | Clean ✅ |
| **Windows** | ❌ No | ✅ Yes (45s) | Dialog stays open | Orphaned ⚠️ |
| **Linux** | ❌ No | ✅ Yes (45s) | Dialog stays open | Orphaned ⚠️ |

### User Experience

**macOS (Best)**:
```
1. Dialog appears
2. User doesn't respond for 45 seconds
3. Dialog automatically closes
4. AI receives timeout response
5. ✅ Clean, no orphaned UI
```

**Windows/Linux (Acceptable)**:
```
1. Dialog appears
2. User doesn't respond for 45 seconds
3. AI receives timeout response
4. ⚠️ Dialog still visible on screen
5. User must manually close it
```

---

## Testing Requirements

### macOS ✅
- [x] Direct dialog test
- [x] Full MCP integration test
- [x] Timeout behavior verified
- [x] Retry mechanism tested

### Windows ❌
- [ ] Test on real Windows 10/11 system
- [ ] Verify PowerShell dialog appears
- [ ] Test timeout behavior
- [ ] Verify orphaned dialog handling
- [ ] Test button text mapping (OK, Cancel, Yes, No)

### Linux ❌
- [ ] Test on Ubuntu (GNOME + zenity)
- [ ] Test on Kubuntu (KDE + kdialog)
- [ ] Test on Fedora
- [ ] Verify timeout behavior
- [ ] Test fallback (zenity → kdialog)
- [ ] Verify button text handling

---

## Known Limitations

### All Platforms
1. **5-second elicitation timeout**: Clients without elicitation support take 5 seconds to fall back to native dialog
2. **45-second dialog timeout**: Short timeout to keep AI responsive
3. **No multi-turn dialogs**: Each confirmation is single-shot

### Windows/Linux Specific
1. **Orphaned dialogs**: User must manually close if timeout occurs
2. **No auto-dismiss**: Platform APIs don't support timeout
3. **Untested**: May have hidden issues

---

## Recommendations

### For Development
1. ✅ **Ship macOS support immediately** - fully tested and working
2. ⚠️ **Mark Windows/Linux as experimental** - needs testing
3. 📝 **Add platform-specific warnings** in documentation

### For Users
1. **macOS users**: Fully supported, native experience
2. **Windows users**: Functional but may see orphaned dialogs
3. **Linux users**: Requires zenity or kdialog installation

### For Future Enhancement
1. **Windows**: Research alternative APIs with timeout support
2. **Linux**: Consider custom dialog with timeout (Python/GTK)
3. **All platforms**: Add visual countdown timer in dialog
4. **Test automation**: CI/CD tests for Windows and Linux

---

## Code Locations

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| `showNativeDialog()` | src/utils/native-dialog.ts | 80-181 | Main entry, timeout wrapper |
| `showMacDialog()` | src/utils/native-dialog.ts | 186-226 | macOS AppleScript |
| `showWindowsDialog()` | src/utils/native-dialog.ts | 234-280 | Windows PowerShell |
| `showLinuxDialog()` | src/utils/native-dialog.ts | 289-301 | Linux dispatcher |
| `showZenityDialog()` | src/utils/native-dialog.ts | 306-341 | GNOME zenity |
| `showKDialogDialog()` | src/utils/native-dialog.ts | 346-368 | KDE kdialog |

---

## Related Documentation

- [Native Dialog Timeout & Retry](./native-dialog-timeout-retry.md) - Complete architecture
- [MCP Prompts for User Interaction](./mcp-prompts-for-user-interaction.md) - Elicitation first
- [Clipboard Security Pattern](./clipboard-security-pattern.md) - Credential collection
