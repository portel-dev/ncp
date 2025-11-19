# Workflow Modes - Tool Exposure Control

NCP supports three workflow modes that control which tools are exposed to AI clients. This prevents the problem where AI defaults to the most powerful tool and bypasses progressive disclosure.

## The Problem

When all three tools (`find`, `run`, `code`) are exposed together:
- AI sees `code` as more powerful and flexible
- AI writes `const tools = await ncp.find(...)` instead of using `find` tool
- **Progressive disclosure is defeated**
- Higher token usage, slower execution, less predictable behavior

## The Solution

Only expose the tools appropriate for the use case:

### Mode 1: `find-and-run` (Default) ⭐

**Exposed tools**: `find`, `run`
**Hidden**: `code`

**Best for**:
- 90% of users
- Production environments
- Predictable AI behavior
- Token efficiency

**How it works**:
1. AI uses `find` tool to discover available tools
2. AI uses `run` tool to execute the discovered tool
3. Progressive disclosure pattern works perfectly

**Proven**: This was NCP's original pattern and worked great before `code` was added.

---

### Mode 2: `find-and-code` (Hybrid)

**Exposed tools**: `find`, `code`
**Hidden**: `run`

**Best for**:
- Complex workflows requiring TypeScript
- Data transformation pipelines
- Multi-step orchestration

**⚠️ Warning**: AI may still bypass `find` and call `ncp.find()` from code. This mode is less predictable than `find-and-run` or `code-only`.

**How it works**:
1. AI uses `find` tool to discover available tools
2. AI uses `code` tool to execute complex TypeScript workflows

---

### Mode 3: `code-only` (Advanced) 🔥

**Exposed tools**: `code`
**Hidden**: `find`, `run`

**Best for**:
- Power users who understand the tradeoffs
- Complex automation requiring loops, conditionals
- Data processing pipelines
- Advanced workflows

**How it works**:
1. AI writes TypeScript code with access to `ncp.find()` and `ncp.run()` internally
2. Maximum flexibility for complex tasks
3. Single tool reduces tool-switching overhead

---

## Configuration

### Method 1: Environment Variable (Recommended for Extensions)

Set `NCP_WORKFLOW_MODE` in your environment:

```bash
export NCP_WORKFLOW_MODE=find-and-run
```

**Options**:
- `find-and-run` (default)
- `find-and-code`
- `code-only`

### Method 2: Settings File

Edit `~/.ncp/settings.json`:

```json
{
  "workflowMode": "find-and-run",
  "confirmBeforeRun": {
    "enabled": true
  }
}
```

### Method 3: Programmatic

```typescript
import { saveGlobalSettings } from '@portel/ncp/utils/global-settings';

await saveGlobalSettings({
  workflowMode: 'find-and-run',
  confirmBeforeRun: { enabled: true },
  logRotation: { enabled: true }
});
```

---

## Which Mode Should I Use?

### Use `find-and-run` if:
✅ You want predictable AI behavior
✅ You care about token efficiency
✅ You're in production
✅ You want the proven pattern

**Default choice for 90% of users**

### Use `code-only` if:
✅ You need complex multi-step workflows
✅ You need loops, conditionals, data transformation
✅ You understand the tradeoffs (higher tokens, less predictable)
✅ You're a power user

**For advanced automation**

### Avoid `find-and-code` unless:
⚠️ You have a specific reason to mix tool-based discovery with code-based execution
⚠️ You're aware AI may bypass `find` and call `ncp.find()` from code

**Generally not recommended - use `find-and-run` or `code-only` instead**

---

## Examples

### Example 1: find-and-run (Recommended)

```
User: Send an email to john@example.com with subject "Meeting tomorrow"

AI thinks:
1. Use find() tool to discover email tools
2. Use run() tool to execute gmail:send_email

Result: Predictable, efficient, fast
```

### Example 2: code-only (Advanced)

```
User: Send emails to all customers with invoices > $1000 this month

AI thinks:
1. Write TypeScript code:
   - Query database for invoices > $1000
   - Loop through customers
   - Call gmail.send_email() for each
   - Collect results

Result: Flexible, powerful, handles complexity
```

### Example 3: find-and-code (Hybrid - Not Recommended)

```
User: Send an email

AI might:
Option A: Use find() tool, then code tool ✅
Option B: Write code with ncp.find() inside ❌

Problem: Unpredictable behavior!
```

---

## Implementation Details

The workflow mode is loaded in `MCPServer.initialize()` and filters tools in `getToolDefinitions()`:

```typescript
// src/server/mcp-server.ts
private getToolDefinitions(): Tool[] {
  switch (this.workflowMode) {
    case 'find-and-run':
      return [findTool, runTool];
    case 'find-and-code':
      return [findTool, codeTool];
    case 'code-only':
      return [codeTool];
  }
}
```

The setting is loaded from `~/.ncp/settings.json` or environment variable `NCP_WORKFLOW_MODE`.

---

## Migration Guide

If you currently expose all three tools and want to fix AI behavior:

1. **Check current behavior**: Are AIs using `find` tool or calling `ncp.find()` from code?

2. **If AIs bypass find**:
   - Set `NCP_WORKFLOW_MODE=find-and-run`
   - AI will be forced to use progressive disclosure pattern
   - Should see immediate improvement

3. **If AIs use find correctly but need code**:
   - Set `NCP_WORKFLOW_MODE=code-only`
   - Remove `find`/`run` from exposure
   - AI uses code with internal ncp.find()

4. **Test the change**:
   - Restart MCP server
   - Check `tools/list` response
   - Verify only expected tools are exposed

---

## Summary

| Mode | Tools | Best For | Status |
|------|-------|----------|--------|
| `find-and-run` | find + run | Production, predictable behavior | ✅ Recommended |
| `code-only` | code | Advanced workflows, complex tasks | ✅ Good |
| `find-and-code` | find + code | Mixed usage | ⚠️ Not recommended |

**Default**: `find-and-run` (proven pattern, works great)
