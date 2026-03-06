# NCP Testing Strategy - Preventing Publication Issues

## Problem Statement
The recent NPM publication (1.0.4) broke MCP server mode functionality, causing tools to not appear on mcp.so and other platforms. This happened because:

1. ❌ No automated testing of MCP protocol integration
2. ❌ No validation of CLI vs server mode detection logic
3. ❌ No pre-publish verification pipeline
4. ❌ No end-to-end testing of the actual published package

## Comprehensive Testing Pipeline

### Phase 1: Core Functionality Tests (Existing + New)

#### 1.1 MCP Protocol Integration Tests
```javascript
// test/mcp-protocol.test.ts
describe('MCP Protocol Integration', () => {
  test('should respond to MCP initialize request', async () => {
    const response = await sendMCPRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} }
    });

    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('ncp');
  });

  test('should expose find and run tools', async () => {
    const response = await sendMCPRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });

    expect(response.result.tools).toHaveLength(2);
    expect(response.result.tools[0].name).toBe('find');
    expect(response.result.tools[1].name).toBe('run');
  });

  test('find tool should have proper input schema', async () => {
    const response = await sendMCPRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {}
    });

    const findTool = response.result.tools.find(t => t.name === 'find');
    expect(findTool.inputSchema.properties).toHaveProperty('description');
    expect(findTool.inputSchema.properties).toHaveProperty('limit');
    expect(findTool.inputSchema.properties).toHaveProperty('confidence_threshold');
  });
});
```

#### 1.2 CLI vs Server Mode Detection Tests
```javascript
// test/mode-detection.test.ts
describe('CLI vs Server Mode Detection', () => {
  test('should default to server mode when no args', () => {
    const shouldRunAsServer = detectServerMode([]);
    expect(shouldRunAsServer).toBe(true);
  });

  test('should use CLI mode for find command', () => {
    const shouldRunAsServer = detectServerMode(['find', 'file operations']);
    expect(shouldRunAsServer).toBe(false);
  });

  test('should use CLI mode for config command', () => {
    const shouldRunAsServer = detectServerMode(['config', 'import']);
    expect(shouldRunAsServer).toBe(false);
  });

  test('should use server mode with --profile flag only', () => {
    const shouldRunAsServer = detectServerMode(['--profile', 'default']);
    expect(shouldRunAsServer).toBe(true);
  });
});
```

#### 1.3 End-to-End Package Tests
```javascript
// test/package-e2e.test.ts
describe('Published Package E2E Tests', () => {
  test('should install and run as MCP server', async () => {
    // Test actual npm package installation and execution
    const { stdout } = await execAsync('echo \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\' | npx @portel/ncp');
    const response = JSON.parse(stdout);
    expect(response.result.serverInfo.name).toBe('ncp');
  });
});
```

### Phase 2: Pre-Publish Validation Pipeline

#### 2.1 Pre-Publish Hook
```json
// package.json
{
  "scripts": {
    "prepublishOnly": "npm run test:full && npm run test:package",
    "test:full": "npm run test:unit && npm run test:integration && npm run test:mcp",
    "test:package": "npm run build && npm run test:package:local",
    "test:package:local": "node scripts/test-package-locally.js"
  }
}
```

#### 2.2 Package Validation Script
```javascript
// scripts/test-package-locally.js
const { spawn } = require('child_process');
const { promisify } = require('util');

async function testPackageLocally() {
  console.log('🧪 Testing package functionality before publish...');

  // Test 1: MCP Server Mode
  const mcpTest = spawn('node', ['dist/index.js']);

  const testRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  }) + '\n';

  mcpTest.stdin.write(testRequest);

  let response = '';
  mcpTest.stdout.on('data', (data) => {
    response += data.toString();
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  mcpTest.kill();

  if (!response.includes('"name":"find"') || !response.includes('"name":"run"')) {
    throw new Error('❌ MCP server mode test failed - tools not exposed properly');
  }

  console.log('✅ MCP server mode test passed');

  // Test 2: CLI Mode Detection
  const cliTest = spawn('node', ['dist/index.js', 'help']);
  let cliOutput = '';

  cliTest.stdout.on('data', (data) => {
    cliOutput += data.toString();
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!cliOutput.includes('Usage: ncp [options] [command]')) {
    throw new Error('❌ CLI mode test failed - help not shown');
  }

  console.log('✅ CLI mode test passed');
  console.log('🎉 All package tests passed - safe to publish!');
}

testPackageLocally().catch(error => {
  console.error(error.message);
  process.exit(1);
});
```

### Phase 3: Continuous Integration Pipeline

#### 3.1 GitHub Actions Workflow
```yaml
# .github/workflows/test-and-publish.yml
name: Test and Publish

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Run unit tests
      run: npm run test:unit

    - name: Run MCP protocol tests
      run: npm run test:mcp

    - name: Build package
      run: npm run build

    - name: Test package locally
      run: npm run test:package:local

    - name: Test CLI vs Server mode detection
      run: npm run test:mode-detection

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && contains(github.event.head_commit.message, '[publish]')
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        registry-url: 'https://registry.npmjs.org'

    - name: Install and test
      run: |
        npm ci
        npm run test:full
        npm run test:package

    - name: Publish to NPM
      run: npm publish
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Phase 4: Post-Publish Verification

#### 4.1 Automated Post-Publish Tests
```javascript
// scripts/verify-published-package.js
async function verifyPublishedPackage() {
  console.log('🔍 Verifying published package on NPM...');

  // Wait for NPM propagation
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Test fresh installation
  await execAsync('npm install -g @portel/ncp@latest');

  // Test MCP server mode
  const { stdout } = await execAsync(
    'echo \'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\' | ncp'
  );

  const response = JSON.parse(stdout);
  if (!response.result?.tools?.some(t => t.name === 'find')) {
    throw new Error('❌ Published package MCP server broken!');
  }

  console.log('✅ Published package verification passed');
}
```

### Phase 5: Integration with External Platforms

#### 5.1 mcp.so Integration Tests
```javascript
// test/external-platform.test.ts
describe('External Platform Integration', () => {
  test('should be discoverable by mcp.so', async () => {
    // Test that NCP appears and shows tools on mcp.so
    const response = await fetch('https://mcp.so/api/servers/natural-context-provider/tools');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.tools).toContainEqual(
      expect.objectContaining({ name: 'find' })
    );
    expect(data.tools).toContainEqual(
      expect.objectContaining({ name: 'run' })
    );
  });
});
```

## Implementation Checklist

- [ ] Create MCP protocol integration tests
- [ ] Create CLI vs Server mode detection tests
- [ ] Create end-to-end package tests
- [ ] Add pre-publish validation script
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Create post-publish verification script
- [ ] Add external platform integration tests
- [ ] Document testing procedures in README
- [ ] Train team on testing requirements

## Benefits

1. **Prevent Regressions** - Catch breaking changes before they reach users
2. **Faster Debugging** - Know exactly what broke and when
3. **Confidence in Releases** - Every publish is validated
4. **External Integration Assurance** - Verify compatibility with mcp.so, Claude Desktop, etc.
5. **Team Productivity** - Less time fixing production issues

## Success Metrics

- 🎯 **Zero broken NPM publishes** - No more functionality regressions
- 🎯 **100% MCP protocol compatibility** - Always works with MCP clients
- 🎯 **Automated verification** - No manual testing required before publish
- 🎯 **External platform compatibility** - Immediate visibility on mcp.so after publish