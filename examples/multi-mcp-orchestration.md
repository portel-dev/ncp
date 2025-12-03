# Multi-MCP Orchestration: The TRUE Powerhouse

## The Key Insight

**NCP is an MCP server that aggregates multiple MCPs behind it.**

Users interact with NCP via `find` and `run` (or `code`) interfaces. The Schedule tool is one of NCP's internal MCPs.

### The Limitation
Traditional scheduling runs **one MCP tool** at a scheduled time:
```javascript
// Schedule a single tool
await schedule.create({
  name: "check-analytics",
  tool: "analytics:overview",  // Just ONE tool
  parameters: { period: 1 }
});
```

### The Powerhouse 🚀
Schedule **CODE** that orchestrates **MULTIPLE MCPs** internally:
```javascript
// Schedule CODE that orchestrates many MCPs!
await schedule.create({
  name: "comprehensive-report",
  tool: "code:run",  // ← Execute CODE, not a single tool
  parameters: {
    code: `
      // Orchestrate multiple MCPs in one schedule!
      const stats = await analytics.overview({ period: 1 });
      const schedules = await schedule.list();
      const mcps = await mcp.list();

      const report = buildReport(stats, schedules, mcps);
      await filesystem.write_file({
        path: '/reports/daily.md',
        content: report
      });

      return { success: true, mcps_used: 4 };
    `
  }
});
```

## Why This is Powerful

### Before: Multiple Schedules for Workflow
```
Schedule 1: analytics:overview → get stats → store in file
Schedule 2: filesystem:read → load stored stats
Schedule 3: generate report → more filesystem operations
Schedule 4: send notification

Problems:
❌ Need to coordinate 4 separate schedules
❌ Cannot share data between schedules
❌ Race conditions if timing is off
❌ Complex error handling
❌ 4× setup cost (token-wise)
```

