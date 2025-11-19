# Runtime Network Permissions

## Overview

Code-Mode now supports **runtime network permissions via elicitations**. When code tries to access a restricted network (private IPs, localhost), the user is prompted for permission. This makes local network MCPs practical while maintaining security.

## The Problem

Phase 4 network isolation blocks private IPs (192.168.x.x) by default for security. But local network MCPs need access to devices:
- **LG TV** at 192.168.1.100
- **Philips Hue** at 192.168.1.50
- **Home Assistant** at homeassistant.local:8123
- **Dev servers** at localhost:3000

## The Solution

When restricted network access is attempted, show a **permission dialog** asking the user:

```
┌──────────────────────────────────────┐
│  Network Access Permission           │
├──────────────────────────────────────┤
│  LG Remote wants to access           │
│  local network (private IP):         │
│                                      │
│  http://192.168.1.100:3000/power-on │
│                                      │
│  Allow this network access?          │
│                                      │
│  [Allow Once] [Allow Always] [Deny]  │
└──────────────────────────────────────┘
```

User decides:
- **Allow Once**: Permission for 1 hour (temporary)
- **Allow Always**: Permission forever (trusted device)
- **Deny**: Block access

## Real-World Example: LG Remote

### Scenario
User asks: *"Turn on my TV and set volume to 15"*

AI generates code:
```javascript
// Check TV status
const status = await fetch('http://192.168.1.100:3000/status');
const data = await status.json();

// Turn on if off
if (data.power === 'off') {
  await fetch('http://192.168.1.100:3000/power-on', { method: 'POST' });
}

// Set volume
await fetch('http://192.168.1.100:3000/volume', {
  method: 'POST',
  body: JSON.stringify({ level: 15 })
});
```

### What Happens

**First Request** (`/status`):
1. Code tries: `fetch('http://192.168.1.100:3000/status')`
2. NetworkPolicyManager: ❌ Private IP (blocked by default)
3. **Elicitation shown**:
   ```
   Worker Code wants to access local network (private IP):
   http://192.168.1.100:3000/status

   Allow this network access?
   [Allow Once] [Allow Always] [Deny]
   ```
4. User clicks: **[Allow Always]** ← Trust this TV
5. Permission cached permanently
6. Request proceeds → TV returns status

**Second Request** (`/power-on`):
1. Code tries: `fetch('http://192.168.1.100:3000/power-on')`
2. NetworkPolicyManager checks cache: ✅ Approved (same URL)
3. **No prompt** - uses cached permission
4. Request proceeds → TV powers on

**Third Request** (`/volume`):
1. Code tries: `fetch('http://192.168.1.100:3000/volume')`
2. NetworkPolicyManager checks cache: ✅ Approved (same URL)
3. **No prompt** - uses cached permission
4. Request proceeds → Volume set

**Result**: User prompted **once**, subsequent requests work automatically!

## Permission Types

### 1. Allow Once (Temporary)
- **Duration**: 1 hour
- **Use case**: Testing, one-time access, untrusted networks
- **Example**: Accessing a friend's dev server

```
User clicks: [Allow Once]
└→ Permission expires after 1 hour
└→ Next request after expiry: shows prompt again
```

### 2. Allow Always (Permanent)
- **Duration**: Forever (until manually revoked)
- **Use case**: Trusted devices, home network, local development
- **Example**: Your LG TV, Philips Hue, Home Assistant

```
User clicks: [Allow Always]
└→ Permission cached permanently
└→ All future requests: automatic (no prompts)
└→ Can revoke anytime via networkPolicy.revokePermission()
```

### 3. Deny (Block)
- **Duration**: Blocked permanently
- **Result**: Request fails with error
- **Example**: Suspicious or unauthorized access

```
User clicks: [Deny]
└→ Request blocked
└→ Error: "Network request blocked: User denied permission"
```

## Permission Management

### List Permissions
```javascript
const permissions = networkPolicyManager.getPermissions();

// Output:
[
  {
    url: 'http://192.168.1.100:3000/status',
    approved: true,
    permanent: true  // "Allow Always"
  },
  {
    url: 'http://localhost:3000/api',
    approved: true,
    permanent: false  // "Allow Once" (expires in 1h)
  }
]
```

### Revoke Permission
```javascript
// Revoke specific URL
networkPolicyManager.revokePermission('http://192.168.1.100:3000/status');

// Next request to that URL: shows prompt again
```

### Clear All Permissions
```javascript
// Clear all cached permissions
networkPolicyManager.clearPermissions();

// All future restricted requests: show prompts
```

