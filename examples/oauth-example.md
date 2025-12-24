# OAuth 2.1 Example Configuration

This example demonstrates how to configure NCP to connect to an OAuth 2.1-enabled MCP server.

## Example: Connecting to an OAuth-protected MCP

### 1. Add OAuth MCP to your configuration

Edit `~/.ncp/config.json` (or use `ncp config`):

```json
{
  "mcpServers": {
    "my-oauth-mcp": {
      "url": "https://mcp.example.com/api",
      "auth": {
        "type": "oauth",
        "oauth21": {
          "scopes": ["read", "write"],
          "callbackPort": 9876
        }
      }
    }
  }
}
```

### 2. First Connection - Authorization Flow

When NCP first connects to this MCP:

1. **NCP will open your browser** to the OAuth authorization page
2. **Grant permissions** to NCP
3. **Browser redirects** back to `http://localhost:9876/callback`
4. **NCP receives the authorization code** and exchanges it for tokens
5. **Tokens are saved** to `~/.ncp/auth/` for future use

```bash
# First connection triggers OAuth flow
ncp find "tools from my-oauth-mcp"

# Output:
# 🔐 OAuth authorization required for my-oauth-mcp
# 🌐 Opening browser for authorization...
# ✅ Authorization successful! Token saved.
# 🔍 Finding tools...
```

### 3. Subsequent Connections - Automatic

After initial authorization, NCP automatically:
- Loads saved access token
- Refreshes token if expired
- Handles token errors gracefully

```bash
# No authorization needed - uses saved token
ncp find "tools from my-oauth-mcp"

# Output:
# 🔍 Finding tools...
# ✅ Found 5 tools from my-oauth-mcp
```

## Configuration Options

### Minimal (Dynamic Registration)

Let NCP automatically register as an OAuth client:

```json
{
  "auth": {
    "type": "oauth",
    "oauth21": {}
  }
}
```

### With Scopes

Request specific OAuth scopes:

```json
{
  "auth": {
    "type": "oauth",
    "oauth21": {
      "scopes": ["read", "write", "admin"]
    }
  }
}
```

### Custom Callback Port

Use a different local port for OAuth callback:

```json
{
  "auth": {
    "type": "oauth",
    "oauth21": {
      "callbackPort": 8080
    }
  }
}
```

### Pre-registered Client

If you've pre-registered your OAuth client with the MCP server:

```json
{
  "auth": {
    "type": "oauth",
    "oauth21": {
      "scopes": ["read", "write"],
      "clientId": "ncp-client-abc123",
      "clientSecret": "your-client-secret-here"
    }
  }
}
```

## Headless Environments

If NCP can't open a browser (CI/CD, SSH session), it will print the authorization URL:

```bash
ncp find "tools from my-oauth-mcp"

# Output:
# 🔐 OAuth authorization required for my-oauth-mcp
# 🌐 Please visit this URL to authorize:
# https://auth.example.com/authorize?client_id=...&redirect_uri=...&code_challenge=...
# 
# After authorizing, paste the authorization code here:
```

**Steps:**
1. Copy the printed URL
2. Open in your browser
3. Grant permissions
4. Copy the `code` parameter from the redirect URL
5. Paste it into NCP prompt

## Token Management

### Token Storage Location

Tokens are stored per-server in `~/.ncp/auth/`:

```
~/.ncp/auth/
  ├── abc123def456.json  (tokens for mcp.example.com)
  ├── xyz789uvw012.json  (tokens for api.another.com)
  └── ...
```

Each file contains:
- `clientInfo`: OAuth client ID and secret (if registered)
- `tokens`: Access token, refresh token, expiry
- `codeVerifier`: PKCE verifier (temporary, during auth)

### Clearing Tokens

To force re-authorization, delete the token file:

```bash
rm ~/.ncp/auth/*.json
```

Or use the invalidation API (for future CLI command):

```typescript
provider.invalidateCredentials('all');     // Clear everything
provider.invalidateCredentials('tokens');  // Clear only access/refresh tokens
provider.invalidateCredentials('client');  // Clear client registration
```

## Troubleshooting

### "Browser failed to open"

**Solution:** Manual authorization
1. Copy the printed URL
2. Visit it in your browser
3. Paste the authorization code when prompted

### "Token expired" / "Invalid token"

**Solution:** NCP automatically refreshes tokens
- If refresh fails, re-authorization is triggered
- Check token file: `~/.ncp/auth/{serverKey}.json`

### "Connection refused" on callback

**Solution:** Check callback port
- Default port: 9876
- Ensure port is not in use: `lsof -i :9876`
- Change port in config: `"callbackPort": 8080`

### "Client not registered"

**Solution:** Dynamic registration
- If no `clientId` provided, NCP auto-registers
- If server doesn't support dynamic registration, pre-register and provide `clientId`

## Advanced: Multiple MCP Servers

NCP caches OAuth providers per server, so each server:
- Has its own authorization flow
- Stores tokens separately
- Refreshes tokens independently

```json
{
  "mcpServers": {
    "mcp-server-1": {
      "url": "https://mcp1.example.com/api",
      "auth": {
        "type": "oauth",
        "oauth21": { "scopes": ["read"] }
      }
    },
    "mcp-server-2": {
      "url": "https://mcp2.example.com/api",
      "auth": {
        "type": "oauth",
        "oauth21": { "scopes": ["write"] }
      }
    }
  }
}
```

Each server triggers its own authorization flow on first use.

## Security Best Practices

1. **Use HTTPS URLs** - Never use OAuth with plain HTTP in production
2. **Minimal Scopes** - Request only the scopes you need
3. **Rotate Secrets** - If using pre-registered clients, rotate secrets regularly
4. **Token Storage** - `~/.ncp/auth/` files contain sensitive tokens - protect with file permissions
5. **Revoke Access** - Use server's OAuth management UI to revoke tokens if compromised

## Example: Full Workflow

```bash
# 1. Add OAuth MCP
ncp add my-oauth-mcp https://mcp.example.com/api --oauth --scopes "read,write"

# 2. First use - triggers authorization
ncp find "list files"
# 🔐 Authorization required...
# 🌐 Opening browser...
# ✅ Authorized!

# 3. Subsequent uses - automatic
ncp run filesystem:read_file --params '{"path": "/data/file.txt"}'
# ✅ Success (used cached token)

# 4. After token expires (handled automatically)
ncp find "database tools"
# 🔄 Refreshing token...
# ✅ Found tools

# 5. Manual token clearing
rm ~/.ncp/auth/*.json

# 6. Next use re-authorizes
ncp find "tools"
# 🔐 Authorization required again...
```

## References

- [MCP OAuth Specification](https://modelcontextprotocol.io/specification/2025-03-26/authentication/oauth)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11)
- [PKCE (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
- [Dynamic Client Registration (RFC 7591)](https://datatracker.ietf.org/doc/html/rfc7591)
