# Automated Test Plan - Version 1.5.4

## Overview

This document outlines automated tests for all features added since version 1.5.3.

**Test Execution:**
```bash
npm run test:features
```

**Features to Test:**
1. ✅ Protocol Transparency (clientInfo passthrough)
2. ✅ Registry Security (quality scoring & filtering)
3. ✅ HTTP/SSE Transport Support
4. ✅ Client Registry Expansion
5. ✅ HTTP Authentication

---

## Test Suite 1: Protocol Transparency

**Feature:** ClientInfo passthrough to downstream MCPs (commit 9561a18)

### Test 1.1: ClientInfo Storage from Initialize
```typescript
// Test that MCPServer stores clientInfo from initialize request
test('should store full clientInfo from initialize request', async () => {
  const server = new MCPServer('all', false, false);
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      clientInfo: {
        name: 'claude-desktop',
        version: '1.2.3'
      }
    }
  };

  const response = await server.handleRequest(request);

  // Verify clientInfo was stored internally
  // (would need to expose getter for this test)
});
```

### Test 1.2: ClientInfo Passthrough to Orchestrator
```typescript
// Test that orchestrator receives clientInfo
test('should pass clientInfo to orchestrator via setClientInfo', async () => {
  const orchestrator = new NCPOrchestrator('all', false, false);
  const clientInfo = { name: 'cursor', version: '0.1.0' };

  orchestrator.setClientInfo(clientInfo);

  // Verify orchestrator stores clientInfo
  // Create a Client and verify it uses actual clientInfo
});
```

### Test 1.3: Downstream MCP Receives Actual Client
```bash
# Integration test using mock MCP server
# 1. Start mock MCP that logs received clientInfo
# 2. Send initialize with clientInfo to NCP
# 3. Execute tool through NCP to downstream mock MCP
# 4. Verify mock MCP received actual clientInfo (not "ncp-oss")

Expected:
  Mock MCP logs: "Received clientInfo: { name: 'claude-desktop', version: '1.2.3' }"
  NOT: "Received clientInfo: { name: 'ncp-oss', version: '1.0.0' }"
```

**Verification Points:**
- ✅ MCPServer stores full clientInfo from initialize
- ✅ Orchestrator receives clientInfo via setClientInfo()
- ✅ All 5 Client creation sites use this.clientInfo
- ✅ Downstream MCPs see actual client (not "ncp-oss")

---

## Test Suite 2: Registry Security Features

**Feature:** Quality scoring and security filtering (commit 094f291)

### Test 2.1: Quality Score Calculation
```typescript
test('should calculate quality scores correctly', async () => {
  const client = new RegistryClient();

  // Test server with repository
  const serverWithRepo: ServerSearchResult = {
    server: {
      name: 'io.github.modelcontextprotocol/server-filesystem',
      repository: { url: 'https://github.com/anthropics/mcp', source: 'github' }
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        publishedAt: '2024-09-01T00:00:00Z',
        updatedAt: '2024-10-01T00:00:00Z'
      }
    }
  };

  const score = client['calculateQualityScore'](serverWithRepo, [
    'io.github.modelcontextprotocol'
  ]);

  // Should get: +100 (has repo) +20 (GitHub) +200 (trusted) +50 (good age) +30 (recently updated)
  expect(score).toBeGreaterThan(300);
});
```

### Test 2.2: Security Filtering
```typescript
test('should filter servers by security requirements', async () => {
  const client = new RegistryClient();

  const results = await client.search('filesystem', {
    security: {
      requireRepository: true,
      minAgeDays: 7,
      trustedNamespaces: ['io.github.modelcontextprotocol']
    }
  });

  // All results should have repositories
  results.forEach(result => {
    expect(result.server.repository?.url).toBeTruthy();
  });

  // Trusted namespaces should be first
  expect(results[0].server.name).toMatch(/^io\.github\.modelcontextprotocol/);
});
```

### Test 2.3: Cache Performance
```bash
# Test that fetchAllServers uses 30-minute cache
# 1. Call search() twice within 30 minutes
# 2. Verify second call uses cache (no network request)
# 3. Wait 31 minutes, call again
# 4. Verify cache expired (new network request)

Expected:
  First call: Network request made
  Second call (< 30 min): "Using cached registry dataset"
  Third call (> 30 min): Network request made
```

**Verification Points:**
- ✅ Quality score favors: repository, GitHub, trusted namespace, good age, recent updates
- ✅ Security filtering works: requireRepository, minAgeDays, trustedNamespaces
- ✅ Results sorted by quality score (highest first)
- ✅ Cache TTL is 30 minutes

---

## Test Suite 3: HTTP/SSE Transport Support

