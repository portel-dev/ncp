# HTTP/SSE MCP Integration - Complete Guide

## ✅ What's Implemented

NCP now supports **HTTP and SSE-based MCPs** with full authentication support:

- ✅ HTTP/SSE transport (SSEClientTransport)
- ✅ OAuth 2.0 Device Flow (RFC 8628)
- ✅ Bearer token authentication
- ✅ API key authentication
- ✅ Basic HTTP authentication
- ✅ Encrypted token storage (AES-256-CBC)
- ✅ Automatic token refresh
- ✅ CLI commands for setup

---

## 🚀 Quick Start

### 1. Public Endpoint (No Auth)

```bash
ncp add-http my-mcp https://example.com/mcp/sse
```

### 2. Bearer Token Auth

```bash
ncp add-http my-mcp https://api.example.com/mcp/sse \
  --auth-type bearer \
  --token "your-bearer-token-here"
```

### 3. API Key Auth

```bash
ncp add-http my-mcp https://api.example.com/mcp/sse \
  --auth-type apiKey \
  --token "sk-your-api-key-here"
```

### 4. Basic Auth

```bash
ncp add-http my-mcp https://api.example.com/mcp/sse \
  --auth-type basic \
  --username "your-username" \
  --password "your-password"
```

### 5. OAuth 2.0 Device Flow

```bash
ncp add-http my-mcp https://api.example.com/mcp/sse \
  --auth-type oauth \
  --client-id "your-client-id" \
  --device-auth-url "https://auth.example.com/device/code" \
  --token-url "https://auth.example.com/token" \
  --scopes "mcp.read" "mcp.write"
```

**OAuth Flow on First Connection:**
```
┌─────────────────────────────────────────┐
│     🔐 OAuth Authentication Required    │
└─────────────────────────────────────────┘

📱 Visit: https://auth.example.com/device

🔑 Enter code: ABCD-1234

⏱️  Code expires in 15 minutes

⏳ Waiting for authorization...
...
✅ Authentication successful!
```

---

## 📋 Full Example: Adding GitHub Copilot MCP

**Hypothetical GitHub Copilot MCP example:**

```bash
# Add GitHub Copilot MCP with OAuth
ncp add-http github-copilot https://api.github.com/copilot/mcp/sse \
  --auth-type oauth \
  --client-id "Iv1.1234567890abcdef" \
  --device-auth-url "https://github.com/login/device/code" \
  --token-url "https://github.com/login/oauth/access_token" \
  --scopes "copilot"

# Test discovery
ncp find "code completion"

# Execute a tool
ncp run github-copilot:complete_code --params '{"language": "python", "context": "def fibonacci("}' --dry-run
```

---

## 🔧 Technical Details

### Architecture

**Config Structure:**
```json
{
  "mcpServers": {
    "my-mcp": {
      "url": "https://api.example.com/mcp/sse",
      "auth": {
        "type": "oauth",
        "oauth": {
          "clientId": "...",
          "deviceAuthUrl": "...",
          "tokenUrl": "...",
          "scopes": ["mcp.read", "mcp.write"]
        }
      }
    }
  }
}
```

**Token Storage:**
```
~/.ncp/tokens/
  ├── my-mcp.token         # Encrypted token file
  └── ...

~/.ncp/encryption.key      # AES-256 encryption key (0o600 permissions)
```

**Authentication Flow:**

1. **First Connection:**
   ```
   User runs: ncp find "query"
     ↓
   Orchestrator creates SSEClientTransport
     ↓
   No valid token found → Trigger OAuth Device Flow
     ↓
   Display instructions to user
     ↓
   Poll for authorization
     ↓
   Store encrypted token in ~/.ncp/tokens/
     ↓
   Connect with Authorization header
   ```

2. **Subsequent Connections:**
   ```
   User runs: ncp run my-mcp:tool
     ↓
   Check TokenStore for valid token
     ↓
   Token found and not expired → Use cached token
     ↓
   Connect immediately with Authorization header
   ```

3. **Token Expiration:**
   ```
   Token expires (checked with 5-minute buffer)
     ↓
   Return null from TokenStore
     ↓
   Trigger new OAuth flow or refresh (if refresh_token available)
   ```

