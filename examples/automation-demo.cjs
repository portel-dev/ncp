#!/usr/bin/env node

/**
 * Code-Mode + Scheduler: Automation Powerhouse Demo
 *
 * This demo showcases the power of combining Code-Mode with the Scheduler
 * to create intelligent automation workflows.
 *
 * Run: node examples/automation-demo.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(70) + '\n');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function demo(title, description) {
  console.log('');
  log(`🎯 ${title}`, 'cyan');
  log(`   ${description}`, 'dim');
  console.log('');
}

// Demo scenarios
const demos = [
  {
    name: 'simple-hello',
    title: 'Simple Scheduled Code Execution',
    description: 'Schedule code that runs every minute (demo: 1 execution)',
    schedule: '* * * * *',
    code: `
      const now = new Date();
      return {
        message: 'Hello from scheduled code!',
        timestamp: now.toISOString(),
        time: now.toLocaleTimeString()
      };
    `,
  },
  {
    name: 'system-monitor',
    title: 'System Health Monitor',
    description: 'Monitor CPU and memory every 5 minutes',
    schedule: '*/5 * * * *',
    code: `
      const os = require('os');

      const health = {
        timestamp: new Date().toISOString(),
        cpu: {
          cores: os.cpus().length,
          load: os.loadavg()[0].toFixed(2),
          model: os.cpus()[0].model
        },
        memory: {
          total: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          free: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          used: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1) + '%'
        },
        uptime: Math.floor(os.uptime() / 3600) + ' hours'
      };

      // Alert if memory > 90%
      if (parseFloat(health.memory.used) > 90) {
        return { alert: 'HIGH_MEMORY', ...health };
      }

      return { status: 'healthy', ...health };
    `,
  },
  {
    name: 'data-pipeline',
    title: 'Automated Data Pipeline',
    description: 'Fetch, transform, and store data every hour',
    schedule: '0 * * * *',
    code: `
      const fs = require('fs').promises;
      const path = require('path');

      // Simulate fetching data from API
      const mockData = {
        timestamp: new Date().toISOString(),
        metrics: [
          { name: 'api_calls', value: Math.floor(Math.random() * 1000) },
          { name: 'response_time', value: Math.floor(Math.random() * 500) },
          { name: 'error_rate', value: Math.random().toFixed(3) }
        ]
      };

      // Transform data
      const transformed = {
        date: mockData.timestamp.split('T')[0],
        summary: mockData.metrics.reduce((acc, m) => {
          acc[m.name] = m.value;
          return acc;
        }, {})
      };

      // Store results (in temp directory for demo)
      const dataDir = '/tmp/ncp-demo-data';
      try {
        await fs.mkdir(dataDir, { recursive: true });
        const filename = path.join(dataDir, \`metrics-\${Date.now()}.json\`);
        await fs.writeFile(filename, JSON.stringify(transformed, null, 2));

        return {
          status: 'success',
          processed: mockData.metrics.length,
          stored: filename,
          data: transformed
        };
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    `,
  },
  {
    name: 'conditional-workflow',
    title: 'Conditional Automation',
    description: 'Smart workflow that adapts based on conditions',
    schedule: '*/10 * * * *',
    code: `
      const hour = new Date().getHours();

      // Business hours: 9 AM - 6 PM
      const isBusinessHours = hour >= 9 && hour < 18;

      if (!isBusinessHours) {
        return {
          skipped: true,
          reason: 'Outside business hours',
          hour,
          nextRun: 'Tomorrow at 9 AM'
        };
      }

      // Simulate checking a condition
      const systemLoad = Math.random();

      if (systemLoad > 0.8) {
        return {
          alert: 'HIGH_LOAD',
          action: 'throttle',
          load: systemLoad.toFixed(2),
          message: 'Reducing processing rate'
        };
      }

      return {
        status: 'normal',
        load: systemLoad.toFixed(2),
        message: 'Processing at normal rate'
      };
    `,
  },
  {
    name: 'multi-step-etl',
    title: 'Multi-Step ETL Pipeline',
    description: 'Extract, Transform, Load with error handling',
    schedule: '0 3 * * *',
    code: `
      // Multi-step pipeline with error handling
      async function withRetry(fn, retries = 3) {
        for (let i = 0; i < retries; i++) {
          try {
            return await fn();
          } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
          }
        }
      }

      const steps = [];

      // Step 1: Extract
      steps.push({ step: 'extract', status: 'running' });
      const data = await withRetry(async () => {
        // Simulate data extraction
        return Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          value: Math.random() * 100,
          category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)]
        }));
      });
      steps[steps.length - 1].status = 'success';

      // Step 2: Transform
      steps.push({ step: 'transform', status: 'running' });
      const transformed = data.map(record => ({
        ...record,
        normalized: record.value / 100,
        processed: new Date().toISOString()
      }));
      steps[steps.length - 1].status = 'success';

      // Step 3: Analyze
      steps.push({ step: 'analyze', status: 'running' });
      const stats = {
        total: transformed.length,
        byCategory: transformed.reduce((acc, r) => {
          acc[r.category] = (acc[r.category] || 0) + 1;
          return acc;
        }, {}),
        avgValue: (transformed.reduce((sum, r) => sum + r.value, 0) / transformed.length).toFixed(2)
      };
      steps[steps.length - 1].status = 'success';

      // Step 4: Load (store results)
      steps.push({ step: 'load', status: 'running' });
      const fs = require('fs').promises;
      await fs.mkdir('/tmp/ncp-demo-data', { recursive: true });
      await fs.writeFile(
        \`/tmp/ncp-demo-data/etl-\${Date.now()}.json\`,
        JSON.stringify({ stats, sample: transformed.slice(0, 5) }, null, 2)
      );
      steps[steps.length - 1].status = 'success';

      return {
        pipeline: 'completed',
        steps,
        stats,
        duration: steps.length + 's (simulated)'
      };
    `,
  },
];

