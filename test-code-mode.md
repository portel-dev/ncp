# Code-Mode Testing Guide

## Setup

1. Start NCP as MCP server:
```bash
ncp --profile all
```

2. Use MCP Inspector or Claude Desktop to connect to NCP

## Test Cases

### Test 1: Single Tool Execution
**Traditional (2 API calls):**
```
1. find({ description: "send email" })
2. run({ tool: "gmail:send_email", parameters: {...} })
```

**Code-Mode (1 API call):**
```
code({
  code: `
    const result = await gmail.send_email({
      to: "test@example.com",
      subject: "Test",
      body: "Hello"
    });
    console.log(result);
  `
})
```

### Test 2: Multi-Tool Workflow
**Traditional (7 API calls):**
```
1. find({ description: "search email" })
2. run({ tool: "gmail:search", parameters: {...} })
3. find({ description: "send slack" })
4. run({ tool: "slack:send_message", parameters: {...} })
5. find({ description: "create issue" })
6. run({ tool: "github:create_issue", parameters: {...} })
```

**Code-Mode (1 API call):**
```
code({
  code: `
    // Search emails
    const emails = await gmail.search({ query: "is:unread" });
    console.log("Found emails:", emails.length);
    
    // Send Slack notification
    const slack_result = await slack.send_message({
      channel: "#alerts",
      text: \`Found \${emails.length} unread emails\`
    });
    
    // Create GitHub issue if many emails
    if (emails.length > 10) {
      const issue = await github.create_issue({
        title: "High email volume",
        body: \`\${emails.length} unread emails need attention\`
      });
      console.log("Created issue:", issue.number);
    }
  `
})
```

### Test 3: Progressive Disclosure
**Code-Mode with find:**
```
code({
  code: `
    // Discover available tools
    const tools = await ncp.find({ description: "send email" });
    console.log("Available tools:", tools);
    
    // Use discovered tool
    if (tools.tools.length > 0) {
      const result = await gmail.send_email({
        to: "user@example.com",
        subject: "Found it!",
        body: "Tool discovery works"
      });
      console.log(result);
    }
  `
})
```

### Test 4: Error Handling
```
code({
  code: `
    try {
      const result = await nonexistent.tool();
    } catch (error) {
      console.error("Error:", error.message);
      return { error: error.message };
    }
  `
})
```

### Test 5: Timeout Protection
```
code({
  code: `
    // Infinite loop should timeout
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  `,
  timeout: 5000
})
```

## Expected Results

✅ Code executes in VM sandbox
✅ All MCPs available as namespaces
✅ Console output captured
✅ Errors handled gracefully
✅ Timeouts enforced
✅ Return values properly formatted
