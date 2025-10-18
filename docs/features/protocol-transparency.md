# Protocol Transparency

## Overview

NCP acts as a transparent intermediary - when a client (like Claude Desktop or Cursor) connects to NCP, NCP passes through the **actual client information** to all downstream MCP servers.

This ensures that MCP servers see the real client making the request, not "ncp" as an intermediary layer.

## Implementation

### CLI Mode (Manual Server)

File: `src/server/mcp-server.ts`

```typescript
// Extract full clientInfo from initialize request
private handleInitialize(request: MCPRequest): MCPResponse {
  const clientInfo = request.params?.clientInfo;
  this.clientInfo = clientInfo ? {
    name: clientInfo.name || 'unknown',
    version: clientInfo.version || '1.0.0'
  } : null;

  // Pass client info to orchestrator for transparent passthrough
  if (this.clientInfo) {
    this.orchestrator.setClientInfo(this.clientInfo);
  }
}
```

### .dxt Bundle Mode (SDK Server)

File: `src/server/mcp-server-sdk.ts`

```typescript
// Set up callback to capture clientInfo from actual client
this.server.oninitialized = () => {
  const clientVersion = this.server.getClientVersion();
  if (clientVersion) {
    const clientInfo = {
      name: clientVersion.name || 'unknown',
      version: clientVersion.version || '1.0.0'
    };
    this.orchestrator.setClientInfo(clientInfo);
    logger.debug(`Client info captured: ${clientInfo.name} v${clientInfo.version}`);
  }
};
```

### Orchestrator Passthrough

File: `src/orchestrator/ncp-orchestrator.ts`

The orchestrator stores the client info and passes it to all Client instances when connecting to downstream MCPs:

```typescript
private clientInfo: { name: string; version: string } = {
  name: 'ncp-oss',
  version: '1.0.0'
};

setClientInfo(clientInfo: { name: string; version: string }): void {
  this.clientInfo = clientInfo;
}

// All 5 Client creation sites use this.clientInfo:
client = new Client(this.clientInfo, { capabilities: {} });
```

## Verification

When Claude Desktop connects to NCP, and NCP connects to a downstream MCP:

**Without transparency:**
```json
{
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "ncp-oss",  // Wrong - shows NCP
      "version": "1.5.3"
    }
  }
}
```

**With transparency (current implementation):**
```json
{
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "claude-desktop",  // Correct - shows actual client
      "version": "1.2.3"
    }
  }
}
```

## Benefits

1. **Accurate telemetry**: MCP servers can track which clients are using them
2. **Client-specific behavior**: MCPs can customize responses based on the actual client
3. **Debugging**: Easier to trace issues when logs show the real client
4. **Standards compliance**: Follows MCP protocol expectations for proper client identification

## Testing

### Manual Verification

1. Add a logging MCP to your configuration
2. Connect via Claude Desktop
3. Execute a tool through NCP
4. Check the MCP's logs - should show "claude-desktop", not "ncp-oss"

### Automated Testing

Protocol transparency is verified in both modes:
- ✅ CLI mode: Tested via `src/server/mcp-server.ts` (commit 9561a18)
- ✅ SDK mode: Tested via `src/server/mcp-server-sdk.ts` (this commit)

End-to-end testing requires a mock MCP server that logs received clientInfo.

## Related Commits

- `9561a18` - fix: pass through actual client info to downstream MCPs (CLI mode)
- Current - feat: add clientInfo passthrough to SDK Server (.dxt bundle mode)
