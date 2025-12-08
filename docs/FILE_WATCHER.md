# FileWatcher: Dynamic Discovery of Skills and Photons

## Overview

The FileWatcher enables **automatic discovery and indexing** of skills and photons without requiring NCP to restart. When you add, modify, or delete skill/photon files, NCP immediately detects and makes them available.

This replaces the old workflow where you had to restart NCP to use newly added skills and photons.

## How It Works

1. **File Monitoring**: FileWatcher continuously monitors:
   - `~/.ncp/skills/` directory for skill changes
   - `~/.ncp/photons/` directory for photon changes (if Photon runtime is enabled)

2. **Event Detection**: When files are added, modified, or deleted:
   - Event is debounced to prevent duplicate processing
   - Temporary/system files are automatically filtered out
   - Orchestrator is notified via callbacks

3. **Index Update**: Skills/photons are:
   - Loaded and parsed
   - Added to discovery index
   - Made available to Claude immediately
   - Execution time tracked and logged

## Configuration

### Environment Variables

#### `NCP_ENABLE_SKILLS` (default: true)
Enables skill discovery. Set to `false` to disable skills:
```bash
export NCP_ENABLE_SKILLS=false
```

#### `NCP_ENABLE_PHOTON_RUNTIME` (default: false)
Enables photon runtime. Set to `true` to enable photons:
```bash
export NCP_ENABLE_PHOTON_RUNTIME=true
```

**Note**: FileWatcher only starts if at least one of these is enabled.

#### `NCP_FILE_WATCHER_DEBOUNCE_MS` (default: 300)
Debounce interval in milliseconds. Prevents rapid file changes from triggering multiple updates:
```bash
export NCP_FILE_WATCHER_DEBOUNCE_MS=500  # 500ms debounce
```

- **Lower values** (100-200ms): More responsive, but higher CPU usage
- **Higher values** (500-1000ms): Less responsive, but more stable with slow editors
- **Default (300ms)**: Good balance for most use cases

## Usage Examples

### Adding a New Skill

1. **Create skill directory and file**:
```bash
mkdir -p ~/.ncp/skills/my-skill
echo "# My Skill" > ~/.ncp/skills/my-skill/SKILL.md
```

2. **NCP automatically detects it**:
```
⭐ Skill added (auto-detected): my-skill
✅ Skill indexed: my-skill (125ms)
```

3. **Skill is immediately available** to Claude without restart

### Modifying an Existing Skill

1. **Edit the SKILL.md file**:
```bash
nano ~/.ncp/skills/my-skill/SKILL.md
```

2. **NCP automatically detects the change**:
```
🔄 Skill modified (auto-detected): my-skill
✅ Skill updated: my-skill (142ms)
```

3. **Updated version available immediately**

### Removing a Skill

1. **Delete the skill directory**:
```bash
rm -rf ~/.ncp/skills/my-skill
```

2. **NCP automatically detects removal**:
```
🗑️  Skill removed (auto-detected): my-skill
✅ Skill unindexed: my-skill
```

3. **Skill no longer available** to Claude

## File Filtering

FileWatcher automatically ignores:
- **Editor backups**: `~`, `.swp`, `.swo`, `.bak`
- **Temp files**: `.tmp`, `.orig`
- **macOS**: `._*`, `.DS_Store`
- **Windows**: `Thumbs.db`
- **Office**: `~123` (Word/Excel backups)

These are silently ignored and don't trigger updates.

## Logging

### Log Levels

Enable detailed logging to debug FileWatcher:
```bash
export NCP_DEBUG=true
```

### Log Messages

Different emoji indicators show operation type:
- **⭐**: File added (new detection)
- **🔄**: File modified (update detection)
- **🗑️**: File deleted (removal detection)
- **✅**: Operation succeeded
- **❌**: Operation failed
- **📁**: FileWatcher startup/shutdown

### Example Log Output

```
📁 File watcher started for skills and photons directories (debounce: 300ms)
⭐ Skill added (auto-detected): my-skill
✅ Skill indexed: my-skill (125ms)
🔄 Skill modified (auto-detected): my-skill
✅ Skill updated: my-skill (142ms)
🗑️  Skill removed (auto-detected): my-skill
✅ Skill unindexed: my-skill
```

## Troubleshooting

### FileWatcher Not Detecting Changes

**Symptom**: Files added but not appearing in NCP

**Causes & Solutions**:

1. **Skills are disabled**:
   ```bash
   # Check if enabled (should be 'true')
   echo $NCP_ENABLE_SKILLS

   # Enable if disabled
   export NCP_ENABLE_SKILLS=true
   ```

2. **Photon runtime disabled** (for photons):
   ```bash
   # Enable photon runtime
   export NCP_ENABLE_PHOTON_RUNTIME=true
   ```

3. **File in wrong location**:
   - Skills must be in `~/.ncp/skills/`
   - Photons must be in `~/.ncp/photons/`
   - Use full paths: `~` expands to your home directory

4. **File not matching expected format**:
   - Skills: Directory with `SKILL.md` file
   - Photons: Files ending in `.photon.ts` or `.photon.js`

