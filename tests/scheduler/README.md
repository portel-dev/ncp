# Scheduler Tests

This directory contains tests for the NCP scheduler system.

## Test Files

### Unit Tests (Fast, Always Run)

- **`job-manager.test.ts`** - Tests for legacy job management (backward compatibility)
- **`task-manager.test.ts`** - Tests for new timing group and task management
- **`cron-manager.test.ts`** - Tests for cron expression parsing and OS scheduler integration
- **`natural-language-parser.test.ts`** - Tests for natural language schedule parsing
- **`process-isolation.test.ts`** - Tests for timing groups and process isolation architecture

### Integration Tests

- **`scheduler-integration.test.ts`** - End-to-end tests with mocked orchestrator
- **`real-execution.test.ts`** - Real MCP execution tests (skipped by default, requires setup)

## Running Tests

```bash
# Run all scheduler tests
npm test -- tests/scheduler

# Run specific test file
npm test -- tests/scheduler/process-isolation.test.ts

# Run with coverage
npm test -- --coverage tests/scheduler
```

## Test Architecture

### Unit Tests
- Use isolated test directories (no shared state)
- Mock file system paths
- Fast execution (< 2 seconds total)
- Run on every commit

### Integration Tests
- Test with mocked MCP orchestrator
- Verify data flow and error handling
- Medium speed (< 5 seconds)
- Run on every commit

### Real Execution Tests
- **Location**: `real-execution.test.ts`
- **Status**: Skipped by default (`.skip`)
- **Purpose**: Test with actual MCP servers and tool execution
- **Requirements**:
  - MCP servers configured
  - Actual network/file access
  - Longer timeouts
- **Enable**: Remove `.skip` from test descriptions

## Manual Testing

For testing with real MCP tool calls:

1. **Quick Test**: See `TESTING_WITH_REAL_MCPS.md`
2. **Guided Manual Test**: See `MANUAL_TESTING.md`

### Recommended Manual Test Flow

```bash
# 1. Build
npm run build

# 2. Create a test task using built-in scheduler MCP
node dist/index.js scheduler:create-task \
  --name "Self test" \
  --schedule "in 1 minute" \
  --tool "scheduler:list-tasks" \
  --parameters '{}'

# 3. Wait and verify
sleep 65
node dist/index.js scheduler:list-executions
```

## Test Helpers

`test-helpers.ts` provides utilities:

- `createTestDirectory()` - Create isolated temp directory
- `cleanupTestDirectory()` - Clean up after tests
- `mockSchedulerEnvironment()` - Set up scheduler directory structure
- `createMockJob()` - Create test job objects
- `MockCrontab` - Mock OS scheduler for testing

## Process Isolation Testing

The `process-isolation.test.ts` file verifies:

1. **Timing Groups**: Multiple tasks share one OS schedule
2. **Task Data Structure**: Tasks have metadata, timings group them
3. **Isolation Architecture**: Child processes prevent cascading failures
4. **Timing Cleanup**: Empty timing groups are removed

These are unit tests that verify the **architecture**, not actual execution.
For real execution testing, use `TESTING_WITH_REAL_MCPS.md`.

## What to Test Before Releasing

### Unit Tests (Automated)
- [x] All unit tests pass
- [x] Process isolation architecture verified
- [x] Task and timing CRUD operations
- [x] Natural language parsing

### Integration Tests (Automated)
- [x] Job lifecycle works
- [x] Validation catches errors
- [x] Execution recording works

### Manual Tests (Before Release)
- [ ] Create task with real MCP
- [ ] Task executes on schedule
- [ ] Multiple tasks run in parallel
- [ ] Failed task doesn't crash others
- [ ] Paused task doesn't execute
- [ ] Completed task stops executing
- [ ] Timing group cleanup works
- [ ] OS scheduler integration works (macOS/Linux)

## Common Issues

### Tests fail with "Task already exists"
- Tests aren't isolated
- Make sure `createTestDirectory()` returns unique dirs
- Check `beforeEach` sets up fresh environment

### Tests timeout
- Increase timeout: `jest.setTimeout(30000)`
- Check for hanging promises
- Verify cleanup in `afterEach`

### "Cannot find module" errors
- Run `npm run build` first
- Check import paths use `.js` extension
- Verify TypeScript compiled successfully

## Test Coverage Goals

- Unit tests: > 90%
- Integration tests: > 80%
- Manual testing: 100% of user-facing features

## Future Test Improvements

- [ ] Add performance benchmarks
- [ ] Test with multiple MCP servers simultaneously
- [ ] Test with long-running tasks (hours)
- [ ] Test timing precision (execution within X seconds of schedule)
- [ ] Test cleanup of old executions
- [ ] Test migration from V1 to V2 storage
