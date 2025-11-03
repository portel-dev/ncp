# NCP Comprehensive Test Prompt

**Prerequisites**:
- Install ncp.dxt in Claude Desktop
- Clean state: Only `~/.ncp/micromcps/` exists with calculator, string, and workflow MicroMCPs

---

## Part 1: Verify Clean Architecture (CRITICAL)

### Test 1.1: Only 2 Tools Exposed
**Goal**: Verify NCP doesn't overwhelm AI with tools

Open Claude Desktop tools panel. You should see **ONLY 2 tools**:
- `find` - Tool discovery
- `run` - Tool execution

❌ **FAIL if you see**: mcp:add, schedule:create, analytics:overview, shell:execute, etc.
✅ **PASS if you see**: Only find and run

---

## Part 2: MicroMCP Discovery & Testing

### Test 2.1: Discover User-Installed MicroMCPs
**Goal**: Verify MicroMCPs in ~/.ncp/micromcps/ are auto-discovered

```
find with description "calculator add"
```

**Expected**: Should find calculator:add, calculator:subtract, calculator:multiply, calculator:divide, calculator:power

### Test 2.2: Execute Calculator MicroMCP
**Goal**: Verify MicroMCP execution works

```
run with tool "calculator:add" and parameters {"a": 15, "b": 27}
```

**Expected**: Returns 42

### Test 2.3: Execute String MicroMCP
```
run with tool "string:uppercase" and parameters {"text": "hello world"}
```

**Expected**: Returns "HELLO WORLD"

### Test 2.4: List All User MicroMCPs
```
find with description "calculator | string | workflow"
```

**Expected**: Should show all tools from all 3 MicroMCPs

---

## Part 3: Shell MicroMCP & CLI Discovery

### Test 3.1: Enable Shell MicroMCP
1. Open NCP settings in Claude Desktop
2. Toggle **ON**: "Enable Shell MicroMCP (Built-in)"
3. Save and restart Claude Desktop

### Test 3.2: Verify Shell Tools Available
```
find with description "shell execute"
```

**Expected**: Should find shell:execute, shell:run, shell:which, shell:getEnv, shell:ls, shell:pwd, shell:cd

### Test 3.3: Execute Shell Command
```
run with tool "shell:run" and parameters {"command": "echo 'Hello from Shell MicroMCP'"}
```

**Expected**: Returns "Hello from Shell MicroMCP"

### Test 3.4: Check Command Existence
```
run with tool "shell:which" and parameters {"command": "git"}
```

**Expected**: Returns path to git binary (e.g., /usr/bin/git)

### Test 3.5: Enable CLI Discovery
1. Open NCP settings
2. Toggle **ON**: "Enable CLI Discovery (Built-in)"
3. Save and restart Claude Desktop

### Test 3.6: Verify CLI Tools Discovered
```
find with description "ffmpeg convert video"
```

**Expected**: Should find ffmpeg and related tools (if installed)

```
find with description "git version control"
```

**Expected**: Should find git tools

---

## Part 4: MCP Management (Built-in)

### Test 4.1: List Current MCPs
```
run with tool "mcp:list" and parameters {}
```

**Expected**: Shows auto-imported MCPs from Claude Desktop

### Test 4.2: Add New MCP from Registry
```
run with tool "mcp:add" and parameters {"mcp_name": "filesystem"}
```

**Expected**:
- Prompts for confirmation
- Downloads and configures filesystem MCP
- Shows success message

### Test 4.3: Verify New MCP Available
```
find with description "read file"
```

**Expected**: Should find filesystem:read_file, filesystem:read_multiple_files, etc.

### Test 4.4: MCP Health Check
```
run with tool "mcp:doctor" and parameters {}
```

**Expected**: Shows health status of all MCPs (connection times, failures, etc.)

### Test 4.5: Export Configuration
```
run with tool "mcp:export" and parameters {"to": "clipboard"}
```

**Expected**: Configuration copied to clipboard

### Test 4.6: Remove MCP
```
run with tool "mcp:remove" and parameters {"mcp_name": "filesystem"}
```

**Expected**:
- Shows confirmation prompt
- Removes MCP from configuration
- Success message

---

## Part 5: Scheduler (Built-in)