### After: Single Schedule Orchestrating All MCPs
```javascript
// ONE schedule does it all!
await schedule.create({
  name: "daily-workflow",
  tool: "code:run",
  parameters: {
    code: `
      // Step 1: Get analytics (analytics MCP)
      const stats = await analytics.overview({ period: 1 });

      // Step 2: Get schedules (schedule MCP)
      const scheds = await schedule.list();

      // Step 3: Check MCP health (mcp MCP)
      const health = await mcp.doctor();

      // Step 4: Build report with all data
      const report = \`
        # Daily Report
        Stats: \${JSON.stringify(stats)}
        Schedules: \${scheds.length}
        Health: \${health.status}
      \`;

      // Step 5: Save report (filesystem MCP)
      await filesystem.write_file({
        path: '/reports/daily.md',
        content: report
      });

      // Step 6: If issues, auto-fix (mcp + schedule MCPs)
      if (health.issues) {
        await schedule.pause({ job_id: 'problematic-task' });
        await mcp.doctor({ fix: true });
      }

      return { success: true };
    `
  }
});
```

Benefits:
✅ ONE schedule orchestrates ALL MCPs
✅ Share data seamlessly between steps
✅ No race conditions - sequential execution
✅ Comprehensive error handling
✅ Simpler management
✅ Lower token cost

## Real-World Orchestration Patterns

### 1. System Health & Auto-Healing

```javascript
await schedule.create({
  name: "health-monitor",
  schedule: "*/5 * * * *",  // Every 5 minutes
  tool: "code:run",
  parameters: {
    code: `
      // Check analytics (analytics MCP)
      const perf = await analytics.performance({ today: true });

      // Get active schedules (schedule MCP)
      const schedules = await schedule.list();

      // Check each MCP's health (mcp MCP)
      const health = await mcp.doctor();

      // Auto-heal if issues detected
      if (health.unhealthy.length > 0) {
        for (const unhealthy of health.unhealthy) {
          // Pause related schedules
          const relatedSchedules = schedules.filter(s =>
            s.tool.startsWith(unhealthy.name)
          );

          for (const sched of relatedSchedules) {
            await schedule.pause({ job_id: sched.id });
          }

          // Try to fix the MCP
          await mcp.remove({ mcp_name: unhealthy.name });
          await mcp.add({ mcp_name: unhealthy.name });

          // Resume schedules
          for (const sched of relatedSchedules) {
            await schedule.resume({ job_id: sched.id });
          }
        }

        return { healed: health.unhealthy.length };
      }

      return { status: 'healthy' };
    `
  }
});
```

**MCPs orchestrated:** analytics, schedule, mcp (all working together!)

### 2. Intelligent Backup Pipeline

```javascript
await schedule.create({
  name: "smart-backup",
  schedule: "0 2 * * *",  // Daily at 2 AM
  tool: "code:run",
  parameters: {
    code: `
      // Get files to backup (filesystem MCP)
      const files = await filesystem.list_directory({
        path: '/data'
      });

      // Check last backup status (analytics MCP)
      const lastBackup = await analytics.usage({
        tool: 'smart-backup',
        period: 1
      });

      // Only backup changed files
      const toBackup = files.filter(f =>
        f.modified > lastBackup.lastRun
      );

      // Backup each file (filesystem MCP)
      for (const file of toBackup) {
        const content = await filesystem.read_file({
          path: file.path
        });

        await filesystem.write_file({
          path: \`/backup/\${file.name}\`,
          content: content
        });
      }

      // Schedule next backup based on change frequency (schedule MCP)
      const changeRate = toBackup.length / files.length;
      const nextSchedule = changeRate > 0.5
        ? "*/6 * * * *"  // High change rate: every 6 hours
        : "0 2 * * *";   // Low change rate: daily

      await schedule.update({
        job_id: "smart-backup",
        schedule: nextSchedule
      });

      return {
        backed_up: toBackup.length,
        next_schedule: nextSchedule
      };
    `
  }
});
```

**MCPs orchestrated:** filesystem (multiple calls), analytics, schedule

### 3. Dynamic Resource Management

```javascript
await schedule.create({
  name: "resource-manager",
  schedule: "*/10 * * * *",  // Every 10 minutes
  tool: "code:run",
  parameters: {
    code: `
      // Check system usage (analytics MCP)
      const usage = await analytics.overview({ today: true });

      // Parse load from analytics
      const loadMatch = usage.match(/CPU.*?(\\d+\\.\\d+)/);
      const load = loadMatch ? parseFloat(loadMatch[1]) : 0;

      // Get all active schedules (schedule MCP)
      const schedules = await schedule.list();
      const activeCount = schedules.filter(s => s.active).length;

      // Adjust based on load
      if (load > 0.8 && activeCount > 5) {
        // High load: pause non-critical schedules
        const nonCritical = schedules.filter(s =>
          !s.name.includes('critical') && s.active
        );

        for (const sched of nonCritical.slice(0, 3)) {
          await schedule.pause({ job_id: sched.id });
        }

        return {
          action: 'PAUSED',
          count: 3,
          reason: 'high_load',
          load: load
        };
      } else if (load < 0.3) {
        // Low load: resume paused schedules
        const paused = schedules.filter(s => !s.active);

        for (const sched of paused) {
          await schedule.resume({ job_id: sched.id });
        }

        return {
          action: 'RESUMED',
          count: paused.length,
          load: load
        };
      }

      return { action: 'NO_CHANGE', load: load };
    `
  }
});
```

**MCPs orchestrated:** analytics, schedule (multiple pause/resume operations)

### 4. Multi-Source Data Aggregation

```javascript
await schedule.create({
  name: "data-aggregator",
  schedule: "0 * * * *",  // Hourly
  tool: "code:run",
  parameters: {
    code: `
      // Get analytics data (analytics MCP)
      const analytics_data = await analytics.overview({ period: 1 });

      // Get schedule execution stats (schedule MCP)
      const schedule_data = await schedule.list();
      const executions = schedule_data.reduce((sum, s) =>
        sum + (s.executions || 0), 0
      );

      // Get MCP configurations (mcp MCP)
      const mcp_data = await mcp.list();

      // Read previous aggregate (filesystem MCP)
      let previous = {};
      try {
        const prev = await filesystem.read_file({
          path: '/data/aggregate.json'
        });
        previous = JSON.parse(prev);
      } catch (e) {
        // First run, no previous data
      }

      // Build new aggregate
      const aggregate = {
        timestamp: new Date().toISOString(),
        analytics: analytics_data,
        schedule_executions: executions,
        mcp_count: mcp_data.length,
        trend: {
          executions_delta: executions - (previous.schedule_executions || 0),
          mcp_delta: mcp_data.length - (previous.mcp_count || 0)
        }
      };

      // Save aggregate (filesystem MCP)
      await filesystem.write_file({
        path: '/data/aggregate.json',
        content: JSON.stringify(aggregate, null, 2)
      });

      // Also save timestamped snapshot (filesystem MCP)
      await filesystem.write_file({
        path: \`/data/snapshots/\${Date.now()}.json\`,
        content: JSON.stringify(aggregate, null, 2)
      });

      return {
        success: true,
        trend: aggregate.trend
      };
    `
  }
});
```

**MCPs orchestrated:** analytics, schedule, mcp, filesystem (multiple operations)

## Code-Mode API Reference

When code runs via `code:run`, MCPs are exposed as namespace objects:

### Available Namespaces

```javascript
// Analytics MCP
await analytics.overview({ period: number, today: boolean });
await analytics.performance({ period: number });
await analytics.usage({ period: number });
await analytics.tokens({ period: number });

