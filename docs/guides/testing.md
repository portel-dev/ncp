# NCP Testing Guide

## Overview

This document outlines comprehensive testing strategies for NCP to ensure the MCP interface works correctly and there are no regressions before release.

## Test Categories

### 1. Automated Unit Tests ✅ (Existing)
**Status**: Currently passing with comprehensive coverage

**What's Covered**:
- Core orchestrator functionality
- Discovery engine semantic search
- Health monitoring
- Tool schema parsing
- Cache management
- Error handling
- CLI command functionality

**Run Tests**:
```bash
npm test
```

### 2. MCP Interface Integration Tests

#### 2.1 MCP Server Mode Testing
**Purpose**: Verify NCP works correctly as an MCP server for AI clients

**Test Commands**:
```bash
# Test MCP server mode startup
node dist/index.js --profile all

# Should output valid MCP initialization and wait for stdin
# Ctrl+C to exit after verifying initialization
```

**Expected Behavior**:
- Clean startup with no errors
- Proper MCP protocol initialization
- Responsive to JSON-RPC requests

#### 2.2 Tool Discovery Testing
**Purpose**: Verify semantic discovery works end-to-end

**Setup**:
```bash
# Add test MCPs
ncp add filesystem npx @modelcontextprotocol/server-filesystem /tmp
ncp add memory npx @modelcontextprotocol/server-memory
```

**Test Commands**:
```bash
# Test discovery functionality
ncp find "file operations"
ncp find "memory tools"
ncp find "read"
ncp find ""  # Should handle empty query gracefully
```

**Expected Results**:
- Relevant tools returned with confidence scores
- Proper formatting and descriptions
- No crashes or errors
- Reasonable response times (<2 seconds)

#### 2.3 Tool Execution Testing
**Purpose**: Verify tool execution through NCP interface

**Test Commands**:
```bash
# Test tool execution with parameters
echo "test content" > /tmp/ncp-test.txt
ncp run filesystem:read_file --params '{"path": "/tmp/ncp-test.txt"}'

# Test tool execution without parameters
ncp run memory:create_entities --params '{}'

# Test invalid tool execution
ncp run nonexistent:tool --params '{}'
```

**Expected Results**:
- Successful execution returns proper results
- Error handling for invalid tools/parameters
- Clear error messages for debugging

### 3. Configuration Management Testing

#### 3.1 Import Functionality Testing
**Purpose**: Verify the simplified import interface works correctly

**Test Scenarios**:

**Clipboard Import**:
```bash
# Test 1: Multiple MCPs
echo '{"filesystem": {"command": "npx", "args": ["@modelcontextprotocol/server-filesystem", "/tmp"]}, "memory": {"command": "npx", "args": ["@modelcontextprotocol/server-memory"]}}' | pbcopy
ncp config import --dry-run

# Test 2: Single MCP (should prompt for name)
echo '{"command": "npx", "args": ["@modelcontextprotocol/server-memory"]}' | pbcopy
echo "test-memory" | ncp config import --dry-run

# Test 3: Empty clipboard
echo "" | pbcopy
ncp config import
```

**File Import**:
```bash
# Create test config file
cat > test-config.json << EOF
{
  "filesystem": {
    "command": "npx",
    "args": ["@modelcontextprotocol/server-filesystem", "/tmp"]
  }
}
EOF

# Test file import
ncp config import test-config.json --dry-run
rm test-config.json
```

**Expected Results**:
- JSON displayed in highlighted box
- Correct parsing and validation
- Proper error messages for invalid JSON/empty clipboard
- Successful import with detailed feedback

#### 3.2 Profile Management Testing
**Purpose**: Verify profile system works correctly

**Test Commands**:
```bash
# Test profile creation and management
ncp add test-server echo --profiles test-profile
ncp list --profile test-profile
ncp remove test-server --profiles test-profile
ncp list --profile test-profile  # Should be empty

# Test default profile
ncp list --profile all
```

### 4. Client Integration Testing

#### 4.1 Claude Desktop Integration Test
**Purpose**: Verify NCP works with Claude Desktop

**Manual Test Steps**:
1. Add NCP to Claude Desktop config:
```json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "env": {
        "NCP_PROFILE": "all"
      }
    }
  }
}
```

2. Restart Claude Desktop
3. Test in Claude Desktop:
   - Ask: "What tools are available for file operations?"
   - Ask: "Read the file /tmp/ncp-test.txt"
   - Verify NCP's `find` and `run` tools appear
   - Verify tool execution works correctly

**Expected Results**:
- NCP appears as available MCP server
- `find` and `run` tools visible to Claude
- Semantic discovery works through Claude interface
- Tool execution successful

#### 4.2 VS Code Integration Test (If Available)
**Purpose**: Verify NCP works with VS Code MCP extension

**Test Steps**:
1. Configure NCP in VS Code settings
2. Test tool discovery and execution
3. Verify no conflicts with other MCP servers

### 5. Performance & Reliability Testing

#### 5.1 Load Testing
**Purpose**: Verify NCP handles multiple requests correctly

