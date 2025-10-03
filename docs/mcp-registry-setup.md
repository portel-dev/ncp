# MCP Registry Publishing Setup

## Overview

NCP automatically publishes to the MCP Registry when a GitHub Release is created. This document explains the authentication setup.

## Authentication Methods

### Method 1: GitHub OIDC (Automatic)

**Pros**:
- ✅ No secrets to configure
- ✅ Automatic via GitHub Actions
- ✅ Most secure (short-lived tokens)

**Cons**:
- ⚠️ May not detect organization membership correctly
- ⚠️ Known issue with `portel-dev` organization detection

**How it works**:
- Workflow has `id-token: write` permission
- GitHub Actions generates OIDC token automatically
- MCP Publisher uses token to authenticate

**No setup required** - works out of the box (if organization detection works)

---

### Method 2: GitHub Personal Access Token (Fallback)

**Use this if OIDC fails to detect `portel-dev` organization**

#### Setup Steps

1. **Create GitHub PAT**:
   - Go to: https://github.com/settings/tokens
   - Click: "Tokens (classic)" → "Generate new token (classic)"
   - Name: `MCP Registry Publishing`
   - Scopes needed:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `read:org` (Read org and team membership)
   - Click "Generate token"
   - **Copy the token** (you won't see it again!)

2. **Add as GitHub Secret**:
   - Go to: https://github.com/portel-dev/ncp/settings/secrets/actions
   - Click: "New repository secret"
   - Name: `MCP_GITHUB_TOKEN`
   - Value: Paste your PAT
   - Click: "Add secret"

3. **Workflow will automatically use it**:
   - Workflow tries OIDC first
   - If OIDC fails, falls back to `MCP_GITHUB_TOKEN`
   - No code changes needed!

---

## Verification

### Check Organization Membership

Verify you're an admin of `portel-dev`:

```bash
gh api orgs/portel-dev/memberships/$(gh api user -q .login)
```

Expected output:
```json
{
  "role": "admin",
  "state": "active"
}
```

### Check Repository Permissions

```bash
gh api repos/portel-dev/ncp/collaborators/$(gh api user -q .login)/permission
```

Expected output:
```json
{
  "permission": "admin",
  "role_name": "admin"
}
```

### Validate server.json

```bash
curl -sS https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json -o /tmp/server.schema.json
jsonschema -i server.json /tmp/server.schema.json
```

Should output: (no errors = valid)

---

## Testing the Workflow

### Option 1: Wait for Real Release

The workflow triggers automatically when you publish a GitHub Release via the Release workflow.

### Option 2: Manual Test (Local)

You can test MCP Publisher authentication locally:

```bash
# Download MCP Publisher
VERSION="v1.1.0"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

curl -L "https://github.com/modelcontextprotocol/registry/releases/download/${VERSION}/mcp-publisher_${VERSION#v}_${OS}_${ARCH}.tar.gz" | tar xz

# Test authentication
./mcp-publisher login github-oidc  # Try OIDC first

# Or with PAT
export GITHUB_TOKEN="your-pat-here"
echo "$GITHUB_TOKEN" | ./mcp-publisher login github --token-stdin

# Dry run publish (doesn't actually publish)
./mcp-publisher publish --dry-run
```

---

## Troubleshooting

### "Organization portel-dev not detected"

**Solution**: Use GitHub PAT (Method 2 above)

This is a known limitation with GitHub OIDC tokens not always exposing organization membership.

### "Authentication failed"

**Check**:
1. PAT is valid and not expired
2. PAT has `repo` and `read:org` scopes
3. Secret name is exactly `MCP_GITHUB_TOKEN`
4. You're an admin of `portel-dev` organization

### "Invalid server.json"

**Check**:
- Description is ≤100 characters
- Version format is valid (e.g., `1.4.0`)
- All required fields present
- Run validation: `jsonschema -i server.json /tmp/server.schema.json`

---

## Security Notes

### GitHub PAT Best Practices

- ✅ Use classic tokens (fine-grained tokens not yet supported by MCP Publisher)
- ✅ Minimum scopes: `repo`, `read:org`
- ✅ Store as GitHub Secret (never commit to code)
- ✅ Rotate token periodically
- ✅ Revoke immediately if compromised

### OIDC vs PAT

| Feature | OIDC | PAT |
|---------|------|-----|
| Security | ⭐⭐⭐⭐⭐ Short-lived | ⭐⭐⭐ Long-lived |
| Setup | Zero config | Requires secret |
| Org Detection | ⚠️ May fail | ✅ Reliable |
| Recommended | If it works | If OIDC fails |

---

## What Gets Published

Each release publishes to:

1. **NPM**: `@portel/ncp@X.Y.Z`
2. **MCP Registry**: `io.github.portel-dev/ncp`
3. **GitHub Releases**: Tagged release

All automatic via GitHub Actions!

---

## Support

If you encounter issues:

1. Check GitHub Actions logs
2. Review this troubleshooting guide
3. Test authentication locally
4. Open an issue: https://github.com/portel-dev/ncp/issues
