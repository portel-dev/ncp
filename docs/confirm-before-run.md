# Confirm Modifications Before Executing

## Overview

NCP includes server-side safety enforcement that asks for confirmation before tools make modifications. This protects against unwanted writes, deletes, and executions.

**Simple toggle:**
```bash
ncp settings modifications on   # Enable (default)
ncp settings modifications off  # Disable
```

Under the hood, it uses a tag-based semantic matching system to identify dangerous operations.

## Quick Start

### Enable/Disable

```bash
# Check current status
ncp settings modifications

# Enable confirmations (default)
ncp settings modifications on

# Disable confirmations
ncp settings modifications off
```

### Manage Approved Tools

```bash
# List tools you've approved
ncp settings whitelist list

# Clear all approved tools
ncp settings whitelist clear

# Remove specific tool
ncp settings whitelist remove filesystem:write_file
```

## How It Works

The system uses **semantic vector similarity** to match tool descriptions against a tag-based pattern. When a tool's description closely matches the pattern, NCP prompts for confirmation before executing.

### What Gets Caught

With default settings, these operations require confirmation:
- **File operations**: Writing, deleting, moving files
- **Command execution**: Shell commands, Docker, Kubernetes
- **Database operations**: Updates, deletes, drops
- **Deployments**: Production pushes, code deploys
- **Communication**: Sending emails, posting messages
- **Financial**: Money transfers, charges

### What Doesn't Get Caught

Safe read-only operations run without prompts:
- Reading files
- Viewing data
- Getting information
- Searching/querying

---

## Advanced Configuration

Most users don't need to touch these settings. The defaults work great!

### Tag-Based Pattern System (Advanced)

The pattern is defined using **space-separated tags with hyphens** for multi-word concepts:

```
delete-files remove-data-permanently create-files write-to-disk
send-emails send-messages publish-content-online execute-shell-commands
run-scripts modify-database-records deploy-to-production push-to-production
http-post-requests http-put-requests http-delete-requests update-data
patch-data drop-database-tables truncate-tables git-commit git-push
transfer-money charge-payments revoke-access revoke-permissions
permanent-changes irreversible-changes
```

### Why Tags?

Testing showed that **hyphenated tag patterns achieve 46.4% accuracy** compared to 44.7% for prose lists:

- **Tags with hyphens** create strong semantic units (`write-to-disk` = single concept)
- **Removes filler words** that dilute the semantic embedding
- **Higher keyword density** = stronger vector signals
- **Easier to maintain** = just add/remove tags

## Configuration

Settings are stored in `~/.ncp/settings.json`. Most users manage this via CLI commands:

```bash
# User-friendly commands (recommended)
ncp settings modifications on/off
ncp settings whitelist list
ncp settings whitelist clear
```

**For advanced users**, you can edit the file directly:

```json
{
  "confirmBeforeRun": {
    "enabled": true,                    // Toggle via CLI
    "modifierPattern": "...",           // Don't modify unless you know what you're doing
    "vectorThreshold": 0.40,            // Don't modify unless you know what you're doing
    "approvedTools": []                 // Managed via CLI
  }
}
```

### Settings Explained

**`enabled`** (boolean)
- **User-facing**: "Confirm modifications before executing"
- Manage via: `ncp settings modifications on/off`

**`approvedTools`** (array)
- Tools you've approved via "Approve Always" button
- Manage via: `ncp settings whitelist list/clear/remove`

**`modifierPattern`** (string) - **ADVANCED**
- Tag-based semantic pattern for matching dangerous operations
- Default is scientifically tested - don't change unless you know what you're doing
- See "Advanced Configuration" section below

**`vectorThreshold`** (number) - **ADVANCED**
- Similarity threshold (0.0-1.0) for triggering confirmations
- Default `0.40` catches ~6% of tools (file writes, executions, database ops)
- See "Advanced Configuration" section below

## Customizing the Pattern

### Adding Your Own Tags

```bash
# Edit global settings
nano ~/.ncp/settings.json
```

Add tags to the `modifierPattern`:

```json
{
  "modifierPattern": "delete-files write-to-disk execute-shell-commands your-custom-tag another-dangerous-operation"
}
```

