# MCP Version Management & Auto-Update

NCP automatically detects MCP version updates and manages cache invalidation efficiently.

## Overview

When MCPs are updated, NCP will:
1. Detect version changes automatically
2. Invalidate only the affected MCP's cache (not the entire profile)
3. Show inline notifications when you call tools from outdated MCPs
4. Support easy updates via `ncp update mcp-name`

## Features

### 1. Automatic Version Detection

NCP checks npm registry for newer versions of installed MCPs (24-hour cache):

```bash
# Version checks happen automatically when:
ncp run github:get_issue owner=anthropic repo=claude-code number=123

# If github MCP has an update, you'll see:
# ⚠️  "github" v1.0.0 → v1.0.1 available. Update with: ncp update github
```

### 2. Per-MCP Cache Invalidation

When a version change is detected, **only that MCP's cache is refreshed**:

```
Before Update:
cache.json
├── mcps.github (version 1.0.0) ✅
├── mcps.filesystem (version 1.2.0) ✅
└── mcps.postgres (version 2.1.0) ✅

After github update → 1.0.1:
cache.json
├── mcps.github (version 1.0.1) [REFRESHED - cache cleared]
├── mcps.filesystem (version 1.2.0) ✅ [UNTOUCHED]
└── mcps.postgres (version 2.1.0) ✅ [UNTOUCHED]
```

### 3. Inline Notifications

When using tools from outdated MCPs, you'll see:

```bash
$ ncp run github:get_issue owner=anthropic repo=claude-code number=123

⚠️  "github" v1.0.0 → v1.0.1 available. Update with: ncp update github

[Tool output...]
```

Notifications are shown **once per 24 hours per MCP** to avoid spam.

## Updating MCPs

### Update a Specific MCP

```bash
# Update just the github MCP
ncp update github

# Output:
# 🔄 Updating github MCP...
# ✅ Updated github from v1.0.0 to v1.0.1
# 🗑️  Invalidated cache for github
# 📦 Run: ncp list   (to verify)
```

### Update NCP Itself

```bash
# Update NCP core
ncp update

# Same as: npm install -g @portel/ncp@latest
```

### Check for Available Updates

```bash
# Check all MCPs for updates
ncp update --check

# Output:
# 📦 Updates Available:
# • github: 1.0.0 → 1.0.1
# • postgres: 2.1.0 → 2.2.0
#
# Run: ncp update mcp-name
```

## How It Works

### Cache Structure

```typescript
// Tool metadata cache with per-MCP versioning
{
  "version": "1.0.0",
  "profileHash": "abc123...",
  "mcps": {
    "github": {
      "configHash": "def456...",
      "serverInfo": {
        "version": "1.0.1"  // ← Version tracked per MCP
      },
      "tools": [...]
    }
  }
}
```

### Version Detection Flow

```
1. Load tools from cache
   ↓
2. Compare cached version with installed version
   ↓
3. Version mismatch detected?
   ├─ YES: Invalidate just this MCP's cache
   │        ├─ Remove metadata.mcps.github
   │        └─ Remove embeddings for github:*
   │
   └─ NO: Use cache as-is
   ↓
4. On next initialization, rediscover changed MCPs only
```

### Update Process

```
ncp update github
   ↓
1. Check if update available (npm registry)
   ↓
2. Update MCP package (npm install)
   ↓
3. Invalidate github cache:
   ├─ Delete cached tools
   └─ Delete cached embeddings
   ↓
4. Invalidate update check cache
   ↓
5. Next tool discovery: rediscover github tools only
```

## Configuration

### Disable Version Notifications

If you find notifications too verbose, set environment variable:

```bash
export NCP_DISABLE_VERSION_NOTIFICATIONS=true
ncp run github:get_issue owner=anthropic repo=claude-code number=123
```

### Force Update Check

By default, version checks are cached for 24 hours. Force immediate check:

```bash
ncp update --check --force
```

## Technical Details

### Version Comparison

Semantic versioning is used:
- `1.0.0` vs `1.0.1` → Update available
- `2.0.0` vs `1.9.9` → No update (already newer)
- `1.0.0-beta` vs `1.0.0` → Update available

### Cache Efficiency

**Before:** Profile-level invalidation
```
Profile changed → Entire cache cleared → All MCPs rediscovered (slow)
```

**Now:** MCP-level invalidation
```
github updated → Only github cache cleared → All other MCPs reused (fast)
Savings: O(n) discovery reduced to O(1) for unchanged MCPs
```

### Notification Spam Prevention

