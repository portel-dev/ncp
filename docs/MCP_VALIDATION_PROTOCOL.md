# MCP Validation Protocol

## Overview

The MCP Validation Protocol is a **gold standard** for validating tool parameters before execution. It enables MCPs to perform deep validation beyond simple schema checking - verifying paths exist, testing database connections, checking permissions, and more.

This prevents **silent failures** in scheduled jobs and automated workflows.

## The Problem

**Without Validation:**
```
AI: Schedule daily backup to /data
→ Job created ✅
→ 3 days later: fails silently (path doesn't exist)
→ Nobody notices until manual check
```

**With Validation Protocol:**
```
AI: Schedule daily backup to /data
→ MCP validates immediately
→ Error: "Path /data does not exist"
→ AI fixes the path
→ Job created ✅
```

## Protocol Specification

### Tool: `validate`

Every MCP **SHOULD** implement a `validate` tool that performs dry-run validation.

#### Input Schema
```json
{
  "name": "validate",
  "description": "Validate tool parameters before execution (dry-run)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tool": {
        "type": "string",
        "description": "Tool name to validate"
      },
      "arguments": {
        "type": "object",
        "description": "Tool parameters to validate"
      }
    },
    "required": ["tool", "arguments"]
  }
}
```

#### Output Format
```json
{
  "valid": boolean,
  "errors": string[],
  "warnings": string[]
}
```

#### Example Request
```json
{
  "tool": "read_file",
  "arguments": {
    "path": "/nonexistent/file.txt"
  }
}
```

#### Example Response (Invalid)
```json
{
  "valid": false,
  "errors": [
    "Path does not exist: /nonexistent/file.txt"
  ],
  "warnings": []
}
```

#### Example Response (Valid with Warnings)
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    "File is very large (5GB), reading may be slow"
  ]
}
```

## Implementation Guide

### Basic Implementation (Schema Validation)

```typescript
class MyMCP {
  tools = [
    {
      name: "validate",
      description: "Validate tool parameters",
      inputSchema: { /* see above */ }
    },
    // ... other tools
  ];

  async executeTool(toolName: string, args: any) {
    if (toolName === 'validate') {
      return this.handleValidate(args);
    }
    // ... handle other tools
  }

  private handleValidate(args: any) {
    const { tool, arguments: toolArgs } = args;
    const errors = [];
    const warnings = [];

    // Find the tool
    const toolDef = this.tools.find(t => t.name === tool);
    if (!toolDef) {
      return {
        success: true,
        content: JSON.stringify({
          valid: false,
          errors: [`Unknown tool: ${tool}`],
          warnings: []
        })
      };
    }

    // Validate required parameters
    const schema = toolDef.inputSchema;
    for (const required of schema.required || []) {
      if (!(required in toolArgs)) {
        errors.push(`Missing required parameter: ${required}`);
      }
    }

    // Validate parameter types
    for (const [param, value] of Object.entries(toolArgs)) {
      const paramSchema = schema.properties[param];
      if (!paramSchema) {
        warnings.push(`Parameter "${param}" not in schema`);
        continue;
      }

      const expectedType = paramSchema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType !== actualType) {
        errors.push(`Parameter "${param}": expected ${expectedType}, got ${actualType}`);
      }
    }

    return {
      success: true,
      content: JSON.stringify({
        valid: errors.length === 0,
        errors,
        warnings
      })
    };
  }
}
```

### Advanced Implementation (Deep Validation)

```typescript
class FilesystemMCP {
  private handleValidate(args: any) {
    const { tool, arguments: toolArgs } = args;
    const errors = [];
    const warnings = [];

    switch (tool) {
      case 'read_file':
        // Check path exists
        if (!fs.existsSync(toolArgs.path)) {
          errors.push(`Path does not exist: ${toolArgs.path}`);
        }
        // Check readable
        else if (!this.isReadable(toolArgs.path)) {
          errors.push(`Path is not readable: ${toolArgs.path}`);
        }
        // Warn if large
        else if (this.getFileSize(toolArgs.path) > 100_000_000) {
          warnings.push('File is very large (>100MB), reading may be slow');
        }
        break;

      case 'write_file':
        const dir = path.dirname(toolArgs.path);
        // Check directory exists
        if (!fs.existsSync(dir)) {
          errors.push(`Directory does not exist: ${dir}`);
        }
        // Check writable
        else if (!this.isWritable(dir)) {
          errors.push(`Directory is not writable: ${dir}`);
        }
        // Check disk space
        else if (this.getFreeDiskSpace(dir) < 1_000_000_000) {
          warnings.push('Low disk space (<1GB free)');
        }
        break;
    }

    return {
      success: true,
      content: JSON.stringify({
        valid: errors.length === 0,
        errors,
        warnings
      })
    };
  }
}
```

### Database MCP Example

```typescript
class DatabaseMCP {
  private async handleValidate(args: any) {
    const { tool, arguments: toolArgs } = args;
    const errors = [];
    const warnings = [];

    if (tool === 'query') {
      // Validate SQL syntax
      try {
        this.parseSql(toolArgs.sql);
      } catch (e) {
        errors.push(`Invalid SQL syntax: ${e.message}`);
        return this.validationResponse(false, errors, warnings);
      }

      // Test connection
      try {
        await this.testConnection();
      } catch (e) {
        errors.push(`Database connection failed: ${e.message}`);
        return this.validationResponse(false, errors, warnings);
      }

      // Validate table exists
      const tables = this.extractTables(toolArgs.sql);
      for (const table of tables) {
        if (!await this.tableExists(table)) {
          errors.push(`Table does not exist: ${table}`);
        }
      }

      // Warn about expensive queries
      if (toolArgs.sql.includes('SELECT *')) {
        warnings.push('SELECT * may be inefficient on large tables');
      }
    }

    return this.validationResponse(errors.length === 0, errors, warnings);
  }

