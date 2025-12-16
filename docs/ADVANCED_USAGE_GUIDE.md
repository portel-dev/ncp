# NCP Advanced Usage Guide

This guide covers advanced patterns, optimization strategies, and techniques for power users.

## Table of Contents

1. [Advanced Workflow Patterns](#advanced-workflow-patterns)
2. [Performance Optimization](#performance-optimization)
3. [Troubleshooting](#troubleshooting)
4. [Custom MCP Development](#custom-mcp-development)
5. [Architecture Deep-Dive](#architecture-deep-dive)

---

## Advanced Workflow Patterns

### Multi-Step Orchestration

Combine multiple MCPs to create sophisticated workflows:

```bash
# Example: Create GitHub issue from local file content
# 1. Read local file
ncp run filesystem:read_file path=/path/to/issue-template.md

# 2. Use content to create GitHub issue
ncp run github:create_issue \
  owner=myorg \
  repo=my-repo \
  title="New Feature Request" \
  body="<from previous response>"

# 3. Post notification to Slack
ncp run slack:send_message \
  channel=#notifications \
  text="Issue created: <issue-url>"
```

### Conditional Execution Chains

Use scripting to create conditional MCP executions:

```bash
#!/bin/bash
# Check if repository needs update
NEEDS_UPDATE=$(ncp run github:list_branches owner=myorg repo=my-repo | grep -c "feature-branch")

if [ $NEEDS_UPDATE -gt 0 ]; then
  echo "Found feature branches, creating PR"
  ncp run github:create_pull_request \
    owner=myorg \
    repo=my-repo \
    head=feature-branch \
    base=main
else
  echo "No feature branches found"
fi
```

### Batch Operations

Process multiple items efficiently:

```bash
# Process multiple files across an MCP
for file in /data/*.json; do
  echo "Processing $file"
  ncp run custom-processor:process_file path="$file"
done
```

---

## Performance Optimization

### Caching Strategy

NCP implements intelligent caching for frequently accessed data:

- **Prompts/Resources Caching**: 60-second TTL for list operations
- **Tool Discovery**: Results cached during tool lookup phase
- **Connection Pooling**: Reuses MCP connections with configurable limits

To maximize caching benefits:
- Batch multiple find/list operations within 60 seconds
- Avoid frequent profile switching (invalidates caches)
- Monitor cache hits via debug logging: `ncp config debugLogging true`

### Connection Pool Management

NCP maintains a connection pool with these limits:

- **MAX_CONNECTIONS**: Maximum simultaneous MCP connections (default: 50)
- **MAX_EXECUTIONS_PER_CONNECTION**: Executions before reconnection (default: 1000)
- **LRU Eviction**: Least recently used connections removed when limit exceeded

Optimize for your workload:
```bash
# For high-frequency operations, ensure pool size is adequate
# Monitor connection reuse: check logs for "Reusing connection" messages

# For long-running sessions, monitor execution counts
# to detect forced reconnections
```

### Query Optimization

When using `find`, optimize your queries:

```bash
# ✅ Good: Specific, natural language
ncp find "read file from filesystem"

# ✅ Good: Tool name prefix
ncp find "filesystem:read"

# ⚠️ Inefficient: Too broad
ncp find "data"

# Use depth control to reduce data transfer
ncp find "file operations" --depth 0  # Names only
ncp find "file operations" --depth 1  # Names + descriptions
ncp find "file operations" --depth 2  # Full details (default)
```

---

## Troubleshooting

### Debug Logging

Enable comprehensive debugging:

```bash
ncp config debugLogging true

# Or via environment variable
export NCP_DEBUG=true
ncp run github:list_issues owner=anthropic repo=claude-code
```

Debug logs include:
- MCP connection establishment
- Tool discovery process
- Parameter validation
- Cache hits/misses
- Performance metrics

### Connection Issues

**Symptom: "Failed to connect to MCP"**

```bash
# Check MCP health
ncp doctor

# Verify configuration
ncp config location  # Check where configs are stored

# Test with explicit profile
ncp list --profile all
```

**Symptom: "Tool not found"**

```bash
# Search across all MCPs
ncp find "operation description"

# List specific MCP tools
ncp list | grep "mcp-name"

# Verify MCP is loaded
ncp doctor
```

**Symptom: "Command execution timeout"**

```bash
# Check if MCP is responsive
ncp run mcp-name:simple_tool

# Enable debug logs to see where timeout occurred
ncp config debugLogging true

# Try with dry-run to verify parameters
ncp run mcp-name:tool_name param1=value --dry-run
```

### Performance Issues

**Symptom: Slow `find` operations**

```bash
# Use more specific queries
ncp find "database query operations" --depth 1  # Reduce data
ncp find "postgres" --depth 2  # Be specific

# Check cache effectiveness
ncp config debugLogging true
# Look for "Using cached" messages
```

**Symptom: Slow tool execution**

```bash
# Profile the execution
time ncp run mcp:tool param=value

# Check connection pool status
ncp config debugLogging true
# Monitor "Reusing connection" vs "Creating new connection"

# Consider connection pool limits
# If many connections are created, increase MAX_CONNECTIONS
```

---

## Custom MCP Development

### Building a Custom MCP

Create an MCP for your specific needs:

```typescript
// src/my-custom-mcp.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-custom-mcp',
  version: '1.0.0'
});

// Define tools
server.setRequestHandler('tools/list', () => ({
  tools: [
    {
      name: 'process_data',
      description: 'Process data from custom source',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data to process' }
        },
        required: ['data']
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'process_data') {
    // Implementation
    return {
      content: [{ type: 'text', text: 'Processed result' }]
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Integrating Custom MCPs

Add your custom MCP to NCP:

```bash
# Option 1: Direct command
ncp add my-custom-mcp node /path/to/my-custom-mcp.js

# Option 2: Via profile configuration
ncp config location  # Find config file
# Edit ~/.ncp/profiles/all.json and add:
# {
#   "mcpServers": {
#     "my-custom-mcp": {
#       "command": "node",
#       "args": ["/path/to/my-custom-mcp.js"]
#     }
#   }
# }

# Verify
ncp list | grep my-custom-mcp
```

---

## Architecture Deep-Dive

### Request Processing Pipeline

```
User Input
    ↓
Command Parser
    ↓
Tool Discovery (ToolFinder)
    ↓
Parameter Validation (ToolSchemaParser)
    ↓
Context Resolution (ToolContextResolver)
    ↓
MCP Connection Pool
    ↓
Tool Execution (with error handling)
    ↓
Result Formatting & Output
```

### MCP Connection Lifecycle

```
1. Initial Request to MCP
   ├─ Check connection pool
   ├─ If exists: Reuse (increment executionCount)
   └─ If not: Create new connection

2. Tool Execution
   ├─ Validate parameters
   ├─ Call MCP tool
   └─ Capture response

3. Connection Management
   ├─ Track lastUsed timestamp
   ├─ Update executionCount
   └─ Check for LRU eviction

4. Cleanup
   ├─ Cache results (if applicable)
   └─ Return to pool (don't close)
```

### Tool Discovery Mechanism

```
ToolFinder.findTools(query)
    ↓
DiscoveryEngine.findRelevantTools(query)
    ↓
Vector Similarity Search
    ├─ Convert query to embedding
    ├─ Search against indexed tools
    └─ Return sorted by relevance

Results
    ├─ Full tool schemas (if depth >= 2)
    ├─ Names + descriptions (if depth >= 1)
    └─ Names only (if depth = 0)
```

### Internal MCP Architecture

```
NCPManagementMCP (Bundled)
├─ add: Add new MCPs to profile
├─ remove: Remove MCPs from profile
├─ list: List configured MCPs
├─ import: Import configs
└─ export: Export configs

NCPSchedulerMCP (Bundled)
├─ create: Create scheduled jobs
├─ retrieve: Get job status
├─ update: Modify job settings
└─ delete: Remove jobs
```

---

## Advanced Configuration

### Environment Variables

```bash
# Debugging
NCP_DEBUG=true              # Enable debug logging
DEBUG=true                  # Alternative debug flag

# Auto-import control
NCP_SKIP_AUTO_IMPORT=true   # Disable Claude Desktop sync

# Scheduler
NCP_ENABLE_SCHEDULER=true   # Enable built-in scheduler

# Confirmation
NCP_CONFIRM_BEFORE_RUN=true # Always show confirmation
```

### Profile-Specific Optimization

```bash
# Create a high-performance profile
ncp config --profile performance

# Add only essential MCPs
ncp add github --profile performance
ncp add filesystem --profile performance

# Use it for critical operations
ncp run --profile performance github:get_issues owner=myorg
```

---

## Best Practices

### 1. Use Profiles for Different Contexts

```bash
# Development profile (many MCPs)
ncp list --profile dev | wc -l

# Production profile (essential only)
ncp list --profile prod | wc -l
```

### 2. Monitor Resource Usage

```bash
# Check connection count
ncp config debugLogging true
# Look for active connections in logs

# Monitor cache effectiveness
# Expect 70%+ cache hits for typical workflows
```

### 3. Implement Graceful Degradation

```bash
# Always handle tool-not-found errors
ncp run github:get_organization owner=myorg || \
  echo "GitHub MCP unavailable, using fallback"

# Use dry-run for validation
ncp run mcp:tool param=value --dry-run && \
  ncp run mcp:tool param=value || \
  echo "Validation failed"
```

### 4. Batch Operations Strategically

```bash
# Good: Batch related operations
for repo in repo1 repo2 repo3; do
  ncp run github:create_issue owner=org repo=$repo title="Bug"
done

# Better: Use multi-argument tools when available
ncp run github:bulk_create_issues owner=org repos="repo1,repo2,repo3" titles="Bug"
```

### 5. Schedule Repetitive Tasks

```bash
# Schedule daily health checks
ncp schedule create \
  --name "health-check" \
  --tool github:check_status \
  --schedule "0 9 * * *" \
  --timezone "America/New_York"

# Monitor scheduled job execution
ncp schedule retrieve --job health-check --executions
```

---

## Performance Benchmarks

Typical performance metrics on a modern system:

- **Tool Discovery**: 50-200ms (cached: 1-5ms)
- **Tool Execution**: 100-2000ms (depends on MCP)
- **Connection Reuse**: 5-10x faster than new connections
- **Cache Hit**: 95%+ after initial discovery

---

## Getting Help

- Check debug logs: `ncp config debugLogging true`
- Review MCP status: ncp doctor
- Consult test-drive guide: `ncp resources read ncp:test-drive`
- Review docs: `ncp resources read ncp:help/getting-started`
