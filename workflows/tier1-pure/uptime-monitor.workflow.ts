/**
 * Website Uptime Monitor Workflow
 *
 * Monitors multiple URLs for availability, logs results, and outputs status report.
 * Can be scheduled to run periodically for continuous monitoring.
 *
 * @name uptime-monitor
 * @description Monitor website uptime and response times
 * @category Monitoring
 * @complexity beginner
 * @author NCP Team
 * @version 1.0.0
 *
 * @dependencies csv-stringify@^6.4.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';

interface CheckResult {
  url: string;
  status: 'up' | 'down' | 'slow' | 'error';
  statusCode: number | null;
  responseTime: number; // milliseconds
  timestamp: string;
  error?: string;
}

interface WorkflowConfig {
  urls: string[];           // URLs to monitor
  outputPath?: string;      // Log file path (optional)
  timeout?: number;         // Request timeout in ms (default: 10000)
  slowThreshold?: number;   // Response time considered slow in ms (default: 3000)
}

interface WorkflowResult {
  summary: {
    total: number;
    up: number;
    down: number;
    slow: number;
    avgResponseTime: number;
  };
  results: CheckResult[];
  outputFile?: string;
}

/**
 * Website Uptime Monitor
 *
 * Example usage:
 * ```typescript
 * const result = await run({
 *   urls: [
 *     "https://google.com",
 *     "https://github.com",
 *     "https://example.com"
 *   ],
 *   outputPath: "./uptime-log.csv",
 *   timeout: 5000,
 *   slowThreshold: 2000
 * });
 * ```
 */
export async function run(config: WorkflowConfig): Promise<WorkflowResult> {
  const timeout = config.timeout ?? 10000;
  const slowThreshold = config.slowThreshold ?? 3000;

  const results: CheckResult[] = [];

  console.log(`🔍 Checking ${config.urls.length} URLs...`);
  console.log(`   Timeout: ${timeout}ms | Slow threshold: ${slowThreshold}ms\n`);

  for (const url of config.urls) {
    const startTime = Date.now();
    let result: CheckResult = {
      url,
      status: 'error',
      statusCode: null,
      responseTime: 0,
      timestamp: new Date().toISOString()
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'NCP-Uptime-Monitor/1.0'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      result.statusCode = response.status;
      result.responseTime = responseTime;

      if (response.status >= 200 && response.status < 400) {
        result.status = responseTime > slowThreshold ? 'slow' : 'up';
      } else {
        result.status = 'down';
      }

    } catch (error: any) {
      result.responseTime = Date.now() - startTime;

      if (error.name === 'AbortError') {
        result.status = 'down';
        result.error = 'Request timed out';
      } else {
        result.status = 'error';
        result.error = error.message;
      }
    }

    // Log result
    const icon = {
      up: '✅',
      slow: '🐢',
      down: '❌',
      error: '⚠️'
    }[result.status];

    console.log(`${icon} ${result.url}`);
    console.log(`   Status: ${result.status.toUpperCase()} | ${result.responseTime}ms${result.error ? ` | ${result.error}` : ''}`);

    results.push(result);
  }

  // Calculate summary
  const summary = {
    total: results.length,
    up: results.filter(r => r.status === 'up').length,
    down: results.filter(r => r.status === 'down' || r.status === 'error').length,
    slow: results.filter(r => r.status === 'slow').length,
    avgResponseTime: Math.round(
      results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
    )
  };

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Up: ${summary.up} | 🐢 Slow: ${summary.slow} | ❌ Down: ${summary.down}`);
  console.log(`   ⏱️  Avg response time: ${summary.avgResponseTime}ms`);

  // Save to CSV if outputPath specified
  let outputFile: string | undefined;
  if (config.outputPath) {
    const { stringify } = await import('csv-stringify/sync');

    const csvContent = stringify(results, {
      header: true,
      columns: ['url', 'status', 'statusCode', 'responseTime', 'timestamp', 'error']
    });

    outputFile = config.outputPath.startsWith('/')
      ? config.outputPath
      : join(process.cwd(), config.outputPath);

    // Append to existing file or create new
    try {
      const existing = await fs.readFile(outputFile, 'utf-8');
      // If file exists, append without header
      const dataOnly = stringify(results, {
        header: false,
        columns: ['url', 'status', 'statusCode', 'responseTime', 'timestamp', 'error']
      });
      await fs.writeFile(outputFile, existing + dataOnly, 'utf-8');
    } catch {
      // File doesn't exist, create new with header
      await fs.writeFile(outputFile, csvContent, 'utf-8');
    }

    console.log(`\n💾 Logged to: ${outputFile}`);
  }

  return {
    summary,
    results,
    outputFile
  };
}

// Default export for Photon compatibility
export default { run };
