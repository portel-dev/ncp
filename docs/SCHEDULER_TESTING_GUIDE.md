## Scheduler Testing Guide

Comprehensive guide for testing the NCP scheduler system.

---

## Testing Strategy

### 1. **Unit Tests** (Fast, Isolated)
Test individual components in isolation:
- JobManager (CRUD operations)
- ExecutionRecorder (CSV + JSON storage)
- CronManager (validation only, not actual crontab)
- NaturalLanguageParser (schedule parsing)
- ToolValidator (validation logic)

### 2. **Integration Tests** (Moderate, Mocked)
Test component interactions with mocked dependencies:
- Job creation → Validation → Storage → Cron entry
- Execution flow → Recording → Cleanup
- CLI commands → Scheduler → Storage

### 3. **E2E Tests** (Slow, Real System)
Test actual system behavior (run manually or in isolated CI):
- Real crontab manipulation
- Actual tool execution
- Real MCP interactions

---

## Running Tests

### **All Tests**
```bash
npm test
```

### **Scheduler Tests Only**
```bash
npm test -- test/scheduler
```

### **Specific Test File**
```bash
npm test -- test/scheduler/job-manager.test.ts
```

### **Watch Mode**
```bash
npm test -- --watch test/scheduler
```

---

## Test Structure

```
test/scheduler/
├── test-helpers.ts                      # Shared utilities
├── job-manager.test.ts                  # JobManager unit tests
├── execution-recorder.test.ts           # ExecutionRecorder unit tests
├── cron-manager.test.ts                 # CronManager unit tests
├── natural-language-parser.test.ts      # Parser unit tests
├── tool-validator.test.ts               # Validation unit tests
├── scheduler-integration.test.ts        # Integration tests
└── e2e/                                 # End-to-end tests
    ├── real-cron.test.ts                # Actual crontab tests
    └── real-execution.test.ts           # Actual tool execution tests
```

---

## Unit Testing

### **JobManager Tests**

Tests CRUD operations on jobs:

```typescript
describe('JobManager', () => {
  it('should create a new job', () => {
    const job = createMockJob();
    jobManager.createJob(job);

    const retrieved = jobManager.getJob(job.id);
    expect(retrieved).toEqual(job);
  });

  it('should reject duplicate job IDs', () => {
    const job = createMockJob();
    jobManager.createJob(job);

    expect(() => jobManager.createJob(job)).toThrow('already exists');
  });
});
```

**Run:**
```bash
npm test -- test/scheduler/job-manager.test.ts
```

---

### **NaturalLanguageParser Tests**

Tests schedule parsing:

```typescript
describe('NaturalLanguageParser', () => {
  it('should parse "every day at 9am"', () => {
    const result = NaturalLanguageParser.parseSchedule('every day at 9am');

    expect(result.success).toBe(true);
    expect(result.cronExpression).toBe('0 9 * * *');
  });

  it('should parse "in 5 minutes" as one-time', () => {
    const result = NaturalLanguageParser.parseSchedule('in 5 minutes');

    expect(result.success).toBe(true);
    expect(result.fireOnce).toBe(true);
  });
});
```

**Run:**
```bash
npm test -- test/scheduler/natural-language-parser.test.ts
```

---

### **CronManager Tests**

Tests cron expression validation (NOT actual crontab):

```typescript
describe('CronManager', () => {
  it('should validate correct cron expressions', () => {
    const result = CronManager.validateCronExpression('0 9 * * *');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid expressions', () => {
    const result = CronManager.validateCronExpression('60 * * * *');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('minute');
  });
});
```

**Run:**
```bash
npm test -- test/scheduler/cron-manager.test.ts
```

---

## Integration Testing

Tests component interactions with mocked dependencies:

```typescript
describe('Scheduler Integration', () => {
  it('should create job with validation', async () => {
    // Mock file system
    const testDir = createTestDirectory();
    mockSchedulerEnvironment(testDir);

    // Create scheduler
    const scheduler = new Scheduler();

    // Create job (validation happens automatically)
    const job = await scheduler.createJob({
      name: 'Test Job',
      schedule: 'every day at 9am',
      tool: 'test:tool',
      parameters: {}
    });

    expect(job.id).toBeDefined();
    expect(job.cronExpression).toBe('0 9 * * *');

    // Cleanup
    cleanupTestDirectory(testDir);
  });
});
```

