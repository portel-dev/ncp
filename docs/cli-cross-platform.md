# CLI Tool Discovery - Cross-Platform Support

## Overview

The CLI tool catalog now supports **Linux, macOS, and Windows** with platform-specific filtering.

## Platform Detection

- **Linux**: `process.platform === 'linux'`
- **macOS**: `process.platform === 'darwin'`
- **Windows**: `process.platform === 'win32'`

## Command Existence Checking

### Unix (Linux/macOS)
```bash
which ffmpeg
```

### Windows
```cmd
where ffmpeg
```

The scanner automatically uses the correct command based on platform.

## Tool Catalog Organization

### Cross-Platform Tools (No platform restriction)
- ffmpeg, git, docker, npm, curl, etc.
- These work on all platforms (if installed)

### Unix-Only Tools (Linux/macOS)
- grep, sed, awk, find, ssh, tar
- Most text processing and file utilities
- Marked with: `platforms: ['linux', 'darwin']`

### Windows-Only Tools
- powershell, cmd, robocopy, tasklist, ipconfig
- Marked with: `platforms: ['win32']`

## Windows-Specific Tools Added

### Shell & Scripting
- **powershell** - Windows PowerShell
- **pwsh** - PowerShell Core (cross-platform)
- **cmd** - Windows Command Prompt
- **wsl** - Windows Subsystem for Linux

### Package Managers
- **winget** - Windows Package Manager
- **choco** - Chocolatey
- **scoop** - Scoop installer

### File Operations
- **robocopy** - Robust file copy
- **xcopy** - Extended copy

### Process Management
- **tasklist** - List processes
- **taskkill** - Kill processes

### Network
- **netsh** - Network shell
- **ipconfig** - IP configuration

### System
- **systeminfo** - System information
- **wmic** - WMI command-line

## Total Tool Count

- **Cross-platform**: ~90 tools
- **Unix-only**: ~50 tools
- **Windows-only**: ~15 tools
- **Total catalog**: ~155 tools

## Usage on Different Platforms

### macOS (current)
```bash
export NCP_CLI_AUTOSCAN=true
ncp find "text processing"
# Returns: grep, sed, awk, etc.
```

### Linux
```bash
export NCP_CLI_AUTOSCAN=true
ncp find "text processing"
# Returns: grep, sed, awk, etc.
```

### Windows
```cmd
set NCP_CLI_AUTOSCAN=true
ncp find "process list"
# Returns: tasklist, wmic, etc.
```

## Testing

### Test on macOS/Linux
```bash
node tests/debug-cli-scanner.cjs
# Should find Unix tools (grep, sed, find, ssh, etc.)
# Should NOT find Windows tools
```

### Test on Windows
```cmd
node tests\debug-cli-scanner.cjs
# Should find Windows tools (tasklist, ipconfig, etc.)
# Should NOT find Unix tools (unless in WSL/Git Bash)
```

## Platform-Specific Notes

### Windows Considerations
1. **Git Bash** - Has Unix tools, platform detection shows 'win32'
2. **WSL** - Full Linux environment, shows as 'linux'
3. **PowerShell** - Native Windows, use Windows tools

### macOS Considerations
1. Most Unix tools pre-installed
2. Homebrew for additional tools
3. GNU versions available via Homebrew (gnu-sed, gnu-tar)

### Linux Considerations
1. Most tools pre-installed
2. Package manager varies (apt, yum, dnf)
3. Minimal systems may lack some tools

## Future Enhancements

- [ ] Detect WSL vs native Windows
- [ ] Suggest package manager commands for missing tools
- [ ] Add more Windows PowerShell cmdlets
- [ ] Platform-specific tool aliases (dir → ls on Windows)
