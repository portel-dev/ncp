# mcps.portel.dev API Contract

## Overview

The NCP CLI now fetches provider information from `mcps.portel.dev` to enable dynamic, server-side provider registry management. This allows adding new providers without requiring CLI updates.

## Base URL

```
https://mcps.portel.dev/api
```

## Endpoints Required

### 1. List All Providers

**Endpoint:** `GET /api/providers`

**Description:** Returns all available MCP providers

**Response:**
```json
{
  "canva": {
    "id": "canva",
    "name": "Canva",
    "description": "Design and creative tools",
    "website": "https://www.canva.com",
    "recommended": "stdio",
    "stdio": {
      "setup": {
        "description": "Authenticate with Canva CLI",
        "command": "npx @canva/cli@latest login",
        "needsSetup": true
      },
      "command": "npx",
      "args": ["-y", "@canva/cli@latest", "mcp"]
    },
    "http": {
      "url": "https://mcp.canva.com/mcp",
      "auth": "oauth",
      "docs": "https://www.canva.dev/docs/connect/mcp-server/",
      "notes": "Requires OAuth app registration. Stdio version recommended."
    }
  },
  "slack": {
    "id": "slack",
    "name": "Slack",
    ...
  }
}
```

**Alternative Response Format (also supported):**
```json
{
  "providers": {
    "canva": {...},
    "slack": {...}
  }
}
```

---

### 2. Get Single Provider

**Endpoint:** `GET /api/providers/{providerId}`

**Description:** Returns details for a specific provider

**Example:** `GET /api/providers/canva`

**Response:**
```json
{
  "id": "canva",
  "name": "Canva",
  "description": "Design and creative tools",
  "website": "https://www.canva.com",
  "recommended": "stdio",
  "stdio": {
    "setup": {
      "description": "Authenticate with Canva CLI",
      "command": "npx @canva/cli@latest login",
      "needsSetup": true
    },
    "command": "npx",
    "args": ["-y", "@canva/cli@latest", "mcp"]
  },
  "http": {
    "url": "https://mcp.canva.com/mcp",
    "auth": "oauth",
    "docs": "https://www.canva.dev/docs/connect/mcp-server/"
  }
}
```

**Error Response (404):**
```json
{
  "error": "Provider not found",
  "providerId": "unknown"
}
```

---

### 3. Search Providers (Optional)

**Endpoint:** `GET /api/providers/search?q={query}`

**Description:** Search providers by name, description, or ID

**Example:** `GET /api/providers/search?q=design`

**Response:**
```json
{
  "results": [
    {
      "id": "canva",
      "name": "Canva",
      "description": "Design and creative tools",
      ...
    },
    {
      "id": "figma",
      "name": "Figma",
      "description": "Collaborative design tool",
      ...
    }
  ],
  "query": "design",
  "count": 2
}
```

---

## Provider Schema

### Provider Object

```typescript
interface Provider {
  id: string;                      // Unique identifier (lowercase)
  name: string;                    // Display name
  description: string;             // Short description
  website: string;                 // Provider's website
  recommended: 'stdio' | 'http';   // Recommended transport
  stdio?: ProviderStdioConfig;     // Stdio configuration (if available)
  http?: ProviderHttpConfig;       // HTTP configuration (if available)
}
```

### Stdio Configuration

```typescript
interface ProviderStdioConfig {
  setup?: {
    description: string;   // What the setup does
    command: string;       // Command to run (e.g., "npx @canva/cli@latest login")
    needsSetup: boolean;   // Whether setup is required
  };
  command: string;         // Main command (e.g., "npx")
  args: string[];          // Arguments (e.g., ["-y", "@canva/cli@latest", "mcp"])
}
```

### HTTP Configuration

```typescript
interface ProviderHttpConfig {
  url: string;                          // MCP endpoint URL
  auth: 'bearer' | 'oauth' | 'basic';  // Authentication type
  docs: string;                        // Documentation URL
  notes?: string;                      // Additional notes/warnings
}
```

---

## Client Behavior

### Request Flow

```
User: ncp add canva
    ↓
1. Fetch: GET https://mcps.portel.dev/api/providers/canva
    ↓
2. If successful → Use remote provider data
    ↓
3. If failed (network error, timeout) → Use local fallback
    ↓
4. Display provider info and guide user through setup
```

### Timeouts

- Connection timeout: **5 seconds**
- Read timeout: **5 seconds**
- On timeout → Use local cache/fallback

### Caching

- NCP caches registry in memory during execution
- No persistent cache (always fetches fresh on new command)
- Local `providers.json` serves as offline fallback

### Headers

```
User-Agent: ncp-cli
Accept: application/json
```

---

## Error Handling

### Server Down

If `mcps.portel.dev` is unreachable:
- NCP falls back to local `providers.json`
- User sees: `(Using local provider registry)`
- Everything continues to work

### Provider Not Found

**Remote:**
```json
{
  "error": "Provider not found",
  "providerId": "unknown"
}
```

