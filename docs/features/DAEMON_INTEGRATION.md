# Daemon Integration & Cross-Process Events

**Version:** 2.3.0+
**Status:** Available - Production Ready

## Overview

NCP 2.3.0 integrates with the photon daemon for:
- **Cross-process event routing** - Photons in different processes coordinate
- **Event distribution** - Events flow through DaemonBroker (Unix socket)
- **Graceful fallback** - Local-only mode when daemon not running
- **Zero setup overhead** - Works automatically, no configuration needed

---

## Architecture

### Without Daemon (Local-Only)

```
NCP Process
├── Photon A → emits event
├── Photon B → subscribes
└── Event routed locally (NoOpBroker)
```

**Limitation:** Events only work within single process

### With Daemon (Cross-Process)

```
Photon Daemon
│
├── Unix Socket
│   │
│   ├── NCP Process 1
│   │   ├── Photon A → emits event
│   │   └── Photon C (no subscription)
│   │
│   └── NCP Process 2
│       ├── Photon B → subscribes
│       └── Receives event from Photon A
```

**Benefit:** Events flow across processes transparently

---

## Using Cross-Process Events

### Publishing Events

Any Photon can emit events:

```typescript
export default class DataProcessor extends Photon {
  async run(params) {
    const data = await fetchData();

    // Emit event (goes to daemon if running, local if not)
    await this.emit({
      type: 'data_ready',
      data: {
        count: data.length,
        timestamp: new Date().toISOString()
      }
    });

    return { processed: true };
  }
}
```

### Subscribing to Events

Declare subscriptions with `@notify-on` annotation:

```typescript
/**
 * Photon that listens for data_ready events
 * @notify-on data_ready,file_updated
 */
export default class DataListener extends Photon {
  async onNotification(eventType, payload) {
    if (eventType === 'data_ready') {
      console.log(`Data ready: ${payload.count} items`);
      // React to event
    }
  }
}
```

### How It Works

1. **Photon declares subscription** via `@notify-on` tag
2. **NCP loads Photon** and registers subscription
3. **Another Photon emits event** via `this.emit()`
4. **NCP dispatches locally** to subscribed Photons
5. **NCP publishes to daemon** for cross-process delivery
6. **Daemon routes to other processes** via DaemonBroker
7. **Remote Photons receive** via `onNotification()`

---

## Setting Up Photon Daemon

### Option 1: Separate Daemon Process

```bash
# Terminal 1: Start daemon
photon daemon

# Terminal 2: NCP uses it automatically
ncp find "search query"
```

### Option 2: Beam UI (includes daemon)

```bash
# Starts photon daemon internally
photon beam
```

### Verification

Check if daemon is running:

```bash
# If daemon running: events will be cross-process
# If daemon not running: events stay local (NoOpBroker fallback)

# No configuration needed - works automatically!
```

---

## Event Publishing Examples

### Example 1: Data Processing Pipeline

**Processor Photon** - Fetches data:
```typescript
export default class DataFetcher extends Photon {
  async run(params) {
    const data = await fetchFromAPI();

    // Emit event
    await this.emit({
      type: 'data_fetched',
      data: { recordCount: data.length }
    });

    return { fetched: true };
  }
}
```

**Listener Photon** - Reacts to data:
```typescript
/**
 * @notify-on data_fetched
 */
export default class DataImporter extends Photon {
  async onNotification(eventType, payload) {
    if (eventType === 'data_fetched') {
      const { recordCount } = payload;
      console.log(`Importing ${recordCount} records...`);

      // Import data
      await this.importRecords(recordCount);
    }
  }
}
```

**Workflow:**
1. Run `data-fetcher` Photon → emits `data_fetched`
2. Daemon routes event to subscribers
3. `data-importer` receives event → imports data
4. Both Photons coordinate without direct coupling

### Example 2: Metrics Collection

**Stats Photon** - Publishes metrics:
```typescript
export default class MetricsCollector extends Photon {
  async run(params) {
    const metrics = {
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date()
    };

    await this.emit({
      type: 'metrics_collected',
      data: metrics
    });

    return metrics;
  }
}
```

**Monitor Photon** - Tracks metrics:
```typescript
/**
 * @notify-on metrics_collected
 */
export default class MetricsMonitor extends Photon {
  private state = { maxMemory: 0, alerts: [] };

  getState() { return this.state; }
  setState(newState) { this.state = newState; }

  async onNotification(eventType, payload) {
    if (eventType === 'metrics_collected') {
      const { memoryUsage } = payload.data;

      // Track memory
      if (memoryUsage.heapUsed > this.state.maxMemory) {
        this.state.maxMemory = memoryUsage.heapUsed;
        this.state.alerts.push({
          type: 'high_memory',
          value: memoryUsage.heapUsed,
          timestamp: new Date()
        });
      }
    }
  }
}
```

---

## File Watching Improvements

### PhotonWatcher Replacement

NCP 2.3.0 replaces chokidar with `PhotonWatcher` from photon-core:

