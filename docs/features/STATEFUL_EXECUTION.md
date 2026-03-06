# Stateful Execution & Checkpoint/Resume

**Version:** 2.3.0+
**Status:** Available - Production Ready

## Overview

NCP tracks code executions with StateLog, enabling:
- **Resumable workflows** - Long operations survive interruptions
- **Audit trails** - Complete history of execution at `~/.photon/runs/`
- **Code-to-Photon conversion** - Successful code becomes tools
- **State persistence** - Photons remember data across sessions

---

## How It Works

### Execution Tracking

Every code execution:

1. **Generates runId** - Unique identifier (e.g., `20260306_abc123xyz`)
2. **Logs start event** - Records code and parameters
3. **Executes code** - Your TypeScript runs
4. **Logs result/error** - Records outcome
5. **Persists to disk** - JSONL file at `~/.photon/runs/{runId}.jsonl`

### JSONL Format

Each run is stored as append-only JSONL:

```jsonl
{"type":"start","tool":"code","params":{"code":"const x = 42;..."},"timestamp":"2026-03-06T10:30:00Z"}
{"type":"return","value":42,"timestamp":"2026-03-06T10:30:01Z"}
```

**Structure:**
```
~/.photon/runs/
├── 20260306_abc123xyz.jsonl
├── 20260305_def456uvw.jsonl
└── 20260304_ghi789rst.jsonl
```

---

## Photon State Persistence

### Saving State After Execution

After a Photon tool runs successfully, NCP automatically:

1. Checks if Photon implements `getState()`
2. Calls `state = photon.getState()`
3. Saves to `~/.photon/state/{photonName}/default`

### Restoring State on Load

When a Photon is loaded:

1. NCP creates InstanceStore for the Photon
2. Attempts to load saved state from `~/.photon/state/{photonName}/default`
3. If found, calls `photon.setState(savedState)`
4. Photon resumes with previous state

### Example: Counter Photon

```typescript
export default class CounterPhoton extends Photon {
  private state = { count: 0, lastRun: null };

  // Called after each execution to save state
  getState() {
    return this.state;
  }

  // Called on load to restore state
  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  async run(params) {
    // Count persists across executions!
    this.state.count++;
    this.state.lastRun = new Date().toISOString();

    return {
      count: this.state.count,
      lastRun: this.state.lastRun
    };
  }
}
```

**Execution sequence:**

```
Session 1:
  Load photon → state = { count: 0 }
  Run 1 → count: 1, save state
  Run 2 → count: 2, save state
  Exit

Session 2:
  Load photon → restore state → count: 2
  Run 3 → count: 3, save state
  Run 4 → count: 4, save state
```

---

## Run Information Access

### List Recent Runs

```typescript
const runs = await code.list_runs({ limit: 10 });
```

**Response:**
```json
{
  "runs": [
    {
      "runId": "20260306_abc123xyz",
      "startedAt": "2026-03-06T10:30:00Z",
      "completedAt": "2026-03-06T10:30:05Z",
      "status": "completed"
    },
    {
      "runId": "20260305_def456uvw",
      "startedAt": "2026-03-05T14:15:00Z",
      "completedAt": "2026-03-05T14:15:03Z",
      "status": "completed"
    }
  ]
}
```

### Get Run Details

```typescript
const run = await code.get_run({ runId: "20260306_abc123xyz" });
```

**Response:**
```json
{
  "runId": "20260306_abc123xyz",
  "tool": "code",
  "params": {
    "code": "const repos = await github.search_repos({...});"
  },
  "startedAt": "2026-03-06T10:30:00Z",
  "completedAt": "2026-03-06T10:30:05Z",
  "status": "completed"
}
```

---

## Checkpoint/Resume Pattern

### For Photons: Implementing Checkpoints

The `maybeStatefulExecute` function from photon-core enables checkpoint-based resumability:

```typescript
import { maybeStatefulExecute } from '@portel/photon-core';

export default class LongRunningPhoton extends Photon {
  async *run(params) {
    // Yield checkpoint after side effects
    yield { checkpoint: { step: 1 } };

    const data = await fetch('https://api.example.com/large-data');

    // Checkpoint before returning (enables resume)
    yield { checkpoint: { step: 2, data } };

    return { status: 'completed', data };
  }
}
```

**How it works:**
1. User pauses execution → checkpoint logged
2. NCP resumes from checkpoint → no re-execution of completed steps
3. Daemon restart? → Resumes from last checkpoint automatically

### For Code Mode: Implicit Logging

`code:run` automatically:
- Logs execution start with code
- Logs final result or error
- Returns `runId` for conversion

No explicit checkpoint API needed - your code just runs normally.

---

## Daemon Integration with Events

### Publishing Events

When photon daemon is running, Photons can emit events:

```typescript
export default class NotificationPhoton extends Photon {
  async run(params) {
    const result = await processData(params);

    // Emit event for other Photons
    await this.emit({
      type: 'data_processed',
      data: { count: result.length, timestamp: new Date() }
    });

    return result;
  }
}
```

### Subscribing to Events

