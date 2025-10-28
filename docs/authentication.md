# Authentication Guide

NCP supports authentication for MCPs that require API keys, tokens, or credentials. This guide shows you how to provide credentials non-interactively.

## Quick Reference

```bash
# HTTP MCP with bearer token
ncp add https://mcp.example.com --token "your-token-here"

# Registry-based HTTP MCP with token
ncp add notion --token "secret_xxx"

# stdio MCP with environment variables
ncp add github --env GITHUB_TOKEN=ghp_xxx

# stdio MCP with auto-setup (interactive)
ncp add github -y
```

---

## HTTP MCPs (Bearer Tokens)

Most HTTP/SSE MCPs use bearer token authentication.

### From Registry

```bash
# Add with token in one command
ncp add canva --token "your-canva-token"

# Registry auto-detects that Canva uses HTTP transport
# Token is saved to your profile configuration
```

### Manual HTTP URLs

```bash
# Direct URL with token
ncp add https://mcp.example.com --token "bearer_xxx"

# NCP auto-detects this is an HTTP endpoint
# Generates name from domain: "mcp-example-com"
```

### Without Token (Manual Config Required)

```bash
# Add without token - will warn
ncp add notion

# Output:
# ⚠️  Bearer token required but not provided
# Add token later: ncp add notion --token "your-token"
```

**To add token later:**
```bash
ncp add notion --token "your-token-here"
# This overwrites the existing configuration
```

---

## stdio MCPs (Environment Variables)

stdio MCPs often need API keys or credentials as environment variables.

### Using `--env` Flag

```bash
# Single environment variable
ncp add github --env GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Multiple environment variables
ncp add slack \
  --env SLACK_BOT_TOKEN=xoxb-xxx \
  --env SLACK_TEAM_ID=T123456

# Complex values (use quotes)
ncp add postgres \
  --env POSTGRES_CONNECTION_STRING="postgresql://user:pass@host:5432/db"
```

### Using Setup Commands (Interactive)

Some MCPs have setup commands that handle authentication for you.

```bash
# Auto-run setup with -y flag
ncp add github -y

# This runs: gh auth login
# Opens browser for OAuth authentication
```

**Without `-y` flag:**
```bash
ncp add github

# Prompts:
# Run authentication now? (y/n):
```

---

## Common Patterns

### GitHub

**Option 1: Personal Access Token**
```bash
# Non-interactive
ncp add github --env GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

**Option 2: OAuth via GitHub CLI**
```bash
# Interactive
ncp add github -y
# Opens browser for authentication
```

### Slack

```bash
ncp add slack \
  --env SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx \
  --env SLACK_TEAM_ID=T01234567
```

### Notion

```bash
ncp add notion --token "secret_xxxxxxxxxxxx"
```

### OpenAI

```bash
ncp add openai --env OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

### PostgreSQL

```bash
ncp add postgres \
  --env POSTGRES_CONNECTION_STRING="postgresql://user:pass@localhost:5432/mydb"
```

---

## Security Best Practices

### 1. Never Commit Tokens to Git

```bash
# Add to .gitignore
echo "*.token" >> .gitignore
echo ".env" >> .gitignore
```

### 2. Use Environment Variables in CI/CD

```bash
# GitHub Actions example
ncp add github --env GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}

# Shell script
ncp add notion --token "$NOTION_TOKEN"
```

### 3. Store Tokens Securely

```bash
# Use a secrets file with restrictive permissions
echo "your-token" > ~/.secrets/notion_token
chmod 600 ~/.secrets/notion_token

# Read from file
ncp add notion --token "$(cat ~/.secrets/notion_token)"
```

### 4. Rotate Tokens Regularly

```bash
# Generate new token on provider's website
# Update in NCP
ncp add notion --token "new-token-here"  # Overwrites old token
```

### 5. Secure NCP Profiles

```bash
# Restrict permissions on profile directory
chmod 700 ~/.ncp
chmod 600 ~/.ncp/profiles/*.json
```

---

## Where Credentials Are Stored

**Location:** `~/.ncp/profiles/<profile>.json`