**Benefits:**
- ✅ Symlink resolution (macOS compatibility)
- ✅ Debouncing built-in (prevents reload storms)
- ✅ Editor temp file filtering (ignores `.swp`, `.bak`, etc.)
- ✅ Inode tracking (handles in-place edits)
- ✅ Battle-tested in production

### Automatic Photon Hot Reload

When you save a `.photon.ts` file:

```
1. File saved → PhotonWatcher detects change
2. File reloaded → New version compiled
3. Index updated → Tool schemas refreshed
4. Available immediately → Next `find` includes new version
```

**Example:**
```bash
# Edit your photon
vim ~/.ncp/photons/my-tool.photon.ts

# Save
# ↓ PhotonWatcher detects immediately
# ↓ NCP reloads
# ↓ Changes available

# Use immediately
ncp find "my tool"  # ← Latest version
```

### No Manual Reload Needed

Before 2.3.0:
```
Edit photon → Restart NCP → Tools available
```

After 2.3.0:
```
Edit photon → Auto-detected → Tools available instantly
```

---

## Graceful Fallback

### When Daemon is Running

```typescript
const broker = getBroker();
// ↓ Returns DaemonBroker
// ↓ Events route cross-process via Unix socket
// ↓ Instant delivery, zero latency
```

### When Daemon is Not Running

```typescript
const broker = getBroker();
// ↓ Returns NoOpBroker
// ↓ Events stay local (same process)
// ↓ Zero overhead, API identical
```

**Key point:** No configuration needed. Same code works both ways.

---

## Best Practices

### ✅ Event Naming

```typescript
// Good - descriptive, scoped
await this.emit({ type: 'data_fetched', data: {...} });
await this.emit({ type: 'file_updated', data: {...} });
await this.emit({ type: 'error_occurred', data: {...} });

// Bad - too generic
await this.emit({ type: 'event', data: {...} });
await this.emit({ type: 'notification', data: {...} });
```

### ✅ Subscribe Only What You Need

```typescript
// Good - specific subscriptions
/**
 * @notify-on data_fetched,file_updated
 */
export default class MyPhoton extends Photon {
  async onNotification(eventType, payload) {
    // Handle only what you declared
  }
}

// Avoid - subscribing to everything
/**
 * @notify-on *
 */
// ↑ Don't do this - wastes resources
```

### ✅ Error Handling in Events

```typescript
async onNotification(eventType, payload) {
  try {
    if (eventType === 'data_ready') {
      // Handle event
      await processData(payload);
    }
  } catch (error) {
    console.error(`Event handler error: ${error.message}`);
    // Don't rethrow - prevent cascade failures
  }
}
```

### ❌ Synchronous Dependencies

```typescript
// Bad - Photon A waits for Photon B's event
// This can deadlock or timeout

// Good - Photons are independent
// Photon A emits event, continues
// Photon B reacts asynchronously
// No coupling
```

### ❌ Large Event Payloads

```typescript
// Bad - huge object
await this.emit({
  type: 'data_ready',
  data: { allRecords: [/* 100,000 items */] }
});

// Good - send references or summaries
await this.emit({
  type: 'data_ready',
  data: {
    recordCount: 100000,
    summaryUrl: 'where to fetch data'
  }
});
```

---

## Troubleshooting

### Events not being delivered

**Problem:** Photon B doesn't receive event from Photon A

**Check:**
1. Is Photon B declaring `@notify-on` annotation?
2. Does event type match subscription?
3. Is daemon running for cross-process events?

**Solution:**
```typescript
// Photon B must declare subscription
/**
 * @notify-on data_ready   // ← Must match event type
 */
export default class MyPhoton extends Photon {
  async onNotification(eventType, payload) {
    // This is called when event emitted
  }
}
```

### Photon hotload not working

**Problem:** Changed `.photon.ts` file but changes don't appear

**Check:**
1. Did you save the file?
2. Is PhotonWatcher running (in NCP logs)?
3. Check file permissions

**Solution:**
```bash
# Force refresh
ncp list  # Reloads all photons

# Or restart NCP
ncp --version  # Triggers load
```

### Daemon not using DaemonBroker

**Problem:** Events staying local even with daemon running

**Check:**
1. Is daemon actually running?
2. Are you starting daemon before NCP?

**Solution:**
```bash
# Terminal 1: Start daemon FIRST
photon daemon

# Terminal 2: Then start NCP (it will find daemon)
ncp find "..."
```

---

## Performance Notes

### Event Routing Speed

**Local events (NoOpBroker):** < 1ms
**Cross-process events (DaemonBroker):** < 5ms (via Unix socket)

### Memory Usage

Events are ephemeral:
- Not persisted (unless you persist in Photon state)
- No accumulation
- Zero overhead when no subscriptions

### Scalability

- Supports unlimited Photons
- Multiple subscribers per event type
- Daemon handles routing at scale

---

## See Also

- [Code-to-Photon](./CODE_TO_PHOTON.md) - Workflow automation
- [Stateful Execution](./STATEFUL_EXECUTION.md) - State persistence
- [Photon Runtime](../PHOTON_RUNTIME.md) - Custom MCPs
- [NCP Ecosystem Roadmap](../NCP_ECOSYSTEM_ROADMAP.md) - Full architecture
