# NCP 2.3.0 - Major Features Guide

**Released:** March 6, 2026
**Version:** 2.3.0
**Status:** Stable - Production Ready

## 🎯 What's New in 2.3.0

NCP 2.3.0 activates powerful features from photon-core 2.9.4 without building custom infrastructure. Five major capabilities enable automation, persistence, and cross-process coordination.

---

## 📚 Feature Documentation

### 1. **Code-to-Photon Workflow** 🚀
**Transform code executions into reusable tools**

Write code once, save it, use it forever. Execute TypeScript code, get a runId, convert to a Photon, and it's immediately available as a discoverable tool.

**Quick start:**
```typescript
// Step 1: Execute code
const result = await code.run({
  code: "const repos = await github.search_repos({...});"
});
// Returns: runId = "20260306_abc123..."

// Step 2: Save as Photon
await code.save_as_photon({
  runId: "20260306_abc123...",
  photonName: "github-trending",
  description: "Find trending GitHub repos"
});

// Step 3: Use forever
const trending = await github_trending.run({});
```

**Read:** [Code-to-Photon Guide](./features/CODE_TO_PHOTON.md)

**New tools:**
- `code:list-runs` — List recent execution runs
- `code:get-run` — Inspect specific run details
- `code:save-as-photon` — Convert code to reusable Photon

---

### 2. **Stateful Execution & Checkpoints** 💾
**Track executions with persistent logs and resumable checkpoints**

Every code execution generates a runId and StateLog at `~/.photon/runs/{runId}.jsonl`. Photons can implement `getState()`/`setState()` to persist data across sessions.

**How it works:**
```typescript
export default class CounterPhoton extends Photon {
  private state = { count: 0 };

  // Auto-called after execution
  getState() { return this.state; }

  // Auto-called on load
  setState(newState) { this.state = newState; }

  async run(params) {
    this.state.count++;  // Persists across sessions!
    return { count: this.state.count };
  }
}
```

**Benefits:**
- State saved automatically after each execution
- Restored on Photon load
- Enables audit trails and resumability
- Foundation for checkpoint/resume workflows

**Read:** [Stateful Execution Guide](./features/STATEFUL_EXECUTION.md)

---

### 3. **Daemon Integration & Events** 🔄
**Cross-process event routing when photon daemon is running**

Photons can emit and subscribe to events. When daemon is running, events route cross-process via DaemonBroker (Unix socket). When daemon not running, automatic fallback to local-only (NoOpBroker).

**Publishing events:**
```typescript
export default class DataProcessor extends Photon {
  async run(params) {
    const data = await processData();

    // Emit event (routes cross-process if daemon running)
    await this.emit({
      type: 'data_ready',
      data: { count: data.length }
    });

    return { processed: true };
  }
}
```

**Subscribing to events:**
```typescript
/**
 * @notify-on data_ready
 */
export default class DataListener extends Photon {
  async onNotification(eventType, payload) {
    if (eventType === 'data_ready') {
      console.log(`Data ready: ${payload.count} items`);
    }
  }
}
```

**Zero setup needed:**
- No configuration
- Works automatically if daemon running
- Graceful fallback if daemon not running
- Same API both ways

**Read:** [Daemon Integration Guide](./features/DAEMON_INTEGRATION.md)

---

### 4. **PhotonWatcher File Monitoring** 👁️
**Replaced chokidar with battle-tested PhotonWatcher**

Automatic hot-reload of `.photon.ts` files with improved edge case handling:
- ✅ Symlink resolution (macOS)
- ✅ Debouncing (prevents reload storms)
- ✅ Temp file filtering (`.swp`, `.bak`, etc.)
- ✅ Inode tracking (in-place edits)

**Workflow:**
```
1. Edit ~/.ncp/photons/my-tool.photon.ts
2. Save file
3. PhotonWatcher detects instantly
4. NCP reloads automatically
5. Tool available immediately
```

No manual restart needed!

---

### 5. **MCP Apps Protocol Support** 📱
**Groundwork for MCP Apps capabilities**

NCP 2.3.0 detects MCP Apps capabilities and prepares for future UI component support. This enables:
- Rich UI components in tool results
- Interactive parameter handling
- Cross-client visual consistency

---

## 🚀 Quick Start Examples

### Example 1: Email Digest Automation

```typescript
// Write and test your email digest code
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

// ↓ Get runId from response
// ↓ Save as Photon

await code.save_as_photon({
  runId: "20260306_abc123xyz",
  photonName: "daily-email-digest",
  description: "Generate digest of important unread emails"
});

// ↓ Schedule it
await schedule.create({
  name: "daily-digest",
  schedule: "0 8 * * *",  // 8 AM daily
  tool: "daily-email-digest:run",
  parameters: {}
});
```

### Example 2: Stateful Counter

```typescript
// Create a Photon with state
export default class SessionCounter extends Photon {
  private state = { sessions: 0, lastSession: null };

  getState() { return this.state; }
  setState(newState) { this.state = newState; }

  async run(params) {
    this.state.sessions++;
    this.state.lastSession = new Date().toISOString();
    return {
      sessions: this.state.sessions,
      lastSession: this.state.lastSession
    };
  }
}

// Session 1: Run 3 times → count: 1, 2, 3
// Session 2: Run 2 times → count: 4, 5 (state restored!)
// Persists automatically
```

