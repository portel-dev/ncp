# Session ID Transparency in NCP

## Problem Statement

NCP acts as a proxy/gateway between MCP clients (Claude Desktop, Cline, Cursor) and MCP servers. Currently, NCP **drops the `_meta` field** from incoming requests, which breaks stateful MCP servers that depend on `session_id` for:

- Maintaining open file handles
- Database transactions
- Authentication state
- Previous context/memory across requests

### Current Broken Flow

```
Claude Desktop                    NCP                           MCP Server
     |                              |                                |
     | tools/call with _meta        |                                |
     | { session_id: "abc123" }     |                                |
     |----------------------------->|                                |
     |                              |                                |
     |                              | callTool WITHOUT _meta         |
     |                              | (session_id is lost!)          |
     |                              |------------------------------->|
     |                              |                                |
     |                              |    ❌ Server treats as new     |
     |                              |       session every time       |
```

## Solution: Transparent `_meta` Passthrough

NCP must forward `_meta` transparently in both directions.

### Fixed Flow

```
Claude Desktop                    NCP                           MCP Server
     |                              |                                |
     | tools/call with _meta        |                                |
     | { session_id: "abc123" }     |                                |
     |----------------------------->|                                |
     |                              |                                |
     |                              | callTool WITH _meta            |
     |                              | { session_id: "abc123" }       |
     |                              |------------------------------->|
     |                              |                                |
     |                              |    ✅ Server maintains state   |
     |                              |       across requests          |
```

## Where Session ID Can Appear

Based on Microsoft MCP Gateway and MCP spec:

### 1. Query Parameter (SSE/HTTP transport)
```http
POST /mcp/messages?session_id=abc123
```

### 2. HTTP Header
```http
POST /mcp/messages
mcp-session-id: abc123
```

### 3. MCP Protocol `_meta` Field (stdio transport)
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/tmp/file.txt" },
    "_meta": {
      "session_id": "abc123"
    }
  }
}
```

**NCP currently only handles #3 (stdio transport), so we need to focus there first.**

## Implementation Changes

### Change 1: Extract `_meta` from incoming request

**File**: `src/server/mcp-server.ts`

**Method**: `handleRun()`

**Before**:
```typescript
private async handleRun(request: MCPRequest, args: any): Promise<MCPResponse> {
  // ... validation ...

  const toolIdentifier = args.tool;
  const parameters = args.parameters || {};
  const dryRun = args.dry_run || false;

  // ❌ _meta is ignored
  const result = await this.orchestrator.run(toolIdentifier, parameters);

  // ...
}
```

**After**:
```typescript
private async handleRun(request: MCPRequest, args: any): Promise<MCPResponse> {
  // ... validation ...

  const toolIdentifier = args.tool;
  const parameters = args.parameters || {};
  const dryRun = args.dry_run || false;

  // ✅ Extract _meta from request params
  const meta = request.params?._meta;

  // ✅ Pass _meta to orchestrator
  const result = await this.orchestrator.run(toolIdentifier, parameters, meta);

  // ...
}
```

### Change 2: Update orchestrator.run() signature

**File**: `src/orchestrator/ncp-orchestrator.ts`

**Method**: `run()`

**Before**:
```typescript
async run(toolName: string, parameters: any): Promise<ExecutionResult> {
  // ... tool resolution ...

  const result = await withFilteredOutput(async () => {
    return await connection.client.callTool({
      name: actualToolName,
      arguments: parameters
      // ❌ No _meta field
    });
  });

  // ...
}
```

**After**:
```typescript
async run(
  toolName: string,
  parameters: any,
  meta?: Record<string, any>  // ✅ Add _meta parameter
): Promise<ExecutionResult> {
  // ... tool resolution ...

  const result = await withFilteredOutput(async () => {
    return await connection.client.callTool({
      name: actualToolName,
      arguments: parameters,
      _meta: meta  // ✅ Forward _meta to MCP server
    });
  });

  // ...
}
```

### Change 3: Verify MCP SDK support

The MCP SDK already supports `_meta`:

```typescript
// From @modelcontextprotocol/sdk/types.js
export interface CallToolRequest {
  method: "tools/call";
  params: {
    name: string;
    arguments?: { [key: string]: unknown };
    _meta?: { [key: string]: unknown };  // ✅ Already supported!
  };
}
```

**No changes needed to SDK!**

## Testing Strategy

### Test 1: Session ID Passthrough

**Setup**: Create a simple stateful MCP server that logs received session_id

**Test**:
```bash
# Request 1
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run","arguments":{"tool":"test:ping","parameters":{}},"_meta":{"session_id":"test123"}}}' | ncp

# Request 2 (same session)
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run","arguments":{"tool":"test:ping","parameters":{}},"_meta":{"session_id":"test123"}}}' | ncp
```

**Expected**: MCP server logs show same session_id "test123" for both requests

### Test 2: No Session ID (Backwards Compatibility)

**Test**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run","arguments":{"tool":"test:ping","parameters":{}}}}' | ncp
```

**Expected**: Works normally, _meta is undefined/empty (no errors)

### Test 3: Additional _meta Fields

**Test**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run","arguments":{"tool":"test:ping","parameters":{}},"_meta":{"session_id":"test123","custom_field":"value"}}}' | ncp
```

**Expected**: All _meta fields are forwarded transparently

## Benefits

### 1. Stateful MCP Support
- File servers can maintain open handles
- Database servers can maintain transactions
- OAuth flows work correctly

### 2. Protocol Compliance
- NCP becomes truly transparent proxy
- Follows MCP spec for `_meta` handling
- Compatible with all MCP clients and servers

### 3. Future-Proof
- Supports any future `_meta` fields
- No need to hardcode session handling
- Works with Microsoft MCP Gateway pattern

## Rollout Plan

### Phase 1: Core Implementation (Week 1)
- [ ] Modify `handleRun()` to extract `_meta`
- [ ] Update `orchestrator.run()` signature
- [ ] Add unit tests for _meta passthrough

### Phase 2: Testing (Week 2)
- [ ] Create test MCP server that logs session_id
- [ ] Test with real stateful MCP (filesystem)
- [ ] Verify backwards compatibility

### Phase 3: Documentation (Week 3)
- [ ] Update README with session_id support
- [ ] Document _meta transparency
- [ ] Add examples for stateful MCPs

### Phase 4: Release (Week 4)
- [ ] Version bump to 1.4.0
- [ ] Release notes highlighting session support
- [ ] NPM publish

## Related Work

- **Microsoft MCP Gateway**: Reference implementation for session routing
  - https://github.com/microsoft/mcp-gateway
  - Uses `IAdapterSessionStore` for session-to-pod mapping
  - Supports both query param and header-based session_id

- **MCP Spec Discussion #1228**: Passing extra fixed parameters
  - https://github.com/modelcontextprotocol/specification/discussions/1228
  - Documents `_meta` field usage
  - Explains client-to-server metadata passing

## Open Questions

1. **Should NCP track session_id internally?**
   - For debugging/logging purposes
   - For health monitoring correlation
   - Decision: Yes, log it at DEBUG level

2. **Should NCP validate session_id format?**
   - Microsoft uses any string
   - Decision: No validation, pass through transparently

3. **Should NCP support HTTP header/query param for session_id?**
   - Only relevant if NCP adds HTTP transport
   - Decision: Not yet, stdio transport only for now

4. **Should NCP add session_id if client doesn't provide one?**
   - Could generate UUIDs automatically
   - Decision: No, remain transparent. Client decides.