### Tag Format Guidelines

✅ **Good tags:**
- `delete-files` - hyphenated multi-word concept
- `write-to-disk` - clear action-object relationship
- `execute-command` - specific operation
- `permanent-changes` - semantic descriptor

❌ **Avoid:**
- `delete files` - spaces break the semantic unit
- `operations that delete` - filler words dilute the signal
- `del` - too short/ambiguous
- Single words without context - `delete`, `write`, `execute`

### Testing Your Pattern

Use the built-in test command to evaluate your pattern:

```bash
# Test current pattern
ncp test confirm-pattern

# Test custom pattern
ncp test confirm-pattern --pattern "your-tags here"

# Output detailed CSV
ncp test confirm-pattern --output ./my-results.csv
```

The test will:
- Compare your pattern against all cached MCP tools
- Show which tools would trigger confirmation
- Provide threshold recommendations
- Output detailed CSV for analysis

## User Experience

### When Confirmation is Triggered

```
⚠️  Confirm Before Running

Tool: filesystem:write_file
Description: Create a new file or completely overwrite an existing file

This operation matches your safety pattern (confidence: 46.4%)

Options:
  [R] Run Once      - Execute this time only
  [A] Approve Always - Never ask again for this tool
  [C] Cancel        - Don't execute

Your choice:
```

### Approved Tools

When a user clicks "Approve Always", the tool is added to `approvedTools` in settings and will never prompt again.

## Performance

The confirm-before-run check is **extremely fast**:

- **Pattern embedding**: Generated once at startup (~30 seconds)
- **Tool comparison**: Uses cached embeddings (instant)
- **Similarity calculation**: Vectorized cosine similarity (~1ms per tool)

**Total overhead**: < 5ms per tool execution

## Security Benefits

- ✅ **Server-side enforcement** - Cannot be bypassed by client
- ✅ **Semantic matching** - Catches dangerous operations even with different wording
- ✅ **User-approved whitelist** - Balances security with usability
- ✅ **Customizable** - Adjust pattern and threshold for your environment
- ✅ **Transparent** - Shows confidence score so users understand why

## Testing Methodology

The default pattern and threshold were scientifically tested:

1. **Test corpus**: 83 real MCP tools from production use
2. **Pattern variations**: 16 different approaches tested
3. **Tag-based winner**: 46.4% peak accuracy, 18.9% average
4. **Threshold tuning**: 0.40 catches top 5 dangerous operations (6.1% of tools)

See `/tests/confirm-pattern/` for full test suite and results.

## Examples of Caught Operations

With the default configuration (threshold 0.40), these operations trigger confirmation:

1. **filesystem:write_file** (46.4%) - File creation/overwriting
2. **docker:run_command** (44.7%) - Docker command execution
3. **filesystem:edit_file** (42.9%) - File editing
4. **kubernetes:kubectl_generic** (42.6%) - Kubernetes commands
5. **kubernetes:exec_in_pod** (40.6%) - Pod command execution

While these safe operations don't trigger:

- **filesystem:read_file** (21.9%) - Reading files
- **github:get_file_contents** (15.0%) - Viewing repository files
- **notion:API-get-user** (-2.0%) - Retrieving user info

## Troubleshooting

### Too Many Prompts (Too Sensitive)

**Raise the threshold:**
```json
{
  "vectorThreshold": 0.45  // Higher = less sensitive
}
```

Or **remove tags** from the pattern to narrow scope.

### Missing Dangerous Operations (Not Sensitive Enough)

**Lower the threshold:**
```json
{
  "vectorThreshold": 0.35  // Lower = more sensitive
}
```

Or **add more tags** to catch additional operations:
```json
{
  "modifierPattern": "... your-additional-dangerous-tags"
}
```

### Disabling Entirely

For fully automated environments:
```json
{
  "enabled": false
}
```

Or clear the approved tools list:
```json
{
  "approvedTools": []
}
```

## Future Enhancements

Planned improvements:
- Per-MCP pattern overrides
- Time-based approval expiry
- Audit logging of approved tools
- Pattern templates for different security levels
- Integration with organization-wide policies
