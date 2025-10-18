# Test Implementation Roadmap

## Priority Order (Easiest → Hardest)

### Phase 1: Unit Tests (No External Dependencies) ⚡ QUICK WINS

#### 1. Client Registry Tests (30 minutes)
**File:** `scripts/test-client-registry.js`

```javascript
// Test all 14 clients are registered
// Test config path resolution
// Test platform-specific paths

Status: ✅ Can implement immediately
Dependencies: None
Risk: Low
```

#### 2. Registry Security Tests (45 minutes)
**File:** `scripts/test-registry-security.js`

```javascript
// Test quality score calculation
// Test security filtering logic
// Test cache behavior

Status: ✅ Can implement immediately
Dependencies: None (uses mocked data)
Risk: Low
```

### Phase 2: Integration Tests (Mock External Services) 🔧 MEDIUM EFFORT

#### 3. HTTP/SSE Transport Tests (1 hour)
**Status:** Already exists (`test-http-sse-support.sh`)

**Enhancements needed:**
- Add bearer token auth test
- Add transport detection test
- Add config validation test

```bash
# Already has:
- Add HTTP server without auth ✅
- Verify config format ✅

# Need to add:
- Add HTTP server with auth ⏳
- Test transport type detection ⏳
- Test connection failure handling ⏳
```

#### 4. HTTP Authentication Tests (1 hour)
**File:** `scripts/test-http-auth.js`

**Approach:** Mock clipboard, test detection logic

```javascript
// Test credential pattern detection
// Mock clipboard content
// Test collectHTTPCredentials() flow

Status: ⚠️  Requires clipboard mocking
Dependencies: clipboard library mock
Risk: Medium
```

### Phase 3: End-to-End Tests (Requires Mock MCP) 🏗️ COMPLEX

#### 5. Protocol Transparency Tests (2 hours)
**File:** `scripts/test-protocol-transparency.js`

**Approach:** Create mock MCP server that logs clientInfo

```javascript
// 1. Create minimal MCP server (logs what it receives)
// 2. Start it as subprocess
// 3. Send initialize to NCP with clientInfo
// 4. Execute tool through NCP
// 5. Verify mock MCP received actual clientInfo

Status: ⚠️  Requires mock MCP implementation
Dependencies: Mock MCP server, subprocess management
Risk: High
```

---

## Implementation Order

### Day 1: Quick Wins
1. ✅ Create client registry tests (30 min)
2. ✅ Create registry security tests (45 min)
3. ✅ Enhance HTTP/SSE tests (30 min)

**Outcome:** 60% test coverage

### Day 2: Integration
4. ⚠️  Create HTTP auth tests (1 hour)
5. ⚠️  Create protocol transparency tests (2 hours)

**Outcome:** 100% test coverage

---

## Quick Start: Implement Phase 1 Now

Let's start with the two easiest test suites:

### Test 1: Client Registry (`scripts/test-client-registry.js`)

```javascript
#!/usr/bin/env node

import { listRegisteredClients, getClientConfigPath, getClientDefinition } from '../dist/utils/client-registry.js';
import assert from 'assert';

console.log('Testing Client Registry...\n');

// Test 1: All 14 clients registered
console.log('Test 1: Verify 14 clients registered');
const clients = listRegisteredClients();
assert.strictEqual(clients.length, 14, `Expected 14 clients, got ${clients.length}`);
console.log('✅ Pass: 14 clients registered\n');

// Test 2: New clients exist
console.log('Test 2: Verify new clients exist');
const newClients = ['zed', 'windsurf', 'enconvo', 'raycast', 'vscode',
                    'github-copilot', 'pieces', 'tabnine', 'claude-code'];
newClients.forEach(client => {
  assert(clients.includes(client), `Missing client: ${client}`);
});
console.log('✅ Pass: All 9 new clients found\n');

// Test 3: Config path resolution
console.log('Test 3: Test config path resolution');
const zedDef = getClientDefinition('zed');
assert(zedDef, 'Zed definition not found');
assert.strictEqual(zedDef.mcpServersPath, 'context_servers');
console.log('✅ Pass: Config paths resolve correctly\n');

console.log('✅ All Client Registry Tests Passed!');
```

### Test 2: Registry Security (`scripts/test-registry-security.js`)

```javascript
#!/usr/bin/env node

import { RegistryClient } from '../dist/services/registry-client.js';
import assert from 'assert';

console.log('Testing Registry Security Features...\n');

const client = new RegistryClient();

// Mock server data
const mockServerTrusted = {
  server: {
    name: 'io.github.modelcontextprotocol/server-filesystem',
    repository: { url: 'https://github.com/anthropics/mcp', source: 'github' }
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: '2024-09-01T00:00:00Z',
      updatedAt: '2024-10-15T00:00:00Z'
    }
  }
};

const mockServerUntrusted = {
  server: {
    name: 'random.company/server-test',
    repository: { url: '', source: '' }  // No repo
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: '2024-10-10T00:00:00Z'
    }
  }
};

// Test 1: Quality score calculation
console.log('Test 1: Quality score for trusted server with repo');
const trustedScore = client['calculateQualityScore'](mockServerTrusted, [
  'io.github.modelcontextprotocol'
]);
assert(trustedScore > 300, `Expected score > 300, got ${trustedScore}`);
console.log(`✅ Pass: Trusted server scored ${trustedScore} (expected > 300)\n`);

// Test 2: Quality score for untrusted server
console.log('Test 2: Quality score for untrusted server without repo');
const untrustedScore = client['calculateQualityScore'](mockServerUntrusted, []);
assert(untrustedScore < 100, `Expected score < 100, got ${untrustedScore}`);
console.log(`✅ Pass: Untrusted server scored ${untrustedScore} (expected < 100)\n`);

// Test 3: Security filtering
console.log('Test 3: Security filtering removes servers without repos');
const mockServers = [mockServerTrusted, mockServerUntrusted];
const filtered = client['applySecurityFilters'](mockServers, { requireRepository: true });
assert.strictEqual(filtered.length, 1, 'Expected 1 server after filtering');
assert.strictEqual(filtered[0].server.name, mockServerTrusted.server.name);
console.log('✅ Pass: Security filtering works correctly\n');

console.log('✅ All Registry Security Tests Passed!');
```

---

## Running the Tests

Add to `package.json`:

```json
{
  "scripts": {
    "test:features": "bash scripts/test-features.sh",
    "test:client-registry": "node scripts/test-client-registry.js",
    "test:registry-security": "node scripts/test-registry-security.js",
    "test:http": "bash test-http-sse-support.sh"
  }
}
```

---

## Next Steps

1. **Implement Phase 1 tests now** (90 minutes total)
2. **Run them:** `npm run test:client-registry && npm run test:registry-security`
3. **Fix any issues** found
4. **Move to Phase 2** when ready

**Ready to implement?** Start with `scripts/test-client-registry.js`
