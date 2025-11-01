# Manual Testing Guide for Scheduler with Real MCP Calls

This guide shows how to manually test the scheduler with real MCP tool executions.

## Prerequisites

1. NCP must be built and installed
2. At least one MCP server configured in `~/.ncp/config.json`

## Option 1: Quick Test with Filesystem MCP

If you have the filesystem MCP configured, you can test with simple file operations:

```bash
# 1. Create a test task that lists files
ncp scheduler:create-task \
  --name "List files test" \
  --schedule "in 1 minute" \
  --tool "filesystem:list_directory" \
  --parameters '{"path": "/tmp"}'

# 2. Wait 1 minute and check execution
ncp scheduler:list-executions
```

## Option 2: Test with Weather MCP (if available)

```bash
# Create a task that gets weather
ncp scheduler:create-task \
  --name "Weather check" \
  --schedule "in 2 minutes" \
  --tool "weather:get-forecast" \
  --parameters '{"city": "San Francisco"}'

# Wait and verify
ncp scheduler:list-executions
```

## Option 3: Create a Test MCP Server

Create a minimal test MCP for reliable testing:

### 1. Create test MCP server file

Create `~/test-mcp-server.mjs`:

```javascript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'test-scheduler', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'greet',
    description: 'Greet someone',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    }
  }, {
    name: 'timestamp',
    description: 'Get current timestamp',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'greet') {
    return {
      content: [{
        type: 'text',
        text: `Hello, ${args.name}! (executed at ${new Date().toISOString()})`
      }]
    };
  } else if (name === 'timestamp') {
    return {
      content: [{
        type: 'text',
        text: `Current time: ${new Date().toISOString()}`
      }]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 2. Make it executable

```bash
chmod +x ~/test-mcp-server.mjs
```

### 3. Add to NCP config

Edit `~/.ncp/config.json`:

```json
{
  "mcpServers": {
    "test-scheduler": {
      "command": "node",
      "args": ["~/test-mcp-server.mjs"]
    }
  }
}
```

### 4. Test the MCP works

```bash
ncp find greet
# Should show: test-scheduler:greet
```

### 5. Create scheduled tasks

```bash
# Create a task that runs every minute
ncp scheduler:create-task \
  --name "Greet task" \
  --schedule "every minute" \
  --tool "test-scheduler:greet" \
  --parameters '{"name": "Scheduler"}'

# Create another task for the same timing
ncp scheduler:create-task \
  --name "Timestamp task" \
  --schedule "every minute" \
  --tool "test-scheduler:timestamp" \
  --parameters '{}'

# List tasks
ncp scheduler:list-tasks
```

### 6. Monitor executions

```bash
# Wait a minute, then check executions
ncp scheduler:list-executions

# Check execution results
ncp scheduler:get-execution <execution-id>

# Watch live (if you have watch command)
watch -n 5 "ncp scheduler:list-executions --limit 5"
```

## Testing Process Isolation

To verify that one crashing task doesn't affect others:

### 1. Create a failing task

```bash
# This will fail because the tool doesn't exist
ncp scheduler:create-task \
  --name "Bad task" \
  --schedule "every 2 minutes" \
  --tool "test-scheduler:nonexistent" \
  --parameters '{}'
```

### 2. Create good tasks in the same timing

```bash
ncp scheduler:create-task \
  --name "Good task 1" \
  --schedule "every 2 minutes" \
  --tool "test-scheduler:greet" \
  --parameters '{"name": "Task1"}'

ncp scheduler:create-task \
  --name "Good task 2" \
  --schedule "every 2 minutes" \
  --tool "test-scheduler:timestamp" \
  --parameters '{}'
```

### 3. Verify isolation

Wait 2 minutes and check executions:

```bash
ncp scheduler:list-executions --limit 10
```

Expected behavior:
- ✅ "Good task 1" should show SUCCESS
- ✅ "Good task 2" should show SUCCESS
- ❌ "Bad task" should show FAILURE
- ✅ All tasks should have execution records (none silently failed)

## Testing Parallel Execution

All tasks with the same timing run in parallel, not sequential:

```bash
# Create 5 tasks for the same timing
for i in {1..5}; do
  ncp scheduler:create-task \
    --name "Parallel task $i" \
    --schedule "in 3 minutes" \
    --tool "test-scheduler:greet" \
    --parameters "{\"name\": \"Task$i\"}"
done

# Wait 3 minutes and check execution times
ncp scheduler:list-executions --limit 10
```

All 5 tasks should have started within a few seconds of each other (not 5 minutes apart).

## Debugging Failed Executions

```bash
# Get detailed error for a failed execution
ncp scheduler:get-execution <execution-id>

# Check scheduler logs (if NCP_DEBUG=true)
tail -f ~/.ncp/logs/ncp-error.log

# Check OS scheduler (macOS)
launchctl list | grep ncp-scheduler

# Check cron entries (Linux)
crontab -l | grep ncp
```

## Cleanup

```bash
# List all tasks
ncp scheduler:list-tasks

# Delete specific task
ncp scheduler:delete-task <task-id>

# Or delete by name
ncp scheduler:delete-task --name "Task name"

# Clean up old executions
ncp scheduler:cleanup --max-age-days 7
```

## Common Issues

### Task not executing
- Check OS scheduler is set up: `ncp scheduler:list-timings`
- Verify cron expression: `ncp scheduler:validate-cron "* * * * *"`
- Check task is active: `ncp scheduler:get-task <task-id>`

### Tool not found
- Verify MCP is configured: `ncp list-servers`
- Check tool exists: `ncp find <tool-name>`
- Test tool manually: `ncp run <tool:name> --parameters '{}'`

### All tasks failing
- Check NCP installation: `which ncp`
- Verify config file: `cat ~/.ncp/config.json`
- Check logs: `cat ~/.ncp/logs/ncp-error.log`