### Code Locations

**Transport Creation:**
- `src/orchestrator/ncp-orchestrator.ts:617-717` - `createTransport()`
  - Detects `config.url` vs `config.command`
  - Creates `SSEClientTransport` with auth headers
  - Falls back to `StdioClientTransport` for local processes

**Authentication:**
- `src/orchestrator/ncp-orchestrator.ts:723-759` - `getAuthToken()`
  - Checks cached tokens
  - Triggers OAuth flow when needed
  - Stores tokens for reuse

**OAuth Device Flow:**
- `src/auth/oauth-device-flow.ts` - Complete RFC 8628 implementation
  - Device code request
  - User instructions display
  - Token polling with error handling

**Token Storage:**
- `src/auth/token-store.ts` - Secure encrypted storage
  - AES-256-CBC encryption
  - Per-MCP token files
  - Expiration checking (5-minute buffer)

---

## 🧪 Testing Guide

### Test 1: Public SSE Endpoint

**Setup a test MCP server:**

```javascript
// test-sse-server.js
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

const app = express();
const server = new Server({ name: 'test-sse-mcp', version: '1.0.0' }, {
  capabilities: { tools: {} }
});

server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'test_tool',
    description: 'A test tool for HTTP/SSE',
    inputSchema: { type: 'object', properties: {} }
  }]
}));

server.setRequestHandler('tools/call', async (request) => ({
  content: [{ type: 'text', text: 'Hello from HTTP/SSE MCP!' }]
}));

const transport = new SSEServerTransport('/sse', server);
app.use(transport.router);

app.listen(3000, () => {
  console.log('Test SSE MCP running on http://localhost:3000/sse');
});
```

**Run server:**
```bash
node test-sse-server.js
```

**Add to NCP:**
```bash
ncp add-http test-sse http://localhost:3000/sse
```

**Test:**
```bash
# Should discover test_tool
ncp find "test"

# Should execute successfully
ncp run test-sse:test_tool
```

### Test 2: Bearer Token Auth

**Server with auth:**
```javascript
// Modify test-sse-server.js
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (auth !== 'Bearer test-token-123') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

**Add with auth:**
```bash
ncp add-http test-sse-auth http://localhost:3000/sse \
  --auth-type bearer \
  --token "test-token-123"
```

### Test 3: OAuth Flow Simulation

Create a mock OAuth server to test the device flow:

```javascript
// mock-oauth-server.js
import express from 'express';
const app = express();

let deviceCode = null;
let authorized = false;

// Device authorization endpoint
app.post('/device/code', (req, res) => {
  deviceCode = 'test-device-code-' + Date.now();
  res.json({
    device_code: deviceCode,
    user_code: 'TEST-1234',
    verification_uri: 'http://localhost:4000/authorize',
    verification_uri_complete: 'http://localhost:4000/authorize?user_code=TEST-1234',
    expires_in: 900,
    interval: 5
  });
});

// Authorization page
app.get('/authorize', (req, res) => {
  const code = req.query.user_code;
  res.send(`
    <h1>Authorize Device</h1>
    <p>Code: ${code}</p>
    <button onclick="authorize()">Authorize</button>
    <script>
      function authorize() {
        fetch('/authorize/approve', { method: 'POST' })
          .then(() => alert('Authorized! Return to CLI'));
      }
    </script>
  `);
});

app.post('/authorize/approve', (req, res) => {
  authorized = true;
  res.json({ success: true });
});

// Token endpoint (polling)
app.post('/token', (req, res) => {
  if (!authorized) {
    return res.json({ error: 'authorization_pending' });
  }
  res.json({
    access_token: 'test-access-token-' + Date.now(),
    token_type: 'Bearer',
    expires_in: 3600
  });
});

app.listen(4000, () => {
  console.log('Mock OAuth server running on http://localhost:4000');
});
```

**Test OAuth flow:**
```bash
# Start mock OAuth server
node mock-oauth-server.js

# Add MCP with OAuth
ncp add-http test-oauth http://localhost:3000/sse \
  --auth-type oauth \
  --client-id "test-client" \
  --device-auth-url "http://localhost:4000/device/code" \
  --token-url "http://localhost:4000/token"