**Format:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "notion": {
      "url": "https://mcp.notion.so",
      "auth": {
        "type": "bearer",
        "token": "secret_xxxxxxxxxxxx"
      }
    }
  }
}
```

**Security Notes:**
- Stored in plain text (secure your home directory)
- Never sent to Portel servers
- Only read by NCP when connecting to MCPs

---

## Updating Credentials

### Update Token

```bash
# Re-run add command with new token
ncp add notion --token "new-token-here"
```

### Update Environment Variables

```bash
# Re-run add command with new values
ncp add github --env GITHUB_TOKEN=ghp_new_token_here
```

### Manual Edit

```bash
# Find config location
ncp config location

# Edit manually
code ~/.ncp/profiles/all.json
```

---

## Troubleshooting

### "Authentication failed" Error

**Check token validity:**
1. Generate new token on provider's website
2. Verify token has correct scopes/permissions
3. Re-add with new token: `ncp add <name> --token "new-token"`

### "Permission denied" Error

**Check environment variables:**
```bash
# Verify environment variable format
ncp add github --env GITHUB_TOKEN=ghp_xxx

# Check token has required permissions
# (e.g., GitHub tokens need 'repo' scope for private repos)
```

### Token Keeps Expiring

**Solutions:**
1. **Use stdio with OAuth:** Provider CLI handles token refresh
   ```bash
   ncp add github -y  # Uses gh CLI, handles refresh automatically
   ```

2. **Generate longer-lived tokens:** Check provider settings for token expiration

3. **Use manual refresh:** Re-run add command when token expires

### Can't Find How to Generate Token

**Steps:**
1. Visit provider's website (e.g., github.com, notion.so)
2. Go to Settings → Developer Settings → Personal Access Tokens
3. Generate new token with required scopes
4. Copy token immediately (won't be shown again)
5. Use with NCP: `ncp add <provider> --token "token-here"`

**Common locations:**
- GitHub: Settings → Developer settings → Personal access tokens
- GitLab: Preferences → Access Tokens
- Slack: api.slack.com → Your Apps → OAuth & Permissions
- Notion: notion.so/my-integrations

---

## stdio vs HTTP: Which to Use?

### Prefer stdio When Available

**Advantages:**
- Provider handles authentication
- Automatic token refresh
- One-time setup (via `-y` flag or `--env`)

**Example:**
```bash
# GitHub offers both stdio and HTTP
# stdio version is easier:
ncp add github -y  # OAuth via gh CLI

# vs HTTP version:
ncp add github --transport http --token "ghp_xxx"  # Manual token
```

### Use HTTP When

- Provider only offers HTTP endpoint
- You prefer manual token control
- stdio version has issues

**Example:**
```bash
# Notion only offers HTTP
ncp add notion --token "secret_xxx"
```

---

## Advanced: OAuth (Coming Soon)

We're building OAuth proxy support to simplify authentication:

- No manual token generation needed
- Browser-based authentication flow
- Tokens stay local (never stored by Portel)
- Support for 50+ providers

**Status:** In development
**Updates:** https://github.com/portel-dev/oauth-proxy

For now, use bearer tokens or stdio versions with built-in OAuth.

---

## CI/CD Examples

### GitHub Actions

```yaml
name: Add MCP
on: push

jobs:
  add-mcp:
    runs-on: ubuntu-latest
    steps:
      - name: Install NCP
        run: npm install -g @portel/ncp

      - name: Add GitHub MCP
        run: ncp add github --env GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}

      - name: Add Notion MCP
        run: ncp add notion --token ${{ secrets.NOTION_TOKEN }}
```

### Shell Script

```bash
#!/bin/bash
# setup-mcps.sh

# Load secrets from environment
set -a
source .env
set +a

# Add MCPs non-interactively
ncp add github --env GITHUB_TOKEN="$GITHUB_TOKEN"
ncp add slack --env SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN"
ncp add notion --token "$NOTION_TOKEN"

echo "✅ All MCPs configured"
```

---

## Need Help?

- **Documentation:** https://github.com/portel-dev/ncp/tree/main/docs
- **Issues:** https://github.com/portel-dev/ncp/issues
- **Discord:** https://discord.gg/portel
