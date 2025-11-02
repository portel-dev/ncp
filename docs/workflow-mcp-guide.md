# Workflow MCP - Intelligent Task Orchestration

## Overview

The Workflow MCP uses **Claude as an intelligent orchestrator** to execute multi-step workflows, make decisions, and coordinate other SimpleMCPs. It's like having an AI assistant that can automate complex tasks by combining multiple tools.

## What Makes This Powerful

1. **Claude-Powered Intelligence**: Each step can use Claude's reasoning to analyze results and make decisions
2. **Tool Orchestration**: Calls other SimpleMCPs as tools (GitHub, Slack, databases, cloud storage, etc.)
3. **Conditional Logic**: Steps can execute based on previous results
4. **State Management**: Tracks workflow execution and results
5. **Natural Language Workflows**: Generate workflows from plain English descriptions

## Installation & Configuration

### 1. Configure Anthropic API Key

```json
{
  "mcpServers": {
    "workflow": {
      "type": "internal",
      "env": {
        "ANTHROPIC_API_KEY": "_USE_SECURE_STORAGE_"
      }
    }
  }
}
```

Get your API key from: https://console.anthropic.com/

### 2. Verify Installation

```bash
ncp find "workflow"
```

## Core Capabilities

### 1. Execute Predefined Workflows

Run built-in workflows for common tasks:

```bash
# Daily standup: GitHub issues → AI summary → Slack
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{"slackWebhook":"https://hooks.slack.com/...","repo":"owner/repo"}'

# Content pipeline: Scrape → Analyze → Report → Email
ncp run workflow:execute \
  workflowName="content-pipeline" \
  context='{"sourceUrl":"https://...","recipient":"user@example.com"}'

# Data sync: Database backup → S3 upload → Notify
ncp run workflow:execute \
  workflowName="data-sync" \
  context='{"dbPath":"./data.db","s3Bucket":"backups","slackWebhook":"..."}'
```

### 2. Execute Custom Workflows

Define and run your own workflows:

```bash
ncp run workflow:execute-custom \
  workflow='{
    "name": "content-analyzer",
    "description": "Analyze website content and save insights",
    "steps": [
      {
        "name": "Scrape Website",
        "description": "Extract content from target URL",
        "tool": "scraper:extract",
        "parameters": {"url": "https://example.com"}
      },
      {
        "name": "Analyze with AI",
        "description": "Extract key insights",
        "tool": "ai:complete",
        "parameters": {
          "prompt": "Analyze this content and extract key insights",
          "provider": "anthropic"
        }
      },
      {
        "name": "Save to Database",
        "description": "Store insights in database",
        "tool": "database:insert",
        "parameters": {
          "dbPath": "./insights.db",
          "tableName": "content_insights"
        }
      }
    ]
  }'
```

### 3. Execute Intelligent Tasks

Let Claude figure out how to accomplish a task:

```bash
# Simple task
ncp run workflow:execute-task \
  task="Summarize the latest trends in AI from Hacker News"

# Task with context
ncp run workflow:execute-task \
  task="Find and summarize GitHub issues about performance" \
  context='{"repo":"facebook/react","daysBack":7}'

# Task with tool restrictions
ncp run workflow:execute-task \
  task="Create a daily report and send it via email" \
  availableTools='["ai:complete","notify:email","database:query"]'
```

### 4. Generate Workflows from Natural Language

Describe what you want, get a workflow definition:

```bash
ncp run workflow:generate-workflow \
  description="Every morning, check GitHub issues in my repo, summarize them with AI, and post a summary to our team's Slack channel"

# Returns:
{
  "workflow": {
    "name": "morning-github-summary",
    "description": "Daily GitHub issue summary to Slack",
    "steps": [...]
  }
}

# Then execute the generated workflow:
ncp run workflow:execute-custom workflow='<paste-generated-workflow>'
```

### 5. Schedule Workflows

Get cron commands for scheduling:

```bash
ncp run workflow:schedule \
  workflowName="daily-standup" \
  schedule="0 9 * * 1-5"

# Returns instructions like:
# Add to crontab: 0 9 * * 1-5 ncp run workflow:execute workflowName="daily-standup"
```

## Built-in Workflows

### 1. Daily Standup (`daily-standup`)

**What it does**: Fetches GitHub issues, summarizes with AI, posts to Slack

**Required context**:
- `slackWebhook` - Slack webhook URL
- `repo` - GitHub repository (owner/repo)

**Example**:
```bash
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{
    "slackWebhook": "https://hooks.slack.com/services/...",
    "repo": "anthropics/claude-code"
  }'
```

**Steps**:
1. Fetch open GitHub issues
2. AI summarizes issues for standup
3. Post summary to Slack