**Test Script**:
```bash
# Concurrent discovery tests
for i in {1..10}; do
  ncp find "file tools" &
done
wait

# Sequential execution tests
for i in {1..5}; do
  ncp run memory:create_entities --params '{"entities": ["test'$i'"]}'
done
```

**Expected Results**:
- No crashes under concurrent load
- Consistent response times
- Proper resource cleanup

#### 5.2 Memory & Resource Testing
**Purpose**: Verify no memory leaks or resource issues

**Test Commands**:
```bash
# Long-running discovery tests
for i in {1..100}; do
  ncp find "test query $i" > /dev/null
done

# Monitor memory usage during test
# Should remain stable, not continuously grow
```

### 6. Error Handling & Edge Cases

#### 6.1 MCP Server Failure Testing
**Purpose**: Verify graceful handling of MCP server failures

**Test Steps**:
1. Add a failing MCP server:
```bash
ncp add failing-server nonexistent-command
```

2. Test discovery with failing server:
```bash
ncp find "tools"  # Should still return results from healthy servers
ncp list --depth 1  # Should show health status
```

**Expected Results**:
- Healthy servers continue working
- Failed servers marked as unhealthy
- Clear error messages for debugging

#### 6.2 Invalid Input Testing
**Purpose**: Verify robust error handling

**Test Commands**:
```bash
# Invalid JSON in tool execution
ncp run filesystem:read_file --params 'invalid json'

# Non-existent tools
ncp run fake:tool --params '{}'

# Invalid parameters
ncp run filesystem:read_file --params '{"invalid": "parameter"}'
```

**Expected Results**:
- Clear error messages
- No crashes or undefined behavior
- Helpful suggestions for fixing issues

### 7. Regression Testing

#### 7.1 Feature Regression Tests
**Purpose**: Ensure existing functionality still works after changes

**Critical Paths to Test**:
1. Basic MCP server startup
2. Tool discovery with various queries
3. Tool execution with parameters
4. Configuration import/export
5. Profile management
6. Health monitoring

#### 7.2 CLI Regression Tests
**Purpose**: Verify CLI commands still work correctly

**Commands to Test**:
```bash
ncp --help
ncp find --help
ncp config --help
ncp list --help
ncp add --help
ncp run --help
```

### 8. Release Verification Checklist

#### Pre-Release Checklist ✅
- [ ] All unit tests passing
- [ ] MCP server mode starts cleanly
- [ ] Tool discovery returns relevant results
- [ ] Tool execution works correctly
- [ ] Import functionality works (clipboard & file)
- [ ] Profile management works
- [ ] Claude Desktop integration verified
- [ ] Error handling graceful
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] CLI help accurate

#### Manual Integration Test Script
```bash
#!/bin/bash
# Quick integration test script

echo "🧪 Starting NCP Integration Tests..."

# 1. Basic setup
echo "📦 Testing basic setup..."
npm run build
echo '{"test": {"command": "echo", "args": ["hello"]}}' | pbcopy
ncp config import --dry-run

# 2. Tool discovery
echo "🔍 Testing tool discovery..."
ncp find "file"
ncp find "memory"

# 3. Configuration
echo "⚙️  Testing configuration..."
ncp list
ncp config validate

# 4. Server mode (5 second test)
echo "🖥️  Testing MCP server mode (5 seconds)..."
timeout 5s node dist/index.js --profile all || echo "Server mode test completed"

echo "✅ Integration tests completed!"
```

### 9. Automated Testing in CI/CD

#### GitHub Actions Test Matrix
Consider adding these test scenarios to CI:
- Node.js versions: 18, 20, 22
- Platforms: Ubuntu, macOS, Windows
- Profile configurations: empty, single MCP, multiple MCPs
- Import scenarios: clipboard, file, edge cases

#### Performance Benchmarks
Track these metrics over time:
- Tool discovery response time
- Memory usage during operations
- Startup time
- Cache loading performance

### 10. User Acceptance Testing

#### Beta Testing Scenarios
1. **New User Onboarding**:
   - Install NCP globally
   - Import existing Claude Desktop config
   - Test discovery and execution

2. **Power User Workflows**:
   - Multiple profiles setup
   - Complex tool queries
   - Bulk operations

3. **Edge Case Scenarios**:
   - Large number of MCPs
   - Network issues
   - Corrupted configurations

## Running the Full Test Suite

```bash
# 1. Unit tests
npm test

# 2. Build verification
npm run build

# 3. Basic integration tests
./test-integration.sh  # Create the script above

# 4. Manual Claude Desktop test
# Follow section 4.1 steps

# 5. Performance spot check
time ncp find "test"
time ncp run memory:create_entities --params '{}'
```

## Conclusion

This comprehensive testing strategy ensures:
- ✅ **No Regressions**: Existing functionality continues working
- ✅ **MCP Protocol Compliance**: Proper MCP server behavior
- ✅ **User Experience**: Import and discovery features work smoothly
- ✅ **Reliability**: Graceful error handling and recovery
- ✅ **Performance**: Acceptable response times and resource usage

Execute these tests before any release to ensure NCP works correctly as both an MCP server and orchestration layer.