# Session ID Transparency Implementation

## Changes Made

### 1. Modified `src/server/mcp-server.ts`
**Method**: `handleRun()`

**Change**: Extract `_meta` from incoming request and forward to orchestrator

```typescript
// Extract _meta for transparent passthrough (session_id, etc.)
const meta = request.params?._meta;

// Normal execution - pass _meta transparently
const result = await this.orchestrator.run(toolIdentifier, parameters, meta);
```

### 2. Modified `src/orchestrator/ncp-orchestrator.ts`
**Method**: `run()`

**Change**: Accept optional `meta` parameter and forward to MCP servers

```typescript
// Updated signature
async run(toolName: string, parameters: any, meta?: Record<string, any>): Promise<ExecutionResult>

// Forward _meta to MCP server
return await connection.client.callTool({
  name: actualToolName,
  arguments: parameters,
  _meta: meta  // ✅ Transparently forwarded
});
```

## Why This Matters

### Problem Solved
Before this change, NCP dropped the `_meta` field (which contains `session_id` and other protocol-level metadata) when proxying requests to MCP servers. This broke stateful MCPs that depend on session affinity.

### Stateful MCPs That Now Work
- **File servers**: Can maintain open file handles across requests
- **Database servers**: Can maintain transactions across requests
- **OAuth flows**: Can preserve authentication state
- **Any MCP with context/memory**: Can track state between requests

## Protocol Compliance

This implementation follows the MCP specification for `_meta` handling:
- Reference: [MCP Discussion #1228](https://github.com/modelcontextprotocol/specification/discussions/1228)
- `_meta` field is used for passing metadata from client to server
- Common use case: `session_id` for session affinity

## Example Usage

### Client sends request with session_id:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "run",
    "arguments": {
      "tool": "filesystem:read_file",
      "parameters": { "path": "/tmp/test.txt" }
    },
    "_meta": {
      "session_id": "abc123"
    }
  }
}
```

### NCP now forwards _meta to MCP server:
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/tmp/test.txt" },
    "_meta": {
      "session_id": "abc123"
    }
  }
}
```

### Result:
✅ MCP server receives session_id and can maintain state across requests

## Backwards Compatibility

✅ **Fully backwards compatible**
- `meta` parameter is optional
- Existing code that doesn't pass `_meta` continues to work
- No breaking changes to API

## Testing

Created test suite: `test/session-id-passthrough.test.ts`

Tests verify:
1. ✅ `_meta` with `session_id` is forwarded correctly
2. ✅ Requests without `_meta` still work (backwards compatibility)
3. ✅ Empty `_meta` object is handled correctly

## Related Work

- **Microsoft MCP Gateway**: Uses session_id for routing to same pod
  - https://github.com/microsoft/mcp-gateway
- **MCP Spec Discussion**: Documents `_meta` usage
  - https://github.com/modelcontextprotocol/specification/discussions/1228

## Impact

This makes NCP a **truly transparent proxy** for MCP servers. Clients and servers can now use protocol-level features like session affinity without NCP interfering.

## Version

This change will be included in **NCP v1.4.0**
