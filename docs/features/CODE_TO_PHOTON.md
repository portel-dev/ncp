# Code-to-Photon: Workflow Automation Made Permanent

**Version:** 2.3.0+
**Status:** Available - Production Ready

## Overview

The Code-to-Photon workflow transforms your one-time code executions into reusable, discoverable Photon tools. Write code once, save it, and reuse it infinitely.

### Problem This Solves

- **Repetitive Code:** Write the same automation multiple times
- **Tool Proliferation:** Creates custom tools without npm publishing
- **Workflow Capture:** Convert successful executions into permanent tools
- **Team Knowledge:** Share automated workflows as Photons with your team

### Solution: Executable Code Becomes a Tool

```
Write Code → Execute → Success! → Save as Photon → Use Forever
                                        ↓
                         Available in future workflows
```

---

## Quick Start: Code → Photon in 3 Steps

### Step 1: Write & Execute Code

Use `code:run` to execute your automation:

```typescript
// Find trending GitHub repos
const repos = await github.search_repos({
  query: 'stars:>10000 language:javascript',
  sort: 'stars',
  order: 'desc'
});

return repos.map(r => ({
  name: r.name,
  stars: r.stargazers_count,
  url: r.html_url
}));
```

**Response:**
```json
{
  "result": [
    { "name": "react", "stars": 203000, "url": "..." },
    { "name": "vue", "stars": 207000, "url": "..." }
  ],
  "logs": ["Searched GitHub API..."],
  "runId": "20260306_abc123xyz"  // ← Save this!
}
```

### Step 2: Save as Photon

Once your code works, convert it to a reusable Photon:

```typescript
const saved = await code.save_as_photon({
  runId: "20260306_abc123xyz",
  photonName: "github-trending",
  description: "Find trending GitHub repos by stars"
});
```

**Result:**
```json
{
  "success": true,
  "photonPath": "/Users/you/.ncp/photons/github-trending.photon.ts",
  "message": "Photon saved to /Users/you/.ncp/photons/github-trending.photon.ts. Available as 'github-trending' after restart."
}
```

### Step 3: Use as a Tool

Restart NCP and your Photon is immediately available:

```typescript
// Now 'github-trending' is discoverable
const trending = await github_trending.run({});

// Or through code:
const results = await find({ description: "trending repos" });
// → includes github-trending tool
```

---

## Complete Workflow Examples

### Example 1: Email Digest Generator

**Initial execution:**
```typescript
const emails = await gmail.list_messages({
  query: 'is:unread label:Important',
  limit: 10
});

const summary = emails.map(e => ({
  from: e.from,
  subject: e.subject,
  preview: e.snippet
}));

return {
  count: emails.length,
  emails: summary,
  timestamp: new Date().toISOString()
};
```

**Save as Photon:**
```typescript
await code.save_as_photon({
  runId: "run123",
  photonName: "daily-email-digest",
  description: "Generate digest of important unread emails"
});
```

**Now reuse it:**
```typescript
// Schedule it
await schedule.create({
  name: "daily-digest",
  schedule: "0 8 * * *",  // 8 AM daily
  tool: "daily-email-digest:run",
  parameters: {}
});

// Or call manually
const digest = await daily_email_digest.run({});
```

### Example 2: Multi-Tool Orchestration

**Initial code:**
```typescript
// Get GitHub stats
const ghStats = await github.get_user({ username: 'anthropics' });

// Get recent tweets
const tweets = await twitter.search({
  query: 'Anthropic',
  count: 5
});

// Save to spreadsheet
const result = await sheets.append_rows({
  spreadsheet_id: "...",
  range: "Sheet1",
  values: [[
    ghStats.public_repos,
    tweets.length,
    new Date().toISOString()
  ]]
});

return { status: 'saved', ghRepos: ghStats.public_repos, tweets: tweets.length };
```

**Save as Photon:**
```typescript
await code.save_as_photon({
  runId: "run456",
  photonName: "anthropic-metrics",
  description: "Track Anthropic GitHub and Twitter metrics in spreadsheet"
});
```

**Schedule it:**
```typescript
await schedule.create({
  name: "weekly-metrics",
  schedule: "0 9 * * 1",  // Monday 9 AM
  tool: "anthropic-metrics:run",
  parameters: {}
});
```

---

## Code Execution State & Resumability

### Understanding Runs

Every code execution creates a **run** with:
- **runId:** Unique identifier (e.g., `20260306_abc123xyz`)
- **Code:** Your TypeScript source code
- **Start time:** When execution began
- **Result:** Output value (if successful)
- **Error:** Error message (if failed)
- **Logs:** Console output during execution

### Listing Runs

See recent executions:

```typescript
const runs = await code.list_runs({ limit: 10 });

// Returns:
// [
//   { runId: "20260306_abc123xyz", startedAt: "...", status: "completed" },
//   { runId: "20260306_def456uvw", startedAt: "...", status: "completed" },
//   ...
// ]
```

### Inspecting Run Details

Get full execution information:

```typescript
const run = await code.get_run({
  runId: "20260306_abc123xyz"
});

// Returns:
// {
//   "runId": "20260306_abc123xyz",
//   "tool": "code",
//   "params": { "code": "const repos = await github..." },
//   "startedAt": "2026-03-06T10:30:00Z",
//   "completedAt": "2026-03-06T10:30:05Z",
//   "status": "completed"
// }
```

---

## Best Practices

### ✅ Do

**Make code idempotent:**
```typescript
// Good - same result on retry
const config = await settings.get_config({ key: 'user' });
await settings.update_config({ key: 'user', value: newValue });
```

