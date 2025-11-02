# Workflow + Schedule Integration Guide

## Architecture Overview

Two MCPs working together for intelligent task automation:

```
┌─────────────────┐         ┌──────────────────┐
│  Schedule MCP   │ ─────>  │  Workflow MCP    │
│                 │         │                  │
│ • WHEN to run   │         │ • WHAT to run    │
│ • Cron timing   │         │ • Claude brain   │
│ • Task queue    │         │ • Tool calling   │
│ • Persistence   │         │ • Intelligence   │
└─────────────────┘         └──────────────────┘
        │                            │
        │                            ▼
        │                   ┌──────────────────┐
        │                   │  Other SimpleMCPs│
        │                   │                  │
        └──────────────────>│ • GitHub         │
                            │ • Slack/Email    │
                            │ • Database       │
                            │ • Cloud Storage  │
                            │ • AI             │
                            └──────────────────┘
```

## Quick Start

### 1. Test Workflow First

Always test manually before scheduling:

```bash
# Test the intelligent task
ncp run workflow:execute-task \
  task="Check GitHub issues and summarize them"

# Or test a predefined workflow
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{"slackWebhook":"https://...","repo":"owner/repo"}'
```

### 2. Schedule It

Once it works, add to schedule:

```bash
ncp run schedule:add \
  name="morning-standup" \
  command="ncp run workflow:execute workflowName=daily-standup context='{\"slackWebhook\":\"...\",\"repo\":\"...\"}'" \
  schedule="0 9 * * 1-5" \
  description="Daily standup summary"
```

### 3. Verify & Monitor

```bash
# List all scheduled tasks
ncp run schedule:list

# Check specific task
ncp run schedule:get name="morning-standup"

# View logs (if schedule MCP supports it)
ncp run schedule:logs name="morning-standup"
```

## Real-World Examples

### Example 1: Automated Daily Standup

**Goal**: Every weekday at 9am, check GitHub issues and post summary to Slack

**Step 1 - Test manually**:
```bash
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{
    "slackWebhook": "https://hooks.slack.com/services/T00/B00/XXX",
    "repo": "company/project"
  }'
```

**Step 2 - Schedule it**:
```bash
ncp run schedule:add \
  name="team-standup" \
  command="ncp run workflow:execute workflowName=daily-standup context='{\"slackWebhook\":\"https://hooks.slack.com/services/T00/B00/XXX\",\"repo\":\"company/project\"}'" \
  schedule="0 9 * * 1-5" \
  description="Automated daily standup summary"
```

**Result**: Every weekday at 9am:
1. Workflow MCP fetches GitHub issues
2. Claude summarizes them intelligently
3. Posts to your Slack channel

### Example 2: Content Monitoring

**Goal**: Every hour, check website for changes and alert team

**Step 1 - Define custom workflow**:
```json
{
  "name": "content-monitor",
  "description": "Monitor website for changes",
  "steps": [
    {
      "name": "Scrape Content",
      "tool": "scraper:extract",
      "parameters": {"url": "https://example.com/news"}
    },
    {
      "name": "Check Changes",
      "tool": "ai:complete",
      "parameters": {
        "prompt": "Compare with previous content and identify significant changes",
        "provider": "anthropic"
      }
    },
    {
      "name": "Alert Team",
      "tool": "notify:slack",
      "parameters": {
        "webhookUrl": "${context.slackWebhook}",
        "text": "Content changed: ${previousResults[1].output}"
      }
    }
  ]
}
```

**Step 2 - Test it**:
```bash
ncp run workflow:execute-custom \
  workflow='<paste-json-above>' \
  context='{"slackWebhook":"https://..."}'
```

**Step 3 - Schedule it**:
```bash
ncp run schedule:add \
  name="content-monitor" \
  command="ncp run workflow:execute-custom workflow='<escaped-json>' context='{\"slackWebhook\":\"...\"}'" \
  schedule="0 * * * *" \
  description="Hourly content monitoring"
```

### Example 3: Intelligent Task Execution

**Goal**: Let Claude decide what to do based on context

**Use Case**: "Check our key metrics and alert if anything looks unusual"

**Schedule intelligent task**:
```bash
ncp run schedule:add \
  name="metrics-check" \
  command="ncp run workflow:execute-task task='Query database for key metrics from last hour, analyze for anomalies, and alert via Slack if anything unusual' context='{\"dbPath\":\"./metrics.db\",\"slackWebhook\":\"...\"}'" \
  schedule="0 * * * *" \
  description="Intelligent metrics monitoring"
```

**What happens**:
1. Schedule MCP calls Workflow MCP every hour
2. Workflow MCP uses Claude to figure out:
   - What database queries to run
   - What constitutes "unusual"
   - Whether to send an alert
3. Claude orchestrates the necessary SimpleMCPs to accomplish the task

### Example 4: Data Pipeline

**Goal**: Daily ETL job with AI enrichment