### 2. Content Pipeline (`content-pipeline`)

**What it does**: Scrapes content, analyzes with AI, generates PDF report, emails results

**Required context**:
- `sourceUrl` - URL to scrape
- `recipient` - Email recipient

**Example**:
```bash
ncp run workflow:execute \
  workflowName="content-pipeline" \
  context='{
    "sourceUrl": "https://news.ycombinator.com",
    "recipient": "team@company.com"
  }'
```

**Steps**:
1. Scrape content from URL
2. AI analyzes content for insights
3. Generate PDF report
4. Email report to recipient

### 3. Data Sync (`data-sync`)

**What it does**: Backs up database to S3, notifies on completion

**Required context**:
- `dbPath` - SQLite database path
- `s3Bucket` - S3 bucket name
- `slackWebhook` - Slack webhook for notifications

**Example**:
```bash
ncp run workflow:execute \
  workflowName="data-sync" \
  context='{
    "dbPath": "./production.db",
    "s3Bucket": "my-backups",
    "slackWebhook": "https://hooks.slack.com/..."
  }'
```

**Steps**:
1. Export database to JSON
2. Upload to S3
3. Notify Slack on success

## Creating Custom Workflows

### Workflow Definition Structure

```typescript
{
  "name": "workflow-name",
  "description": "What this workflow does",
  "steps": [
    {
      "name": "Step Name",
      "description": "What this step does",
      "tool": "mcp-name:tool-name",      // Optional: MCP tool to call
      "parameters": {                     // Optional: Tool parameters
        "param1": "value1",
        "param2": "${context.variable}"   // Use context variables
      },
      "condition": "expression"           // Optional: Execute conditionally
    }
  ]
}
```

### Using Context Variables

Access context and previous results in parameters:

```json
{
  "parameters": {
    "url": "${context.websiteUrl}",              // From context
    "content": "${previousResults[0].output}",   // From previous step
    "timestamp": "${timestamp}"                   // Built-in variable
  }
}
```

### Conditional Steps

Execute steps based on conditions:

```json
{
  "name": "Send Alert",
  "description": "Alert if error count > 10",
  "tool": "notify:slack",
  "parameters": {...},
  "condition": "previousResults[0].output.errorCount > 10"
}
```

## Available SimpleMCP Tools

### AI & Analysis
- `ai:complete` - Generate text with AI
- `ai:vision` - Analyze images
- `ai:similarity` - Compare text similarity
- `ai:embed` - Generate embeddings

### Notifications
- `notify:slack` - Send Slack messages
- `notify:discord` - Send Discord messages
- `notify:email` - Send emails
- `notify:teams` - Send Teams messages
- `notify:broadcast` - Send to multiple platforms

### Data & Storage
- `database:query` - Execute SQL queries
- `database:insert` - Insert data
- `database:find` - Query with filters
- `database:backup` - Backup database
- `cloud:s3-upload` - Upload to S3
- `cloud:s3-download` - Download from S3
- `cloud:gcs-upload` - Upload to Google Cloud
- `cloud:azure-upload` - Upload to Azure

### Web & Scraping
- `scraper:extract` - Extract content from URLs
- `scraper:screenshot` - Capture screenshots
- `scraper:fill-form` - Automate forms
- `scraper:extract-links` - Get all links

### Documents
- `document:create-pdf` - Generate PDFs
- `document:create-excel` - Generate spreadsheets
- `document:create-word` - Generate Word docs
- `document:parse-csv` - Parse CSV files
- `document:create-invoice` - Generate invoices

### Version Control
- `github:create-issue` - Create GitHub issues
- `github:list-issues` - List repository issues

## Real-World Examples

### Example 1: Automated Content Monitoring

Monitor a website and get notified of changes:

```json
{
  "name": "content-monitor",
  "description": "Monitor website, detect changes, notify",
  "steps": [
    {
      "name": "Scrape Current Content",
      "tool": "scraper:extract",
      "parameters": {"url": "https://example.com/news"}
    },
    {
      "name": "Compare with Previous",
      "tool": "ai:similarity",
      "parameters": {
        "text1": "${context.previousContent}",
        "text2": "${previousResults[0].output}"
      }
    },
    {
      "name": "Alert on Changes",
      "tool": "notify:slack",
      "parameters": {
        "webhookUrl": "${context.slackWebhook}",
        "text": "Content changed! Similarity: ${previousResults[1].similarity}"
      },
      "condition": "previousResults[1].similarity < 0.9"
    }
  ]
}
```

### Example 2: Data Pipeline

ETL pipeline with AI enrichment:

```json
{
  "name": "data-pipeline",
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
        "tableName": "enriched_data",
        "data": "${previousResults[1].output}"
      }
    },
    {
      "name": "Generate Report",
      "tool": "document:create-pdf",
      "parameters": {
        "title": "Daily Analytics Report",
        "content": "${previousResults[1].output}"
      }
    }
  ]
}
```

### Example 3: Weekly Team Report

Aggregate data from multiple sources:

```json
{
  "name": "weekly-report",
  "description": "Compile weekly team report from GitHub, database, and analytics",
  "steps": [
    {
      "name": "Get GitHub Activity",
      "tool": "github:list-issues",
      "parameters": {"repo": "team/project", "state": "closed"}
    },
    {
      "name": "Query Database Metrics",
      "tool": "database:query",
      "parameters": {
        "dbPath": "./metrics.db",
        "query": "SELECT * FROM weekly_stats WHERE week = '${context.week}'"
      }
    },
    {
      "name": "Synthesize with AI",
      "tool": "ai:complete",
      "parameters": {
        "prompt": "Create executive summary from: GitHub: ${previousResults[0]}, Metrics: ${previousResults[1]}",
        "provider": "anthropic"
      }
    },
    {
      "name": "Create PDF Report",
      "tool": "document:create-report",
      "parameters": {
        "title": "Weekly Team Report",
        "summary": "${previousResults[2].output}",
        "data": "${previousResults[1].output}"
      }
    },
    {
      "name": "Email to Team",
      "tool": "notify:email",
      "parameters": {
        "to": "${context.teamEmail}",
        "subject": "Weekly Report - Week ${context.week}",
        "text": "${previousResults[2].output}"
      }
    }
  ]
}
```

## Scheduling Workflows with NCP Schedule MCP

The Workflow MCP is designed to be **invoked by the Schedule MCP** for automated execution.

### Setup: Schedule MCP + Workflow MCP

**Architecture**:
- **Schedule MCP** - Handles WHEN to run (timing, cron)
- **Workflow MCP** - Handles WHAT to run (intelligent task execution)

### Step 1: List Available Workflows

```bash
ncp run workflow:list-workflows
```

Returns:
```json
{
  "workflows": [
    {
      "name": "daily-standup",
      "description": "Daily standup: Check issues, summarize, post to Slack",
      "requiredContext": ["slackWebhook", "repo"],
      "recommendedSchedule": "0 9 * * 1-5"
    }
  ]
}
```

### Step 2: Add to Schedule MCP

```bash
# Schedule daily standup for weekdays at 9am
ncp run schedule:add \
  name="daily-standup" \
  command="ncp run workflow:execute workflowName=daily-standup context='{\"slackWebhook\":\"https://hooks.slack.com/...\",\"repo\":\"owner/repo\"}'" \
  schedule="0 9 * * 1-5"

# Schedule content pipeline daily at midnight
ncp run schedule:add \
  name="content-pipeline" \
  command="ncp run workflow:execute workflowName=content-pipeline context='{\"sourceUrl\":\"https://...\",\"recipient\":\"team@company.com\"}'" \
  schedule="0 0 * * *"

# Schedule data sync daily at 2am
ncp run schedule:add \
  name="data-sync" \
  command="ncp run workflow:execute workflowName=data-sync context='{\"dbPath\":\"./data.db\",\"s3Bucket\":\"backups\",\"slackWebhook\":\"...\"}'" \
  schedule="0 2 * * *"
```

### Step 3: Verify Schedule

```bash
# List all scheduled tasks
ncp run schedule:list

# Check specific schedule
ncp run schedule:get name="daily-standup"
```

### Step 4: Run Manually (Test Before Scheduling)

Always test your workflow manually first:

```bash
# Test the workflow command
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{"slackWebhook":"https://...","repo":"owner/repo"}'

# If it works, add to schedule
```

### Example: Complete Setup Flow

```bash
# 1. Test workflow manually
ncp run workflow:execute \
  workflowName="daily-standup" \
  context='{"slackWebhook":"https://hooks.slack.com/services/T00/B00/XXX","repo":"anthropics/claude-code"}'

# 2. If successful, schedule it
ncp run schedule:add \
  name="team-standup" \
  command="ncp run workflow:execute workflowName=daily-standup context='{\"slackWebhook\":\"https://hooks.slack.com/services/T00/B00/XXX\",\"repo\":\"anthropics/claude-code\"}'" \
  schedule="0 9 * * 1-5" \
  description="Daily standup summary posted to Slack"

# 3. Verify it's scheduled
ncp run schedule:list

# 4. Remove if needed
ncp run schedule:remove name="team-standup"
```

### Advanced: Multiple Workflows on Different Schedules

