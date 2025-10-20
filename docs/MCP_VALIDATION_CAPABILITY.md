# MCP Validation Capability

## Overview

Instead of assuming a `validate` tool exists, MCPs should **announce validation support via capabilities** during initialization. This follows MCP protocol patterns and allows clients to detect support programmatically.

## Problem with Tool-Based Approach

**Current (suboptimal):**
```typescript
// Client has to try calling validate and handle errors
try {
  await mcp.call('validate', params);
} catch (error) {
  // Does this MCP support validation? Who knows!
  // Fall back to schema-only validation
}
```

**Issues:**
- ❌ No way to know if MCP supports validation
- ❌ Must attempt and handle failure
- ❌ Wastes round-trip if not supported
- ❌ Error handling is ambiguous (not supported vs validation failed)

## Solution: Capabilities-Based Announcement

**Proposed (better):**
```typescript
// Server announces during initialization
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "experimental": {
        "toolValidation": {
          "supported": true,
          "method": "validate"  // Optional: custom validation tool name
        }
      }
    },
    "serverInfo": {
      "name": "my-mcp",
      "version": "1.0.0"
    }
  }
}

// Client checks capability first
if (mcp.capabilities.experimental?.toolValidation?.supported) {
  // MCP supports validation - use it!
  const result = await mcp.call('validate', params);
} else {
  // Fall back to schema-only validation
  validateAgainstSchema(params);
}
```

**Benefits:**
- ✅ Client knows support before attempting call
- ✅ No wasted round-trips
- ✅ Clear separation: not supported vs validation failed
- ✅ Follows MCP protocol patterns
- ✅ Backward compatible (experimental capabilities)

## Capability Schema

### Basic Support
```typescript
{
  "experimental": {
    "toolValidation": {
      "supported": true
    }
  }
}
```

### Advanced Options
```typescript
{
  "experimental": {
    "toolValidation": {
      "supported": true,
      "method": "validate",           // Default: "validate"
      "async": true,                  // Supports async validation
      "streaming": false,             // Supports streaming validation
      "contextAware": true,           // Can validate based on current context
      "cacheable": true               // Validation results can be cached
    }
  }
}
```

## Validation Tool Specification

When `toolValidation.supported = true`, the MCP MUST implement a validation tool:

**Tool Name:** `validate` (or custom name specified in `method`)

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "tool": {
      "type": "string",
      "description": "Tool name to validate (without MCP prefix)"
    },
    "arguments": {
      "type": "object",
      "description": "Tool arguments to validate"
    }
  },
  "required": ["tool", "arguments"]
}
```

**Output Format:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["Optional warning messages"],
  "suggestions": ["Optional improvement suggestions"]
}
```

## Implementation Guide

### For MCP Servers

**1. Announce Capability in Initialize Response:**

```typescript
// In your MCP server initialization
server.setRequestHandler('initialize', async (request) => {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
      experimental: {
        toolValidation: {
          supported: true
        }
      }
    },
    serverInfo: {
      name: 'my-mcp',
      version: '1.0.0'
    }
  };
});
```

**2. Implement Validate Tool:**

```typescript
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'validate') {
    const { tool, arguments: args } = request.params.arguments;

    // Perform validation
    const errors = [];
    const warnings = [];

    if (tool === 'write_file') {
      if (!args.path) errors.push('Missing required parameter: path');
      if (args.path && !isWritable(args.path)) {
        errors.push(`Path not writable: ${args.path}`);
      }
      if (!args.content) warnings.push('Empty content will create empty file');
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: errors.length === 0,
          errors,
          warnings
        })
      }]
    };
  }

  // Handle other tools...
});
```

### For MCP Clients

**1. Check Capability During Connection:**

```typescript
class MCPClient {
  private validationSupported: boolean = false;

  async connect() {
    const initResult = await this.initialize();

    // Check if server supports validation
    this.validationSupported =
      initResult.capabilities.experimental?.toolValidation?.supported === true;

    console.log(`Validation supported: ${this.validationSupported}`);
  }

  async validateTool(tool: string, args: any): Promise<ValidationResult> {
    if (!this.validationSupported) {
      // Fall back to schema-only validation
      return this.validateAgainstSchema(tool, args);
    }

    // Use MCP-native validation
    const result = await this.callTool('validate', {
      tool,
      arguments: args
    });

    return JSON.parse(result.content[0].text);
  }
}
```

**2. Graceful Degradation:**

```typescript
async function scheduleJob(mcp: MCPClient, tool: string, args: any) {
  let validationResult;

  if (mcp.supportsValidation()) {
    // Use MCP-native validation (deep checks)
    validationResult = await mcp.validateTool(tool, args);
  } else {
    // Fall back to schema-only validation
    validationResult = await validateAgainstSchema(tool, args);
  }

  if (!validationResult.valid) {
    throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
  }

  // Schedule the job...
}
```

## Migration Path

### Phase 1: Experimental (Current)
- Use `experimental.toolValidation` capability
- MCPs opt-in by announcing support
- Clients detect and use if available
- Gather feedback and iterate

### Phase 2: Standardization (Future)
If widely adopted:
- Propose to MCP protocol maintainers
- Move from `experimental` to standard capability
- Add to official MCP specification
- Version: MCP 2025-XX-XX

### Phase 3: Ecosystem Adoption
- Major MCPs implement validation
- Clients expect validation support
- Becomes de facto standard

## Reference Implementation

See NCP's internal Scheduler MCP for reference:

**Server Side:**
```typescript
// src/internal-mcps/scheduler.ts
export class SchedulerMCP implements InternalMCP {
  name = 'scheduler';

  // Announce capability
  capabilities = {
    experimental: {
      toolValidation: {
        supported: true
      }
    }
  };

  // Implement validate tool
  async executeTool(name: string, params: any) {
    if (name === 'validate') {
      return this.handleValidate(params);
    }
    // ... other tools
  }

  private async handleValidate(params: any) {
    const { tool, arguments: args } = params;
    const errors = [];

    // Tool-specific validation logic
    if (tool === 'schedule') {
      if (!args.name) errors.push('Missing required parameter: name');
      if (!args.schedule) errors.push('Missing required parameter: schedule');
      // ... more validation
    }

    return {
      success: true,
      content: JSON.stringify({
        valid: errors.length === 0,
        errors,
        warnings: []
      })
    };
  }
}
```

**Client Side:**
```typescript
// src/services/scheduler/tool-validator.ts
export class ToolValidator {
  async validateTool(tool: string, parameters: any): Promise<ValidationResult> {
    const [mcpName, toolName] = tool.split(':');

    // Check if MCP supports validation capability
    if (orchestrator.hasCapability(mcpName, 'experimental.toolValidation')) {
      // Use MCP-native validation
      const result = await orchestrator.executeTool(
        `${mcpName}:validate`,
        { tool: toolName, arguments: parameters }
      );

      return JSON.parse(result.content);
    }

    // Fall back to schema-only validation
    return this.validateAgainstSchema(tool, parameters);
  }
}
```

## Benefits

### For MCP Developers
- ✅ Clear API contract
- ✅ Discoverable via capabilities
- ✅ Optional (experimental capabilities)
- ✅ Backward compatible

### For MCP Clients
- ✅ No guessing if validation exists
- ✅ Faster detection (no failed attempts)
- ✅ Clear error handling
- ✅ Graceful degradation

### For End Users
- ✅ Better error messages before execution
- ✅ Fewer runtime failures
- ✅ More reliable scheduled jobs
- ✅ Improved developer experience

## Comparison

### Before (Tool-Only Approach)
```
Client: "Does MCP support validation?"
[Attempts to call validate tool]
[Gets error - but why? Not supported? Or validation failed?]
[Client has to guess]
```

### After (Capability-Based Approach)
```
Client: "Does MCP support validation?"
[Checks capabilities.experimental.toolValidation]
[Knows immediately: supported or not]
[Makes informed decision]
```

## Future Extensions

### Validation Levels
```typescript
{
  "experimental": {
    "toolValidation": {
      "supported": true,
      "levels": {
        "syntax": true,      // Basic syntax/type checking
        "semantic": true,    // Logical correctness
        "runtime": true,     // Runtime checks (file exists, etc.)
        "security": false    // Security policy checks
      }
    }
  }
}
```

### Batch Validation
```typescript
{
  "experimental": {
    "toolValidation": {
      "supported": true,
      "batchValidation": true,  // Can validate multiple tools at once
      "maxBatchSize": 10
    }
  }
}
```

### Validation Caching
```typescript
{
  "experimental": {
    "toolValidation": {
      "supported": true,
      "caching": {
        "enabled": true,
        "ttl": 3600,  // seconds
        "invalidateOn": ["resource_change", "tool_update"]
      }
    }
  }
}
```

## Adoption Strategy

### For NCP
1. ✅ Implement in internal MCPs (scheduler)
2. ✅ Update orchestrator to check capability
3. ✅ Document for MCP developers
4. ✅ Provide examples and templates

### For MCP Ecosystem
1. Share proposal with MCP maintainers
2. Get feedback from MCP developers
3. Create reference implementations
4. Submit to MCP specification (if successful)

### For Scheduler
1. ✅ Use `validate` tool as fallback
2. ✅ Add capability check to ToolValidator
3. ✅ Skip validation attempt if capability not announced
4. ✅ Log when falling back to schema-only

## Open Questions

1. **Should validation be synchronous only?**
   - Pro: Simpler to implement
   - Con: Some checks need async (network calls)
   - Proposal: Support both, indicate via capability

2. **Should we version the validation protocol?**
   - Pro: Allows evolution
   - Con: More complexity
   - Proposal: Add `version: "1.0"` to capability

3. **Should validation results be cacheable?**
   - Pro: Performance improvement
   - Con: May become stale
   - Proposal: Optional, controlled by MCP

## Conclusion

**Use capabilities, not just tools!**

The MCP protocol provides `experimental` capabilities specifically for this use case. By announcing `toolValidation` support during initialization:

1. Clients can detect support instantly
2. No wasted round-trips on unsupported MCPs
3. Clear separation of concerns (capability vs validation result)
4. Follows established MCP patterns
5. Paves path for standardization

**Recommendation:** Implement both the capability announcement AND the validate tool. The capability tells clients what to expect, and the tool provides the actual validation.

---

**Status:** ✅ Implemented in NCP v1.6.0
**Implementation Complete:**
1. ✅ ToolValidator checks capabilities before attempting validation (lines 184-193 in tool-validator.ts)
2. ✅ SchedulerMCP announces toolValidation capability (lines 32-39 in scheduler.ts)
3. ✅ InternalMCPManager provides capability checking (hasCapability method with dot-notation support)
4. ✅ Documentation complete for external MCP developers

**How It Works:**
- Scheduler announces `experimental.toolValidation.supported: true` during initialization
- ToolValidator checks capability via `internalMCPManager.hasCapability()` before calling validate tool
- If capability not announced, falls back to schema-only validation
- No wasted round-trips, clear separation of "not supported" vs "validation failed"
