# MCP Registry Security Analysis

## Overview

The MCP Registry (`https://registry.modelcontextprotocol.io`) is an **unvalidated, open registry** where anyone can publish MCP servers. Based on API analysis and video reviews, there is **no verification or security vetting** of submitted entries.

## Current State of Registry

### What We Found

From analyzing the registry API (October 2025):

**Repository Quality**:
- ✅ **73% have GitHub repos** (73 out of 100 sampled)
- ⚠️  **27% have NO repository** (empty repository.url field)
- ⚠️  Some appear to be test/demo servers (e.g., `ai.alpic.test/test-mcp-server`)

**Available Metadata**:
```json
{
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "status": "active",           // All show "active" (not a trust indicator)
      "publishedAt": "2025-10-09...",
      "updatedAt": "2025-10-09...",
      "isLatest": true
    }
  },
  "server": {
    "name": "ai.company/server-name",
    "repository": {
      "url": "https://github.com/...",  // Sometimes empty
      "source": "github"                 // Sometimes empty
    }
  }
}
```

### Security Concerns

1. **No Verification Process**
   - Anyone can publish to the registry
   - No code review or security audit
   - No reputation system
   - No takedown process (unclear)

2. **Missing Trust Indicators**
   - No "official" or "verified" badge
   - `status: "active"` applied to ALL entries (not meaningful)
   - No download counts visible
   - No user ratings/reviews

3. **Attack Vectors**
   - **Malicious Code**: Stdio servers execute arbitrary code on user's machine
   - **Typosquatting**: Register names similar to popular servers
   - **Supply Chain**: Compromise popular packages after gaining trust
   - **Data Exfiltration**: HTTP/SSE servers can send sensitive data anywhere
   - **Credential Harvesting**: Request fake env vars to steal API keys

## What Filters Are Available?

### Currently Exposed in API

1. **Repository Information**
   ```typescript
   repository: {
     url: string;      // Can filter: has repo vs no repo
     source: string;   // Can filter: "github" vs empty
   }
   ```

2. **Status** (Not Useful)
   ```typescript
   status: "active"  // All entries show this
   ```

3. **Dates**
   ```typescript
   publishedAt: string;  // Can filter by age
   updatedAt: string;    // Can detect abandoned packages
   ```

4. **Transport Type**
   ```typescript
   packages: []   // stdio server
   remotes: []    // HTTP/SSE server
   ```

5. **Namespace**
   ```typescript
   name: "ai.company/server-name"  // Can filter by namespace
   ```

### Currently NOT Available

❌ **Verified/Official Badge** - No way to distinguish Anthropic's official servers
❌ **Download Counts** - Can't filter by popularity
❌ **Security Scan Results** - No malware/vulnerability scanning
❌ **User Reviews/Ratings** - No community feedback
❌ **Maintainer Reputation** - No trust score
❌ **License Information** - No OSS license verification

## Our Current Implementation

### What We Show Users

From `src/internal-mcps/ncp-management.ts:800`:
```typescript
const statusBadge = c.status === 'active' ? '⭐' : '📦';
const transportBadge = c.transport === 'stdio' ? '💻' : '🌐';
```

**Problems**:
- ⭐ badge shown for ALL servers (misleading)
- No indication of trust/verification
- No repository link shown
- No warning about unverified sources

### What We Filter By

From `src/services/registry-client.ts:122`:
```typescript
const filtered = (data.servers || []).filter((s: ServerSearchResult) =>
  s.server.name.toLowerCase().includes(lowerQuery) ||
  s.server.description?.toLowerCase().includes(lowerQuery)
);
```

**Only text search** - no security filtering at all.

## Security Recommendations

### Immediate Actions (Can Implement Now)

#### 1. **Filter by Repository Presence**
```typescript
// Only show servers with GitHub repos
.filter(s => s.server.repository?.url && s.server.repository?.source === 'github')
```

**Pros**: Reduces attack surface by ~27%
**Cons**: Excludes legitimate closed-source or self-hosted servers

#### 2. **Show Repository in Results**
```typescript
const repoInfo = c.repository?.url ? `\n  Repo: ${c.repository.url}` : '\n  ⚠️  No repository';
```

**Pros**: Users can inspect source before installing
**Cons**: None

#### 3. **Namespace Allowlist** (Optional)
```typescript
const TRUSTED_NAMESPACES = [
  'io.github.modelcontextprotocol',  // Official Anthropic servers
  'com.github.microsoft',            // Microsoft
  'io.github.anthropics',            // Anthropic (if different)
];

// Priority sort: trusted first, then by date
```

**Pros**: Clear distinction between official and community
**Cons**: Requires maintaining allowlist

#### 4. **Age Filter**
```typescript
const AGE_THRESHOLD_DAYS = 30;  // Only show servers published >30 days ago
```

**Pros**: New malicious servers can't be installed immediately
**Cons**: Excludes brand new legitimate servers

#### 5. **Require Confirmation with Warning**

