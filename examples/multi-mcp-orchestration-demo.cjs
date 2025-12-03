#!/usr/bin/env node

/**
 * REAL Automation Powerhouse Demo
 *
 * This demo shows the TRUE power:
 * Schedule CODE that orchestrates MULTIPLE MCPs internally
 *
 * Example: Schedule code that:
 * 1. Checks analytics (analytics MCP)
 * 2. Writes report to file (filesystem MCP)
 * 3. Manages other schedules (schedule MCP)
 * 4. Lists MCPs (mcp MCP)
 *
 * All in ONE scheduled code block!
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(70) + '\n');
}

header('🚀 Code-Mode + Scheduler: TRUE Powerhouse Demo');

log('The Real Power:', 'cyan');
console.log('  ❌ NOT: Schedule a single MCP tool');
console.log('  ✅ YES: Schedule CODE that orchestrates multiple MCPs!');
console.log('');

header('📋 Example Workflow');

log('Scenario: Daily system report automation', 'cyan');
console.log('');
console.log('Traditional approach (multiple schedules):');
log('  1. Schedule: analytics:overview → get stats', 'yellow');
log('  2. Schedule: filesystem:write_file → write report', 'yellow');
log('  3. Schedule: schedule:list → check other tasks', 'yellow');
log('  ❌ 3 separate schedules, hard to coordinate', 'red');
console.log('');

console.log('Code-Mode approach (single schedule):');
log('  ✅ Schedule CODE that does ALL of this:', 'green');
console.log('');

const orchestrationCode = `
// This code runs on schedule and orchestrates multiple MCPs!

// Step 1: Get analytics from analytics MCP
const analytics = await mcp.call('analytics:overview', {
  period: 1,
  today: true
});

// Step 2: Get list of active schedules from schedule MCP
const schedules = await mcp.call('schedule:list', {});

// Step 3: Get configured MCPs from mcp MCP
const mcps = await mcp.call('mcp:list', {});

// Step 4: Build comprehensive report
const report = \`
# Daily System Report
Generated: \${new Date().toISOString()}

## Analytics Summary
\${analytics.data}

## Active Schedules
\${schedules.count} schedules running

## Configured MCPs
\${mcps.count} MCPs available

## Health Status
All systems operational
\`;

// Step 5: Write report using filesystem MCP
await mcp.call('filesystem:write_file', {
  path: '/tmp/daily-report.md',
  content: report
});

// Step 6: Return summary
return {
  report_generated: true,
  mcps_checked: mcps.count,
  schedules_active: schedules.count,
  timestamp: new Date().toISOString()
};
`.trim();

log('The Scheduled Code:', 'cyan');
console.log(orchestrationCode);
console.log('');

header('💡 Real-World Multi-MCP Workflows');

const workflows = [
  {
    name: 'Automated Backup Pipeline',
    mcps: ['filesystem', 'schedule', 'analytics'],
    code: `
// 1. Get list of files to backup (filesystem MCP)
const files = await mcp.call('filesystem:list_directory', { path: '/data' });

// 2. Check last backup time (analytics MCP)
const lastBackup = await mcp.call('analytics:usage', { period: 1 });

// 3. Create backup files (filesystem MCP)
for (const file of files) {
  await mcp.call('filesystem:read_file', { path: file });
  await mcp.call('filesystem:write_file', {
    path: \`/backup/\${file}\`
  });
}

// 4. Schedule next backup (schedule MCP)
await mcp.call('schedule:create', {
  name: 'next-backup',
  schedule: 'in 24 hours',
  tool: 'code:run',
  parameters: { code: '...' }
});

return { backed_up: files.length };
`
  },
  {
    name: 'Health Monitoring & Auto-Healing',
    mcps: ['analytics', 'schedule', 'mcp'],
    code: `
// 1. Check system health (analytics MCP)
const health = await mcp.call('analytics:performance', { today: true });

// 2. Get all active schedules (schedule MCP)
const schedules = await mcp.call('schedule:list', {});

// 3. Check MCP health (mcp MCP)
const mcpHealth = await mcp.call('mcp:doctor', {});

// 4. Auto-fix if issues detected
if (health.issues || mcpHealth.unhealthy) {
  // Pause problematic schedules
  for (const schedule of schedules.problematic) {
    await mcp.call('schedule:pause', { job_id: schedule.id });
  }

  // Alert admin
  return { alert: 'SYSTEM_ISSUES', paused: schedules.problematic.length };
}

return { status: 'healthy' };
`
  },
  {
    name: 'Dynamic Resource Management',
    mcps: ['analytics', 'schedule', 'mcp'],
    code: `
// 1. Check current load (analytics MCP)
const usage = await mcp.call('analytics:usage', { today: true });

// 2. Get active schedules (schedule MCP)
const schedules = await mcp.call('schedule:list', {});

// 3. Adjust schedule frequency based on load
if (usage.high_load) {
  // Reduce monitoring frequency during high load
  await mcp.call('schedule:update', {
    job_id: 'monitor',
    schedule: '*/30 * * * *'  // Every 30 min instead of 5
  });
} else {
  // Increase frequency during low load
  await mcp.call('schedule:update', {
    job_id: 'monitor',
    schedule: '*/5 * * * *'  // Back to every 5 min
  });
}

