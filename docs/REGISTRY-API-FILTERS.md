# MCP Registry API - Available Filters & Data

## API Endpoint
```
GET https://registry.modelcontextprotocol.io/v0/servers?limit=<number>
```

## Available Data Points

### 1. Repository Information
```json
{
  "repository": {
    "url": "https://github.com/owner/repo",  // Can be empty ""
    "source": "github"                        // Can be empty ""
  }
}
```

**Filter Options**:
- ✅ Has repository vs no repository
- ✅ GitHub vs other sources
- ❌ No API parameter to filter server-side

### 2. Status
```json
{
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "status": "active"  // Always "active" for all servers
    }
  }
}
```

**Filter Options**:
- ❌ Not useful - all servers show "active"

### 3. Publication Dates
```json
{
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "publishedAt": "2025-10-09T17:05:17.793149Z",
      "updatedAt": "2025-10-09T17:05:17.793149Z"
    }
  }
}
```

**Filter Options**:
- ✅ Filter by age (recently published vs established)
- ✅ Filter by maintenance (recently updated)
- ❌ No API parameter to filter server-side

### 4. Namespace
```json
{
  "name": "ai.company/server-name"
  // Format: <namespace>/<server-name>
}
```

**Common Namespaces**:
- `io.github.modelcontextprotocol/*` - Official Anthropic (likely)
- `ai.*` - Various companies
- `com.github.*` - GitHub-based
- Test servers exist: `ai.alpic.test/*`

**Filter Options**:
- ✅ Filter by namespace prefix
- ✅ Allowlist trusted namespaces
- ❌ No API parameter to filter server-side

### 5. Transport Type
```json
{
  "packages": [{...}],  // stdio server (npx, node, python)
  "remotes": [{...}]    // HTTP/SSE server
}
```

**Filter Options**:
- ✅ Filter stdio only (more auditable)
- ✅ Filter HTTP/SSE only (no local code execution)
- ❌ No API parameter to filter server-side

### 6. Environment Variables
```json
{
  "environmentVariables": [
    {
      "name": "GITHUB_TOKEN",
      "description": "GitHub API token",
      "isRequired": true,
      "isSecret": true
    }
  ]
}
```

**Filter Options**:
- ✅ Show env vars in discovery (transparency)
- ✅ Warn if many secrets required
- ❌ No API parameter to filter server-side

### 7. Package Identifier (stdio only)
```json
{
  "packages": [{
    "identifier": "@modelcontextprotocol/server-filesystem",
    "version": "0.2.0",
    "runtimeHint": "npx"
  }]
}
```

**Filter Options**:
- ✅ Check if npm package exists
- ✅ Get npm download counts
- ✅ Verify package ownership
- ❌ Requires separate npm API call

## What's NOT Available

❌ **Download Count** - No statistics from registry
❌ **User Ratings** - No review system
❌ **Verified Badge** - No official verification
❌ **Security Scan** - No malware/vulnerability data
❌ **Reputation Score** - No trust metrics
❌ **License Info** - Must check repository
❌ **Dependencies** - Must check package.json

## API Limitations

### No Server-Side Filtering
The API does NOT support query parameters like:
- `?status=verified`
- `?has_repository=true`
- `?namespace=io.github.*`
- `?min_age_days=30`

**All filtering must be client-side** after fetching results.

### Rate Limiting
- Unknown rate limits
- Large `limit` values (>100) sometimes fail
- 5-minute cache recommended

### No Pagination
- No `offset` or `page` parameter
- Must fetch all with high `limit`
- Not suitable for large result sets

## Security Filtering Strategy

### Client-Side Filters We Can Apply

#### 1. Repository Filter
```typescript
servers.filter(s =>
  s.server.repository?.url &&
  s.server.repository?.source === 'github'
)
```

#### 2. Age Filter (Avoid Brand New)
```typescript
const AGE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days
servers.filter(s => {
  const published = new Date(s._meta?.['io.modelcontextprotocol.registry/official']?.publishedAt);
  return Date.now() - published.getTime() > AGE_THRESHOLD;
})
```

#### 3. Namespace Allowlist
```typescript
const TRUSTED = ['io.github.modelcontextprotocol', 'com.github.microsoft'];
servers.filter(s =>
  TRUSTED.some(ns => s.server.name.startsWith(ns))
)
```

#### 4. Active Maintenance Filter
```typescript
const STALE_THRESHOLD = 180 * 24 * 60 * 60 * 1000; // 6 months
servers.filter(s => {
  const updated = new Date(s._meta?.['io.modelcontextprotocol.registry/official']?.updatedAt);
  return Date.now() - updated.getTime() < STALE_THRESHOLD;
})
```

### External API Enrichment

#### NPM Package Verification
```typescript
async function verifyNpmPackage(identifier: string) {
  const response = await fetch(`https://registry.npmjs.org/${identifier}`);
  const data = await response.json();

  return {
    exists: response.ok,
    downloads: data.downloads?.weekly || 0,
    maintainers: data.maintainers?.length || 0,
    publishedDate: data.time?.created,
    latestVersion: data['dist-tags']?.latest
  };
}
```

#### GitHub Repository Verification
```typescript
async function verifyGitHubRepo(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  const [, owner, repo] = match;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  const data = await response.json();

  return {
    exists: response.ok,
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    openIssues: data.open_issues_count || 0,
    lastPush: data.pushed_at,
    isArchived: data.archived || false
  };
}
```

## Recommended Implementation

### Priority 1: Basic Security
- Show repository URL in results
- Hide servers with no repository (optional flag)
- Show transport type clearly
- Enhanced confirmation dialog

### Priority 2: Trust Indicators
- GitHub stars (via GitHub API)
- NPM downloads (via NPM API)
- Package age
- Maintenance status

### Priority 3: Advanced Filtering
- Namespace allowlist
- Manual curated list
- Local blocklist
- Risk scoring

## Example Usage

```typescript
import { RegistryClient } from './registry-client';

const client = new RegistryClient();

// Get raw results
const results = await client.search('file');

// Apply security filters
const filtered = results
  .filter(s => s.server.repository?.url)  // Has repo
  .filter(s => !s.server.name.includes('.test'))  // Not test server
  .sort((a, b) => {
    // Official first
    if (a.server.name.startsWith('io.github.modelcontextprotocol')) return -1;
    if (b.server.name.startsWith('io.github.modelcontextprotocol')) return 1;
    return 0;
  });

// Enrich with external data
for (const server of filtered) {
  if (server.server.packages?.[0]) {
    const npmData = await verifyNpmPackage(server.server.packages[0].identifier);
    server.npmDownloads = npmData.downloads;
  }

  if (server.server.repository?.url) {
    const githubData = await verifyGitHubRepo(server.server.repository.url);
    server.githubStars = githubData.stars;
  }
}
```

## Summary

**What We Have**:
- ✅ Repository URL and source
- ✅ Publication/update dates
- ✅ Namespace
- ✅ Transport type
- ✅ Environment variables

**What We DON'T Have**:
- ❌ Verification/trust indicators
- ❌ Server-side filtering
- ❌ Download/usage statistics
- ❌ Security scan results
- ❌ User reviews

**What We Must Do**:
1. Client-side filtering for security
2. External API calls for enrichment
3. Manual curation for trust
4. User education about risks