```bash
# 1. Create custom workflow
cat > data-pipeline.json << 'EOF'
{
  "name": "daily-etl",
  "description": "Extract, enrich with AI, load to database",
  "steps": [
    {
      "name": "Extract from API",
      "tool": "scraper:extract",
      "parameters": {"url": "https://api.example.com/data"}
    },
    {
      "name": "Enrich with AI",
      "tool": "ai:complete",
      "parameters": {
        "prompt": "Categorize and tag this data: ${previousResults[0].output}",
        "provider": "anthropic"
      }
    },
    {
      "name": "Load to Database",
      "tool": "database:insert",
      "parameters": {
        "dbPath": "./analytics.db",
        "tableName": "enriched_data"
      }
    },
    {
      "name": "Upload Backup to S3",
      "tool": "cloud:s3-upload",
      "parameters": {
        "bucket": "backups",
        "key": "daily-${timestamp}.json"
      }
    }
  ]
}
EOF

# 2. Test it
ncp run workflow:execute-custom workflow="$(cat data-pipeline.json)"

# 3. Schedule it for 2am daily
ncp run schedule:add \
  name="daily-etl" \
  command="ncp run workflow:execute-custom workflow='$(cat data-pipeline.json | jq -c)'" \
  schedule="0 2 * * *" \
  description="Daily ETL with AI enrichment"
```

## Common Patterns

### Pattern 1: Test → Schedule → Monitor

```bash
# Always follow this pattern:

# 1. TEST
ncp run workflow:execute workflowName="..." context='...'

# 2. SCHEDULE (only if test succeeded)
ncp run schedule:add name="..." command="ncp run workflow:..." schedule="..."

# 3. MONITOR
ncp run schedule:list
```

### Pattern 2: Multiple Workflows at Different Times

```bash
# Morning: GitHub summary
ncp run schedule:add name="morning-github" command="..." schedule="0 9 * * 1-5"

# Hourly: Content monitoring
ncp run schedule:add name="content-check" command="..." schedule="0 * * * *"

# Evening: Daily report
ncp run schedule:add name="evening-report" command="..." schedule="0 17 * * 1-5"

# Night: Backups
ncp run schedule:add name="nightly-backup" command="..." schedule="0 2 * * *"
```

### Pattern 3: Conditional Execution

Workflow handles the logic, schedule just invokes it:

```bash
# Schedule runs every hour, but workflow only alerts if needed
ncp run schedule:add \
  name="smart-alert" \
  command="ncp run workflow:execute-task task='Check metrics, only alert if anomalies detected'" \
  schedule="0 * * * *"
```

## Best Practices

### 1. Always Test Before Scheduling

```bash
# ❌ DON'T: Schedule without testing
ncp run schedule:add name="untested" command="ncp run workflow:execute ..." schedule="..."

# ✅ DO: Test first
ncp run workflow:execute workflowName="..." context='...'
# Verify it works, THEN schedule
ncp run schedule:add name="tested" command="..." schedule="..."
```

### 2. Use Descriptive Names

```bash
# ❌ BAD: Vague names
ncp run schedule:add name="task1" command="..." schedule="..."

# ✅ GOOD: Descriptive names
ncp run schedule:add name="daily-standup-engineering-team" command="..." schedule="..."
```

### 3. Add Descriptions

```bash
ncp run schedule:add \
  name="content-monitor" \
  command="..." \
  schedule="0 * * * *" \
  description="Monitors company blog for changes, alerts #marketing channel"
```

### 4. Start with Longer Intervals

```bash
# ❌ DON'T: Start with frequent execution
schedule="*/5 * * * *"  # Every 5 minutes - may hit rate limits

# ✅ DO: Start conservative, increase frequency later
schedule="0 */6 * * *"  # Every 6 hours initially
# After monitoring, adjust to:
schedule="0 * * * *"    # Every hour
```

### 5. Handle Errors Gracefully

Use workflow's built-in error handling:

```json
{
  "steps": [
    {"name": "Try main task", "tool": "..."},
    {
      "name": "Fallback notification",
      "tool": "notify:email",
      "parameters": {"to": "admin@company.com", "subject": "Workflow failed"},
      "condition": "previousResults[0].success === false"
    }
  ]
}
```

## Troubleshooting

### Problem: Workflow not executing on schedule

**Check**:
```bash
# 1. Is it scheduled?
ncp run schedule:list | grep "your-workflow"

# 2. Is schedule MCP running?
ps aux | grep ncp

# 3. Check schedule MCP logs
ncp run schedule:logs name="your-workflow"

# 4. Test workflow manually
ncp run workflow:execute workflowName="..." context='...'
```

### Problem: Workflow executes but fails

**Debug**:
```bash
# Run workflow manually to see detailed error
ncp run workflow:execute workflowName="..." context='...'

# Check each step individually
ncp run github:list-issues repo="owner/repo"
ncp run ai:complete prompt="test" provider="anthropic"
```

### Problem: Wrong schedule time

```bash
# Remove and re-add with correct schedule
ncp run schedule:remove name="your-workflow"
ncp run schedule:add name="your-workflow" command="..." schedule="correct-cron"
```

## Summary

**Schedule MCP** handles **WHEN** (timing, persistence, execution)
**Workflow MCP** handles **WHAT** (intelligence, orchestration, tools)

**Together they enable**:
- ✅ Automated intelligent task execution
- ✅ Claude-powered decision making
- ✅ Multi-step workflows with conditional logic
- ✅ Integration with all SimpleMCPs
- ✅ Reliable scheduling and error handling

**Workflow pattern**:
1. Define intelligent task (workflow or free-form)
2. Test manually to verify it works
3. Schedule with Schedule MCP
4. Monitor execution and refine

This combination gives you **cron + intelligence** - scheduled tasks that can think and adapt!
