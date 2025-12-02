# Client Perspective: Automation Powerhouse for ANY MCP Client

## The Revolutionary Capability

**NCP is both an MCP Server AND an MCP Client:**

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Clients                              │
│  (Claude Desktop, Claude Code, Cursor, any MCP client)     │
└─────────────────────────┬───────────────────────────────────┘
                          │ Connects to NCP as MCP server
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                         NCP                                 │
│  • Acts as MCP SERVER for clients                          │
│  • Acts as MCP CLIENT for backend MCPs                     │
│  • Exposes schedule:create tool                            │
│  • Exposes ncp:code tool                                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ Connects to backend MCPs
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              Backend MCP Servers                            │
│  (filesystem, postgres, gmail, slack, github, etc.)        │
└─────────────────────────────────────────────────────────────┘
```

## What This Means for Claude & Claude Code

### Before: No Scheduling
```
Claude Desktop or Claude Code:
  ❌ Cannot schedule tasks
  ❌ Must be actively running to do anything
  ❌ No background automation
  ❌ User must remember to ask repeatedly
```

### After: Full Automation via NCP!
```
Claude Desktop or Claude Code:
  ✅ Can schedule tasks via NCP
  ✅ Tasks run even when client is offline
  ✅ Full background automation
  ✅ Set it and forget it!
```

## How Claude Uses This

### Step 1: Claude Discovers NCP's Tools

```
User: "What scheduling tools are available?"

Claude calls: tools/list on NCP

NCP returns:
  - schedule:create
  - schedule:list
  - schedule:update
  - ncp:code
  - (all other tools from backend MCPs)
```

### Step 2: Claude Schedules Code

```
User: "Set up daily reports that check all our systems"

Claude calls: schedule:create
{
  "name": "daily-system-report",
  "schedule": "0 9 * * *",
  "tool": "ncp:code",
  "parameters": {
    "code": `
      // This code runs on NCP's scheduler
      // Can access ALL MCPs that NCP has!

      // Check database (postgres MCP)
      const dbStats = await postgres.query({
        sql: "SELECT COUNT(*) FROM users"
      });

      // Check emails (gmail MCP)
      const emails = await gmail.list_messages({
        query: "is:unread"
      });

      // Check repos (github MCP)
      const repos = await github.list_repos({
        org: "mycompany"
      });

      // Send report (slack MCP)
      await slack.send_message({
        channel: "reports",
        text: \`Daily Report:
          - Users: \${dbStats.count}
          - Unread emails: \${emails.length}
          - Repos: \${repos.length}
        \`
      });

      return { report_sent: true };
    `
  }
}

NCP responds: Schedule created ✅

From now on:
  • Every day at 9 AM
  • NCP runs this code
  • Code orchestrates 4 MCPs (postgres, gmail, github, slack)
  • Report gets sent automatically
  • Even when Claude is offline!
```

### Step 3: Claude Monitors Execution

```
User: "How's my daily report doing?"

Claude calls: schedule:list

NCP returns:
  - daily-system-report: active, last run 9:00 AM, next run 9:00 AM tomorrow

Claude calls: analytics:usage

NCP returns:
  - daily-system-report has run 30 times, 100% success rate
```

## Real-World Use Cases

### 1. Claude Desktop: Automated Customer Support

```javascript
// User to Claude Desktop:
"Monitor our support inbox and auto-respond to common questions"

// Claude creates schedule via NCP:
await schedule.create({
  name: "auto-support",
  schedule: "*/15 * * * *",  // Every 15 minutes
  tool: "ncp:code",
  parameters: {
    code: `
      // Check inbox (gmail MCP)
      const messages = await gmail.list_messages({
        query: "is:unread label:support"
      });

      for (const msg of messages) {
        const content = await gmail.get_message({ id: msg.id });

        // Check if it's a common question
        if (content.includes("reset password")) {
          // Auto-respond (gmail MCP)
          await gmail.send_message({
            to: content.from,
            subject: "Re: " + content.subject,
            body: "Here's how to reset your password: ..."
          });

          // Log to database (postgres MCP)
          await postgres.query({
            sql: "INSERT INTO auto_responses VALUES (...)"
          });
        }
      }

      return { processed: messages.length };
    `
  }
});

// Result:
// ✅ Support inbox monitored every 15 minutes
// ✅ Common questions auto-answered
// ✅ Logged to database
// ✅ Runs even when Claude Desktop is closed!
```

### 2. Claude Code: CI/CD Monitoring

```javascript
// User to Claude Code:
"Monitor our CI/CD pipeline and alert on failures"