Already implemented in `src/internal-mcps/ncp-management.ts:213`:
```typescript
⚠️ Installing MCPs can execute arbitrary code on your system.
Only proceed if you trust this MCP server.
```

**Enhancement**: Add repository link to confirmation:
```typescript
⚠️ SECURITY WARNING

Source: ${repoUrl || 'NO REPOSITORY - UNVERIFIED'}
Author: ${namespace}

This MCP will execute code on your machine. Only install if you:
1. Recognize the author
2. Have reviewed the source code
3. Trust this server completely
```

### Medium-Term Improvements

#### 6. **Manual Curated List**

Create our own curated list of verified servers:
```json
{
  "verified": [
    {
      "name": "io.github.modelcontextprotocol/server-filesystem",
      "verifiedBy": "NCP Team",
      "verifiedDate": "2025-10-18",
      "reason": "Official Anthropic server"
    }
  ]
}
```

#### 7. **GitHub Star Count**

Fetch GitHub stars as trust indicator:
```typescript
async function getGitHubStars(repoUrl: string): Promise<number> {
  // Extract owner/repo from URL
  // Call GitHub API
  // Return star count
}
```

#### 8. **NPM Package Verification**

For `npx` servers, check npm registry:
```typescript
// Verify package exists on npm
// Check download counts
// Check publish date
// Check maintainer count
```

#### 9. **Local Allowlist/Blocklist**

```json
{
  "allowlist": ["filesystem", "github", "postgres"],
  "blocklist": ["ai.sketchy-server/*"]
}
```

### Long-Term Solutions (Requires Registry Changes)

#### 10. **Verification System**
- Official badge for Anthropic-verified servers
- Community verification (like GitHub sponsors)
- Security scan results (SAST/dependency scanning)

#### 11. **Reputation System**
- User ratings/reviews
- Download counts
- Incident reports
- Age of package

#### 12. **Sandboxing**
- Run MCPs in containers
- Limit filesystem access
- Network policy enforcement

## Recommended Implementation Plan

### Phase 1: Immediate (This Release)

- [ ] **Show repository URL** in discovery results
- [ ] **Filter out servers with no repository** (optional flag)
- [ ] **Enhanced confirmation dialog** with source/author
- [ ] **Warning badge** for unverified sources

### Phase 2: Next Release

- [ ] **Trusted namespace allowlist**
- [ ] **GitHub stars integration**
- [ ] **NPM package verification**
- [ ] **Manual curated list**

### Phase 3: Future

- [ ] **Reputation system** (if registry adds it)
- [ ] **Local allowlist/blocklist**
- [ ] **Sandboxing support**

## Security Best Practices for Users

### What Users Should Do

1. **Check the Source**
   - ✅ Has GitHub repository
   - ✅ Active maintenance (recent commits)
   - ✅ Many stars/forks
   - ✅ Known author/organization

2. **Review the Code**
   - Read the source before installing
   - Check for suspicious network calls
   - Look for credential harvesting
   - Verify dependencies

3. **Start with Official Servers**
   - Anthropic's official servers (io.github.modelcontextprotocol/*)
   - Well-known companies (Microsoft, Docker, etc.)
   - Popular community servers (high GitHub stars)

4. **Use Profiles**
   - Isolate untrusted MCPs in separate profiles
   - Limit access to sensitive data
   - Monitor behavior

### Red Flags

❌ **No repository** - Cannot inspect source
❌ **Empty/generic description** - Low effort
❌ **Recently published** - Not battle-tested
❌ **Typosquatting** - Similar name to popular server
❌ **Requests unusual env vars** - Potential credential harvesting
❌ **HTTP/SSE to unknown domain** - Data exfiltration risk

## Example: Secure Discovery UI

```
📋 Found 5 MCPs matching "file":

1. ⭐💻 filesystem [VERIFIED]
   Official Anthropic file operations server
   ✓ Repository: github.com/modelcontextprotocol/servers
   ✓ Published: 2024-08-15 (287 days ago)
   ✓ Stars: 2,431

2. 📦💻 file-manager
   Community file manager with extras
   ⚠️  Repository: github.com/unknown-user/file-manager
   ⚠️  Published: 2025-10-10 (8 days ago)
   ⚠️  Stars: 3

3. 🚫💻 super-files
   ❌ NO REPOSITORY - Unverified source
   ❌ Published: 2025-10-17 (1 day ago)
   ❌ HIGH RISK - Do not install
```

## Conclusion

The MCP Registry is currently **unvalidated and poses security risks**. We should:

1. ✅ **Immediately**: Add repository filtering and enhanced warnings
2. ⏳ **Soon**: Implement trust indicators (GitHub stars, curated list)
3. 🔮 **Future**: Advocate for registry-level verification system

**Security is our responsibility**, not just the registry's. We must protect users from malicious servers through multiple layers of defense.

---

**Related Files**:
- `src/services/registry-client.ts` - Registry API client
- `src/internal-mcps/ncp-management.ts` - Discovery UI
- `PRE-RELEASE-CHECKLIST.md` - Security review checklist
