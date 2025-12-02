# Code-Mode + Scheduler: Automation Powerhouse

## Why This Combination is Powerful

**Traditional Approach (find + run):**
- Each scheduled task needs pre-existing MCP tool
- Limited to what tools are available
- Cannot combine multiple operations easily
- High token cost for complex workflows

**Code-Mode + Scheduler:**
- Schedule arbitrary code execution
- Chain multiple operations in single task
- Use any Node.js capability
- Massive token savings (90%+ for complex tasks)
- True automation freedom

## 🚀 Automation Patterns

### 1. Scheduled Data Pipeline
```javascript
// Schedule daily data processing at 2 AM
await schedule.create({
  name: "daily-data-pipeline",
  schedule: "0 2 * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      // Fetch data from multiple sources
      const apiData = await fetch('https://api.example.com/metrics');
      const metrics = await apiData.json();

      // Process and transform
      const processed = metrics.map(m => ({
        date: new Date().toISOString().split('T')[0],
        value: m.value * 1.1,
        trend: m.value > m.previous ? 'up' : 'down'
      }));

      // Store results
      const fs = require('fs').promises;
      await fs.writeFile(
        '/data/daily-metrics.json',
        JSON.stringify(processed, null, 2)
      );

      return { processed: processed.length, date: new Date() };
    `
  }
});
```

### 2. Periodic Health Monitoring
```javascript
// Check system health every 5 minutes
await schedule.create({
  name: "system-health-check",
  schedule: "*/5 * * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      const os = require('os');
      const { execSync } = require('child_process');

      const health = {
        timestamp: new Date().toISOString(),
        cpu: os.loadavg()[0],
        memory: (1 - os.freemem() / os.totalmem()) * 100,
        uptime: os.uptime(),
      };

      // Alert if thresholds exceeded
      if (health.cpu > 0.8 || health.memory > 90) {
        // Send alert (integrate with your notification system)
        return { alert: true, ...health };
      }

      return { status: 'healthy', ...health };
    `
  }
});
```

### 3. Automated Report Generation
```javascript
// Generate weekly reports every Monday at 9 AM
await schedule.create({
  name: "weekly-report",
  schedule: "0 9 * * 1",
  tool: "ncp:code",
  parameters: {
    code: `
      const fs = require('fs').promises;

      // Aggregate data from multiple sources
      const logs = await fs.readdir('/logs');
      const lastWeek = logs.filter(f => {
        const stat = fs.statSync('/logs/' + f);
        const age = Date.now() - stat.mtime.getTime();
        return age < 7 * 24 * 60 * 60 * 1000;
      });

      // Generate markdown report
      const report = \`# Weekly Report - \${new Date().toISOString().split('T')[0]}

## Summary
- Total log files: \${lastWeek.length}
- Period: Last 7 days
- Generated: \${new Date().toLocaleString()}

## Key Metrics
[Your metrics here]
      \`;

      await fs.writeFile('/reports/weekly.md', report);

      return { reportGenerated: true, files: lastWeek.length };
    `
  }
});
```

### 4. Scheduled API Integration
```javascript
// Sync with external API every hour
await schedule.create({
  name: "api-sync",
  schedule: "0 * * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      // Fetch from external API
      const response = await fetch('https://api.external.com/data', {
        headers: { 'Authorization': 'Bearer ' + process.env.API_KEY }
      });
      const data = await response.json();

      // Transform and store
      const transformed = data.items.map(item => ({
        id: item.id,
        synced: new Date(),
        data: item
      }));

      const fs = require('fs').promises;
      const existing = JSON.parse(
        await fs.readFile('/data/cache.json', 'utf8')
      );

      const merged = [...existing, ...transformed];
      await fs.writeFile('/data/cache.json', JSON.stringify(merged));

      return { synced: transformed.length, total: merged.length };
    `
  }
});
```

### 5. Cleanup and Maintenance Tasks
```javascript
// Clean up old files daily at midnight
await schedule.create({
  name: "cleanup-old-files",
  schedule: "0 0 * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      const fs = require('fs').promises;
      const path = require('path');

      const dirs = ['/tmp/cache', '/logs/old', '/data/temp'];
      let removed = 0;

      for (const dir of dirs) {
        const files = await fs.readdir(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);
          const age = Date.now() - stat.mtime.getTime();
          const days = age / (24 * 60 * 60 * 1000);

          // Remove files older than 30 days
          if (days > 30) {
            await fs.unlink(filePath);
            removed++;
          }
        }
      }

      return { removed, timestamp: new Date() };
    `
  }
});
```

### 6. Multi-Step Workflow Automation
```javascript
// Complex workflow: fetch, process, analyze, report
await schedule.create({
  name: "etl-pipeline",
  schedule: "0 3 * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      const fs = require('fs').promises;

      // Step 1: Extract
      const sources = [
        'https://api1.example.com/data',
        'https://api2.example.com/data'
      ];

      const datasets = await Promise.all(
        sources.map(url => fetch(url).then(r => r.json()))
      );

      // Step 2: Transform
      const combined = datasets.flat().map(record => ({
        id: record.id,
        value: parseFloat(record.value),
        category: record.type?.toLowerCase() || 'unknown',
        processed: new Date()
      }));

      // Step 3: Load
      await fs.writeFile(
        '/data/processed.json',
        JSON.stringify(combined, null, 2)
      );

      // Step 4: Analyze
      const stats = {
        total: combined.length,
        byCategory: combined.reduce((acc, r) => {
          acc[r.category] = (acc[r.category] || 0) + 1;
          return acc;
        }, {}),
        avgValue: combined.reduce((sum, r) => sum + r.value, 0) / combined.length
      };

      // Step 5: Report
      await fs.writeFile(
        '/reports/etl-stats.json',
        JSON.stringify(stats, null, 2)
      );

      return stats;
    `
  }
});
```

## 🎯 Real-World Use Cases

### E-Commerce Automation
```javascript
// Check inventory, update prices, generate alerts
await schedule.create({
  name: "ecommerce-automation",
  schedule: "0 */2 * * *", // Every 2 hours
  tool: "ncp:code",
  parameters: {
    code: `
      // Check inventory levels
      const inventory = await fetch('https://api.shop.com/inventory').then(r => r.json());

      // Find low stock items
      const lowStock = inventory.filter(item => item.quantity < item.threshold);

      // Auto-adjust prices based on demand
      const priceUpdates = inventory
        .filter(item => item.views > item.sales * 10)
        .map(item => ({
          id: item.id,
          newPrice: item.price * 0.95 // 5% discount
        }));

      // Generate alerts
      if (lowStock.length > 0) {
        return {
          alert: 'LOW_STOCK',
          items: lowStock.map(i => i.name),
          priceUpdates: priceUpdates.length
        };
      }

      return { status: 'ok', checked: inventory.length };
    `
  }
});
```

### DevOps Automation
```javascript
// Deployment health checks and rollback
await schedule.create({
  name: "deployment-monitor",
  schedule: "*/10 * * * *", // Every 10 minutes
  tool: "ncp:code",
  parameters: {
    code: `
      const { execSync } = require('child_process');

      // Check all services
      const services = ['web', 'api', 'worker'];
      const health = {};

      for (const service of services) {
        try {
          const status = execSync(\`curl -f http://\${service}:8080/health\`);
          health[service] = { status: 'healthy', response: status.toString() };
        } catch (error) {
          health[service] = { status: 'unhealthy', error: error.message };

          // Auto-rollback if critical service fails
          if (service === 'api') {
            execSync('kubectl rollout undo deployment/api');
            return { action: 'ROLLBACK', service };
          }
        }
      }

      return { timestamp: new Date(), services: health };
    `
  }
});
```

### Data Science Automation
```javascript
// Daily model retraining with fresh data
await schedule.create({
  name: "model-retraining",
  schedule: "0 4 * * *", // 4 AM daily
  tool: "ncp:code",
  parameters: {
    code: `
      const fs = require('fs').promises;
      const { execSync } = require('child_process');

      // Fetch latest training data
      const data = await fetch('https://data.example.com/training-set').then(r => r.json());
      await fs.writeFile('/ml/data/latest.json', JSON.stringify(data));

      // Run training script
      const trainOutput = execSync('python /ml/train.py --data /ml/data/latest.json');

      // Evaluate model performance
      const evalOutput = execSync('python /ml/evaluate.py');
      const metrics = JSON.parse(evalOutput.toString());

      // Deploy if accuracy improved
      if (metrics.accuracy > 0.95) {
        execSync('cp /ml/models/new_model.pkl /ml/models/production.pkl');
        return { deployed: true, accuracy: metrics.accuracy };
      }

      return { deployed: false, accuracy: metrics.accuracy };
    `
  }
});
```

## 💡 Power Comparison

### Before: Traditional MCP Tools Only
```
❌ Limited to pre-built tools
❌ Cannot combine operations
❌ Need separate tools for each step
❌ High token cost for orchestration
❌ Complex workflows require multiple schedules
```

### After: Code-Mode + Scheduler
```
✅ Execute arbitrary code
✅ Chain multiple operations
✅ Use full Node.js ecosystem
✅ 90%+ token savings
✅ Single schedule for complex workflows
✅ Dynamic logic and conditionals
✅ Error handling and retries built-in
```

## 🎨 Advanced Patterns

### Conditional Execution
```javascript
await schedule.create({
  name: "conditional-workflow",
  schedule: "0 * * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      // Check condition first
      const config = JSON.parse(
        await require('fs').promises.readFile('/config.json', 'utf8')
      );

      if (!config.enableAutoProcessing) {
        return { skipped: true, reason: 'disabled in config' };
      }

      // Proceed with main logic
      const result = await processData();
      return result;
    `
  }
});
```

### Error Handling and Retries
```javascript
await schedule.create({
  name: "resilient-task",
  schedule: "0 */6 * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      async function withRetry(fn, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
          }
        }
      }

      const result = await withRetry(async () => {
        const response = await fetch('https://unreliable-api.com/data');
        if (!response.ok) throw new Error('API error');
        return response.json();
      });

      return result;
    `
  }
});
```

### Dynamic Scheduling
```javascript
// Schedule changes based on results
await schedule.create({
  name: "adaptive-monitor",
  schedule: "*/5 * * * *",
  tool: "ncp:code",
  parameters: {
    code: `
      const metrics = await checkSystemMetrics();

      // If system is under load, increase monitoring frequency
      if (metrics.load > 0.8) {
        // Update this schedule to run every minute
        await schedule.update({
          job_id: "adaptive-monitor",
          schedule: "* * * * *"
        });
        return { adjusted: true, newFrequency: '1min' };
      }

      // If system is idle, decrease frequency
      if (metrics.load < 0.2) {
        await schedule.update({
          job_id: "adaptive-monitor",
          schedule: "*/15 * * * *"
        });
        return { adjusted: true, newFrequency: '15min' };
      }

      return { adjusted: false, load: metrics.load };
    `
  }
});
```

## 📊 Token Efficiency

**Traditional Approach:**
```
find(description) → 2000 tokens
run(tool, params) → 500 tokens
Per execution: 2500 tokens
Daily (24 runs): 60,000 tokens
```

**Code-Mode Approach:**
```
Schedule once: 1500 tokens
Execution overhead: 50 tokens
Per execution: 50 tokens
Daily (24 runs): 1,200 tokens
Savings: 97.5% 🎉
```

## 🚀 Getting Started

1. **Enable Code-Mode** in your NCP profile:
```json
{
  "workflowMode": "find-and-code"
}
```

2. **Create your first automation**:
```bash
ncp run schedule:create
```

3. **Monitor execution**:
```bash
ncp run schedule:list
ncp run analytics:overview
```

## 🔒 Security Considerations

When scheduling code execution:
- ✅ Use network policies for external access
- ✅ Validate inputs and sanitize data
- ✅ Set execution timeouts
- ✅ Monitor resource usage
- ✅ Use audit logging (Phase 5)
- ✅ Test with `testRun: true` first

## 🎯 Next Steps

- Explore `examples/automation-demos.js` for working examples
- Check `docs/workflow-modes.md` for configuration
- Review `docs/code-mode-phase5-audit.md` for security
- Monitor with `analytics:performance`

---

**The Future of AI Automation:** Schedule intelligence, not just tools. 🚀
