#!/usr/bin/env tsx
/**
 * Measure Code-Mode token savings vs traditional find→run approach
 * 
 * Compares:
 * - Number of API calls
 * - Total tokens used (approximate)
 * - Execution time
 */

interface Measurement {
  apiCalls: number;
  approxTokens: number;
  timeMs: number;
}

/**
 * Approximate token count (1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Simulate traditional approach: find → run → find → run
 */
function measureTraditional(): Measurement {
  let apiCalls = 0;
  let totalTokens = 0;

  // Scenario: Search email, send Slack, create GitHub issue

  // Call 1: find email search
  apiCalls++;
  const findEmailRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'find',
      arguments: { description: 'search email', depth: 2 }
    }
  });
  const findEmailResponse = `
# **gmail:search** (95% match)
Search for emails matching query
### query: string - Search query
### limit: number (optional) - Max results

💡 **Code-Mode**: \`const result = await gmail.search({ query: "..." })\`
`;
  totalTokens += estimateTokens(findEmailRequest + findEmailResponse);

  // Call 2: run gmail:search
  apiCalls++;
  const runEmailRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'run',
      arguments: {
        tool: 'gmail:search',
        parameters: { query: 'is:unread', limit: 10 }
      }
    }
  });
  const runEmailResponse = JSON.stringify({
    success: true,
    content: [
      { from: 'boss@company.com', subject: 'Urgent', snippet: '...' },
      { from: 'client@example.com', subject: 'Question', snippet: '...' }
    ]
  });
  totalTokens += estimateTokens(runEmailRequest + runEmailResponse);

  // Call 3: find slack send
  apiCalls++;
  const findSlackRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'find',
      arguments: { description: 'send slack message', depth: 2 }
    }
  });
  const findSlackResponse = `
# **slack:send_message** (98% match)
Post message to Slack channel
### channel: string - Channel name or ID
### text: string - Message content

💡 **Code-Mode**: \`const result = await slack.send_message({ channel: "...", text: "..." })\`
`;
  totalTokens += estimateTokens(findSlackRequest + findSlackResponse);

  // Call 4: run slack:send_message
  apiCalls++;
  const runSlackRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'run',
      arguments: {
        tool: 'slack:send_message',
        parameters: {
          channel: '#alerts',
          text: 'Found 2 unread emails'
        }
      }
    }
  });
  const runSlackResponse = JSON.stringify({
    success: true,
    content: { ok: true, ts: '1234567890.123456' }
  });
  totalTokens += estimateTokens(runSlackRequest + runSlackResponse);

  // Call 5: find github create issue
  apiCalls++;
  const findGithubRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'find',
      arguments: { description: 'create github issue', depth: 2 }
    }
  });
  const findGithubResponse = `
# **github:create_issue** (97% match)
Create new GitHub issue
### title: string - Issue title
### body: string - Issue body
### labels: array (optional) - Issue labels

💡 **Code-Mode**: \`const result = await github.create_issue({ title: "...", body: "..." })\`
`;
  totalTokens += estimateTokens(findGithubRequest + findGithubResponse);

  // Call 6: run github:create_issue
  apiCalls++;
  const runGithubRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'run',
      arguments: {
        tool: 'github:create_issue',
        parameters: {
          title: 'High email volume',
          body: '2 unread emails need attention',
          labels: ['urgent']
        }
      }
    }
  });
  const runGithubResponse = JSON.stringify({
    success: true,
    content: { number: 42, html_url: 'https://github.com/...' }
  });
  totalTokens += estimateTokens(runGithubRequest + runGithubResponse);

  return {
    apiCalls,
    approxTokens: totalTokens,
    timeMs: apiCalls * 200 // Assume 200ms per API call (network + processing)
  };
}

/**
 * Simulate Code-Mode approach: single code execution
 */
function measureCodeMode(): Measurement {
  let apiCalls = 1; // Only one call
  let totalTokens = 0;

  const codeRequest = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'code',
      arguments: {
        code: `
// Search emails
const emails = await gmail.search({ query: "is:unread", limit: 10 });
console.log("Found emails:", emails.length);

// Send Slack notification
const slackResult = await slack.send_message({
  channel: "#alerts",
  text: \`Found \${emails.length} unread emails\`
});
console.log("Slack sent:", slackResult.ok);

// Create GitHub issue
const issue = await github.create_issue({
  title: "High email volume",
  body: \`\${emails.length} unread emails need attention\`,
  labels: ["urgent"]
});
console.log("Created issue:", issue.number);
`
      }
    }
  });

  const codeResponse = JSON.stringify({
    content: [{
      type: 'text',
      text: `
🚀 **Code-Mode Execution Result**

**Console Output:**
\`\`\`
Found emails: 2
Slack sent: true
Created issue: 42
\`\`\`

**Return Value:**
\`\`\`json
undefined
\`\`\`
`
    }]
  });

  totalTokens += estimateTokens(codeRequest + codeResponse);

  return {
    apiCalls,
    approxTokens: totalTokens,
    timeMs: 200 // Single API call
  };
}

/**
 * Main measurement
 */
function main() {
  console.log('📊 Code-Mode Token Savings Measurement\n');
  console.log('Scenario: Search emails → Send Slack → Create GitHub issue\n');

  const traditional = measureTraditional();
  const codeMode = measureCodeMode();

  console.log('━'.repeat(60));
  console.log('TRADITIONAL APPROACH (find → run → find → run → find → run)');
  console.log('━'.repeat(60));
  console.log(`API Calls:        ${traditional.apiCalls}`);
  console.log(`Approx Tokens:    ${traditional.approxTokens.toLocaleString()}`);
  console.log(`Est. Time:        ${traditional.timeMs}ms`);

  console.log('\n' + '━'.repeat(60));
  console.log('CODE-MODE APPROACH (single code execution)');
  console.log('━'.repeat(60));
  console.log(`API Calls:        ${codeMode.apiCalls}`);
  console.log(`Approx Tokens:    ${codeMode.approxTokens.toLocaleString()}`);
  console.log(`Est. Time:        ${codeMode.timeMs}ms`);

  console.log('\n' + '━'.repeat(60));
  console.log('SAVINGS');
  console.log('━'.repeat(60));
  
  const apiCallSavings = ((traditional.apiCalls - codeMode.apiCalls) / traditional.apiCalls * 100).toFixed(1);
  const tokenSavings = ((traditional.approxTokens - codeMode.approxTokens) / traditional.approxTokens * 100).toFixed(1);
  const timeSavings = ((traditional.timeMs - codeMode.timeMs) / traditional.timeMs * 100).toFixed(1);

  console.log(`API Calls:        ${apiCallSavings}% fewer (${traditional.apiCalls} → ${codeMode.apiCalls})`);
  console.log(`Tokens:           ${tokenSavings}% fewer (${traditional.approxTokens.toLocaleString()} → ${codeMode.approxTokens.toLocaleString()})`);
  console.log(`Execution Time:   ${timeSavings}% faster (${traditional.timeMs}ms → ${codeMode.timeMs}ms)`);

  console.log('\n✨ Summary:');
  console.log(`   • ${apiCallSavings}% fewer API round trips`);
  console.log(`   • ${tokenSavings}% fewer tokens`);
  console.log(`   • ${timeSavings}% faster execution`);
}

main();