```bash
# Morning standup
ncp run schedule:add \
  name="morning-standup" \
  command="ncp run workflow:execute workflowName=daily-standup context='...'" \
  schedule="0 9 * * 1-5"

# Hourly content check
ncp run schedule:add \
  name="hourly-content-monitor" \
  command="ncp run workflow:execute-task task='Check website for changes and alert if needed' context='...'" \
  schedule="0 * * * *"

# Nightly backup
ncp run schedule:add \
  name="nightly-backup" \
  command="ncp run workflow:execute workflowName=data-sync context='...'" \
  schedule="0 2 * * *"

# Weekly report
ncp run schedule:add \
  name="weekly-report" \
  command="ncp run workflow:execute-custom workflow='...'" \
  schedule="0 9 * * 1"
```

## Advanced Features

### Error Handling

Workflows automatically stop on errors and report:

```json
{
  "workflowName": "daily-standup",
  "status": "failed",
  "results": [
    {"step": "Fetch Issues", "success": true, "output": {...}},
    {"step": "Summarize", "success": false, "error": "API key invalid"}
  ]
}
```

### Workflow State

Every execution returns complete state:

```json
{
  "workflowName": "content-pipeline",
  "currentStep": 3,
  "status": "completed",
  "startTime": "2024-01-15T09:00:00Z",
  "endTime": "2024-01-15T09:02:30Z",
  "results": [
    {
      "step": "Scrape Content",
      "success": true,
      "output": {...},
      "timestamp": "2024-01-15T09:00:15Z"
    },
    // ... more results
  ]
}
```

### Conditional Execution

Steps execute only when conditions are met:

```json
{
  "name": "Alert on High Error Rate",
  "tool": "notify:slack",
  "parameters": {...},
  "condition": "previousResults[0].output.errorRate > 0.05"
}
```

## Best Practices

### 1. Start Simple

Begin with 2-3 steps, add complexity gradually:

```json
{
  "steps": [
    {"name": "Fetch data", "tool": "..."},
    {"name": "Process", "tool": "ai:complete"},
    {"name": "Notify", "tool": "notify:slack"}
  ]
}
```

### 2. Use Context for Configuration

Pass environment-specific values via context:

```bash
# Development
ncp run workflow:execute workflowName="..." context='{"env":"dev","dbPath":"./dev.db"}'

# Production
ncp run workflow:execute workflowName="..." context='{"env":"prod","dbPath":"./prod.db"}'
```

### 3. Test Steps Individually

Before creating a workflow, test each tool separately:

```bash
# Test scraping
ncp run scraper:extract url="https://example.com"

# Test AI
ncp run ai:complete prompt="Summarize this..." provider="anthropic"

# Then combine in workflow
```

### 4. Use Descriptive Names

Make workflows self-documenting:

```json
{
  "name": "github-issues-to-slack-summary",
  "description": "Fetch GitHub issues, generate AI summary, post to Slack",
  "steps": [
    {"name": "Fetch Open Issues from Repository", ...},
    {"name": "Generate Natural Language Summary", ...},
    {"name": "Post Summary to Team Channel", ...}
  ]
}
```

### 5. Handle Failures Gracefully

Add notification steps with conditions:

```json
{
  "name": "Notify on Failure",
  "tool": "notify:slack",
  "parameters": {
    "text": "Workflow failed at step: ${context.failedStep}"
  },
  "condition": "status === 'failed'"
}
```

## Troubleshooting

### Workflow Not Executing

1. Check API key is configured:
   ```bash
   # Should show ANTHROPIC_API_KEY
   cat ~/.ncp/all.json | grep ANTHROPIC
   ```

2. Verify workflow exists:
   ```bash
   ncp run workflow:execute workflowName="invalid-name"
   # Shows available workflows
   ```

### Tool Calls Failing

1. Ensure tool MCPs are loaded:
   ```bash
   ncp list  # Should show github, notify, etc.
   ```

2. Check tool parameters match schema:
   ```bash
   ncp find "github:list-issues"  # Shows required parameters
   ```

### Context Variables Not Working

Use correct syntax:
- `${context.variableName}` - From context parameter
- `${previousResults[0].output}` - From previous step
- `${timestamp}` - Built-in variables

## Summary

The Workflow MCP turns Claude into an **intelligent task orchestrator** that can:

✅ Execute multi-step workflows with intelligent decision-making
✅ Coordinate multiple SimpleMCPs as tools
✅ Handle conditional logic and error cases
✅ Generate workflows from natural language
✅ Be scheduled for automated recurring tasks

**Key Innovation**: Claude isn't just executing steps—it's **reasoning about the results** and making intelligent decisions at each stage.

Start with built-in workflows, then create your own custom automations!