**Run:**
```bash
npm test -- test/scheduler/scheduler-integration.test.ts
```

---

## Manual Testing

### **1. Test Job Creation**

```bash
# Create a test job
ncp schedule create scheduler:validate "in 2 minutes" \
  --name "Test Validation Job" \
  --params '{"tool": "schedule", "arguments": {"name": "test"}}' \
  --fire-once

# Verify it was created
ncp schedule list

# Check crontab (Unix/Linux/macOS only)
crontab -l | grep NCP
```

**Expected Output:**
```
# === NCP SCHEDULED JOBS - DO NOT EDIT MANUALLY ===
# NCP_JOB: <job-id>
42 14 20 1 * ncp execute-scheduled <job-id>
# === END NCP SCHEDULED JOBS ===
```

---

### **2. Test Job Execution**

```bash
# Create a job that runs in 1 minute
ncp schedule create scheduler:validate "in 1 minute" \
  --name "Quick Test" \
  --params '{"tool": "schedule", "arguments": {}}' \
  --fire-once

# Wait 1-2 minutes...

# Check execution history
ncp schedule executions --job-id "Quick Test"
```

**Expected Output:**
```
✅ Quick Test
  ID: exec-abc-123
  Time: 1/20/2025, 2:42:00 PM
  Duration: 234ms
```

---

### **3. Test Validation**

```bash
# This should FAIL validation (missing required param)
ncp schedule create scheduler:schedule "every day at 9am" \
  --name "Bad Job" \
  --params '{}'

# Expected error:
# ❌ Tool validation failed:
# Missing required parameter: name
# Missing required parameter: schedule
# Missing required parameter: tool
# Missing required parameter: parameters
```

---

### **4. Test Natural Language Parsing**

```bash
# Test various schedule formats
ncp schedule create scheduler:validate "every weekday at 2:30pm" \
  --name "Weekday Test" \
  --params '{"tool": "schedule", "arguments": {}}' \
  --test-run

# Check the cron expression
ncp schedule get "Weekday Test"
# Should show: 30 14 * * 1-5
```

---

## End-to-End Testing

**⚠️ WARNING:** These tests modify your system crontab. Run in isolated environment!

### **Setup Test Environment**

```bash
# Create isolated test user (Linux)
sudo useradd -m ncptest
sudo su - ncptest

# Or use Docker
docker run -it --rm node:18 bash
npm install -g ncp  # Install NCP
```

---

### **E2E Test 1: Simple Job**

```bash
# Create a simple job
ncp schedule create scheduler:validate "*/5 * * * *" \
  --name "Five Minute Test" \
  --params '{"tool": "schedule", "arguments": {}}' \
  --max-executions 3

# Wait 15 minutes for 3 executions

# Check executions
ncp schedule executions --job-id "Five Minute Test"

# Should show 3 successful executions
# Job should be marked as "completed"
ncp schedule get "Five Minute Test"
```

---

### **E2E Test 2: Error Handling**

```bash
# Create job with invalid tool (should fail validation)
ncp schedule create nonexistent:tool "every day at 9am" \
  --name "Bad Tool" \
  --params '{}'

# Should fail with validation error
```

---

### **E2E Test 3: Cleanup**

```bash
# Create multiple jobs
for i in {1..5}; do
  ncp schedule create scheduler:validate "every day at ${i}am" \
    --name "Test Job $i" \
    --params '{"tool": "schedule", "arguments": {}}'
done

# Generate some executions (run jobs manually)
for i in {1..5}; do
  JOB_ID=$(ncp schedule list | grep "Test Job $i" | awk '{print $4}')
  ncp execute-scheduled $JOB_ID
done

# Run cleanup
ncp schedule cleanup --max-per-job 2

# Verify old executions were deleted
ncp schedule executions
```

---

