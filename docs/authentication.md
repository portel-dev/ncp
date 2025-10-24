# Authentication Guide

NCP automatically detects when MCP servers require authentication and will prompt you for the necessary credentials.

## Authentication Methods

### Bearer Tokens (Most Common)

When adding an HTTP/SSE MCP server that requires authentication:

```bash
$ ncp add-http canva https://mcp.canva.com/mcp

🌐 Adding HTTP/SSE MCP server: canva
   Detecting authentication requirements...
   ✓ Detected: bearer authentication required

   Token not provided, prompting for input...
   📖 Refer to canva's documentation for how to generate an access token

🔐 Bearer Token
   Required for canva authentication
   Enter value (hidden): ████████████████
```

**How to get your token:**

1. Visit the MCP provider's website (e.g., canva.com)
2. Sign in to your account
3. Look for "Developer Settings", "API Keys", or "Access Tokens"
4. Generate a new token/key
5. Copy the token and paste it when NCP prompts

**Security:** Tokens are stored locally in `~/.ncp/profiles/` and never sent to Portel servers.

---

### OAuth (For Advanced Users)

Some providers support OAuth authentication:

```bash
$ ncp add-http provider https://example.com/mcp

# NCP detects OAuth support
   Client ID not provided, prompting for input...
   📖 Register an OAuth app with provider to get a Client ID

# Browser opens for authentication
✅ OAuth authentication successful!
```

**When to use OAuth:**
- Provider requires OAuth (no manual tokens available)
- You want automatic token refresh
- Provider's documentation specifies OAuth

**Note:** OAuth requires registering an OAuth application with the provider. See their developer documentation for instructions.

---

### Stdio Servers (Recommended When Available)

Many MCP providers offer stdio versions that handle authentication themselves:

**Example: Canva**
```bash
# Step 1: Authenticate with provider's CLI
npx @canva/cli@latest login
# Opens browser → Authorize → Done!

# Step 2: Add to NCP
ncp add canva \
  --command "npx" \
  --args "-y @canva/cli@latest mcp"

# Authentication handled automatically by Canva CLI
```

**Benefits:**
- Simpler setup (one-time login)
- Provider handles token management
- No manual token copy/paste

**Check if stdio version is available:**
- Look for CLI tools from the provider (e.g., `@provider/cli`)
- Check provider's MCP documentation for transport options
- Stdio versions usually mentioned alongside HTTP versions

---

## Passing Credentials via CLI

### Via Command-Line Flag

```bash
# Pass token directly
ncp add-http provider https://example.com/mcp \
  --token "your-token-here"
```

### Via Environment Variable

```bash
# Set in environment
export PROVIDER_TOKEN="your-token-here"

# Use in command
ncp add-http provider https://example.com/mcp \
  --token "$PROVIDER_TOKEN"
```

### From File (For Automation/CI)

```bash
# Store token in file
echo "your-token-here" > ~/.secrets/provider_token

# Read and use
ncp add-http provider https://example.com/mcp \
  --token "$(cat ~/.secrets/provider_token)"
```

---

## Common Questions

### Where are tokens stored?

Tokens are stored in your profile configuration files:
- Location: `~/.ncp/profiles/*.json`
- Format: Plain text (secure your home directory)
- Never sent to Portel servers

### How do I update a token?

Re-add the server with the new token:
```bash
ncp add-http provider https://example.com/mcp --token "new-token"
```

Or manually edit: `~/.ncp/profiles/all.json`

### How do I revoke access?

1. Delete the token from your profile:
   ```bash
   # Edit profile and remove the server
   code ~/.ncp/profiles/all.json
   ```

2. Revoke the token on the provider's website:
   - Go to provider's settings/developer page
   - Find active tokens/API keys
   - Revoke the token

### What if I can't find how to get a token?

1. **Check provider's documentation:**
   - Look for "API", "Developer", "Integrations" sections
   - Search for "API key", "access token", "authentication"

2. **Check MCP documentation:**
   - Most MCP servers have README with setup instructions
   - GitHub repos often have authentication guides

3. **Try stdio version:**
   - Check if provider has CLI tool
   - Stdio versions often handle auth automatically

4. **Ask for help:**
   - GitHub Issues: https://github.com/portel/ncp/issues
   - Discord: https://discord.gg/portel

---

## Troubleshooting

### "Authentication failed" Error

- **Check token is valid:** Tokens may expire
- **Check token permissions:** Ensure token has required scopes
- **Regenerate token:** Create a new token from provider's site

### "Invalid token format" Error

- **Copy full token:** Make sure you copied the entire token
- **No extra whitespace:** Trim spaces before/after token
- **Check for line breaks:** Token should be on one line

### Token Keeps Expiring

- **Use OAuth if available:** OAuth tokens can auto-refresh
- **Check token type:** Some tokens are short-lived by design
- **Consider stdio version:** Provider CLI may handle renewals

---

## Security Best Practices

1. **Never commit tokens to git:**
   ```bash
   # Add to .gitignore
   echo "*.token" >> .gitignore
   ```

2. **Use environment variables in CI/CD:**
   ```yaml
   # GitHub Actions example
   - name: Add MCP
     run: ncp add-http provider ${{ secrets.PROVIDER_TOKEN }}
   ```

3. **Rotate tokens regularly:**
   - Generate new tokens periodically
   - Revoke old tokens after updating

4. **Use minimal permissions:**
   - Only grant scopes/permissions needed
   - Avoid "admin" or "full access" tokens when possible

5. **Keep NCP profiles secure:**
   ```bash
   # Set restrictive permissions
   chmod 700 ~/.ncp
   chmod 600 ~/.ncp/profiles/*.json
   ```

---

## Future: OAuth Proxy (Coming Soon)

We're building `oauth.portel.dev` - an open-source OAuth proxy that will make authentication seamless:

- No need to register OAuth apps yourself
- Browser-based authentication flow
- Tokens stay local (never stored by Portel)
- Support for 50+ providers

**Status:** In development
**Updates:** https://github.com/portel/oauth-proxy

For now, use the methods above. They work great and will continue to be supported!
