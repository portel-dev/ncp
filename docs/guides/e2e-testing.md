# End-to-End (E2E) Automated Tests

Real automated tests that can run in CI/CD without user interaction.

## Created Test Files

### 1. `internal-mcps-e2e.test.ts`
Tests internal MCPs (Scheduler + MCP Management) functionality.

**Status**: ⚠️ Needs API fixes (ProfileManager constructor, result.content vs result.data)

**Coverage**:
- Scheduler tool discovery
- Tool validation
- Schedule listing
- MCP management tools
- Disable/enable functionality
- Error handling

### 2. `cli-integration.test.ts`
Tests the actual CLI commands end-to-end.

**Status**: ✅ Ready to run

**Coverage**:
- Discovery (find command)
- Tool validation
- Error handling
- Help/version output
- Profile management
- Environment variable handling

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run individual test suites
npm run test:e2e:internal-mcps
npm run test:e2e:cli

# Run full CI test suite
npm run test:ci
```

## CI/CD Integration

GitHub Actions workflow created at `.github/workflows/ci.yml`:

- ✅ Runs on Ubuntu + macOS
- ✅ Tests Node 18.x and 20.x
- ✅ Includes critical tests, E2E tests, integration tests, DXT tests
- ✅ Code coverage reporting
- ✅ Type checking
- ✅ DXT package building and validation

## Environment Variables for Testing

```bash
# Disable user confirmation dialogs in automated tests
export NCP_CONFIRM_BEFORE_RUN=false

# Disable debug output
export NCP_DEBUG=false

# Use isolated config path
export NCP_CONFIG_PATH=/path/to/test/config
```

## TODO: Fix Before Running

### internal-mcps-e2e.test.ts
1. Fix ProfileManager instantiation (doesn't take constructor params)
2. Change `result.data` to `result.content`
3. Update test expectations to match actual API

### cli-integration.test.ts
- Should work as-is, but needs actual test run to verify

## Benefits

1. **No User Interaction Required** - Tests run completely automated
2. **CI/CD Ready** - Can run in GitHub Actions, CircleCI, etc.
3. **Fast Feedback** - Catches issues before deployment
4. **Comprehensive Coverage** - Tests actual user-facing functionality
5. **Isolated** - Each test uses temp directories, no side effects

## Next Steps

1. Fix the API mismatches in internal-mcps-e2e.test.ts
2. Run the tests locally to verify they pass
3. Enable the CI/CD workflow in GitHub
4. Add more test cases as needed