## Testing Validation Protocol

### **Test MCP-Native Validation**

```bash
# The scheduler MCP implements tools/validate
# Test it through the MCP interface:

# 1. Via CLI (calls MCP internally)
ncp schedule create scheduler:schedule "every day" \
  --name "Validation Test" \
  --params '{"name": "test"}' # Missing required params

# Should show validation errors

# 2. Via run command (test validate tool directly)
ncp run scheduler:validate --params '{
  "tool": "schedule",
  "arguments": {
    "name": "test",
    "schedule": "invalid cron",
    "tool": "filesystem:backup",
    "parameters": {}
  }
}'

# Should return validation errors in JSON format
```

---

## CI/CD Testing

### **GitHub Actions Example**

```yaml
name: Scheduler Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        # Skip Windows since cron not supported

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test -- test/scheduler

      - name: Run integration tests
        run: npm test -- test/scheduler/scheduler-integration.test.ts

      # E2E tests only on Linux (safe cron manipulation)
      - name: Run E2E tests
        if: matrix.os == 'ubuntu-latest'
        run: npm test -- test/scheduler/e2e
```

---

## Test Coverage

### **Check Coverage**

```bash
npm test -- --coverage test/scheduler
```

**Target Coverage:**
- JobManager: 90%+
- ExecutionRecorder: 85%+
- NaturalLanguageParser: 95%+
- CronManager (validation): 90%+
- ToolValidator: 85%+
- Scheduler: 80%+

---

## Debugging Tests

### **Enable Debug Logging**

```bash
# Set debug env var
export NCP_DEBUG=true

# Run tests
npm test -- test/scheduler/job-manager.test.ts

# Debug logs will show file paths, operations, etc.
```

---

### **Inspect Test Artifacts**

```bash
# Tests create temp directories, find them:
ls /tmp/ncp-scheduler-test-*

# Inspect test data
cat /tmp/ncp-scheduler-test-*/scheduler/jobs.json
cat /tmp/ncp-scheduler-test-*/scheduler/executions/summary.csv
```

---

## Common Test Failures

### **1. "crontab command not found"**

**Cause:** Testing on Windows or system without cron
**Solution:** Tests should skip on Windows automatically

```typescript
if (process.platform === 'win32') {
  console.log('Skipping cron test on Windows');
  return;
}
```

---

### **2. "Permission denied" on crontab**

**Cause:** User doesn't have crontab permissions
**Solution:** Run in Docker or add user to cron group

```bash
sudo usermod -a -G cron $USER
```

---

### **3. Test directories not cleaned up**

**Cause:** Test interrupted before cleanup
**Solution:** Manual cleanup

```bash
rm -rf /tmp/ncp-scheduler-test-*
```

---

## Best Practices

1. **Isolate Tests:** Use temp directories, don't touch real crontab
2. **Mock External Deps:** Mock MCPs, file system, cron when possible
3. **Test Edge Cases:** Empty params, invalid cron, duplicate names
4. **Test Error Paths:** Validation failures, missing files, bad permissions
5. **Clean Up:** Always cleanup test artifacts in `afterEach`
6. **Platform Checks:** Skip Windows-specific tests gracefully
7. **Time Independence:** Don't depend on current time for assertions

---

## Summary

### **Quick Test Commands**

```bash
# All tests
npm test

# Unit tests only
npm test -- test/scheduler/*.test.ts

# Integration tests
npm test -- test/scheduler/*-integration.test.ts

# Watch mode for development
npm test -- --watch test/scheduler

# Coverage report
npm test -- --coverage test/scheduler
```

### **Manual Test Workflow**

```bash
# 1. Create test job
ncp schedule create scheduler:validate "in 2 minutes" \
  --name "Test" --params '{"tool":"schedule","arguments":{}}' --fire-once

# 2. Verify in crontab
crontab -l | grep NCP

# 3. Wait for execution

# 4. Check results
ncp schedule executions --job-id "Test"

# 5. Cleanup
ncp schedule delete "Test" -y
```

---

**Remember:** Always test in isolated environments for E2E tests that touch system crontab!