// Claude Code creates schedule via NCP:
await schedule.create({
  name: "ci-monitor",
  schedule: "*/5 * * * *",  // Every 5 minutes
  tool: "ncp:code",
  parameters: {
    code: `
      // Check CI status (github MCP)
      const runs = await github.list_workflow_runs({
        repo: "myapp",
        status: "latest"
      });

      const failures = runs.filter(r => r.conclusion === "failure");

      if (failures.length > 0) {
        // Get failure details (github MCP)
        const details = await Promise.all(
          failures.map(f => github.get_workflow_run({ id: f.id }))
        );

        // Alert team (slack MCP)
        await slack.send_message({
          channel: "alerts",
          text: \`🚨 CI Failures:
            \${details.map(d => \`- \${d.name}: \${d.error}\`).join('\\n')}
          \`
        });

        // Create incident (linear MCP)
        await linear.create_issue({
          title: "CI Pipeline Failure",
          description: JSON.stringify(details),
          priority: "urgent"
        });
      }

      return { checked: runs.length, failures: failures.length };
    `
  }
});

// Result:
// ✅ CI/CD monitored every 5 minutes
// ✅ Team alerted on Slack
// ✅ Incidents auto-created
// ✅ Runs continuously, even when Claude Code is not running!
```

### 3. Cursor: Automated Code Review

```javascript
// User to Cursor:
"Review all new PRs and comment on issues"

// Cursor creates schedule via NCP:
await schedule.create({
  name: "pr-reviewer",
  schedule: "0 */2 * * *",  // Every 2 hours
  tool: "ncp:code",
  parameters: {
    code: `
      // Get open PRs (github MCP)
      const prs = await github.list_pull_requests({
        repo: "myapp",
        state: "open"
      });

      for (const pr of prs) {
        // Get PR files (github MCP)
        const files = await github.get_pr_files({ pr_number: pr.number });

        // Check for common issues
        const issues = [];

        for (const file of files) {
          if (file.filename.includes("test") && file.additions === 0) {
            issues.push("No tests added for " + file.filename);
          }

          if (file.patch.includes("console.log")) {
            issues.push("Debug console.log found in " + file.filename);
          }
        }

        // Comment if issues found (github MCP)
        if (issues.length > 0) {
          await github.create_pr_comment({
            pr_number: pr.number,
            body: \`Automated Review Feedback:\\n\${issues.join('\\n')}\`
          });
        }

        // Track in database (postgres MCP)
        await postgres.query({
          sql: "INSERT INTO pr_reviews VALUES (...)"
        });
      }

      return { reviewed: prs.length };
    `
  }
});

// Result:
// ✅ PRs reviewed every 2 hours
// ✅ Issues commented automatically
// ✅ Tracked in database
// ✅ Runs in background continuously!
```

## The Power Multiplier

### Without NCP
```
Claude Desktop:
  ✅ Can access MCPs
  ❌ Cannot schedule
  ❌ Cannot run when offline
  ❌ User must ask every time

Result: Manual, repetitive, limited
```

### With NCP
```
Claude Desktop → NCP → schedule:create + ncp:code
  ✅ Can access ALL MCPs through NCP
  ✅ CAN schedule via NCP
  ✅ Code runs on NCP (always online)
  ✅ Set once, runs forever

Result: Automated, intelligent, powerful! 🚀
```

## Benefits for Each Client

### Claude Desktop
- **Before:** Interactive only, no automation
- **After:** Can set up automations that run 24/7
- **Use cases:** Email automation, support monitoring, report generation

### Claude Code
- **Before:** Only works when IDE is open
- **After:** Background monitoring and automation
- **Use cases:** CI/CD monitoring, code review, deployment checks

### Cursor
- **Before:** Manual code assistance
- **After:** Automated code quality checks
- **Use cases:** PR reviews, test coverage checks, lint automation

### Any MCP Client
- **Before:** Limited to user interaction
- **After:** Full automation capabilities
- **Use cases:** Anything you can imagine!

## How to Use (From Client Perspective)

### 1. Connect to NCP

```json
// Claude Desktop config: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "ncp": {
      "command": "ncp",
      "args": ["--profile", "default"]
    }
  }
}
```

### 2. Discover NCP's Capabilities

```
User: "What can you automate?"

Claude: Calls tools/list on NCP

Shows:
  - schedule:create (schedule any task)
  - ncp:code (execute code with MCP access)
  - Plus all backend MCPs available through NCP
```

### 3. Create Automation

```
User: "Set up [automation request]"

Claude: Analyzes request, writes code, calls schedule:create

Result: Automation runs on NCP's scheduler!
```

### 4. Monitor & Manage

```
User: "Show my automations"
Claude: Calls schedule:list

User: "How's it performing?"
Claude: Calls analytics:usage