### Example 3: Event-Driven Pipeline

```typescript
// Photon A: Fetches data
export default class DataFetcher extends Photon {
  async run(params) {
    const data = await fetchData();
    await this.emit({ type: 'data_ready', data: { count: data.length } });
    return { fetched: true };
  }
}

// Photon B: Processes data
/**
 * @notify-on data_ready
 */
export default class DataProcessor extends Photon {
  async onNotification(eventType, payload) {
    if (eventType === 'data_ready') {
      console.log(`Processing ${payload.count} items`);
      // Auto-triggered when Photon A emits event
    }
  }
}

// Start daemon (cross-process event routing)
// photon daemon

// Photons coordinate automatically
```

---

## 📊 Feature Matrix

| Feature | Status | Use Case | Setup |
|---------|--------|----------|-------|
| Code-to-Photon | ✅ Stable | Convert code to tools | Auto |
| Stateful Execution | ✅ Stable | Persistent state & audit trails | Auto |
| Event Routing | ✅ Stable | Cross-process coordination | Optional (daemon) |
| PhotonWatcher | ✅ Stable | Auto hot-reload | Auto |
| MCP Apps | ✅ Foundation | Future UI components | Auto |

---

## 🔧 Implementation Details

### How Features Work Together

```
Code Mode
  ├─ Execute code → generates runId
  ├─ Log to StateLog → JSONL at ~/.photon/runs/
  ├─ Save as Photon → convert runId to .photon.ts
  │
  └─ Photon
      ├─ Auto-detects getState()/setState()
      ├─ Persists state → ~/.photon/state/{name}/
      ├─ Can emit events
      ├─ Auto-watched by PhotonWatcher
      │
      └─ If daemon running
          ├─ Events route cross-process
          ├─ Other Photons subscribe
          └─ Full coordination possible
```

### Technology Stack

- **PhotonWatcher** — from photon-core 2.9.4
- **StateLog** — from photon-core 2.9.4
- **InstanceStore** — from photon-core 2.9.4
- **DaemonBroker** — from photon-core 2.9.4 channels
- **MCP Apps** — capability detection ready

---

## 📖 Documentation Map

1. **Code-to-Photon** → [Detailed guide](./features/CODE_TO_PHOTON.md)
   - Quick start
   - Workflow examples
   - Best practices
   - Troubleshooting

2. **Stateful Execution** → [Detailed guide](./features/STATEFUL_EXECUTION.md)
   - How it works
   - State persistence
   - Checkpoint/resume pattern
   - Storage details

3. **Daemon Integration** → [Detailed guide](./features/DAEMON_INTEGRATION.md)
   - Event publishing & subscribing
   - Setting up daemon
   - Cross-process coordination
   - Graceful fallback

---

## 🎓 Learning Path

**Start here:**
1. Read this overview (you are here)
2. Try `code:run` and `code:save-as-photon`
3. Create a Photon with `getState()`/`setState()`

**Then explore:**
4. Check Code-to-Photon examples
5. Set up `photon daemon` for events
6. Subscribe to events in your Photons

**Master:**
7. Build event-driven pipelines
8. Implement checkpoint/resume patterns
9. Combine multiple Photons with events

---

## ✨ What's Next

### 2.4.0 Roadmap
- Auto-UI generation for tool results
- Visual component support in MCP Apps
- Enhanced code analysis and security

### 3.0.0 Vision
- Full MCP Apps integration
- Visual workflow builder
- Photon marketplace ecosystem

---

## 🐛 Troubleshooting

### Common Issues

**Q: Code executed but `save-as-photon` fails**
A: The runId might have expired. Use `code:list-runs` to get a current runId.

**Q: Photon state not persisting**
A: Make sure your Photon implements `getState()` and `setState()` methods.

**Q: Events not delivering cross-process**
A: Start daemon first: `photon daemon` in another terminal.

**Q: Photon not reloading after edit**
A: NCP has PhotonWatcher running. If it's not detecting changes, restart NCP.

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/portel-dev/ncp/issues)
- **Discussions:** [GitHub Discussions](https://github.com/portel-dev/ncp/discussions)
- **Documentation:** [NCP Docs](https://github.com/portel-dev/ncp/tree/main/docs)

---

## 🏆 Credits

Features powered by **photon-core 2.9.4** from Portel:
- PhotonWatcher - battle-tested file monitoring
- StateLog - comprehensive execution tracking
- InstanceStore - state persistence
- DaemonBroker - cross-process events
- MCP Apps protocol support

---

## 📋 Changelog

See [CHANGELOG.md](../../CHANGELOG.md) for complete version history.

**2.3.0 Highlights:**
- ✨ Code-to-Photon workflow
- ✨ Stateful execution with StateLog
- ✨ PhotonWatcher for hot reload
- ✨ DaemonBroker for cross-process events
- ✨ InstanceStore for state persistence
- ✨ MCP Apps capability foundation