Per-MCP notification tracking:
- Each MCP tracks: `lastNotificationTime`, `notificationShown`
- Re-show after 24 hours
- Clear on update (force immediate re-notification)

## Examples

### Scenario 1: Update Available, User Takes Action

```bash
$ ncp run github:list_issues owner=anthropic repo=claude-code

⚠️  "github" v1.0.0 → v1.0.1 available. Update with: ncp update github

[Retrieving issues from GitHub...]

$ ncp update github
🔄 Updating github MCP...
✅ Updated successfully!

$ ncp run github:list_issues owner=anthropic repo=claude-code
[Uses refreshed cache]
```

### Scenario 2: Multiple MCPs, Some Outdated

```bash
$ ncp update --check

📦 Updates Available:
• github: 1.0.0 → 1.0.1
• postgres: 2.1.0 → 2.2.0

$ ncp update github
✅ Updated github

$ ncp update postgres
✅ Updated postgres

$ ncp list | grep version
github (v1.0.1)
postgres (v2.2.0)
```

### Scenario 3: Cache Performance

```bash
# First run after update (cache miss)
$ time ncp run github:get_issue owner=anthropic repo=claude-code number=123
real    2.4s  (rediscovery needed)

# Subsequent runs (cache hit - other MCPs untouched)
$ time ncp run postgres:query database=mydb sql="SELECT ..."
real    0.8s  (reused cache)

# After filesystem update
$ time ncp run filesystem:read_file path=/etc/hosts
real    1.2s  (only filesystem rediscovered)
```

## Troubleshooting

### Version Check Timeout

If npm registry is slow/offline:
```bash
# Version checks timeout after 3 seconds
# Notifications won't show, but tools still work normally
ncp run github:get_issue ...
```

### Cache Sync Issues

If you manually update MCPs outside NCP:
```bash
# Manually clear cache to force full rediscovery
rm -rf ~/.ncp/cache/*
ncp list  # Rebuilds cache
```

### Force Cache Invalidation

```bash
# Clear all caches
rm -rf ~/.ncp/all-tools.json
rm -rf ~/.ncp/embeddings.json
rm -rf ~/.ncp/mcp-updates.json

# Or just one MCP
# Edit ~/.ncp/all-tools.json and remove that MCP's entry
```

## API Reference

### MCPUpdateChecker

```typescript
const checker = new MCPUpdateChecker();

// Check single MCP
const info = await checker.checkMCPUpdate('github', '1.0.0');
// Returns: { name: 'github', currentVersion: '1.0.0', latestVersion: '1.0.1', hasUpdate: true }

// Check multiple MCPs
const updates = await checker.checkAllMCPUpdates([
  { name: 'github', version: '1.0.0' },
  { name: 'postgres', version: '2.1.0' }
]);
// Returns: [{ github update }, { postgres update }]

// Get notification message
const msg = checker.getUpdateNotification(info);
// Returns: "⚠️  "github" v1.0.0 → v1.0.1 available. Update with: ncp update github"
```

### VersionAwareValidator

```typescript
const validator = new VersionAwareValidator(cachePatcher);

// Detect version changes
const changes = await validator.validateAndDetectVersionChanges(
  cache,
  { github: '1.0.1', filesystem: '1.2.0' }
);
// Returns: [{ mcpName: 'github', cachedVersion: '1.0.0', currentVersion: '1.0.1', requiresRefresh: true }]

// Invalidate specific MCPs
await validator.invalidateMCPsInCache(['github']);

// Apply all changes at once
await validator.applyVersionChanges(changes);
```

## Best Practices

1. **Regular Updates**: Run `ncp update --check` weekly to stay current
2. **Read Changelogs**: Check MCP release notes for breaking changes
3. **Test After Update**: Run a few familiar tools after updating MCPs
4. **Keep NCP Updated**: Run `ncp update` regularly for bug fixes and features
5. **Cache Management**: NCP manages cache automatically, but you can clear it if issues arise

## Performance Impact

- **Version checks**: 3-second timeout, cached for 24 hours (minimal impact)
- **Cache invalidation**: O(1) for updated MCP, existing caches untouched (efficient)
- **First startup after update**: ~0.5-1s per updated MCP (discovery needed)
- **Subsequent runs**: Full cache reuse, no version checks (fast)

## See Also

- [ADVANCED_USAGE_GUIDE.md](./ADVANCED_USAGE_GUIDE.md) - Advanced NCP patterns
- [MCP_VALIDATION_CAPABILITY.md](./MCP_VALIDATION_CAPABILITY.md) - MCP validation
