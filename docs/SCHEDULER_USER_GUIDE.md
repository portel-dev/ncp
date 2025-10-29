# Scheduler User Guide

## Quick Start

Schedule any MCP tool to run automatically using natural language or cron expressions.

### Basic Example

```bash
# Schedule a daily backup check
ncp schedule create filesystem:list_directory "every day at 2am" \
  --name "Daily Backup Check" \
  --params '{"path": "/backups"}'

# Check what's scheduled
ncp schedule list

# View execution history
ncp schedule executions
```

## Installation & Requirements

**Supported Platforms:**
- ✅ Unix/Linux/macOS (full support)
- ❌ Windows (not supported - no native cron)

**Requirements:**
- Node.js environment with system access
- `crontab` command available
- Permission to modify crontab

**Check Availability:**
```bash
ncp schedule list
# If you see an error, scheduler is not available on your platform
```

## macOS Permissions

**The scheduler works automatically by default**, but macOS will show a permission dialog when you create your first schedule:

```
"[App Name]" would like to access data from other apps.
```

**You have two options:**

1. **Simply accept the dialog each time** - Click "Allow" when scheduling. The scheduler will work fine.

2. **One-time setup to prevent the dialog** - Grant automation permission permanently so the dialog never appears again.

**[→ See detailed setup instructions](SCHEDULER_MACOS_PERMISSIONS.md)** if you want to configure permissions to avoid the dialog.

> **Why this happens:** The scheduler modifies your system's crontab to ensure scheduled tasks run reliably, even when NCP is not active. macOS requires permission for this automation.

## Natural Language Schedules

The scheduler understands human-friendly schedules:

### Every X Minutes
```bash
"every minute"
"every 5 minutes"
"every 30 minutes"
```

### Hourly
```bash
"every hour"
"hourly"
```

### Daily
```bash
"every day at 9am"
"daily at 2:30pm"
"every day at noon"
"every day at midnight"
```

### Weekdays
```bash
"every weekday at 9am"
"monday to friday at 5pm"
```

### Weekends
```bash
"every weekend at 10am"
```

### Specific Days
```bash
"every monday at 9am"
"every friday at 5pm"
"every sunday at noon"
```

### Monthly
```bash
"monthly at 9am"
"first day of the month at 10am"
```

### One-Time (Relative)
```bash
"in 5 minutes"
"in 2 hours"
"in 1 day"
```

## Cron Expressions

For advanced scheduling, use standard cron expressions:

```bash
# Format: minute hour day month weekday
"0 9 * * *"           # Every day at 9am
"*/15 * * * *"        # Every 15 minutes
"0 0 * * 0"           # Every Sunday at midnight
"30 14 * * 1-5"       # Weekdays at 2:30pm
"0 9 1 * *"           # First of month at 9am
```

## Common Use Cases

### 1. Daily Backup Verification
```bash
ncp schedule create filesystem:list_directory "every day at 2am" \
  --name "Daily Backup Check" \
  --description "Verify backup directory exists and has recent files" \
  --params '{"path": "/backups"}' \
  --test-run
```

### 2. Hourly Health Check
```bash
ncp schedule create http:get "every hour" \
  --name "Service Health Check" \
  --description "Check if service is responding" \
  --params '{"url": "https://api.example.com/health"}'
```

### 3. Weekly Report Generation
```bash
ncp schedule create database:query "every monday at 9am" \
  --name "Weekly Report" \
  --description "Generate weekly analytics report" \
  --params '{"query": "SELECT * FROM weekly_stats"}'
```

### 4. One-Time Reminder
```bash
ncp schedule create slack:send_message "in 30 minutes" \
  --name "Meeting Reminder" \
  --description "Remind team about meeting" \
  --params '{"channel": "#team", "text": "Meeting in 5 minutes!"}' \
  --fire-once
```

### 5. Limited Execution Job
```bash
ncp schedule create api:sync_data "every hour" \
  --name "Data Sync - 24h Test" \
  --description "Test data sync for 24 hours" \
  --params '{"source": "prod", "target": "staging"}' \
  --max-executions 24
```

### 6. Time-Boxed Campaign
```bash
ncp schedule create social:post "every day at 9am" \
  --name "Holiday Campaign" \
  --description "Daily posts until Jan 1st" \
  --params '{"message": "Happy Holidays!"}' \
  --end-date "2026-01-01T00:00:00Z"
```

## Job Management

