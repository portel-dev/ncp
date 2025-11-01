# Testing Scheduler with Real MCP Calls

There are several ways to test the scheduler with actual MCP tool execution:

## Method 1: Use Built-in NCP Internal MCPs (Easiest)

NCP has internal MCPs that are always available. Test with the `scheduler` MCP itself:

```bash
# Build NCP
npm run build

# Create a test task that lists its own tasks (meta!)
node dist/index.js scheduler:create-task \
  --name "List my tasks" \
  --schedule "in 1 minute" \
  --tool "scheduler:list-tasks" \
  --parameters '{}'

# Wait 1 minute, then check if it executed
node dist/index.js scheduler:list-executions
```

## Method 2: Use Any Configured MCP

If you have any MCP already configured in `~/.ncp/config.json`:

```bash
# List available tools
node dist/index.js find

# Pick a simple, safe tool (e.g., filesystem:list_directory)
node dist/index.js scheduler:create-task \
  --name "List temp dir" \
  --schedule "in 2 minutes" \
  --tool "filesystem:list_directory" \
  --parameters '{"path": "/tmp"}'

# Wait and check results
node dist/index.js scheduler:list-executions
```

## Method 3: Create a Permanent Test MCP

Create a test MCP server for development:

### 1. Create `~/dev/test-scheduler-mcp/` directory

```bash
mkdir -p ~/dev/test-scheduler-mcp
cd ~/dev/test-scheduler-mcp
npm init -y
npm install @modelcontextprotocol/sdk
```

### 2. Create `server.mjs`

```javascript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'test-scheduler', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'echo',
      description: 'Echo a message with timestamp',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to echo' }
        },
        required: ['message']
      }
    },
    {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' }
        },
        required: ['a', 'b']
      }
    },
    {
      name: 'sleep',
      description: 'Sleep for specified seconds',
      inputSchema: {
        type: 'object',
        properties: {
          seconds: { type: 'number' }
        },
        required: ['seconds']
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  const timestamp = new Date().toISOString();

  if (name === 'echo') {
    return {
      content: [{
        type: 'text',
        text: `[${timestamp}] ${args.message}`
      }]
    };
  }

  if (name === 'add') {
    const result = args.a + args.b;
    return {
      content: [{
        type: 'text',
        text: `${args.a} + ${args.b} = ${result}`
      }]
    };
  }

  if (name === 'sleep') {
    await new Promise(resolve => setTimeout(resolve, args.seconds * 1000));
    return {
      content: [{
        type: 'text',
        text: `Slept for ${args.seconds} seconds`
      }]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 3. Make executable and add to NCP config

```bash
chmod +x ~/dev/test-scheduler-mcp/server.mjs
```

Edit `~/.ncp/config.json`:

```json
{
  "mcpServers": {
    "test-scheduler": {
      "command": "node",
      "args": ["/Users/yourusername/dev/test-scheduler-mcp/server.mjs"]
    }
  }
}
```

### 4. Test it works

```bash
node dist/index.js find echo
# Should show: test-scheduler:echo

node dist/index.js run test-scheduler:echo --parameters '{"message":"Hello"}'
# Should output: [timestamp] Hello
```

### 5. Create scheduled tasks

```bash
# Single task
node dist/index.js scheduler:create-task \
  --name "Echo every minute" \
  --schedule "every minute" \
  --tool "test-scheduler:echo" \
  --parameters '{"message":"Scheduled execution!"}'

# Multiple tasks at same time
node dist/index.js scheduler:create-task \
  --name "Add calculation" \
  --schedule "every minute" \
  --tool "test-scheduler:add" \
  --parameters '{"a":10,"b":32}'

node dist/index.js scheduler:create-task \
  --name "Another echo" \
  --schedule "every minute" \
  --tool "test-scheduler:echo" \
  --parameters '{"message":"Parallel task!"}'
```

### 6. Monitor executions

```bash
# Wait a minute, then check
node dist/index.js scheduler:list-executions

# Get detailed results
node dist/index.js scheduler:get-execution <execution-id>

# Watch continuously
watch -n 5 "node dist/index.js scheduler:list-executions --limit 5"
```

## Testing Process Isolation

Create tasks where one fails to verify isolation works:

```bash
# Create a good task
node dist/index.js scheduler:create-task \
  --name "Good echo" \
  --schedule "in 2 minutes" \
  --tool "test-scheduler:echo" \
  --parameters '{"message":"I succeed!"}'

# Create a bad task (non-existent tool)
node dist/index.js scheduler:create-task \
  --name "Bad task" \
  --schedule "in 2 minutes" \
  --tool "test-scheduler:nonexistent" \
  --parameters '{}'

# Create another good task
node dist/index.js scheduler:create-task \
  --name "Good add" \
  --schedule "in 2 minutes" \
  --tool "test-scheduler:add" \
  --parameters '{"a":5,"b":7}'
```

Wait 2 minutes and verify:
- "Good echo" shows SUCCESS
- "Bad task" shows FAILURE
- "Good add" shows SUCCESS
- All three have execution records (process isolation worked!)

## Testing Parallel Execution

Create multiple tasks to verify they run in parallel:

```bash
# Create 3 sleep tasks
for i in 1 2 3; do
  node dist/index.js scheduler:create-task \
    --name "Sleep task $i" \
    --schedule "in 3 minutes" \
    --tool "test-scheduler:sleep" \
    --parameters "{\"seconds\":5}"
done

# Wait 3 minutes, check execution times
node dist/index.js scheduler:list-executions --limit 10
```

All three tasks should have started within a few seconds of each other (not 15+ seconds apart), proving they ran in parallel.

## Automated Test Script

For quick verification after code changes:

```bash
#!/bin/bash
# quick-scheduler-test.sh

echo "Creating test tasks..."
node dist/index.js scheduler:create-task \
  --name "Test $(date +%s)" \
  --schedule "in 30 seconds" \
  --tool "scheduler:list-tasks" \
  --parameters '{}'

echo "Waiting 35 seconds..."
sleep 35

echo "Checking execution..."
node dist/index.js scheduler:list-executions --limit 1

echo "Done!"
```

## Debugging

Enable debug logging:

```bash
NCP_DEBUG=true node dist/index.js scheduler:create-task ...

# Check logs
tail -f ~/.ncp/logs/ncp-error.log
```

Check OS scheduler:

```bash
# macOS
launchctl list | grep ncp-scheduler

# Linux
crontab -l | grep ncp
```

## Manual Testing Checklist

- [ ] Task creation works
- [ ] Task appears in list
- [ ] Timing group created
- [ ] OS scheduler entry exists
- [ ] Task executes on schedule
- [ ] Execution recorded
- [ ] Result captured correctly
- [ ] Failed tasks don't crash others
- [ ] Multiple tasks run in parallel
- [ ] Paused tasks don't execute
- [ ] Completed tasks stop executing