**Feature:** HTTP/SSE MCP support (commit 3ab9703)

### Test 3.1: Add HTTP Server Without Auth
```bash
#!/bin/bash
# Test adding public HTTP endpoint

# Clean test environment
rm -rf /tmp/ncp-test-http
mkdir -p /tmp/ncp-test-http/.ncp/profiles

# Add HTTP server
cd /tmp/ncp-test-http
ncp add test-public https://httpbin.org/get --profile all

# Verify config
CONFIG=".ncp/profiles/all.json"
if jq -e '.mcpServers["test-public"].url == "https://httpbin.org/get"' "$CONFIG" > /dev/null; then
  echo "✅ HTTP server added correctly"
else
  echo "❌ HTTP server config incorrect"
  exit 1
fi
```

### Test 3.2: Add HTTP Server With Bearer Token
```bash
#!/bin/bash
# Test adding authenticated HTTP endpoint

# Add server with bearer token
ncp add test-auth https://api.example.com/mcp \
  --auth-type bearer \
  --auth-token "sk_test_123" \
  --profile all

# Verify auth config
CONFIG=".ncp/profiles/all.json"
if jq -e '.mcpServers["test-auth"].auth.type == "bearer"' "$CONFIG" && \
   jq -e '.mcpServers["test-auth"].auth.token == "sk_test_123"' "$CONFIG"; then
  echo "✅ HTTP auth configured correctly"
else
  echo "❌ HTTP auth config incorrect"
  exit 1
fi
```

### Test 3.3: Transport Detection
```typescript
test('should detect transport type from config', () => {
  // stdio: has command
  const stdioConfig = { name: 'test', command: 'npx', args: ['@mcp/server'] };
  expect(detectTransport(stdioConfig)).toBe('stdio');

  // http: has url
  const httpConfig = { name: 'test', url: 'https://api.example.com' };
  expect(detectTransport(httpConfig)).toBe('http');

  // invalid: has both
  expect(() => {
    createTransport({ name: 'test', command: 'npx', url: 'https://...' });
  }).toThrow('Cannot specify both command and url');
});
```

### Test 3.4: HTTP Connection
```bash
# Integration test with real HTTP endpoint
# 1. Start local HTTP MCP server on localhost:3000
# 2. Add it to NCP with: ncp add local-http http://localhost:3000
# 3. List tools: ncp find
# 4. Execute tool: ncp run local-http:test_tool
# 5. Verify tool executes via HTTP transport

Expected:
  HTTP server logs show: POST /mcp/tools/call
  NCP returns tool result successfully
```

**Verification Points:**
- ✅ Can add HTTP server without auth
- ✅ Can add HTTP server with bearer token auth
- ✅ Config stores url, auth.type, auth.token correctly
- ✅ Transport detection works (stdio vs http)
- ✅ Can connect and execute tools via HTTP

---

## Test Suite 4: Client Registry Expansion

**Feature:** Support for 10 new MCP clients (commit 94e40d8)

### Test 4.1: Client Definition Lookup
```typescript
test('should find all registered clients', () => {
  const clients = listRegisteredClients();

  // Should have 14 total clients
  expect(clients.length).toBe(14);

  // Check new clients exist
  expect(clients).toContain('zed');
  expect(clients).toContain('windsurf');
  expect(clients).toContain('enconvo');
  expect(clients).toContain('raycast');
  expect(clients).toContain('vscode');
  expect(clients).toContain('github-copilot');
  expect(clients).toContain('pieces');
  expect(clients).toContain('tabnine');
  expect(clients).toContain('claude-code');
});
```

### Test 4.2: Config Path Resolution
```typescript
test('should resolve config paths for new clients', () => {
  // Test macOS path for Zed
  const zedPath = getClientConfigPath('zed');
  expect(zedPath).toMatch(/\.config\/zed\/settings\.json$/);

  // Test Windsurf on different platforms
  const windsurfPath = getClientConfigPath('windsurf');
  if (process.platform === 'darwin') {
    expect(windsurfPath).toMatch(/Windsurf\/.*\/mcp_settings\.json$/);
  }
});
```

### Test 4.3: Auto-Import Simulation
```bash
#!/bin/bash
# Simulate auto-import from new client

# Create mock Zed config
mkdir -p ~/.config/zed
cat > ~/.config/zed/settings.json << 'EOF'
{
  "context_servers": {
    "test-server": {
      "command": "npx",
      "args": ["-y", "@mcp/test"]
    }
  }
}
EOF

# Run NCP as if connected from Zed
# (Would need to mock clientInfo in initialize)

# Verify auto-import detected and imported MCP
# Check that test-server exists in NCP profile

Expected:
  NCP detects clientName="zed"
  Auto-import finds ~/.config/zed/settings.json
  Imports test-server to profile
```

