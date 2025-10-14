# Telemetry Design for .mcpb Distribution

## Problem

- **NPM**: Automatic download stats via npm registry
- **.mcpb**: Only GitHub release download counts (downloads ≠ actual usage)

## Proposed Solution: Opt-In Anonymous Telemetry

### Privacy-First Principles

1. **Opt-in only** - Disabled by default, explicit user consent
2. **Anonymous** - No personal data (name, email, IP)
3. **Transparent** - Clear disclosure of what's collected
4. **Minimal** - Only essential usage metrics
5. **Open source** - Code is public, users can audit

### What to Collect

```typescript
interface TelemetryEvent {
  // Anonymous identifier (generated on first run)
  installId: string; // UUID v4

  // Version tracking
  ncpVersion: string;

  // Platform info
  platform: 'darwin' | 'win32' | 'linux';
  nodeVersion: string;

  // MCP client info
  clientName: string; // 'claude-desktop', 'cursor', etc.
  clientVersion?: string;

  // Usage metrics
  mcpCount: number; // Number of configured MCPs
  toolsIndexed: number; // Total tools indexed

  // Feature usage (boolean flags)
  features: {
    autoImportEnabled: boolean;
    ragSearchUsed: boolean;
  };

  // Timestamp
  timestamp: number;

  // Event type
  eventType: 'install' | 'startup' | 'daily_ping';
}
```

### What NOT to Collect

❌ User's name, email, or any PII
❌ File paths or directory contents
❌ MCP server names or configurations
❌ Search queries or tool execution details
❌ IP addresses (backend should not log)
❌ Precise timestamps (round to hour for privacy)

### Implementation Options

#### Option A: Self-Hosted (Recommended)

**Pros:**
- Full control over data
- No third-party dependencies
- Can be open-sourced

**Stack:**
- Simple HTTP endpoint (Cloudflare Workers, Vercel Edge Functions)
- Store in SQLite or PostgreSQL
- Dashboard with basic charts (active installs, platform breakdown)

**Example endpoint:**
```javascript
// Cloudflare Worker
export default {
  async fetch(request) {
    const event = await request.json();

    // Validate event structure
    if (!isValidTelemetryEvent(event)) {
      return new Response('Invalid event', { status: 400 });
    }

    // Store in D1 (Cloudflare's SQLite)
    await env.DB.prepare(
      'INSERT INTO telemetry_events VALUES (?, ?, ?, ?)'
    ).bind(
      event.installId,
      event.ncpVersion,
      event.platform,
      event.timestamp
    ).run();

    return new Response('OK', { status: 200 });
  }
};
```

#### Option B: Privacy-Focused Analytics Services

**PostHog** (Open source, self-hostable)
- Free tier: 1M events/month
- Anonymous user tracking
- Feature flags, A/B testing
- Can self-host for full control

**Plausible Analytics** (Privacy-first)
- GDPR compliant
- No cookies
- Lightweight
- Open source

**Umami** (Open source)
- Self-hostable
- Simple, privacy-focused
- Easy deployment (Vercel, Railway)

### User Consent Flow

**First run prompt:**
```
┌─────────────────────────────────────────────────────────────┐
│  📊 Help improve NCP                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NCP would like to collect anonymous usage statistics to   │
│  understand adoption and prioritize features.               │
│                                                             │
│  What we collect:                                           │
│  • Installation ID (random UUID, not tied to you)          │
│  • Platform (macOS/Windows/Linux)                          │
│  • NCP version and MCP client name                         │
│  • Number of configured MCPs (not their names)             │
│                                                             │
│  What we DON'T collect:                                     │
│  • Your name, email, or any personal information           │
│  • File paths, configurations, or MCP server names         │
│  • Search queries or tool execution details                │
│                                                             │
│  You can change this anytime in ~/.ncp/config.json         │
│                                                             │
│  Learn more: https://github.com/portel-dev/ncp/privacy     │
│                                                             │
│  [ Enable Telemetry ]  [ No Thanks ]                       │
└─────────────────────────────────────────────────────────────┘
```

**Configuration:**
```json
// ~/.ncp/config.json
{
  "telemetry": {
    "enabled": false,
    "installId": "550e8400-e29b-41d4-a716-446655440000",
    "lastPing": 1704096000000
  }
}
```

### Implementation Steps