return { adjusted: true, load: usage.level };
`
  }
];

workflows.forEach((wf, idx) => {
  log(`${idx + 1}. ${wf.name}`, 'cyan');
  log(`   MCPs orchestrated: ${wf.mcps.join(', ')}`, 'yellow');
  console.log('');
});

header('🎯 The Powerhouse Comparison');

console.log('Without Code-Mode:');
log('  ❌ Each MCP tool needs separate schedule', 'red');
log('  ❌ Cannot coordinate between MCPs', 'red');
log('  ❌ Cannot share data between steps', 'red');
log('  ❌ Cannot have conditional logic', 'red');
log('  ❌ Multiple schedules = complex management', 'red');
console.log('');

console.log('With Code-Mode + Scheduler:');
log('  ✅ Single schedule orchestrates ALL MCPs', 'green');
log('  ✅ Pass data between MCP calls', 'green');
log('  ✅ Full conditional logic & error handling', 'green');
log('  ✅ Dynamic MCP calls based on results', 'green');
log('  ✅ One schedule = simple management', 'green');
console.log('');

header('💰 Token Efficiency');

console.log('Example: Daily report from 3 MCPs');
console.log('');
console.log('Traditional (3 separate schedules):');
console.log('  Setup:');
log('    schedule analytics → 1500 tokens', 'yellow');
log('    schedule filesystem → 1500 tokens', 'yellow');
log('    schedule mcp → 1500 tokens', 'yellow');
log('    Total: 4500 tokens', 'yellow');
console.log('  Daily execution: 3 × 50 = 150 tokens');
console.log('  Monthly: 150 × 30 = 4,500 tokens');
console.log('  Total first month: 9,000 tokens');
console.log('');

console.log('Code-Mode (1 schedule orchestrating 3 MCPs):');
console.log('  Setup:');
log('    schedule code → 2000 tokens (one-time)', 'green');
console.log('  Daily execution: 50 tokens');
console.log('  Monthly: 50 × 30 = 1,500 tokens');
console.log('  Total first month: 3,500 tokens');
console.log('');
log('  💎 Savings: 61% (and complexity is WAY lower!)', 'green');
console.log('');

header('🚀 How to Create This');

log('Step 1: Use find-and-code workflow mode', 'cyan');
console.log('');
console.log('In your NCP profile:');
console.log('```json');
console.log('{ "workflowMode": "find-and-code" }');
console.log('```');
console.log('');

log('Step 2: Create schedule with orchestration code', 'cyan');
console.log('');
console.log('```javascript');
console.log('await schedule.create({');
console.log('  name: "multi-mcp-report",');
console.log('  schedule: "0 9 * * *",  // Daily at 9 AM');
console.log('  tool: "code:run",');
console.log('  parameters: {');
console.log('    code: `');
console.log('      // Orchestrate multiple MCPs here!');
console.log('      const analytics = await mcp.call("analytics:overview");');
console.log('      const schedules = await mcp.call("schedule:list");');
console.log('      const report = buildReport(analytics, schedules);');
console.log('      await mcp.call("filesystem:write_file", { ');
console.log('        path: "/tmp/report.md", ');
console.log('        content: report ');
console.log('      });');
console.log('      return { success: true };');
console.log('    `');
console.log('  }');
console.log('});');
console.log('```');
console.log('');

log('Step 3: Monitor execution', 'cyan');
console.log('');
console.log('```bash');
console.log('ncp run schedule:list');
console.log('ncp run analytics:overview');
console.log('```');
console.log('');

header('🎬 Live Demo');

log('To see this in action:', 'cyan');
console.log('');
console.log('1. Run the interactive test:');
log('   node tests/manual/test-multi-mcp-orchestration.cjs', 'yellow');
console.log('');
console.log('2. It will:');
console.log('   • Create a schedule with multi-MCP orchestration code');
console.log('   • Execute it once to show it working');
console.log('   • Show you the results');
console.log('   • Clean up afterwards');
console.log('');

header('📖 Documentation');

console.log('• Full guide: examples/multi-mcp-orchestration.md');
console.log('• Working examples: examples/orchestration-patterns.md');
console.log('• API reference: docs/code-mode-mcp-api.md');
console.log('');

header('🎉 Summary');

log('This is the TRUE Automation Powerhouse:', 'bright');
console.log('');
log('  🔥 Schedule CODE, not just tools', 'green');
log('  🔥 Orchestrate MULTIPLE MCPs in one schedule', 'green');
log('  🔥 Pass data between MCP calls', 'green');
log('  🔥 Conditional logic & error handling', 'green');
log('  🔥 Simpler management, better efficiency', 'green');
console.log('');

log('Ready to try it? Run:', 'cyan');
log('  node tests/manual/test-multi-mcp-orchestration.cjs', 'yellow');
console.log('');
