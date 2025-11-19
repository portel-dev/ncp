# Local Network MCPs/Photons

## Problem

With Phase 4 network isolation, the default security policy blocks access to:
- Private IPs (192.168.x.x, 10.x.x.x, 172.16.x.x)
- Localhost (127.0.0.1)

This breaks MCPs that need to communicate with local devices, such as:
- **LG Remote**: Controls LG TV over LAN (http://192.168.1.100:3000)
- **Philips Hue**: Controls smart lights (http://192.168.1.50/api)
- **Home Assistant**: Local home automation (http://homeassistant.local:8123)
- **Local APIs**: Internal microservices, dev servers, etc.

## Solution: Bindings Pattern

MCPs that need local network access should use the **bindings pattern** (Phase 3). Bindings execute in the main thread where they have full Node.js network access.

### Architecture

```
┌─────────────────────────────────────────┐
│         Worker Thread (Sandboxed)        │
│                                          │
│  await fetch('http://192.168.1.1')      │
│  ❌ BLOCKED (network policy)            │
│                                          │
│  await lgRemote.sendCommand('POWER_ON') │
│  ✅ ALLOWED (binding call)              │
│  └─→ Executes in main thread ───────────┼───┐
└──────────────────────────────────────────┘   │
                                               │
┌──────────────────────────────────────────────┼──┐
│         Main Thread (Full Access)            ↓  │
│                                                 │
│  lgRemote.sendCommand() {                      │
│    fetch('http://192.168.1.100:3000/power')   │
│    ✅ Native Node.js fetch - NO restrictions  │
│  }                                             │
└────────────────────────────────────────────────┘
```

### Implementation Example: LG Remote

```typescript
// 1. Create binding with network policy declaration
bindingsManager.createBinding(
  'lgRemote',
  'local-network',  // Type indicates local network access
  ['sendCommand', 'getStatus', 'setVolume'],
  {
    // Network policy declaration (for documentation/permissions)
    allowPrivateIPs: true,
    allowedDomains: [],  // No external domains needed
    maxRequestSize: 1024,
    timeout: 5000
  }
);

// 2. Create authenticated client (executes in main thread)
bindingsManager.createAuthenticatedClient('lgRemote', (credential) => {
  const tvIP = credential.data.custom.tvIP || '192.168.1.100';

  return {
    // Native Node.js fetch - NO network policy restrictions
    sendCommand: async (command: string) => {
      const response = await fetch(`http://${tvIP}:3000/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      return await response.json();
    },

    getStatus: async () => {
      const response = await fetch(`http://${tvIP}:3000/status`);
      return await response.json();
    },

    setVolume: async (level: number) => {
      const response = await fetch(`http://${tvIP}:3000/volume`, {
        method: 'POST',
        body: JSON.stringify({ level })
      });
      return await response.json();
    }
  };
});

// 3. User code (in sandbox) calls binding
const code = `
  // Call binding - executes in main thread with full network access
  const status = await lgRemote.getStatus();
  console.log('TV Power:', status.power);

  if (status.power === 'off') {
    await lgRemote.sendCommand('POWER_ON');
  }

  await lgRemote.setVolume(20);

  // Direct fetch still blocked!
  try {
    await fetch('http://192.168.1.100:3000/status');
  } catch (error) {
    // Error: Network request blocked: Private IP access is not allowed
  }
`;
```

## Security Guarantees

✅ **Worker code cannot bypass network policy**
   - Direct `fetch()` calls are restricted
   - Cannot access private IPs or localhost

✅ **Only approved bindings have local network access**
   - Bindings are created by trusted code (not user)
   - User approves binding during MCP installation

✅ **Binding network access is scoped**
   - Each binding has specific methods
   - Cannot be used to access arbitrary endpoints

✅ **Network policy declaration is auditable**
   - Each binding declares its network needs
   - User can see what network access an MCP requires

## Benefits

1. **Security**: User code in sandbox cannot access local network
2. **Flexibility**: MCPs can access local devices when needed
3. **Transparency**: Network requirements declared upfront
4. **Control**: Only approved bindings have local access

## Other Use Cases

### Philips Hue Binding
```typescript
bindingsManager.createBinding(
  'philipsHue',
  'local-network',
  ['setLight', 'getStatus', 'setScene'],
  { allowPrivateIPs: true }
);

bindingsManager.createAuthenticatedClient('philipsHue', (credential) => ({
  setLight: async (id, state) => {
    await fetch(`http://192.168.1.50/api/${credential.data.apiKey}/lights/${id}/state`, {
      method: 'PUT',
      body: JSON.stringify(state)
    });
  }
}));
```

### Home Assistant Binding
```typescript
bindingsManager.createBinding(
  'homeAssistant',
  'local-network',
  ['callService', 'getState'],
  { allowPrivateIPs: true, allowAllLocalhost: true }
);

bindingsManager.createAuthenticatedClient('homeAssistant', (credential) => ({
  callService: async (domain, service, data) => {
    await fetch(`http://homeassistant.local:8123/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${credential.data.token}` },
      body: JSON.stringify(data)
    });
  }
}));
```

### Development Server Binding
```typescript
bindingsManager.createBinding(
  'devServer',
  'local-network',
  ['getData', 'postData'],
  { allowAllLocalhost: true }
);

bindingsManager.createAuthenticatedClient('devServer', (credential) => ({
  getData: async (endpoint) => {
    const response = await fetch(`http://localhost:3000${endpoint}`);
    return await response.json();
  }
}));
```

## Summary

Local network MCPs/Photons work perfectly with Code-Mode security:
- Use bindings pattern (Phase 3)
- Bindings execute in main thread (full network access)
- Worker code stays restricted (cannot bypass policy)
- Network requirements declared and auditable
- Security maintained, flexibility preserved