User: "Update the schedule"
Claude: Calls schedule:update
```

## API from Client Perspective

When a client (Claude, Claude Code, etc.) connects to NCP:

```javascript
// Available tools from NCP:

// Create scheduled code execution
await tools.call("schedule:create", {
  name: "my-automation",
  schedule: "0 9 * * *",
  tool: "ncp:code",  // ← This is the key!
  parameters: {
    code: `
      // This code runs on NCP
      // Has access to ALL MCPs NCP has!
      const data = await anyMCP.anyTool({ params });
      return { result: data };
    `
  }
});

// List schedules
await tools.call("schedule:list", {});

// Get execution status
await tools.call("analytics:usage", { period: 7 });

// Update schedule
await tools.call("schedule:update", {
  job_id: "my-automation",
  schedule: "0 */6 * * *"  // Change to every 6 hours
});
```

## Real-World Workflow

```
┌──────────────────────────────────────────────────────────┐
│ User to Claude Desktop:                                  │
│ "Monitor our GitHub repos and Slack me about new PRs"   │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ Claude Desktop:                                          │
│ 1. Calls NCP's schedule:create                          │
│ 2. Passes code that uses github + slack MCPs            │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ NCP:                                                     │
│ 1. Schedules the code to run every 15 minutes          │
│ 2. Stores schedule in ~/.ncp/schedules                 │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ Every 15 minutes (NCP's scheduler):                     │
│ 1. Executes the code                                   │
│ 2. Code calls github.list_pull_requests                │
│ 3. Code calls slack.send_message                       │
│ 4. Returns result                                      │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ User:                                                    │
│ ✅ Gets Slack notifications about new PRs              │
│ ✅ Happens automatically, even when Claude is closed   │
│ ✅ No manual work needed!                              │
└──────────────────────────────────────────────────────────┘
```

## Token Efficiency for Clients

### Traditional (Client must ask every time)
```
User: "Check for new PRs"
  → Client processes request: 2000 tokens
  → Client calls MCP: 500 tokens
  → Total: 2500 tokens

User asks 100 times/day:
  → 250,000 tokens/day
  → $125/day
  → $3,750/month
```

### With NCP Scheduling (Set once)
```
User: "Monitor PRs and notify me"
  → Client creates schedule: 2000 tokens (one-time)
  → NCP runs schedule: 50 tokens per run
  → 100 runs/day: 5,000 tokens/day
  → $2.50/day
  → $75/month

Savings: $3,675/month (98% reduction!)
```

## Why This is Revolutionary

1. **Turns ANY MCP client into an automation engine**
   - Claude Desktop: Interactive → Automated
   - Claude Code: IDE-bound → Background automation
   - Cursor: Manual → Automated
   - Any client: Limited → Powerful

2. **Clients get scheduling without building it**
   - No need for each client to implement scheduling
   - NCP provides it as a service
   - All clients benefit immediately

3. **Orchestration of entire MCP ecosystem**
   - One schedule can use many MCPs
   - Complex workflows simplified
   - Enterprise-grade automation accessible

4. **Massive cost savings**
   - 98% token reduction
   - Set once, runs forever
   - No repeated AI inference needed

## Getting Started

### For Users

1. **Install NCP:**
   ```bash
   npm install -g @portel/ncp
   ```

2. **Configure Claude Desktop:**
   ```json
   {
     "mcpServers": {
       "ncp": {
         "command": "ncp",
         "args": ["--profile", "default"]
       }
     }
   }
   ```

3. **Tell Claude to automate:**
   ```
   "Set up automation for [your use case]"
   ```

4. **Claude will:**
   - Write the orchestration code
   - Call schedule:create via NCP
   - Set it up to run automatically
   - Monitor and report status

### For Claude/AI

When user requests automation:

1. Call `tools/list` to see available MCPs
2. Design orchestration code using those MCPs
3. Call `schedule:create` with:
   - `tool: "ncp:code"`
   - `parameters: { code: "your orchestration code" }`
4. Confirm with user that automation is active

## Summary

**The Automation Powerhouse for ALL MCP Clients:**

🎯 **The Innovation:**
- NCP acts as both MCP server AND client
- Exposes scheduling + code execution as MCP tools
- Clients can schedule code that orchestrates all MCPs

🚀 **The Impact:**
- ANY MCP client gets automation superpowers
- Claude Desktop → Full automation capabilities
- Claude Code → Background monitoring & CI/CD
- Cursor → Automated code quality
- Any client → Enterprise automation

💰 **The Savings:**
- 98% token cost reduction
- Set once, runs forever
- No manual repetition needed

**This transforms MCP clients from interactive tools to automation platforms!**

---

Try it:
- `node examples/client-perspective-powerhouse-demo.cjs`
- `examples/client-perspective-powerhouse.md` (this file)