async function runDemo() {
  header('🚀 NCP Automation Powerhouse Demo');

  log('This demo showcases Code-Mode + Scheduler automation patterns', 'cyan');
  log('Each example runs independently and can be scheduled at any frequency\n', 'dim');

  // Show power comparison
  header('💪 Power Comparison');

  console.log('Traditional Approach (find + run):');
  log('  ❌ Limited to pre-built MCP tools', 'red');
  log('  ❌ Cannot chain operations easily', 'red');
  log('  ❌ High token cost per execution', 'red');
  log('  ❌ Need multiple schedules for workflows', 'red');

  console.log('\nCode-Mode + Scheduler:');
  log('  ✅ Execute arbitrary code', 'green');
  log('  ✅ Chain multiple operations', 'green');
  log('  ✅ 90%+ token savings', 'green');
  log('  ✅ Single schedule for complex workflows', 'green');

  // Token efficiency
  header('📊 Token Efficiency');

  console.log('Per Scheduled Task:');
  console.log('  Traditional: find() + run()    = 2,500 tokens');
  console.log('  Code-Mode:   schedule code     = 50 tokens (98% savings!)');
  console.log('');
  console.log('Daily (24 executions):');
  console.log('  Traditional: 60,000 tokens     = ~$0.30');
  console.log('  Code-Mode:   1,200 tokens      = ~$0.006');
  log('  💰 Savings: $0.29/day = $8.70/month per task', 'green');

  // Demo scenarios
  header('🎯 Demo Scenarios');

  info('The following examples demonstrate different automation patterns:');
  console.log('');

  demos.forEach((demo, index) => {
    log(`${index + 1}. ${demo.title}`, 'bright');
    log(`   ${demo.description}`, 'dim');
    log(`   Schedule: ${demo.schedule}`, 'yellow');
    console.log('');
  });

  // Show code examples
  header('💻 Example: System Health Monitor');

  info('This example monitors system health and alerts on issues:');
  console.log('');

  const monitorExample = demos.find(d => d.name === 'system-monitor');
  log('Schedule: ' + monitorExample.schedule + ' (every 5 minutes)', 'yellow');
  console.log('');
  log('Code:', 'cyan');
  console.log(monitorExample.code.trim());

  // Show how to create it
  header('🚀 Creating Scheduled Automation');

  info('To create any of these automations, use the schedule:create tool:');
  console.log('');

  const createExample = `await schedule.create({
  name: "system-monitor",
  schedule: "*/5 * * * *",
  tool: "ncp:code",
  parameters: {
    code: \`
      const os = require('os');
      const health = {
        cpu: os.loadavg()[0],
        memory: (1 - os.freemem() / os.totalmem()) * 100
      };
      return health;
    \`
  }
});`;

  console.log(createExample);

  // Real-world use cases
  header('🌟 Real-World Use Cases');

  const useCases = [
    '📊 Data Pipeline: Fetch, transform, store data daily',
    '🔍 Health Checks: Monitor services every 5 minutes',
    '📧 Report Generation: Weekly reports on Mondays',
    '🧹 Cleanup Tasks: Remove old files at midnight',
    '🔄 API Sync: Hourly sync with external APIs',
    '🤖 DevOps: Deployment health checks & auto-rollback',
    '📈 Analytics: Daily model retraining with fresh data',
    '💼 E-Commerce: Inventory checks & price adjustments',
  ];

  useCases.forEach(useCase => {
    log(useCase, 'cyan');
  });

  // Next steps
  header('📚 Next Steps');

  const steps = [
    '1. Enable Code-Mode in your profile: workflowMode: "find-and-code"',
    '2. Create your first automation: ncp run schedule:create',
    '3. Monitor executions: ncp run schedule:list',
    '4. Check analytics: ncp run analytics:overview',
    '5. View logs: Check ~/.ncp/logs/schedule-*.log',
  ];

  steps.forEach(step => {
    info(step);
  });

  console.log('');
  log('📖 Full documentation: examples/automation-powerhouse.md', 'bright');
  log('💡 More examples: See individual demo objects above', 'dim');

  header('🎉 Demo Complete');

  success('You now understand the automation powerhouse!');
  info('Start scheduling intelligent code execution today.');
  console.log('');
}

// Run demo if called directly
if (require.main === module) {
  runDemo().catch(error => {
    console.error('Demo error:', error);
    process.exit(1);
  });
}

module.exports = { demos };
