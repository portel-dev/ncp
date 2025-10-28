/**
 * Test-Drive Features Guide Resource
 *
 * Helps users understand and explore NCP's full potential
 * through guided, hands-on examples
 */

export const TEST_DRIVE_GUIDE = {
  name: 'ncp:test-drive',
  uri: 'ncp://test-drive/guide',
  description: 'Interactive guide to test-drive NCP features',
  mimeType: 'text/markdown',
  content: `# 🚀 NCP Test-Drive Guide

Explore NCP's full potential with hands-on examples. Try each section to discover what's possible!

## 📚 Table of Contents

- [Quick Start](#quick-start)
- [Discovery Tools](#discovery-tools)
- [Running Tools](#running-tools)
- [Resources & Prompts](#resources--prompts)
- [Health & Status](#health--status)
- [MCP Management](#mcp-management)
- [Scheduler](#scheduler)
- [Advanced Workflows](#advanced-workflows)

---

## Quick Start

**What you'll need:**
- NCP installed and running
- An MCP client installed (Claude Desktop, Perplexity, etc.)
- Basic familiarity with your MCPs

**First steps:**
1. Run \`ncp list\` to see all configured MCPs
2. Run \`ncp find\` to discover available tools
3. Pick a safe read-only tool and run it with \`ncp run\`

---

## Discovery Tools

### Find: Search for Tools

**What it does:** Discover tools across all your MCPs using natural language.

**Try these examples:**

\`\`\`bash
# Search by task description (user story format works best)
ncp find "I want to read a file"
ncp find "I need to get information about a user"
ncp find "I want to write data to a database"

# List all available tools
ncp find

# List only from a specific MCP
ncp find github
\`\`\`

**Why this matters:** Instead of memorizing tool names across 20+ MCPs, describe what you want to do. NCP finds the right tools.

**Advanced options:**
- \`--depth 2\` - Show full tool schemas
- \`--confidence 0.5\` - Adjust search strictness
- \`--limit 20\` - Change results per page

---

### List: See Your MCPs

**What it does:** Display all configured MCPs and their tools.

\`\`\`bash
# Show MCPs in current profile
ncp list

# Count tools per MCP
ncp list | grep "Tools:"

# Show MCPs from specific profile
ncp list --profile all
\`\`\`

---

## Running Tools

### Run: Execute Tools Safely

**What it does:** Execute any MCP tool with automatic validation and error handling.

**Try these:**

\`\`\`bash
# Read a file (safe, read-only)
ncp run filesystem:read_file path=/etc/hostname

# Get GitHub issue (safe, read-only)
ncp run github:get_issue owner=anthropics repo=claude-code number=123

# Preview before executing (dry-run)
ncp run filesystem:write_file path=/tmp/test.txt content="hello" --dry-run

# Execute after seeing the preview
ncp run filesystem:write_file path=/tmp/test.txt content="hello"
\`\`\`

**Safety features:**
- Dry-run shows exactly what will happen
- Confirmation dialogs for dangerous operations
- Parameter validation before execution
- Error handling with helpful messages

**Dangerous operations (require confirmation):**
- Writing/deleting files
- Executing shell commands
- Modifying databases
- Sending emails/messages
- Financial transactions

---

## Resources & Prompts

### Resources: Access MCP Data

**What it does:** Read resources (docs, data, files) from your MCPs.

\`\`\`bash
# List all available resources
ncp resources list

# Read a specific resource
ncp resources read github:issue-123
ncp resources read notion:database-records
ncp resources read slack:conversation-history
\`\`\`

**Try this:**
1. Run \`ncp resources list\` to see what's available
2. Pick one and run \`ncp resources read <name>\`
3. See how MCPs transparently expose their data

---

### Prompts: Decision-Making Templates

**What it does:** Use MCP prompts to guide decision-making and generate content.

\`\`\`bash
# List all available prompts
ncp prompts list

# Use an MCP prompt
ncp prompts get github:pr-template repository=my-repo
ncp prompts get slack:message-template channel=general tone=professional
ncp prompts get notion:page-template database=projects
\`\`\`

**Why this matters:** Prompts help MCPs generate content, templates, and decisions tailored to your use case.

---

## Health & Status

### Monitor Your MCPs

**What it does:** See which MCPs are healthy and ready to use.

\`\`\`bash
# Show MCP health status
ncp status

# See what went wrong
ncp status --detailed

# Watch status in real-time
watch "ncp status"
\`\`\`

**What to look for:**
- ✅ Green = MCP is healthy and ready
- ⚠️ Yellow = MCP has issues but may still work
- ❌ Red = MCP is not available

---

## MCP Management

### Add & Remove MCPs

**What it does:** Configure which MCPs are available.

**Add an MCP (auto-detect):**

\`\`\`bash
# Simple: let NCP find it in the registry
ncp add github

# NCP will show available versions:
# 1. GitHub MCP by Anthropic (official)
# 2. GitHub MCP by Portel (alternative)
# Select one and configure credentials
\`\`\`

**Add an MCP (manual):**

\`\`\`bash
# From registry (auto-detects transport)
ncp add my-mcp

# Manual stdio server
ncp add my-mcp npx @my-org/my-mcp

# HTTP/SSE servers: Use registry or manual config edit
# (Manual HTTP URLs not supported via CLI)
\`\`\`

**Manage MCPs:**

\`\`\`bash
# List all MCPs
ncp list

# Remove an MCP
ncp remove github

# Export your configuration
ncp export --to clipboard

# Import from another user
ncp import --from clipboard
\`\`\`

**Tips:**
- Use \`--profile <name>\` to manage multiple configurations
- Backup with \`ncp export --to file config-backup.json\`
- Test new MCPs with \`--dry-run\` before committing

---

## Scheduler

### Schedule Tool Executions

**What it does:** Run tools automatically on a schedule (cron).

\`\`\`bash
# Schedule daily report generation
ncp schedule create \\
  --name "Daily Report" \\
  --tool github:get_issues \\
  --params '{"repository":"my-repo"}' \\
  --schedule "0 9 * * *" \\
  --timezone "America/New_York"

# List scheduled jobs
ncp schedule retrieve

# View execution history
ncp schedule retrieve --job daily-report --executions

# Pause a job
ncp schedule update --job daily-report --active false

# Resume a job
ncp schedule update --job daily-report --active true

# Remove a job
ncp schedule delete --job daily-report
\`\`\`

**Schedule formats:**
- Cron: \`0 9 * * *\` (9 AM daily)
- Natural language: \`every day at 9am\` or \`every weekday at 2:30pm\`
- RFC 3339: \`2025-12-25T15:00:00-05:00\` (one-time)

---

## Advanced Workflows

### Workflow 1: Search, Review, Then Execute

\`\`\`bash
# 1. Find what you need
ncp find "I want to create a GitHub issue"

# 2. See details
ncp run github:create_issue \\
  owner=myorg \\
  repo=my-repo \\
  title="Test Issue" \\
  body="Testing workflow" \\
  --dry-run

# 3. User confirms in dialog
# 4. Execute
ncp run github:create_issue \\
  owner=myorg \\
  repo=my-repo \\
  title="Test Issue" \\
  body="Testing workflow"
\`\`\`

### Workflow 2: Multi-MCP Orchestration

\`\`\`bash
# Search across all MCPs
ncp find "send notification"

# Execute from specific MCP
ncp run slack:send_message \\
  channel=#notifications \\
  text="Process complete"

# Chain with other tools
ncp run github:create_comment \\
  repo=my-repo \\
  issue=42 \\
  body="Notification sent to Slack"
\`\`\`

### Workflow 3: Data Extraction to Processing

\`\`\`bash
# Read data from one MCP
ncp resources read github:pr-123

# Process with another MCP
ncp run notion:create_page \\
  database=archive \\
  title="PR Summary" \\
  content="<from previous resource>"

# Document the process
ncp schedule create \\
  --name "Weekly Archive" \\
  --schedule "0 17 * * 5"
\`\`\`

---

## Configuration

### Customize NCP Behavior

\`\`\`bash
# Show current settings
ncp config

# Edit interactively
ncp config
# (prompts for each setting)

# Quick edit
ncp config confirmModifications off
ncp config debugLogging on
ncp config autoImport true
\`\`\`

**Available settings:**
- \`autoImport\` - Auto-sync from MCP client on startup
- \`debugLogging\` - Show detailed logs
- \`confirmModifications\` - Ask before dangerous operations
- \`enableScheduler\` - Enable scheduled jobs
- \`enableMCPManagement\` - Enable add/remove MCPs

---

## Tips & Tricks

### Performance

- Use \`--depth 0\` for faster searches (names only)
- Cache tools locally: \`ncp find --depth 2 > tools.json\`
- Limit MCP connections: Use \`ncp config\` to tune

### Security

- Always use dry-run for unfamiliar tools
- Review parameter values before executing
- Enable \`confirmModifications\` for important work
- Check MCP health before critical operations

### Debugging

- Enable debug logs: \`ncp config debugLogging on\`
- Check MCP status: \`ncp status --detailed\`
- Review recent executions: \`ncp log\`
- Test tool parameters: \`ncp run <tool> --dry-run\`

---

## Next Steps

1. **Start small:** Try \`ncp find\` and \`ncp run\` with read-only tools
2. **Explore gradually:** Add more MCPs as you discover needs
3. **Automate:** Use scheduler for repetitive tasks
4. **Share:** Export configurations and share with teammates

---

## Common Questions

**Q: Is it safe to try things?**
A: Yes! Use dry-run for any tool you're unsure about.

**Q: Can I break something?**
A: Dangerous operations require confirmation. You control what happens.

**Q: How do I undo a change?**
A: MCPs handle their own data. Check the MCP's documentation for undo/recovery.

**Q: Can I use NCP in scripts?**
A: Yes! Use \`ncp run\` in bash/Python scripts. Combine with \`--quiet\` for cleaner output.

**Q: What if an MCP fails?**
A: Check \`ncp status\`. NCP shows which MCPs are unhealthy and why.

---

## Resources

- [NCP Documentation](../README.md)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Anthropic MCP Servers](https://github.com/anthropics/mcp-servers)
- [Community MCPs](https://github.com/modelcontextprotocol/servers)

---

**Happy exploring! 🎉**
`
};