### Test 5.1: Create Scheduled Job
```
run with tool "schedule:create" and parameters {
  "name": "Daily Calculator Test",
  "tool": "calculator:add",
  "parameters": {"a": 5, "b": 10},
  "schedule": "every day at 2pm",
  "description": "Test scheduled calculator execution"
}
```

**Expected**: Job created successfully

### Test 5.2: Validate Schedule (Dry Run)
```
run with tool "schedule:validate" and parameters {
  "tool": "calculator:multiply",
  "parameters": {"a": 6, "b": 7},
  "schedule": "every monday at 9am"
}
```

**Expected**: Validation passes, shows schedule details

### Test 5.3: List All Scheduled Jobs
```
run with tool "schedule:list" and parameters {}
```

**Expected**: Shows "Daily Calculator Test" job

### Test 5.4: Get Job Details
```
run with tool "schedule:get" and parameters {"job_id": "Daily Calculator Test"}
```

**Expected**: Shows full job configuration

### Test 5.5: Pause Job
```
run with tool "schedule:pause" and parameters {"job_id": "Daily Calculator Test"}
```

**Expected**: Job paused successfully

### Test 5.6: Resume Job
```
run with tool "schedule:resume" and parameters {"job_id": "Daily Calculator Test"}
```

**Expected**: Job resumed successfully

### Test 5.7: View Execution History
```
run with tool "schedule:executions" and parameters {}
```

**Expected**: Shows execution history for all jobs

### Test 5.8: Update Job Schedule
```
run with tool "schedule:update" and parameters {
  "job_id": "Daily Calculator Test",
  "schedule": "every day at 3pm"
}
```

**Expected**: Schedule updated successfully

### Test 5.9: Delete Job
```
run with tool "schedule:delete" and parameters {"job_id": "Daily Calculator Test"}
```

**Expected**: Job deleted successfully

---

## Part 6: Analytics (Built-in)

### Test 6.1: View Usage Overview
```
run with tool "analytics:overview" and parameters {}
```

**Expected**: ASCII charts showing:
- Most used MCPs
- Tool execution counts
- Token savings
- Performance metrics

### Test 6.2: View Performance Report
```
run with tool "analytics:performance" and parameters {}
```

**Expected**: Charts showing:
- Fastest MCPs
- Reliability metrics
- Response times

### Test 6.3: View Detailed Usage Stats
```
run with tool "analytics:usage" and parameters {}
```

**Expected**: Tables showing:
- Most used MCPs
- Tool counts
- Hourly patterns
- Peak usage times

### Test 6.4: View Today's Analytics Only
```
run with tool "analytics:overview" and parameters {"today": true}
```

**Expected**: Shows only today's data

---

## Part 7: Auto-Import & Integration

### Test 7.1: Verify Auto-Import Worked
**Goal**: Check that Claude Desktop's MCPs were imported automatically

```
run with tool "mcp:list" and parameters {}
```

**Expected**: Should show MCPs from your Claude Desktop config (if any)

### Test 7.2: Search Across All MCPs
```
find with description "send email | read file | execute code"
```

**Expected**: Results from multiple MCPs (Claude Desktop's + NCP's + MicroMCPs)

---

## Part 8: Advanced Search & Discovery

### Test 8.1: Semantic Search
```
find with description "convert video to mp4"
```

**Expected**: Finds relevant tools (ffmpeg if CLI discovery enabled)

### Test 8.2: Multi-Query Search (Pipe Separator)
```
find with description "add numbers | uppercase text | schedule task"
```

**Expected**: Finds tools from calculator, string, and scheduler

### Test 8.3: List All Tools (Pagination)
```
find with limit 10 and page 1
```

**Expected**: Shows first 10 tools from all MCPs

### Test 8.4: Deep Dive (Full Parameters)
```
find with description "calculator" and depth 2
```

**Expected**: Shows calculator tools with full parameter schemas

### Test 8.5: Adjust Search Sensitivity
```
find with description "math" and confidence_threshold 0.1
```

**Expected**: Shows more loosely related results

---

## Part 9: Settings Verification

### Test 9.1: Verify All Settings Toggles Exist
Open NCP settings panel. Should see:

1. ✅ Enable Global CLI Access
2. ✅ Auto-import Client MCPs
3. ✅ Enable Debug Logging
4. ✅ Confirm Modifications Before Run
5. ✅ Enable Log Rotation
6. ✅ Enable Scheduler (Built-in)
7. ✅ Enable MCP Management (Built-in)
8. ✅ **Enable Shell MicroMCP (Built-in)** ← NEW
9. ✅ **Enable CLI Discovery (Built-in)** ← NEW

### Test 9.2: Test Confirmation Dialog
1. Ensure "Confirm Modifications Before Run" is ON
2. Try to add an MCP:
```
run with tool "mcp:add" and parameters {"mcp_name": "test"}
```

**Expected**: Shows confirmation dialog before executing

### Test 9.3: Test Without Confirmation
1. Turn OFF "Confirm Modifications Before Run"
2. Try same command again

**Expected**: Executes immediately without dialog

---

## Part 10: Complete Workflow Test

### Test 10.1: End-to-End User Journey

1. **Install NCP DXT** - Double-click to install
2. **Verify clean start** - Only find and run tools visible
3. **Enable features** - Turn on Shell and CLI Discovery
4. **Discover tools** - Search for calculator, string, shell tools
5. **Execute tools** - Run calculations, string operations, shell commands
6. **Add MCP** - Install filesystem MCP via mcp:add
7. **Create schedule** - Schedule a daily task
8. **Check analytics** - View usage stats
9. **Health check** - Run mcp:doctor
10. **Export config** - Backup configuration

**Expected**: All steps work smoothly, no errors

---

## Success Criteria

✅ **Architecture**: Only 2 tools exposed (find, run)
✅ **MicroMCPs**: Calculator, string, workflow auto-discovered and working
✅ **Shell MicroMCP**: Toggleable, provides 8 CLI tools
✅ **CLI Discovery**: Auto-scans system tools, enhances search
✅ **MCP Management**: Add, remove, list, doctor, export all work
✅ **Scheduler**: Create, list, pause, resume, delete jobs work
✅ **Analytics**: Overview, performance, usage reports display correctly
✅ **Auto-import**: Claude Desktop MCPs imported automatically
✅ **Search**: Semantic search, pagination, depth control work
✅ **Settings**: All 9 toggles present and functional
✅ **Confirmations**: Modification prompts work when enabled
✅ **Performance**: Tool discovery < 2s, no crashes
✅ **No errors**: Clean logs, no stack traces

---

## Troubleshooting

**If Shell MicroMCP not showing:**
- Verify setting is ON in NCP settings
- Restart Claude Desktop
- Check: `find with description "shell execute"`

**If CLI Discovery not working:**
- Verify setting is ON
- Check platform (macOS/Linux/Windows)
- Restart Claude Desktop
- Check: `find with description "ffmpeg"`

**If MicroMCPs not loading:**
- Verify files exist: `~/.ncp/micromcps/*.micro.ts`
- Check: `find with description "calculator"`
- Look for errors in logs

**If scheduling fails:**
- Check: `run with tool "schedule:get" and parameters {"job_id": "job-name"}`
- Verify: `run with tool "schedule:executions" and parameters {}`
- Validate first: Use `schedule:validate` before `schedule:create`

**If only 2 tools NOT showing:**
- CRITICAL BUG: Internal MCPs being exposed directly
- Should see ONLY find and run, not mcp:*, schedule:*, analytics:*, shell:*
- File issue immediately

---

## Test Report Template

After testing, report results:

```
✅/❌ Part 1: Clean Architecture (Only 2 tools)
✅/❌ Part 2: MicroMCP Discovery (Calculator, String, Workflow)
✅/❌ Part 3: Shell & CLI Discovery
✅/❌ Part 4: MCP Management (Add, Remove, List, Doctor, Export)
✅/❌ Part 5: Scheduler (Create, List, Pause, Resume, Delete)
✅/❌ Part 6: Analytics (Overview, Performance, Usage)
✅/❌ Part 7: Auto-Import
✅/❌ Part 8: Advanced Search
✅/❌ Part 9: Settings (All 9 toggles)
✅/❌ Part 10: Complete Workflow

Issues Found:
[List any errors, unexpected behavior, or missing features]

Performance:
- Tool discovery speed: ___s
- Tool execution speed: ___s
- Memory usage: ___MB
```

---

**Ready to test!** Copy this entire prompt into a new Claude Desktop conversation and work through each test systematically.
