# Test Refactoring Guide

This document provides guidance for completing the test refactoring work for the new security and performance features.

## Current Status

### ✅ Completed
- **Command Validation Tests** (`tests/command-validation.test.ts`)
  - 26 unit tests covering all injection vectors
  - All tests passing
  - Direct function testing (no complex mocking needed)

### ⚠️ In Progress / Pending
The following test files need refactoring to use the correct internal MCP interface:

## Architecture Notes

The NCP uses an internal MCP system where:

1. **Instantiation**: `new NCPManagementMCP()` - no constructor arguments
2. **Dependency Injection**: Uses `setProfileManager(manager)` method
3. **Tool Execution**: Uses `executeTool(toolName, parameters)` method
4. **Return Type**: `Promise<InternalToolResult>` with `success` and `error` fields

### Example Pattern
```typescript
// Setup
const mcp = new NCPManagementMCP();
mcp.setProfileManager(profileManager);

// Execution
const result = (await mcp.executeTool('add', {
  mcp_name: 'test-mcp',
  command: 'node',
  args: ['server.js']
})) as InternalToolResult;

// Verification
expect(result.success).toBe(true);
```

## Test Stubs Ready for Refactoring

### 1. Profile Manager Auto-Import Tests
**File**: `tests/profile-manager-autoimport.test.ts` (370 lines)

**Approach**:
- Create ProfileManager instance with test directory
- Test parallelization by measuring timing
- Mock `importFromClient()` to control import count/speed
- Verify timeout protection with long-running imports

**Key Tests**:
- Parallel execution of multiple imports
- 30-second timeout enforcement
- Deduplication of existing MCPs
- Error handling for partial failures

### 2. OAuth Device Flow Tests
**File**: `tests/oauth-device-flow.test.ts` (410 lines)

**Approach**:
- Mock `process.stdin` and its methods
- Mock global `fetch()` for OAuth endpoints
- Verify stdin cleanup in try/catch/finally
- Test state tracking flags (`listenerAttached`, `stdinModified`)

**Key Tests**:
- Listener removal on success/error/timeout
- stdin state restoration
- Non-TTY environment handling
- Error handling in cleanup phase

### 3. Connection Pool Tests
**File**: `tests/ncp-orchestrator-pool.test.ts` (320 lines)

**Approach**:
- Access connection map via private property (OK for tests)
- Create mock connections with execution counts
- Test LRU eviction algorithm
- Verify connection limits enforced

**Key Tests**:
- MAX_CONNECTIONS limit (50)
- MAX_EXECUTIONS_PER_CONNECTION (1000)
- LRU eviction of oldest connection
- Execution count tracking

### 4. Find/Add Integration Tests
**File**: `tests/find-add-integration.test.ts` (450 lines)

**Approach**:
- Mock provider registry to return test MCPs
- Use `executeTool('find', {description: '...'})`
- Use `executeTool('add', {mcp_name: '...'})`
- Verify tools list returned after add

**Key Tests**:
- Zero-results shows top 3 registry MCPs
- Installation instructions in response
- Tools list limited to 10 items
- End-to-end find → add workflow

## Recommended Refactoring Order

1. **Profile Manager Tests** (easiest) - Only needs ProfileManager mocking
2. **Connection Pool Tests** - Simple property access testing
3. **OAuth Device Flow Tests** - Moderate mocking complexity
4. **Find/Add Integration Tests** - Most complex, requires registry mocking

## Testing Best Practices

### 1. Use Direct Function Testing When Possible
```typescript
// ✅ Good: Direct function testing
const error = validateMCPCommand('node; rm -rf /', []);
expect(error).toContain('dangerous');

// ❌ Avoid: Complex mocking
const mcp = new NCPManagementMCP();
// ... 20 lines of setup and mocking ...
```

### 2. Test Behavior, Not Implementation
```typescript
// ✅ Good: Test behavior
const result = await mcp.executeTool('add', {mcp_name: 'test'});
expect(result.success).toBe(true);

// ❌ Avoid: Accessing private methods
const result = await mcp.handleAdd({mcp_name: 'test'});
```

### 3. Use Realistic Mocks
```typescript
// ✅ Good: Mock with realistic return
jest.fn().mockResolvedValue({tools: [{name: 'test_tool'}]});

// ❌ Avoid: Complex type assertions
jest.fn<() => Promise<any>>().mockResolvedValue(null as any);
```

### 4. Organize Tests Logically
```typescript
describe('Feature Name', () => {
  describe('specific behavior', () => {
    it('should do X when Y', () => {
      // test
    });
  });
});
```

## Performance Metrics to Test

When refactoring auto-import tests, measure:
- **Sequential vs Parallel**: Compare 5 imports (sequential ~20s vs parallel ~2-3s)
- **Timeout Enforcement**: Verify 30-second max with slow imports
- **Startup Impact**: Ensure NCP startup < 5 seconds with 10 MCPs

## Migration Path

For existing tests in other files:

1. **Existing Tests in `ncp-orchestrator.test.ts`**: 47KB file, already working
   - Add new test describe blocks for pool management
   - No need to refactor existing tests

2. **Existing Mocking Patterns**: Follow patterns in:
   - `tests/discovery-engine.test.ts` (jest mocking patterns)
   - `tests/cache-optimization.test.ts` (ProfileManager mocking)

3. **Test Utilities**: Use existing helpers:
   - `tmpdir()` for temporary directories
   - `jest.fn()` for mocking
   - `jest.clearAllMocks()` for cleanup

## Running Refactored Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/command-validation.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch
```

## Success Criteria

For each refactored test file:
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ Proper cleanup in afterEach()
- ✅ Clear test descriptions
- ✅ Reasonable test execution time (< 5s per file)
- ✅ Consistent with project patterns

## References

- [Jest Documentation](https://jestjs.io/)
- [TypeScript Testing Best Practices](https://basarat.gitbook.io/typescript/testing)
- [MCP Protocol Documentation](https://github.com/modelcontextprotocol/spec)