**Log intermediate steps:**
```typescript
console.log('Starting GitHub search...');
const repos = await github.search_repos({ ... });
console.log(`Found ${repos.length} repos`);
```

**Return structured data:**
```typescript
return {
  success: true,
  count: items.length,
  items: items,
  timestamp: new Date().toISOString()
};
```

**Test before saving:**
```typescript
// Run multiple times to ensure consistency
const result1 = await code.run({ code: "return 42;" });
const result2 = await code.run({ code: "return 42;" });
// Both should be identical

// Then save
await code.save_as_photon({ runId, photonName, description });
```

### ❌ Don't

**Store secrets in code:**
```typescript
// Bad - credentials in code
const auth = "sk-1234567890abcdef";
```

**Use hardcoded paths:**
```typescript
// Bad - won't work on other machines
const file = "/Users/john/documents/file.txt";

// Good - use API parameters
const file = params.filePath;
```

**Rely on timing:**
```typescript
// Bad - race condition
await api.create({ ... });
setTimeout(() => { /* ... */ }, 100);  // Too fragile!

// Good - poll or use callbacks
const result = await api.create({ ... });
while (!result.ready) {
  await new Promise(r => setTimeout(r, 100));
  result = await api.get({ id: result.id });
}
```

---

## State Persistence with InstanceStore

Photons can maintain state across executions:

```typescript
export default class MyPhoton extends Photon {
  private state = { count: 0, lastRun: null };

  getState() {
    return this.state;
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  async run(params) {
    // State is automatically restored from previous execution
    this.state.count++;
    this.state.lastRun = new Date();

    return {
      runCount: this.state.count,
      lastRun: this.state.lastRun
    };
  }
}
```

**How it works:**
1. First execution: Creates initial state
2. NCP calls `getState()` and saves to `~/.photon/state/{photonName}/`
3. Next execution: NCP calls `setState()` with saved state
4. Your Photon resumes with previous state intact

---

## Integration with Daemon

When photon daemon is running (`photon daemon` or `photon beam`):

**Event Routing:**
```typescript
// Your Photon emits event
await this.emit({
  type: 'metrics_updated',
  data: { count: 42, timestamp: new Date() }
});

// Another Photon subscribes
async onNotification(eventType, payload) {
  if (eventType === 'metrics_updated') {
    console.log(`Metrics updated: ${payload.count}`);
  }
}
```

**Cross-Process Communication:**
- Events flow through daemon's DaemonBroker
- Photons in different processes can coordinate
- When daemon not running: fallback to NoOpBroker (local-only events)

---

## Troubleshooting

### "Save-as-Photon failed: Run not found"

**Cause:** The runId doesn't exist or expired
**Solution:** Use `code:list-runs` to find valid runId, then try again

```typescript
const runs = await code.list_runs({ limit: 20 });
const validRunId = runs[0].runId;  // Use most recent
await code.save_as_photon({ runId: validRunId, ... });
```

### "Photon not appearing after save"

**Cause:** NCP needs to reload Photons
**Solution:** Restart NCP or toggle Photon runtime in settings

```bash
# Option 1: Restart NCP
ncp list  # Forces fresh load

# Option 2: Or in Claude Desktop settings
# Toggle: NCP → Settings → Enable Photon Runtime (toggle off/on)
```

### "State not persisting across runs"

**Cause:** Photon missing `getState()` / `setState()` methods
**Solution:** Implement state methods:

```typescript
export default class MyPhoton extends Photon {
  private state = { /* initial state */ };

  getState() { return this.state; }
  setState(newState) { this.state = { ...this.state, ...newState }; }

  async run(params) { /* ... */ }
}
```

### "DaemonBroker events not routing"

**Cause:** Photon daemon not running
**Solution:** Start the daemon:

```bash
# In another terminal
photon daemon

# Or use Beam
photon beam
```

---

## API Reference

### code:run

Execute TypeScript code with MCP access.

```typescript
const result = await code.run({
  code: "string",        // Required: TypeScript code
  timeout: 30000         // Optional: ms (default 30000, max 300000)
});

// Returns:
{
  result: any,           // Execution result
  logs: string[],        // Console output
  runId: string,         // Unique run identifier
  error?: string         // Error message if failed
}
```

### code:list-runs

List recent code execution runs.

```typescript
const runs = await code.list_runs({
  limit: 10              // Optional: max results (default 10)
});

// Returns:
{
  runs: [
    {
      runId: string,
      startedAt: string,
      completedAt: string,
      status: string
    },
    ...
  ]
}
```

### code:get-run

Get details of a specific run.

```typescript
const run = await code.get_run({
  runId: string          // Required: run identifier
});

// Returns:
{
  runId: string,
  tool: string,
  params: object,        // Original parameters
  startedAt: string,
  completedAt: string,
  status: string
}
```

### code:save-as-photon

Convert code execution into reusable Photon.

```typescript
const result = await code.save_as_photon({
  runId: string,         // Required: run ID to convert
  photonName: string,    // Required: tool name (kebab-case)
  description: string    // Required: what this tool does
});

// Returns:
{
  success: boolean,
  photonPath: string,    // Path to created .photon.ts file
  photonName: string,
  message: string
}
```

---

## See Also

- [Photon Runtime](../PHOTON_RUNTIME.md) - Custom TypeScript MCPs
- [Code Mode](../CODE_MODE.md) - Safe code execution
- [Scheduling](../SCHEDULER_USER_GUIDE.md) - Run Photons on schedule
- [Daemon Architecture](../NCP_ECOSYSTEM_ROADMAP.md) - Cross-process events