5. **Editor hasn't saved file**:
   - FileWatcher only detects saved changes
   - Ensure file is fully saved before checking logs

### Updates Taking Too Long

**Symptom**: Skill/photon updates are slow (>1-2 seconds)

**Possible Causes**:

1. **Debounce interval too high**:
   ```bash
   # Reduce debounce (but watch for duplicates)
   export NCP_FILE_WATCHER_DEBOUNCE_MS=200
   ```

2. **Slow filesystem**:
   - Updates are slower on network shares or cloud storage
   - Consider using local filesystem for `.ncp/` directory

3. **Large skill/photon files**:
   - Parsing large files takes time
   - Consider splitting into smaller files

### FileWatcher Not Starting

**Symptom**: No "File watcher started" message in logs

**Possible Causes**:

1. **Both features disabled**:
   ```bash
   # At least one must be enabled
   export NCP_ENABLE_SKILLS=true
   ```

2. **NCP not initialized yet**:
   - FileWatcher starts during background initialization
   - Wait for "MCP server ready" message

3. **File system permissions**:
   ```bash
   # Check directory is readable
   ls -la ~/.ncp/skills/
   ls -la ~/.ncp/photons/
   ```

### Duplicate Updates

**Symptom**: Same skill updated multiple times for single change

**Cause**: Debounce interval too low, editor creates multiple save events

**Solution**:
```bash
# Increase debounce to reduce duplicates
export NCP_FILE_WATCHER_DEBOUNCE_MS=500
```

## Performance Considerations

### Memory Usage

FileWatcher uses minimal memory:
- Per-file debounce timers: ~1KB each
- Watcher instances: ~2MB total
- No significant impact on NCP's memory footprint

### CPU Usage

FileWatcher has minimal CPU impact:
- Idle state: <0.1% CPU
- Processing updates: <1% CPU per update
- Debounce prevents rapid processing

### Filesystem Impact

FileWatcher uses OS-level file monitoring:
- **macOS**: Uses `FSEvents` (efficient)
- **Linux**: Uses `inotify` (efficient)
- **Windows**: Uses file system watcher API (efficient)

No polling or scanning required.

## Best Practices

### 1. Use Local Filesystem

Avoid:
- Network shares (NFS, SMB)
- Cloud-synced folders (Dropbox, OneDrive, iCloud)
- Virtual filesystems

These can have delayed file change detection.

### 2. One SKILL.md Per Directory

✅ Good:
```
~/.ncp/skills/
  └─ my-skill/
     └─ SKILL.md
```

❌ Bad:
```
~/.ncp/skills/
  └─ SKILL.md  (ambiguous - what's the skill name?)
```

### 3. Use Consistent File Extensions

✅ Good:
```
my-photon.photon.ts
my-photon.photon.js
```

❌ Bad:
```
my-photon.ts (missing .photon marker)
```

### 4. Let Editor Fully Save

Always ensure files are fully saved:
- VSCode: Wait for white dot to disappear from tab
- Vim: Confirm `:w` command completes
- Don't force-save in middle of write

### 5. Check Logs When Adding Skills

Always verify the skill was detected:
```bash
# Look for success message
tail -50 ~/.ncp/logs/ncp.log | grep -i "skill.*indexed"
```

## Advanced Configuration

### Custom Debounce Per Skill

Currently not supported, but can be achieved by:
1. Temporarily increase debounce for bulk operations
2. Return to normal debounce for regular use

```bash
# Bulk add multiple skills
export NCP_FILE_WATCHER_DEBOUNCE_MS=1000
# ...copy/add many skill files...
# Then reduce back for normal use
export NCP_FILE_WATCHER_DEBOUNCE_MS=300
```

### Monitoring FileWatcher Events

To track all file changes:
```bash
export NCP_DEBUG=true
tail -f ~/.ncp/logs/ncp.log | grep -E "⭐|🔄|🗑️|❌"
```

## FAQ

**Q: Does FileWatcher require a restart?**
A: No! That's the whole point - NCP keeps running and detects changes automatically.

**Q: Can I disable FileWatcher but keep skills enabled?**
A: Currently no - if skills are enabled, FileWatcher will start. This is by design to ensure consistency.

**Q: What if I'm editing a skill and someone else is too?**
A: The last save wins. FileWatcher detects the final modification and indexes that version. Consider using version control for collaboration.

**Q: How long does a skill update take?**
A: Typically 100-300ms, depending on:
- File size
- Filesystem speed
- System load
- Debounce interval

**Q: Can I use network shares for ~/.ncp/?**
A: Not recommended. Network latency causes delayed change detection. Use local filesystem for best results.

**Q: What happens if a skill has syntax errors?**
A: The update fails with an error message. Previous version remains in index. Fix the error and re-save to update.

**Q: Do deleted skills clean up immediately?**
A: Yes. Deletion removes the skill from discovery index immediately (within debounce window).

## See Also

- [Skills Documentation](./SKILLS.md)
- [Photons Documentation](./PHOTONS.md)
- [NCP Configuration](./CONFIGURATION.md)