// Schedule MCP
await schedule.create({ name, schedule, tool, parameters });
await schedule.list();
await schedule.get({ job_id });
await schedule.update({ job_id, ... });
await schedule.delete({ job_id });
await schedule.pause({ job_id });
await schedule.resume({ job_id });

// MCP Management MCP
await mcp.list({ profile });
await mcp.add({ mcp_name });
await mcp.remove({ mcp_name });
await mcp.doctor({ mcp_name });
await mcp.export({ to });

// Filesystem MCP (if configured)
await filesystem.read_file({ path });
await filesystem.write_file({ path, content });
await filesystem.list_directory({ path });
await filesystem.create_directory({ path });

// Skills MCP
await skills.find({ query, depth });
await skills.list();
await skills.add({ skill_name });
await skills.remove({ skill_name });

// ANY other configured MCP is also available!
// Format: await <mcp_name>.<tool_name>({ parameters });
```

## Token Efficiency Comparison

### Scenario: Daily report from 3 MCPs

**Traditional: 3 separate scheduled tools**
```
Setup:
  schedule analytics:overview → 1500 tokens
  schedule filesystem:write → 1500 tokens
  schedule custom:merge → 1500 tokens
  Total: 4500 tokens

Monthly execution: 3 × 50 × 30 = 4,500 tokens
Total first month: 9,000 tokens
Ongoing monthly: 4,500 tokens
```

**Code-Mode: 1 schedule orchestrating 3 MCPs**
```
Setup:
  schedule code:run (with multi-MCP logic) → 2000 tokens

Monthly execution: 50 × 30 = 1,500 tokens
Total first month: 3,500 tokens
Ongoing monthly: 1,500 tokens

Savings: 61% first month, 67% ongoing
```

### Scenario: Complex workflow with 6 MCP operations

**Traditional: Cannot do easily**
```
Would need:
  - 6 separate schedules
  - Complex coordination
  - Shared state file
  - Race condition handling

Estimated tokens: 12,000+ first month
```

**Code-Mode: Natural orchestration**
```
Setup: 2500 tokens
Monthly: 1,500 tokens

Savings: 87%+ and WAY simpler!
```

## Best Practices

### 1. Error Handling
```javascript
try {
  const data = await analytics.overview({ period: 1 });
  // Use data...
} catch (error) {
  // Log error, send alert, or return error state
  return { error: error.message, step: 'analytics' };
}
```

### 2. Data Passing
```javascript
// Data flows naturally between MCP calls
const stats = await analytics.overview({ period: 1 });
const report = formatReport(stats);  // Process data
await filesystem.write_file({ path: '/report.md', content: report });
```

### 3. Conditional Orchestration
```javascript
const health = await mcp.doctor();

if (health.issues) {
  // Only call these MCPs if there are issues
  await schedule.pause({ job_id: 'affected-task' });
  await mcp.doctor({ fix: true });
  return { action: 'HEALED' };
}

return { action: 'HEALTHY' };
```

### 4. Dynamic Workflows
```javascript
const config = await filesystem.read_file({ path: '/config.json' });
const settings = JSON.parse(config);

// Different MCP orchestration based on config
if (settings.mode === 'aggressive') {
  await schedule.update({ job_id: 'monitor', schedule: '* * * * *' });
} else {
  await schedule.update({ job_id: 'monitor', schedule: '*/10 * * * *' });
}
```

## How to Use

### 1. Enable Code-Mode
```json
// In your NCP profile
{
  "workflowMode": "find-and-code"
}
```

### 2. Create Orchestration Schedule
```bash
ncp run schedule:create
```

When prompted:
- **Name:** your-workflow-name
- **Tool:** `code:run` ← This is key!
- **Schedule:** cron or natural language
- **Code:** Your multi-MCP orchestration code

### 3. Monitor Execution
```bash
# List schedules
ncp run schedule:list

# Check specific schedule
ncp run schedule:get --job_id your-workflow-name

# View analytics
ncp run analytics:overview
```

## Examples to Try

1. **Run the demo:**
   ```bash
   node examples/multi-mcp-orchestration-demo.cjs
   ```

2. **Test real orchestration:**
   ```bash
   node tests/manual/test-multi-mcp-orchestration.cjs
   ```

3. **Create your own:**
   - Start with examples above
   - Modify for your MCPs
   - Test with `ncp run code:run --code "..."`
   - Schedule with `ncp run schedule:create`

## Summary

**The TRUE Powerhouse:**

✅ Schedule CODE, not just single tools
✅ Orchestrate MULTIPLE MCPs in one schedule
✅ Share data seamlessly between MCP calls
✅ Full conditional logic and error handling
✅ Simpler management (one schedule vs many)
✅ Lower token cost and complexity

**This is what makes Code-Mode + Scheduler a powerhouse:**
Not just scheduling tools, but **scheduling intelligent workflows that orchestrate your entire MCP ecosystem!**

🚀 Start orchestrating today!