**Client behavior:**
- Try local fallback
- If still not found → Treat as manual add
- Show: `Unknown provider 'unknown'. Using manual configuration.`

### Invalid Response

If server returns invalid JSON or unexpected format:
- Log error (if debug mode)
- Fall back to local registry
- Continue operation

---

## Implementation Guidelines for mcps.portel.dev

### Performance

- **Response time:** < 200ms for single provider lookup
- **Caching:** Implement CDN caching (5-minute TTL recommended)
- **Compression:** Enable gzip/brotli

### Security

- **HTTPS only**
- **CORS:** Enable for `ncp-cli` User-Agent
- **Rate limiting:** 100 req/min per IP (generous for CLI tool)

### Availability

- **Target uptime:** 99.9%
- **Graceful degradation:** If server down, clients use local cache
- **Health endpoint:** `GET /health` → `{"status": "ok"}`

### Data Management

**Where providers come from:**
1. Your existing MCP discovery/submission system
2. Manual curation by Portel team
3. Community submissions (verified by Portel)

**Update frequency:**
- Real-time: New providers available immediately
- No CLI update required
- Backward compatible: Old CLIs work with new providers

---

## Integration with Existing Discovery System

### Current Flow (Already Working):
```
User: ncp find "design"
    ↓
Query: mcps.portel.dev/discover
    ↓
Found: Canva MCP
    ↓
Elicitation: Install? (y/n)
    ↓
Auto-install
```

### New Flow (With Provider Registry):
```
User: ncp add canva
    ↓
Query: mcps.portel.dev/api/providers/canva
    ↓
Get provider details (stdio config, auth setup, etc.)
    ↓
Guide user through setup
    ↓
Auto-install
```

### Unified Backend

Both endpoints can share the same provider database:
- `/discover` → Search/discovery API
- `/api/providers` → Provider details API
- Same data, different views

---

## Example Provider Entries

### Canva (Stdio + HTTP)

```json
{
  "id": "canva",
  "name": "Canva",
  "description": "Design and creative tools",
  "website": "https://www.canva.com",
  "recommended": "stdio",
  "stdio": {
    "setup": {
      "description": "Authenticate with Canva CLI",
      "command": "npx @canva/cli@latest login",
      "needsSetup": true
    },
    "command": "npx",
    "args": ["-y", "@canva/cli@latest", "mcp"]
  },
  "http": {
    "url": "https://mcp.canva.com/mcp",
    "auth": "oauth",
    "docs": "https://www.canva.dev/docs/connect/mcp-server/",
    "notes": "Requires OAuth app registration. Stdio version recommended for easier setup."
  }
}
```

### Notion (HTTP only)

```json
{
  "id": "notion",
  "name": "Notion",
  "description": "Notes and documentation",
  "website": "https://notion.so",
  "recommended": "http",
  "http": {
    "url": "https://mcp.notion.so",
    "auth": "bearer",
    "docs": "https://developers.notion.com/docs/mcp",
    "notes": "Requires API key from Notion settings → Integrations → Create integration"
  }
}
```

### Custom MCP (Community Submitted)

```json
{
  "id": "my-custom-mcp",
  "name": "My Custom MCP",
  "description": "Custom integration for...",
  "website": "https://github.com/user/my-mcp",
  "recommended": "stdio",
  "stdio": {
    "command": "node",
    "args": ["/path/to/server.js"]
  }
}
```

---

## Testing

### Endpoint Tests

```bash
# Test provider list
curl https://mcps.portel.dev/api/providers

# Test single provider
curl https://mcps.portel.dev/api/providers/canva

# Test not found
curl https://mcps.portel.dev/api/providers/nonexistent
# Should return 404

# Test search
curl "https://mcps.portel.dev/api/providers/search?q=design"
```

### CLI Tests

```bash
# Test with live server
ncp add canva

# Test with server down (use local fallback)
# Temporarily block mcps.portel.dev in /etc/hosts
ncp add canva  # Should still work using local cache
```

---

## Deployment Checklist

### Backend (mcps.portel.dev):
- [ ] Implement `/api/providers` endpoint
- [ ] Implement `/api/providers/{id}` endpoint
- [ ] Add provider data (Canva, Slack, GitHub, Notion, Linear)
- [ ] Enable CORS
- [ ] Add rate limiting
- [ ] Deploy to production
- [ ] Test all endpoints

### CLI (NCP):
- [ ] Update to fetch from mcps.portel.dev
- [ ] Test remote fetch
- [ ] Test local fallback
- [ ] Build and release
- [ ] Update documentation

---

## Benefits of This Architecture

✅ **Dynamic Updates:** Add providers without CLI releases
✅ **Centralized:** Single source of truth
✅ **Offline Support:** Local fallback if server down
✅ **Scalable:** Can grow to hundreds of providers
✅ **Community:** Enable provider submissions
✅ **Discovery:** Integrate with existing `ncp find` system

---

## Questions?

Contact: dev@portel.dev
Docs: https://docs.portel.dev/api