Photons can listen for events (auto-subscribed if declared):

```typescript
export default class ListenerPhoton extends Photon {
  /**
   * @notify-on data_processed
   */
  async onNotification(eventType, payload) {
    if (eventType === 'data_processed') {
      console.log(`Data processing complete: ${payload.count} items`);
      // React to event
    }
  }
}
```

### Cross-Process Communication

When daemon is running:
- Events published by one Photon
- Routed through daemon's DaemonBroker (Unix socket)
- Delivered to other Photons in different processes
- Zero latency, no polling

When daemon not running:
- Events stay local (NoOpBroker)
- Same API, graceful degradation

---

## Best Practices

### ✅ Checkpoints After Side Effects

```typescript
// Good - checkpoint after external operation
const result = await api.create({ data });
yield { checkpoint: { created: result.id } };

const processed = await processResult(result);
yield { checkpoint: { processed: processed } };

return processed;
```

### ✅ Descriptive State Objects

```typescript
// Good - clear state structure
private state = {
  processedItems: 0,
  lastProcessedId: null,
  lastRun: null,
  errors: []
};
```

### ✅ Test State Restoration

```typescript
// Simulate state persistence
const photon = new MyPhoton();
const state1 = photon.getState();

photon.setState({ count: 10 });
const state2 = photon.getState();

assert(state2.count === 10);  // Verify restore works
```

### ❌ Don't Store Secrets in State

```typescript
// Bad - credentials in state
private state = {
  apiKey: 'sk-123456',  // ← Don't do this!
  tokens: []
};

// Good - use credentials from params/config
async run(params) {
  const apiKey = params.apiKey;  // Pass in each time
  // ... use apiKey
}
```

### ❌ Don't Assume Resume Always Happens

```typescript
// Bad - assumes checkpoint/resume always works
private state = { processedAll: false };

// Good - handle both fresh and resumed execution
private state = {
  processedAll: false,
  batchSize: 100,
  currentIndex: 0
};
```

---

## Storage Details

### Run Logs Location

```
~/.photon/runs/
├── {runId}.jsonl        # JSONL format, append-only
└── ...
```

**Example log file:**
```jsonl
{"type":"start","tool":"code","params":{"code":"return 42;"},"timestamp":"2026-03-06T10:30:00Z"}
{"type":"return","value":42,"timestamp":"2026-03-06T10:30:01Z"}
```

### Photon State Location

```
~/.photon/state/
└── {photonName}/
    ├── default          # Current state (JSON)
    └── backups/         # Optional: previous versions
```

**Example state file:**
```json
{
  "count": 42,
  "lastRun": "2026-03-06T10:30:00Z",
  "processedItems": ["item1", "item2"]
}
```

### Cleanup

Old runs can be deleted:

```typescript
// Delete specific run
await code.delete_run({ runId: "20260301_abc123xyz" });

// Or manually
rm ~/.photon/runs/{runId}.jsonl
```

---

## Troubleshooting

### State not persisting

**Problem:** Photon state resets each execution

**Check:**
1. Does Photon implement `getState()` and `setState()`?
2. Is state object actually changing?
3. Is NCP unable to write to `~/.photon/state/`?

**Solution:**
```typescript
export default class MyPhoton extends Photon {
  private state = { count: 0 };

  // MUST implement these
  getState() { return this.state; }
  setState(newState) { this.state = newState; }

  async run(params) {
    this.state.count++;
    return this.state;
  }
}
```

### Runs not being logged

**Problem:** `code:list-runs` returns empty

**Check:**
1. Is `~/.photon/runs/` directory writable?
2. Did code execution complete successfully?
3. Is NCP version 2.3.0+?

**Solution:**
```bash
# Verify directory exists
mkdir -p ~/.photon/runs

# Check permissions
ls -la ~/.photon/runs/

# Verify NCP version
ncp --version  # Should be 2.3.0 or higher
```

### Daemon events not delivering

**Problem:** Events emitted but not received

**Check:**
1. Is `photon daemon` running?
2. Do Photons declare `@notify-on` annotation?
3. Event type matches subscription?

**Solution:**
```bash
# Start daemon in separate terminal
photon daemon

# Or use Beam
photon beam
```

---

## Performance Considerations

### Run Log Size

Each execution adds to JSONL:
- Simple execution: ~200 bytes
- Complex result: ~1-10 KB
- Old files archived: Automatic cleanup available

### State File Size

State stored as single JSON file:
- Keep state lean (avoid huge arrays)
- Large state = slower restore

**Example:**
```typescript
// Good - compact state
private state = {
  lastId: 42,
  timestamp: "...",
  count: 100
};

// Bad - huge state
private state = {
  allProcessedItems: [/* 10,000+ items */]
};
```

---

## See Also

- [Code-to-Photon](./CODE_TO_PHOTON.md) - Convert code to reusable tools
- [Photon Runtime](../PHOTON_RUNTIME.md) - Custom TypeScript MCPs
- [NCP Ecosystem Roadmap](../NCP_ECOSYSTEM_ROADMAP.md) - Daemon architecture