### Create a Job
```bash
ncp schedule create <tool> <schedule> \
  --name "Job Name" \
  --params '{"param": "value"}' \
  [options]

Options:
  --description <text>      Job description
  --fire-once               Run only once
  --max-executions <num>    Max times to run
  --end-date <iso-date>     Stop after date
  --test-run                Test before scheduling
  --skip-validation         Skip parameter validation (not recommended)
```

### List All Jobs
```bash
# Simple list
ncp schedule list

# Filter by status
ncp schedule list --status active
ncp schedule list --status paused
```

### Get Job Details
```bash
ncp schedule get "Job Name"
# or
ncp schedule get job-id-123
```

### Pause a Job
```bash
ncp schedule pause "Job Name"
```

### Resume a Job
```bash
ncp schedule resume "Job Name"
```

### Delete a Job
```bash
# With confirmation
ncp schedule delete "Job Name"

# Skip confirmation
ncp schedule delete "Job Name" -y
```

## Execution History

### View All Executions
```bash
ncp schedule executions
```

### View Job-Specific History
```bash
ncp schedule executions --job-id "Job Name"
```

### Filter by Status
```bash
ncp schedule executions --status success
ncp schedule executions --status failure
ncp schedule executions --status timeout
```

### View Specific Execution
```bash
ncp schedule executions --execution-id exec-abc-123
```

## Maintenance

### Clean Old Records
```bash
# Delete executions older than 30 days
ncp schedule cleanup --max-age 30

# Keep only last 10 executions per job
ncp schedule cleanup --max-per-job 10

# Combine both
ncp schedule cleanup --max-age 30 --max-per-job 10
```

## Best Practices

### 1. Always Test First
```bash
# Use --test-run to verify parameters work
ncp schedule create my:tool "every day at 9am" \
  --name "Important Job" \
  --params '{"key": "value"}' \
  --test-run
```

### 2. Use Descriptive Names
```bash
# ❌ Bad
--name "Job 1"

# ✅ Good
--name "Daily Database Backup - Production"
```

### 3. Add Descriptions
```bash
--description "Backs up production database to S3. Runs at 2am to minimize impact. Retains last 7 days."
```

### 4. Set Execution Limits
```bash
# For testing
--max-executions 3

# For campaigns
--end-date "2026-01-01T00:00:00Z"
```

### 5. Monitor Execution History
```bash
# Check regularly for failures
ncp schedule executions --status failure
```

### 6. Clean Up Regularly
```bash
# Add to cron or run monthly
ncp schedule cleanup --max-age 90 --max-per-job 20
```

## Validation

The scheduler validates tool parameters **before** scheduling to prevent silent failures.

### Automatic Validation
```bash
# Validation happens automatically
ncp schedule create filesystem:write_file "every day" \
  --name "Daily Log" \
  --params '{"path": "/logs/app.log", "content": "test"}'

# If validation fails, you'll see errors immediately:
# ❌ Tool validation failed:
# - Parameter 'path' must be writable
# - File '/logs' does not exist
```

### Skip Validation (Not Recommended)
```bash
# Only if you're sure parameters are correct
--skip-validation
```

### Test Execution
```bash
# Actually run the tool once as a test
--test-run

# This executes the tool immediately to verify it works
# If successful, job is scheduled
# If fails, error is shown and job is not scheduled
```

## Troubleshooting

### "Scheduler not available"
**Cause:** Platform doesn't support cron (Windows) or crontab not found

**Solution:**
```bash
# Check platform
uname -s  # Should be Darwin/Linux

# Check crontab
which crontab

# On macOS, grant Terminal full disk access:
# System Preferences → Security & Privacy → Full Disk Access → Enable Terminal
```

### "Permission denied" on crontab
**Cause:** User doesn't have crontab permissions

**Solution:**
```bash
# Check if you're in the cron group (Linux)
groups

# Add yourself to cron group
sudo usermod -a -G cron $USER

# On macOS, check System Preferences
```

### Jobs not executing
**Check crontab:**
```bash
crontab -l | grep NCP

# You should see entries like:
# NCP_JOB: job-id-123
# 0 9 * * * ncp _job-run job-id-123
```

**Check execution history:**
```bash
ncp schedule executions --job-id "Job Name"

# Look for error messages
```

**Test manually:**
```bash
# Get job ID
ncp schedule get "Job Name"

# Execute manually
ncp _job-run <job-id>

# Check for errors
```

### Validation failures
**View validation errors:**
```bash
ncp schedule create my:tool "every day" \
  --name "Test" \
  --params '{"bad": "params"}'

# Error shows specific validation issues
```

**Test tool directly:**
```bash
# Try running the tool first
ncp run my:tool --params '{"param": "value"}'
```