**Verification Points:**
- ✅ All 14 clients registered in CLIENT_REGISTRY
- ✅ Config paths resolve correctly per platform
- ✅ mcpServersPath configured for each client
- ✅ Auto-import works for new clients

---

## Test Suite 5: HTTP Authentication

**Feature:** HTTP credential collection (commit 3a95b0a)

### Test 5.1: Credential Detection
```typescript
test('should detect required credentials for known services', () => {
  // GitHub
  const githubCreds = detectHTTPCredentials('github', 'https://api.github.com/mcp');
  expect(githubCreds[0].credentialType).toBe('bearer');
  expect(githubCreds[0].displayName).toContain('GitHub');

  // Stripe
  const stripeCreds = detectHTTPCredentials('stripe', 'https://api.stripe.com/mcp');
  expect(stripeCreds[0].credentialType).toBe('bearer');
  expect(stripeCreds[0].example).toMatch(/sk_test_/);
});
```

### Test 5.2: Credential Collection Flow
```bash
# Test credential collection via clipboard
# 1. Copy bearer token to clipboard: "sk_test_123"
# 2. Call collectHTTPCredentials()
# 3. Verify it detects clipboard content
# 4. Verify it returns { type: 'bearer', token: 'sk_test_123' }

Expected:
  Prompts: "Paste GitHub Personal Access Token from clipboard"
  Returns: { type: 'bearer', token: 'sk_test_123' }
```

### Test 5.3: Integration with ncp:add
```bash
#!/bin/bash
# Test full flow with credential collection

# 1. Copy token to clipboard
echo "sk_test_my_token" | pbcopy  # macOS

# 2. Add GitHub MCP (should trigger credential collection)
ncp add github-api https://api.github.com/mcp

# 3. Verify credentials stored in config
CONFIG=".ncp/profiles/all.json"
if jq -e '.mcpServers["github-api"].auth.token == "sk_test_my_token"' "$CONFIG"; then
  echo "✅ Credentials collected and stored"
else
  echo "❌ Credential collection failed"
  exit 1
fi
```

**Verification Points:**
- ✅ Detects common service patterns (GitHub, GitLab, Stripe, etc.)
- ✅ Collects bearer tokens via clipboard
- ✅ Returns proper auth config format
- ✅ Integrates with ncp:add command

---

## Test Execution Script

Create `scripts/test-features.sh`:

```bash
#!/bin/bash
set -e

echo "=========================================="
echo "Feature Test Suite - Version 1.5.4"
echo "=========================================="
echo ""

# Test Suite 1: Protocol Transparency
echo "Running Suite 1: Protocol Transparency..."
# TODO: Implement protocol transparency tests
echo "  ⏭️  Skipped (requires mock MCP server)"
echo ""

# Test Suite 2: Registry Security
echo "Running Suite 2: Registry Security..."
node scripts/test-registry-security.js
echo ""

# Test Suite 3: HTTP/SSE Support
echo "Running Suite 3: HTTP/SSE Transport..."
./test-http-sse-support.sh
echo ""

# Test Suite 4: Client Registry
echo "Running Suite 4: Client Registry..."
node scripts/test-client-registry.js
echo ""

# Test Suite 5: HTTP Authentication
echo "Running Suite 5: HTTP Authentication..."
# TODO: Implement credential collection tests
echo "  ⏭️  Skipped (requires clipboard interaction)"
echo ""

echo "=========================================="
echo "✅ All Feature Tests Complete"
echo "=========================================="
```

---

## Implementation Checklist

- [ ] Create `scripts/test-registry-security.js` (Suite 2)
- [ ] Create `scripts/test-client-registry.js` (Suite 4)
- [ ] Create `scripts/test-protocol-transparency.js` (Suite 1)
- [ ] Create `scripts/test-http-auth.js` (Suite 5)
- [ ] Enhance existing `test-http-sse-support.sh` (Suite 3)
- [ ] Create master script `scripts/test-features.sh`
- [ ] Add `npm run test:features` script to package.json
- [ ] Document test results format
- [ ] Create CI/CD integration guide

---

## Success Criteria

All tests must pass before releasing version 1.5.4:

1. **Protocol Transparency:** Downstream MCPs see actual client (not "ncp-oss")
2. **Registry Security:** Quality scoring ranks trusted MCPs first
3. **HTTP/SSE Support:** Can add and use HTTP-based MCPs
4. **Client Registry:** Auto-import works for all 14 clients
5. **HTTP Auth:** Bearer tokens collected and stored securely

**Exit Criteria:**
```bash
npm run test:features  # All tests pass
npm run build          # Build succeeds
npm run lint           # No linting errors
```
