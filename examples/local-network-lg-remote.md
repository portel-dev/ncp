# Example: LG TV Remote with Runtime Network Permissions

This example demonstrates how runtime network permissions work with a local network device (LG TV).

## Scenario

You have an LG TV at `192.168.1.100` on your home network. You want to control it using Code-Mode.

## Code Example

```javascript
// Check TV status
const statusResponse = await fetch('http://192.168.1.100:3000/status');
const status = await statusResponse.json();

console.log('TV Power:', status.power);
console.log('TV Volume:', status.volume);

// Turn on TV if it's off
if (status.power === 'off') {
  await fetch('http://192.168.1.100:3000/power-on', {
    method: 'POST'
  });
  console.log('TV powered on!');
}

// Set volume to 15
await fetch('http://192.168.1.100:3000/volume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ level: 15 })
});

console.log('Volume set to 15');
```

## What Happens

### First Request (`/status`)

1. Code tries to access `http://192.168.1.100:3000/status`
2. **NetworkPolicyManager detects**: Private IP (192.168.x.x) - blocked by default
3. **Permission dialog shown**:

```
┌──────────────────────────────────────┐
│  Network Access Permission           │
├──────────────────────────────────────┤
│  Code execution wants to access      │
│  local network (private IP):         │
│                                      │
│  http://192.168.1.100:3000/status   │
│                                      │
│  Allow this network access?          │
│                                      │
│  [Allow Once] [Allow Always] [Deny]  │
└──────────────────────────────────────┘
```

4. **User clicks: [Allow Always]**
5. Permission cached permanently
6. Request proceeds → TV returns status

### Second Request (`/power-on`)

1. Code tries to access `http://192.168.1.100:3000/power-on`
2. NetworkPolicyManager checks cache: ✅ **Approved** (same URL prefix)
3. **No prompt shown** - uses cached permission
4. Request proceeds → TV powers on

### Third Request (`/volume`)

1. Code tries to access `http://192.168.1.100:3000/volume`
2. NetworkPolicyManager checks cache: ✅ **Approved** (same URL prefix)
3. **No prompt shown** - uses cached permission
4. Request proceeds → Volume set

## Result

✅ **User prompted once**
✅ **All subsequent requests work automatically**
✅ **Secure** - User controls all local network access
✅ **Transparent** - User sees exactly what's being accessed

## Permission Options

### Allow Once (Temporary)
- Duration: 1 hour
- Use case: Testing, one-time access
- Expires automatically after 1 hour

### Allow Always (Permanent)
- Duration: Forever (until manually revoked)
- Use case: Trusted devices (your TV, smart lights, home automation)
- Cached permanently

### Deny (Block)
- Blocks the request immediately
- Returns error: "Network request blocked: User denied permission"

## Managing Permissions

### List Permissions
```javascript
const permissions = networkPolicyManager.getPermissions();
console.log(permissions);
// [
//   {
//     url: 'http://192.168.1.100:3000/status',
//     approved: true,
//     permanent: true
//   }
// ]
```

### Revoke Permission
```javascript
networkPolicyManager.revokePermission('http://192.168.1.100:3000/status');
// Next request will prompt again
```

### Clear All Permissions
```javascript
networkPolicyManager.clearPermissions();
// All future restricted requests will prompt
```

## Security Model

✅ **Default: Deny**
- All private IPs and localhost blocked by default
- No blanket permissions

✅ **User Consent Required**
- Every new restricted URL requires user approval
- Full URL shown in permission dialog

✅ **Principle of Least Privilege**
- Only approved URLs work
- Can revoke anytime

✅ **Audit Trail**
- All permissions logged
- Can list all approved URLs

✅ **Transparent**
- User sees exact URL being accessed
- Access type clearly labeled (localhost, private IP, etc.)

## Use Cases

### LG TV Remote
```javascript
await fetch('http://192.168.1.100:3000/power-on');
```

### Philips Hue Lights
```javascript
await fetch('http://192.168.1.50/api/lights/1/state', {
  method: 'PUT',
  body: JSON.stringify({ on: true, hue: 46920 })
});
```

### Home Assistant
```javascript
await fetch('http://homeassistant.local:8123/api/services/light/turn_off', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
```

### Local Dev Server
```javascript
await fetch('http://localhost:3000/api/health');
```

## Notes

- **Network must be reachable**: If the device is offline or unreachable, the request will fail even with permission
- **Per-URL permissions**: Each unique URL requires separate permission (for security)
- **Fallback behavior**: If elicitation is not supported by the client, access is denied (fail-safe)
- **Cached decisions**: Permissions are cached in memory (lost on server restart unless persisted)