### Jobs running but failing
**Check execution logs:**
```bash
# View failed executions
ncp schedule executions --status failure

# Get specific execution details
ncp schedule executions --execution-id <exec-id>
```

**Common issues:**
- Parameters valid at schedule time but environment changed
- Tool depends on external service that's down
- File paths or permissions changed

## Advanced Features

### Using with AI
The scheduler is exposed via `ncp find`, so AI can discover and use it:

```
AI: "Schedule a daily backup check"

You: ncp find schedule
# AI sees: scheduler:schedule tool

AI: Uses scheduler:schedule to create the job
```

### Validation Protocol
The scheduler implements the MCP Validation Protocol, allowing MCPs to provide deep validation:

```bash
# MCPs can implement tools/validate for advanced checks
# scheduler:validate is the reference implementation
ncp run scheduler:validate --params '{
  "tool": "filesystem:write_file",
  "arguments": {"path": "/test", "content": "data"}
}'
```

### Job Statistics
```bash
# View scheduler statistics
ncp run scheduler:get_stats

# Shows:
# - Total jobs
# - Active/paused/completed
# - Execution statistics
# - Success/failure rates
```

## Storage Locations

Jobs and execution records are stored in:
```
~/.ncp/scheduler/
├── jobs.json              # Job definitions
└── executions/
    ├── summary.csv        # Execution summary (fast queries)
    └── results/
        └── exec-*.json    # Detailed results
```

## Cron Integration

Jobs are added to your user's crontab in a managed section:
```bash
crontab -l

# Shows:
# === NCP SCHEDULED JOBS - DO NOT EDIT MANUALLY ===
# NCP_JOB: job-id-123
# 0 9 * * * ncp _job-run job-id-123
# === END NCP SCHEDULED JOBS ===
```

**Important:** Don't edit the NCP section manually - use `ncp schedule` commands instead.

## Examples by Industry

### DevOps
```bash
# Check disk space
ncp schedule create system:disk_usage "every 6 hours" \
  --name "Disk Space Monitor" \
  --params '{"path": "/"}' \
  --max-executions 28  # 7 days

# Restart service if unhealthy
ncp schedule create http:health_check "every 5 minutes" \
  --name "Service Monitor" \
  --params '{"url": "http://localhost:8080/health"}'
```

### Marketing
```bash
# Daily social media posts
ncp schedule create social:post "every day at 9am" \
  --name "Daily Tweet" \
  --params '{"platform": "twitter", "message": "..."}'

# Weekly newsletter
ncp schedule create email:send "every monday at 8am" \
  --name "Weekly Newsletter" \
  --params '{"template": "newsletter", "list": "subscribers"}'
```

### Data Science
```bash
# Hourly data sync
ncp schedule create database:sync "every hour" \
  --name "Data Warehouse Sync" \
  --params '{"source": "prod", "target": "analytics"}'

# Daily model training
ncp schedule create ml:train_model "every day at 3am" \
  --name "Model Retraining" \
  --params '{"dataset": "latest", "model": "classifier"}'
```

### Finance
```bash
# Market data collection
ncp schedule create api:fetch_stock_prices "every weekday at 9:30am" \
  --name "Market Open Data" \
  --params '{"symbols": ["AAPL", "GOOGL"]}'

# End-of-day reconciliation
ncp schedule create finance:reconcile "every weekday at 5pm" \
  --name "Daily Reconciliation" \
  --params '{"account": "trading"}'
```

## FAQ

**Q: Can I schedule jobs to run when NCP is not running?**
A: Yes! Jobs run via system cron, independent of NCP.

**Q: What happens if my computer is off at execution time?**
A: Job is skipped. Cron only runs jobs when the system is on.

**Q: Can I use this in a desktop extension?**
A: Yes! Desktop extensions (VS Code, Electron) have full Node.js access.

**Q: Can I schedule a job to run every second?**
A: No. Cron's minimum interval is 1 minute.

**Q: What if a job takes longer than the interval?**
A: Cron starts a new execution. Multiple instances may run concurrently.

**Q: Can I schedule jobs in different time zones?**
A: Jobs use system time zone. Set via OS timezone settings.

**Q: How do I backup my scheduled jobs?**
A: Copy `~/.ncp/scheduler/jobs.json`

**Q: Can I edit jobs.json manually?**
A: Not recommended. Use `ncp schedule update` instead.

---

**Need Help?**
- Report issues: https://github.com/portel-dev/ncp/issues
- Documentation: See `docs/` directory
- MCP Validation Protocol: `docs/MCP_VALIDATION_PROTOCOL.md`