  private validationResponse(valid: boolean, errors: string[], warnings: string[]) {
    return {
      success: true,
      content: JSON.stringify({ valid, errors, warnings })
    };
  }
}
```

## Integration with NCP Scheduler

NCP's scheduler automatically uses the validation protocol when available:

```typescript
// 1. Try MCP-native validation (tools/validate)
const validation = await mcp.validate(tool, parameters);

// 2. If not supported, fall back to schema validation
if (!validation.supported) {
  validation = await schemaOnlyValidation(tool, parameters);
}

// 3. Only create job if validation passes
if (validation.valid) {
  createScheduledJob();
} else {
  throw new Error(validation.errors.join('\n'));
}
```

## Benefits

### For MCP Authors
- **Prevent user errors** before they become runtime failures
- **Better UX** - immediate feedback instead of silent failures
- **Reusable** - validation logic works for scheduling, testing, dry-runs

### For AI Agents
- **Immediate feedback** - know right away if parameters are wrong
- **Self-correction** - can fix issues before scheduling
- **Trust** - confidence that scheduled jobs will work

### For Users
- **No silent failures** - bad jobs never get scheduled
- **Reliability** - scheduled jobs run successfully
- **Debugging** - clear error messages when something is wrong

## Best Practices

1. **Always return JSON** - Use the exact format: `{valid, errors, warnings}`
2. **Be specific** - "Path /data does not exist" not "Invalid path"
3. **Warn, don't error** - Use warnings for non-critical issues
4. **Test connections** - Verify external resources are accessible
5. **Check permissions** - Validate read/write access before execution
6. **Validate semantics** - Not just types, but business logic too

## Adoption Path

### Phase 1: Schema Validation (Basic)
- Validate required parameters
- Check parameter types
- Verify enum values

### Phase 2: Semantic Validation (Better)
- Check file/path existence
- Validate URL formats
- Test API keys

### Phase 3: Deep Validation (Gold Standard)
- Test actual connections
- Check disk space
- Verify permissions
- Validate query syntax
- Test with sample data

## Reference Implementation

See NCP's internal scheduler MCP for a complete reference implementation:

**File:** `src/internal-mcps/scheduler.ts`

**Method:** `handleValidate()`

This implementation demonstrates:
- Schema validation
- Format validation (cron expressions, tool names)
- Type checking
- Business logic validation

## Future: MCP Protocol Standard

This validation protocol is a **proposed extension** to the MCP specification. If widely adopted, it could become part of the official MCP protocol, making validation a first-class feature across all MCP implementations.

**Help us standardize this!** Implement `tools/validate` in your MCP and share feedback.

## Questions?

- **Q: Is validation required?**
  A: No, but highly recommended for MCPs used in automation/scheduling.

- **Q: What if my tool can't validate everything?**
  A: Validate what you can. Even basic schema validation is better than none.

- **Q: Can validation have side effects?**
  A: No! Validation must be a dry-run with zero side effects.

- **Q: Should I call external APIs during validation?**
  A: Only if fast (<1s). For slow checks, return a warning instead of an error.

## Summary

The MCP Validation Protocol enables **deep, semantic validation** of tool parameters before execution. By implementing the `validate` tool, MCP authors can:

1. Prevent silent failures
2. Provide immediate feedback to AI agents
3. Improve reliability of scheduled jobs
4. Create better user experiences

**Start simple, iterate toward the gold standard.**
