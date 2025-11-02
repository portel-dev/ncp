# Workflow MCP Testing Guide

## Prerequisites

Before testing, ensure:
1. NCP is built: `npm run build`
2. Anthropic API key is configured

## Step-by-Step Testing

### Step 1: Verify Workflow MCP is Loaded

```bash
# Check if workflow MCP is discovered
ncp find "workflow"

# Should show:
# workflow:execute
# workflow:execute-custom
# workflow:execute-task
# workflow:generate-workflow
# workflow:list-workflows
```

If not found, check:
```bash
# Verify file exists
ls -la src/internal-mcps/examples/workflow.mcp.ts

# Rebuild
npm run build
```

### Step 2: Configure Anthropic API Key

**Option A: Add to NCP profile** (recommended):

Edit `~/.ncp/all.json`:
```json
{
  "mcpServers": {
    "workflow": {
      "type": "internal",
      "env": {
        "ANTHROPIC_API_KEY": "_USE_SECURE_STORAGE_"
      }
    }
  }
}
```

Then run any workflow tool - you'll be prompted to enter the key.

**Option B: Set environment variable**:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Step 3: Test Simple Task Execution

**Test 1: Basic intelligent task**
```bash
ncp run workflow:execute-task \
  task="Write a haiku about programming"
```

Expected output:
```json
{
  "task": "Write a haiku about programming",
  "result": "Code flows like water...",
  "usage": { "input_tokens": 25, "output_tokens": 50 },
  "model": "claude-3-5-sonnet-20241022"
}
```

**Test 2: Task with context**
```bash
ncp run workflow:execute-task \
  task="Summarize these GitHub issues" \
  context='{"issues":["Bug in login","Feature request: dark mode","Performance issue"]}'
```

### Step 4: Test Workflow Listing

```bash
ncp run workflow:list-workflows
```

Expected output:
```json
{
  "workflows": [
    {
      "name": "daily-standup",
      "description": "Daily standup: Check issues, summarize, post to Slack",
      "requiredContext": ["slackWebhook", "repo"],
      "recommendedSchedule": "0 9 * * 1-5"
    },
    // ... more workflows
  ]
}
```

### Step 5: Test Workflow Generation

```bash
ncp run workflow:generate-workflow \
  description="Every hour, check Hacker News front page, find AI-related posts, summarize them, and save to a file"
```

Expected: Claude generates a workflow definition with steps.

### Step 6: Test Predefined Workflow (Simulation)

Since predefined workflows need actual MCPs (GitHub, Slack, etc.), let's test the structure:

```bash
# This will execute but may fail at tool calling (expected)
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{"slackWebhook":"https://test.webhook","repo":"test/repo"}'
```

**Expected behavior**:
- ✅ Workflow loads correctly
- ✅ Steps are identified
- ⚠️ Tool calls may fail (if GitHub/Slack MCPs not configured)
- ✅ State tracking works

### Step 7: Test Custom Workflow

Create a simple test workflow:

```bash
ncp run workflow:execute-custom \
  workflow='{
    "name": "test-workflow",
    "description": "Simple test workflow",
    "steps": [
      {
        "name": "Step 1: Think",
        "description": "Generate a random fact about cats"
      },
      {
        "name": "Step 2: Analyze",
        "description": "Explain why cats are interesting"
      }
    ]
  }'
```

**Expected output**:
```json
{
  "workflowName": "test-workflow",
  "status": "completed",
  "results": [
    {
      "step": "Step 1: Think",
      "success": true,
      "output": "Cats can rotate their ears 180 degrees...",
      "timestamp": "2024-01-15T10:00:00Z"
    },
    {
      "step": "Step 2: Analyze",
      "success": true,
      "output": "Cats are interesting because...",
      "timestamp": "2024-01-15T10:00:05Z"
    }
  ],
  "startTime": "2024-01-15T10:00:00Z",
  "endTime": "2024-01-15T10:00:05Z"
}
```

## Integration Testing with Other MCPs

### Test with AI MCP

```bash
ncp run workflow:execute-custom \
  workflow='{
    "name": "ai-test",
    "description": "Test AI integration",
    "steps": [
      {
        "name": "Generate Text",
        "description": "Use AI to write a short poem",
        "tool": "ai:complete",
        "parameters": {
          "prompt": "Write a short poem about technology",
          "provider": "anthropic"
        }
      }
    ]
  }'
```

**Note**: This requires AI MCP to be configured with API keys.

### Test with Database MCP

```bash
ncp run workflow:execute-custom \
  workflow='{
    "name": "db-test",
    "description": "Test database workflow",
    "steps": [
      {
        "name": "Create Test DB",
        "description": "Create a test database table",
        "tool": "database:create-table",
        "parameters": {
          "dbPath": "./test-workflow.db",
          "tableName": "workflow_tests",
          "columns": {"id": "INTEGER PRIMARY KEY", "name": "TEXT", "timestamp": "TEXT"}
        }
      },
      {
        "name": "Insert Test Data",
        "description": "Insert a test record",
        "tool": "database:insert",
        "parameters": {
          "dbPath": "./test-workflow.db",
          "tableName": "workflow_tests",
          "data": {"name": "Test Workflow", "timestamp": "2024-01-15"}
        }
      }
    ]
  }'
```

## Testing with Schedule MCP Integration

### Step 1: Test Workflow Manually

