# Testing Intelligence MicroMCP

## Quick Test (Via Claude Desktop)

### Step 1: Verify Intelligence MCP is loaded

Ask Claude:
```
Find tools related to intelligence or intent
```

**Expected output:**
```
intelligence:create_intent
intelligence:execute
intelligence:teach
intelligence:analyze_before
intelligence:get_plan
intelligence:history
intelligence:suggest
intelligence:adapt
intelligence:list
intelligence:delete
```

---

### Step 2: Create a simple intent

Ask Claude:
```
Create an intelligence intent called "Daily Standup" with the goal
"Help me prioritize my day based on urgent tasks and blockers"
```

**Expected:** Claude uses `intelligence:create_intent` and returns:
- Intent ID
- Confirmation message
- Next steps

---

### Step 3: List intents

Ask Claude:
```
List all intelligence intents
```

**Expected:** Shows the "Daily Standup" intent we just created

---

### Step 4: Get execution plan

Ask Claude:
```
Show me the plan for how you'll execute the Daily Standup intent
```

**Expected:** Claude uses `intelligence:get_plan` and shows:
- What sources it will check
- What analysis it will do
- Output format

---

### Step 5: Execute the intent

Ask Claude:
```
Execute the Daily Standup intent now
```

**Expected:** Claude uses `intelligence:execute` and:
- Generates a dynamic workflow based on current context
- Shows what it would query (GitHub, Linear, etc.)
- Provides strategic output

---

### Step 6: Check history

Ask Claude:
```
Show me the history for the Daily Standup intent
```

**Expected:** Shows:
- Number of executions (1)
- Last execution time
- Success/failure status

---

### Step 7: Teach the AI

Ask Claude:
```
For the Daily Standup intent, please make the output more concise -
just top 3 priorities
```

**Expected:** Claude uses `intelligence:teach` and confirms feedback recorded

---

### Step 8: Execute again to see adaptation

Ask Claude:
```
Execute the Daily Standup intent again
```

**Expected:** Output should incorporate the feedback (more concise)

---

### Step 9: Get suggestions

Ask Claude:
```
What other intents could I create with my current MCPs?
```

**Expected:** Claude uses `intelligence:suggest` and shows:
- 3-5 automation opportunities
- Estimated value for each
- Required MCPs

---

### Step 10: Delete intent (cleanup)

Ask Claude:
```
Delete the Daily Standup intent
```

**Expected:** Intent removed but history preserved

---

## Success Criteria:

- ✅ Intelligence MCP loads automatically
- ✅ All 10 tools are available
- ✅ Can create intents
- ✅ Can execute intents (generates dynamic prompts)
- ✅ Can teach and adapt
- ✅ History tracking works
- ✅ Suggestions work
- ✅ Storage files created in ~/.ncp/intelligence/

---

## Manual Test (CLI - if available)

If CLI access works:

```bash
# Test discovery
ncp find "intelligence"

# Create intent
ncp run intelligence:create_intent \
  --params '{
    "name": "Test Intent",
    "goal": "This is a test",
    "allow_adaptation": true
  }'

# List intents
ncp run intelligence:list

# Execute
ncp run intelligence:execute --params '{"intent_id": "test-intent-..."}'

# Check storage
ls -la ~/.ncp/intelligence/
cat ~/.ncp/intelligence/intents.json
```

---

## Integration Test with Schedule MCP

### Create scheduled intent:

Ask Claude:
```
Create an intelligence intent called "Morning Briefing" that helps me
prioritize my day, and schedule it to run every weekday at 8:30am
```

**Expected:**
1. Claude creates intelligence intent
2. Claude creates schedule that executes the intent
3. Both are linked together

### Verify:

```
List scheduled jobs
```

Should show a job that executes `intelligence:execute`

---

## Check Storage Files:

```bash
# Should see these files after testing:
ls ~/.ncp/intelligence/

# Expected:
# intents.json
# history.json

# View contents:
cat ~/.ncp/intelligence/intents.json | jq
cat ~/.ncp/intelligence/history.json | jq
```

---

## Error Cases to Test:

### 1. Execute non-existent intent:
```
Execute intelligence intent with ID "fake-id"
```
**Expected:** Error message "Intent not found"

### 2. Teach non-existent intent:
```
Teach intelligence intent "fake-id" to be more concise
```
**Expected:** Error message "Intent not found"

### 3. Create intent with missing required fields:
(This should be caught by Claude, but worth testing)
```
ncp run intelligence:create_intent --params '{"name": "Test"}'
```
**Expected:** Error about missing "goal" field

---

## Performance Test:

### Create multiple intents:
```bash
for i in {1..10}; do
  ncp run intelligence:create_intent \
    --params "{\"name\": \"Test $i\", \"goal\": \"Test goal $i\"}"
done

# List all
ncp run intelligence:list

# Should handle 10+ intents smoothly
```

---

## Real-World Scenario Test:

### Scenario: Morning Briefing Setup

**User workflow:**

1. "I want a morning briefing every weekday"
2. Claude creates intelligence intent
3. Claude schedules it
4. User gives feedback: "Too detailed"
5. Claude teaches the intent
6. Next execution is more concise
7. User checks history to see improvement

**Test this complete flow and verify each step works.**

---

## Debugging:

If something doesn't work:

1. **Check logs:**
```bash
tail -f ~/Library/Logs/Claude/mcp.log | grep -i intelligence
```

2. **Check if MicroMCP loaded:**
```bash
# In NCP logs, should see:
# "Loaded MicroMCP: intelligence"
```

3. **Check storage permissions:**
```bash
ls -la ~/.ncp/intelligence/
# Should be readable/writable
```

4. **Verify TypeScript compiled:**
```bash
ls dist/internal-mcps/intelligence.micro.js
# Should exist after build
```

---

## Expected File Structure:

After testing, should see:

```
~/.ncp/intelligence/
├── intents.json          # Stores all intents with learned preferences
└── history.json          # Execution records for learning

Format of intents.json:
{
  "daily-standup-abc123": {
    "id": "daily-standup-abc123",
    "name": "Daily Standup",
    "goal": "Help prioritize my day...",
    "created": "2024-11-04T...",
    "executions": 3,
    "adaptations": [...],
    "learned_preferences": {
      "user_feedback": [...]
    }
  }
}
```

---

## Demo Script (For Showing Others):

**5-minute demo:**

1. "Watch this - I'll create an automation in 30 seconds"
2. Ask Claude: "Create a daily standup briefing at 8:30am"
3. Claude creates intent + schedules it
4. Show: "That's it. No workflow builder, no configuration"
5. Execute once to show output
6. Give feedback: "Make it shorter"
7. Execute again to show it adapted
8. "This is the difference - AI builds and adapts workflows for you"

**Time: 3-4 minutes including explanation**

---

## Troubleshooting:

### Issue: Intelligence MCP not found in discovery

**Fix:**
```bash
# Rebuild
npm run build

# Check if file exists
ls dist/internal-mcps/intelligence.micro.js

# Restart Claude Desktop to reload MCPs
```

### Issue: Storage files not created

**Fix:**
```bash
# Manually create directory
mkdir -p ~/.ncp/intelligence

# Check permissions
chmod 755 ~/.ncp/intelligence
```

### Issue: "Cannot find module" error

**Fix:**
- Check that `intelligence.micro.ts` extends `MicroMCP` (not `BaseMicroMCP`)
- Check imports are correct
- Rebuild: `npm run build`