1. **Create telemetry module:**
   ```typescript
   // src/utils/telemetry.ts
   import { v4 as uuidv4 } from 'uuid';

   export class Telemetry {
     private enabled: boolean;
     private installId: string;

     async sendEvent(eventType: string, data: any) {
       if (!this.enabled) return;

       const event = {
         installId: this.installId,
         eventType,
         ncpVersion: packageJson.version,
         platform: process.platform,
         timestamp: Date.now(),
         ...data
       };

       // Non-blocking fire-and-forget
       fetch('https://telemetry.ncp.dev/event', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(event)
       }).catch(() => {}); // Silently fail
     }
   }
   ```

2. **Add consent prompt on first run:**
   ```typescript
   // Only show if telemetry preference not set
   if (config.telemetry === undefined) {
     const consent = await promptUserConsent();
     config.telemetry = { enabled: consent };
     await saveConfig(config);
   }
   ```

3. **Send events at key points:**
   ```typescript
   // First install
   telemetry.sendEvent('install', {
     clientName: this.clientName,
     mcpCount: mcpServers.length
   });

   // Daily ping (check if >24h since last ping)
   telemetry.sendEvent('daily_ping', {
     mcpCount: mcpServers.length,
     toolsIndexed: this.allTools.length
   });
   ```

### Dashboard Metrics

**Key Metrics to Track:**

1. **Adoption:**
   - Total unique installs (unique installIds)
   - New installs per week/month
   - Growth rate

2. **Platform breakdown:**
   - macOS vs Windows vs Linux
   - MCP client distribution (Claude Desktop, Cursor, etc.)

3. **Engagement:**
   - Daily Active Installs (DAI)
   - Monthly Active Installs (MAI)
   - Retention (% still sending daily pings after 7/30 days)

4. **Feature usage:**
   - Auto-import adoption rate
   - RAG search usage
   - Average MCPs per installation

### Comparison: NPM vs .mcpb Metrics

| Metric | NPM | .mcpb (No Telemetry) | .mcpb (With Telemetry) |
|--------|-----|----------------------|------------------------|
| **Downloads** | ✅ Automatic | ✅ GitHub API | ✅ GitHub API |
| **Unique Installs** | ❌ Not tracked | ❌ Unknown | ✅ installId count |
| **Active Usage** | ❌ Not tracked | ❌ Unknown | ✅ Daily/monthly pings |
| **Platform Breakdown** | ❌ Not tracked | ❌ Unknown | ✅ Tracked |
| **Client Distribution** | ❌ Not tracked | ❌ Unknown | ✅ Tracked |
| **Retention** | ❌ Not tracked | ❌ Unknown | ✅ Tracked |

### Recommendation

**Phase 1 (Immediate):**
- Use GitHub release download stats
- Track at least: total downloads, downloads per version

**Phase 2 (Optional, after community feedback):**
- Implement opt-in telemetry
- Start with minimal metrics (install count, platform)
- Publish privacy policy
- Make telemetry collection code open source

**Phase 3 (Long term):**
- Build public dashboard showing aggregate stats
- Use insights to prioritize features
- Share metrics with community (transparency builds trust)

### Example Public Dashboard

Show aggregate, anonymized data publicly:

```
NCP Adoption Metrics (Last 30 Days)

📊 Total Installations: 1,234
📈 Active Installations: 892 (72% active)
⬆️  Growth: +15% from last month

Platform Distribution:
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ macOS (75%)
▓▓▓▓▓░░░░░░░░░░░░░░░ Windows (18%)
▓░░░░░░░░░░░░░░░░░░░ Linux (7%)

MCP Client Distribution:
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░ Claude Desktop (85%)
▓▓░░░░░░░░░░░░░░░░░░ Cursor (10%)
▓░░░░░░░░░░░░░░░░░░░ Other (5%)

Average MCPs per Installation: 4.2
```

This transparency builds trust and shows the community your product's growth.

---

**Decision Matrix:**

| If you prioritize... | Recommendation |
|----------------------|----------------|
| **Quick implementation** | GitHub release stats only |
| **Better insights** | Add opt-in telemetry (PostHog or self-hosted) |
| **Privacy above all** | GitHub stats + optional telemetry (clearly disclosed) |
| **Community trust** | Open-source telemetry code + public dashboard |

Most open-source projects with .mcpb-style distribution use a hybrid approach:
- GitHub release stats for downloads
- Opt-in telemetry for usage insights
- Public transparency about data collection