# First tool execution will trigger OAuth flow
ncp find "test"

# Follow instructions to visit http://localhost:4000/authorize
# Click "Authorize" button
# CLI should show "✅ Authentication successful!"
```

---

## 📊 Benefits

### For Users

✅ **No local installation needed** - MCPs run remotely
✅ **Secure authentication** - OAuth, bearer tokens, API keys
✅ **Token caching** - Authenticate once, use everywhere
✅ **Cross-platform** - Works on any device with network access

### For MCP Providers

✅ **Scalable hosting** - Serve thousands of users from one instance
✅ **Centralized updates** - Update once, all users benefit
✅ **Usage tracking** - Monitor API calls, enforce rate limits
✅ **Monetization** - Charge for premium features

### Technical Advantages

✅ **Reduced overhead** - No process spawning, instant connections
✅ **Better performance** - Persistent connections, reduced latency
✅ **Resource sharing** - Multiple users share one MCP instance
✅ **Easy debugging** - Centralized logging and monitoring

---

## 🔒 Security

### Token Storage

- **Encryption:** AES-256-CBC with random IV per encryption
- **Key storage:** `~/.ncp/encryption.key` with 0o600 permissions
- **Per-MCP isolation:** Each MCP has separate encrypted token file
- **Expiration checking:** Tokens checked for expiration before use (5-minute buffer)

### Authentication Types

| Type | Security Level | Use Case |
|------|---------------|----------|
| **OAuth** | ⭐⭐⭐⭐⭐ | User-facing services (GitHub, Google, etc.) |
| **Bearer Token** | ⭐⭐⭐⭐ | Server-to-server APIs |
| **API Key** | ⭐⭐⭐⭐ | Cloud services (OpenAI, Anthropic, etc.) |
| **Basic Auth** | ⭐⭐⭐ | Legacy systems, internal tools |
| **None** | ⭐⭐ | Public endpoints, read-only data |

### Best Practices

1. **Never commit tokens** to git repositories
2. **Rotate tokens regularly** using OAuth refresh tokens
3. **Use HTTPS only** for production endpoints
4. **Scope permissions** minimally (request only needed scopes)
5. **Monitor usage** to detect token leakage

---

## 🐛 Troubleshooting

### "Connection refused"

```bash
# Check if server is running
curl -I https://api.example.com/mcp/sse

# Check firewall rules
# Check DNS resolution
```

### "Unauthorized" (401)

```bash
# Verify token is correct
cat ~/.ncp/tokens/my-mcp.token  # (will be encrypted)

# Re-authenticate
rm ~/.ncp/tokens/my-mcp.token
ncp find "test"  # Will trigger new auth flow
```

### "OAuth timeout"

```bash
# Increase timeout (edit if needed)
# Check OAuth server status
curl -X POST https://auth.example.com/device/code \
  -d "client_id=your-client-id"

# Verify callback URL accessibility
```

### SSE Connection Drops

```bash
# Check keepalive settings
# Verify network stability
# Check server logs for errors
```

---

## 📚 Additional Resources

**MCP Protocol Spec:**
- [HTTP/SSE Transport](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports/)

**OAuth 2.0 Device Flow:**
- [RFC 8628](https://tools.ietf.org/html/rfc8628)
- [Auth0 Guide](https://auth0.com/docs/get-started/authentication-and-authorization-flow/device-authorization-flow)

**SSE (Server-Sent Events):**
- [MDN SSE Guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)

**Security Best Practices:**
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Token Storage Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

---

## ✨ Status

**Implementation:** ✅ **COMPLETE**
**Testing:** ⏳ **In Progress**
**Documentation:** ✅ **Complete**

All core functionality is implemented and ready for use:

- [x] SSEClientTransport integration
- [x] OAuth Device Flow (RFC 8628)
- [x] Token storage with encryption
- [x] Bearer/API Key/Basic auth
- [x] CLI commands (`ncp add-http`)
- [x] Automatic token refresh
- [x] Error handling and retry logic

**Next Steps:**
1. Test with real HTTP/SSE MCP servers
2. Add examples to README
3. Create demo video
4. Deploy sample MCP server for testing

---

**Built with ❤️ for the NCP community**