```bash
# Create a simple workflow that just logs
ncp run workflow:execute-task \
  task="Return the current date and time with a friendly message"
```

### Step 2: Schedule It

```bash
# Schedule to run every 5 minutes for testing
ncp run schedule:add \
  name="test-workflow" \
  command="ncp run workflow:execute-task task='Log test execution at current time'" \
  schedule="*/5 * * * *" \
  description="Test workflow execution every 5 minutes"
```

### Step 3: Verify Schedule

```bash
# List schedules
ncp run schedule:list

# Should show your test-workflow
```

### Step 4: Monitor Execution

Wait 5 minutes and check if it ran:

```bash
# Check schedule status/logs (if supported)
ncp run schedule:get name="test-workflow"
```

### Step 5: Remove Test Schedule

```bash
ncp run schedule:remove name="test-workflow"
```

## Troubleshooting Tests

### Issue 1: "workflow not found"

**Symptom**:
```
Error: Tool not found: workflow:execute
```

**Solutions**:
```bash
# 1. Rebuild
npm run build

# 2. Check file exists
ls src/internal-mcps/examples/workflow.mcp.ts

# 3. Check for TypeScript errors
npm run build 2>&1 | grep workflow

# 4. Verify SimpleMCP loader is working
ncp find "ai"  # Test with another example MCP
```

### Issue 2: "ANTHROPIC_API_KEY not configured"

**Symptom**:
```
Error: ANTHROPIC_API_KEY not configured.
```

**Solution**:
```bash
# Option 1: Set environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Option 2: Add to profile
# Edit ~/.ncp/all.json and add workflow MCP config

# Verify
echo $ANTHROPIC_API_KEY
```

### Issue 3: Workflow executes but tool calls fail

**Symptom**:
```json
{
  "step": "Call GitHub",
  "success": false,
  "error": "Tool github:list-issues not found"
}
```

**Explanation**: This is expected if referenced MCPs aren't configured.

**Solutions**:
1. Configure the referenced MCP (e.g., GitHub)
2. Or test with a workflow that doesn't call external tools
3. Or modify workflow to use available MCPs only

### Issue 4: Conditional steps not working

**Test conditional logic**:
```bash
ncp run workflow:execute-custom \
  workflow='{
    "name": "conditional-test",
    "steps": [
      {
        "name": "Step 1",
        "description": "Always runs"
      },
      {
        "name": "Step 2",
        "description": "Should skip",
        "condition": "false"
      },
      {
        "name": "Step 3",
        "description": "Should run",
        "condition": "true"
      }
    ]
  }' \
  context='{}'
```

Expected: Step 2 skipped, Steps 1 and 3 executed.

## Performance Testing

### Test 1: Single Step Latency

```bash
time ncp run workflow:execute-task \
  task="Say hello"
```

Expected: ~2-5 seconds (depends on Claude API latency)

### Test 2: Multi-Step Workflow Latency

```bash
time ncp run workflow:execute-custom \
  workflow='{
    "name": "multi-step",
    "steps": [
      {"name": "Step 1", "description": "First step"},
      {"name": "Step 2", "description": "Second step"},
      {"name": "Step 3", "description": "Third step"}
    ]
  }'
```

Expected: ~6-15 seconds (3 steps × 2-5 seconds each)

### Test 3: Token Usage

Check how many tokens workflows consume:

```bash
ncp run workflow:execute-task \
  task="Generate a comprehensive report about AI trends" | jq '.usage'
```

## Test Checklist

Before considering Workflow MCP ready:

- [ ] `ncp find "workflow"` shows all 5 tools
- [ ] `execute-task` works with simple task
- [ ] `list-workflows` returns predefined workflows
- [ ] `generate-workflow` creates valid workflow from description
- [ ] `execute-custom` runs multi-step workflow
- [ ] Error handling works (test with invalid API key)
- [ ] Integration with Schedule MCP works
- [ ] State tracking shows correct status
- [ ] Conditional steps execute correctly
- [ ] Context variables are accessible in steps

## Quick Test Script

Save this as `test-workflow.sh`:

```bash
#!/bin/bash

echo "Testing Workflow MCP..."

echo "1. Testing discovery..."
ncp find "workflow" | grep -q "workflow:execute" && echo "✓ Discovery works" || echo "✗ Discovery failed"

echo "2. Testing simple task..."
ncp run workflow:execute-task task="Say hello in French" > /dev/null 2>&1 && echo "✓ Simple task works" || echo "✗ Simple task failed"

echo "3. Testing workflow listing..."
ncp run workflow:list-workflows | grep -q "daily-standup" && echo "✓ Workflow listing works" || echo "✗ Workflow listing failed"

echo "4. Testing custom workflow..."
ncp run workflow:execute-custom workflow='{"name":"test","steps":[{"name":"test","description":"test step"}]}' > /dev/null 2>&1 && echo "✓ Custom workflow works" || echo "✗ Custom workflow failed"

echo "Done!"
```

Run it:
```bash
chmod +x test-workflow.sh
./test-workflow.sh
```

## Next Steps

After basic testing works:

1. **Test real workflows** with actual MCP integrations
2. **Schedule workflows** with Schedule MCP
3. **Monitor execution** over time
4. **Optimize** based on token usage and latency
5. **Create custom workflows** for your specific use cases

Happy testing! 🚀