## Implementation

### Setup (Main Thread)

```javascript
import { NetworkPolicyManager, SECURE_NETWORK_POLICY } from './network-policy.js';
import { CodeExecutor } from './code-executor.js';

// Create elicitation function
const elicitationFunction = async (params) => {
  // If client supports elicitations (Claude Desktop)
  if (supportsElicitations) {
    return await showUIElicitation(params);
  }

  // Fallback to system dialog
  return await showSystemDialog(params);
};

// Create network policy with elicitations
const networkPolicy = new NetworkPolicyManager(
  SECURE_NETWORK_POLICY,  // Default: block private IPs
  elicitationFunction     // Show permission prompts
);

// Create code executor
const executor = new CodeExecutor(
  toolsProvider,
  toolExecutor,
  undefined,
  bindingsManager,
  networkPolicy  // With elicitation support
);
```

### User Code (Sandbox)

```javascript
// User code - no changes needed!
const response = await fetch('http://192.168.1.100:3000/status');

// First time: permission prompt shown
// Second time: uses cached permission
```

## Security Guarantees

✅ **User sees exactly what's being accessed**
   - Full URL shown in elicitation
   - Access type clearly labeled (localhost, private IP, etc.)

✅ **User controls all network access**
   - Every restricted access requires approval
   - Can deny suspicious requests

✅ **Principle of least privilege**
   - Only approved URLs work
   - Can revoke permissions anytime

✅ **Audit trail**
   - All permissions logged
   - Can list all approved URLs

✅ **No blanket permissions**
   - More secure than `allowPrivateIPs: true`
   - Each URL requires separate approval

## Benefits Over Static Policies

| Approach | Security | Flexibility | User Experience |
|----------|----------|-------------|-----------------|
| **Block all** | ✅ Secure | ❌ Inflexible | ❌ Breaks local MCPs |
| **Allow all** | ❌ Insecure | ✅ Flexible | ✅ Works, but risky |
| **Static policies** | ✅ Secure | ⚠️ Pre-configured | ⚠️ Complex setup |
| **Runtime permissions** | ✅ Secure | ✅ Flexible | ✅ Simple & transparent |

## Elicitation Format

The elicitation message includes:

1. **Requester**: Who is requesting access
   - "Worker Code" (direct fetch from sandbox)
   - "LG Remote" (from binding, if supported)

2. **Access Type**: What kind of network
   - "localhost" (127.0.0.1, ::1)
   - "local network (private IP)" (192.168.x.x, 10.x.x.x)
   - "external domain" (public internet)

3. **Full URL**: Exact URL being accessed
   - `http://192.168.1.100:3000/power-on`
   - Complete transparency

4. **Clear Options**:
   - **Allow Once** - Temporary (1 hour)
   - **Allow Always** - Permanent
   - **Deny** - Block

## Use Cases

### 1. LG TV Remote
```javascript
// User: "Turn on my TV"
await fetch('http://192.168.1.100:3000/power-on');

// Prompt: "...wants to access local network: http://192.168.1.100..."
// User: [Allow Always] ← Trust this TV
// Future TV commands: automatic
```

### 2. Philips Hue Lights
```javascript
// User: "Set living room lights to blue"
await fetch('http://192.168.1.50/api/lights/1/state', {
  method: 'PUT',
  body: JSON.stringify({ on: true, hue: 46920 })
});

// Prompt once → [Allow Always] → All light controls work
```

### 3. Home Assistant
```javascript
// User: "Turn off all lights"
await fetch('http://homeassistant.local:8123/api/services/light/turn_off', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ...' }
});

// Prompt once → [Allow Always] → All home automation works
```

### 4. Local Dev Server (Temporary)
```javascript
// User: "Check my dev server status"
await fetch('http://localhost:3000/api/health');

// Prompt: "...wants to access localhost..."
// User: [Allow Once] ← Only for this debugging session
// Permission expires after 1 hour
```

## Summary

**Runtime network permissions via elicitations** make Code-Mode practical for real-world use cases involving local devices while maintaining enterprise-grade security through informed user consent.

- 🔒 **Secure**: User controls all restricted network access
- 🎯 **Flexible**: Works with any local network device
- 👤 **Transparent**: User sees exactly what's accessed
- 🚀 **Practical**: LG Remote, Philips Hue, Home Assistant all work
- ⚡ **Efficient**: Permissions cached (user not spammed)
- 🔧 **Manageable**: Can revoke/clear permissions anytime
