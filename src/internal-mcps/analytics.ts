/**
 * Analytics Internal MCP
 *
 * Provides visual analytics with ASCII charts for AI consumption.
 * Returns data wrapped in markdown code blocks for rendering.
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { NCPLogParser, AnalyticsReport } from '../analytics/log-parser.js';
import { VisualAnalyticsFormatter } from '../analytics/visual-formatter.js';
import { TokenMetricsTracker } from '../analytics/token-metrics.js';
import { logger } from '../utils/logger.js';

export class AnalyticsMCP implements InternalMCP {
  name = 'analytics';
  description = 'View NCP usage analytics, token savings, and performance metrics';

  private parser: NCPLogParser;
  private tokenTracker: TokenMetricsTracker;

  constructor() {
    this.parser = new NCPLogParser();
    this.tokenTracker = new TokenMetricsTracker();
  }

  tools: InternalTool[] = [
    {
      name: 'overview',
      description: 'Visual analytics dashboard with ASCII charts showing usage stats, token savings, performance metrics, and trends. Returns formatted in markdown code blocks for rendering.',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Number of days to analyze (e.g., 7 for last week, 30 for last month). Default: 7'
          },
          today: {
            type: 'boolean',
            description: 'Show only today\'s data. Default: false'
          }
        }
      }
    },
    {
      name: 'performance',
      description: 'Visual performance report with gauges and charts showing fastest MCPs, reliability metrics, and response times. Returns formatted in markdown code blocks.',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Number of days to analyze. Default: 7'
          },
          today: {
            type: 'boolean',
            description: 'Show only today\'s data. Default: false'
          }
        }
      }
    },
    {
      name: 'usage',
      description: 'Detailed usage statistics with properly spaced markdown tables: most used MCPs, tool counts, hourly patterns, peak usage times. Tables are readable in plain text without rendering.',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Number of days to analyze. Default: 7'
          },
          today: {
            type: 'boolean',
            description: 'Show only today\'s data. Default: false'
          }
        }
      }
    },
    {
      name: 'tokens',
      description: 'Token usage and savings from Code-Mode vs find+run. Shows efficiency gains.',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Days to analyze (default: 7)'
          }
        }
      }
    }
  ];

  async executeTool(toolName: string, args: any): Promise<InternalToolResult> {
    try {
      // Handle token analytics separately (uses different data source)
      if (toolName === 'tokens') {
        const period = args.period || 7;
        return await this.formatTokenMetrics(period);
      }

      // Parse time range options for MCP log-based analytics
      const parseOptions: any = {};
      if (args.today) {
        parseOptions.today = true;
      } else if (args.period) {
        parseOptions.period = parseInt(args.period) || 7;
      }

      const report = await this.parser.parseAllLogs(parseOptions);

      if (report.totalSessions === 0) {
        return {
          success: true,
          content: [{
            type: 'text',
            text: '📊 No analytics data available for the specified time range.\n\n' +
                  'MCPs need to be used through NCP to generate analytics data.'
          }]
        };
      }

      switch (toolName) {
        case 'overview':
          return await this.formatDashboard(report);

        case 'performance':
          return await this.formatPerformance(report);

        case 'usage':
          return this.formatUsage(report);

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      logger.error(`[AnalyticsMCP] Error executing ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Format dashboard with visual charts in markdown code blocks
   */
  private async formatDashboard(report: AnalyticsReport): Promise<InternalToolResult> {
    const visualOutput = await VisualAnalyticsFormatter.formatVisualDashboard(report);

    const markdown = `\`\`\`txt\n${visualOutput}\n\`\`\``;

    return {
      success: true,
      content: [{
        type: 'text',
        text: markdown
      }]
    };
  }

  /**
   * Format performance metrics with visual charts in markdown code blocks
   */
  private async formatPerformance(report: AnalyticsReport): Promise<InternalToolResult> {
    const visualOutput = await VisualAnalyticsFormatter.formatVisualPerformance(report);

    const markdown = `\`\`\`txt\n${visualOutput}\n\`\`\``;

    return {
      success: true,
      content: [{
        type: 'text',
        text: markdown
      }]
    };
  }

  /**
   * Format usage statistics with properly spaced markdown tables
   */
  private formatUsage(report: AnalyticsReport): InternalToolResult {
    const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const output: string[] = [];

    output.push('# 📈 NCP Usage Statistics');
    output.push('');
    output.push(`**Period**: ${days === 1 ? 'Today' : `Last ${days} days`}`);
    output.push('');

    // Most Used MCPs - properly spaced markdown table
    output.push('## 🔥 Most Used MCPs');
    output.push('');
    const topMCPs = (report.topMCPsByUsage || []).slice(0, 10);
    const maxNameLen = topMCPs.length > 0 ? Math.max(...topMCPs.map(m => m?.name?.length || 0), 15) : 15;

    // Header
    output.push(`| ${'#'.padEnd(3)} | ${'MCP'.padEnd(maxNameLen)} | ${'Sessions'.padStart(8)} | ${'% Total'.padStart(9)} |`);
    output.push(`|${'-'.repeat(5)}|${'-'.repeat(maxNameLen + 2)}|${'-'.repeat(10)}|${'-'.repeat(11)}|`);

    // Rows
    topMCPs.forEach((mcp, i) => {
      const rank = `${i + 1}`.padEnd(3);
      const name = (mcp?.name || 'unknown').padEnd(maxNameLen);
      const sessions = (mcp?.sessions || 0).toString().padStart(8);
      const pct = `${(((mcp?.sessions || 0) / (report.totalSessions || 1)) * 100).toFixed(1)}%`.padStart(9);
      output.push(`| ${rank} | ${name} | ${sessions} | ${pct} |`);
    });
    output.push('');

    // Tool-Rich MCPs
    output.push('## 🛠️ Tool-Rich MCPs');
    output.push('');
    const toolRich = (report.topMCPsByTools || []).slice(0, 10);
    const maxToolNameLen = toolRich.length > 0 ? Math.max(...toolRich.map(m => m?.name?.length || 0), 15) : 15;

    // Header
    output.push(`| ${'#'.padEnd(3)} | ${'MCP'.padEnd(maxToolNameLen)} | ${'Tools'.padStart(6)} |`);
    output.push(`|${'-'.repeat(5)}|${'-'.repeat(maxToolNameLen + 2)}|${'-'.repeat(8)}|`);

    // Rows
    toolRich.forEach((mcp, i) => {
      const rank = `${i + 1}`.padEnd(3);
      const name = (mcp?.name || 'unknown').padEnd(maxToolNameLen);
      const tools = (mcp?.toolCount || 0).toString().padStart(6);
      output.push(`| ${rank} | ${name} | ${tools} |`);
    });
    output.push('');

    // Hourly Usage Pattern
    output.push('## ⏰ Hourly Usage Pattern');
    output.push('');

    const hourlyEntries = Object.entries(report.hourlyUsage || {})
      .sort(([a], [b]) => parseInt(a) - parseInt(b));

    // Header
    output.push(`| ${'Hour'.padEnd(6)} | ${'Sessions'.padStart(8)} |`);
    output.push(`|${'-'.repeat(8)}|${'-'.repeat(10)}|`);

    // Rows
    hourlyEntries.forEach(([hour, count]) => {
      const hourStr = `${hour}:00`.padEnd(6);
      const countStr = count.toString().padStart(8);
      output.push(`| ${hourStr} | ${countStr} |`);
    });
    output.push('');

    // Summary
    output.push('## 📊 Summary');
    output.push('');
    output.push(`| ${'Metric'.padEnd(20)} | ${'Value'.padEnd(15)} |`);
    output.push(`|${'-'.repeat(22)}|${'-'.repeat(17)}|`);
    output.push(`| ${'Total Sessions'.padEnd(20)} | ${report.totalSessions.toLocaleString().padEnd(15)} |`);
    output.push(`| ${'Unique MCPs'.padEnd(20)} | ${report.uniqueMCPs.toString().padEnd(15)} |`);
    output.push(`| ${'Peak Hour'.padEnd(20)} | ${this.getPeakHour(report.hourlyUsage).padEnd(15)} |`);
    output.push(`| ${'Avg Sessions/Day'.padEnd(20)} | ${(report.totalSessions / days).toFixed(0).padEnd(15)} |`);

    return {
      success: true,
      content: [{
        type: 'text',
        text: output.join('\n')
      }]
    };
  }

  /**
   * Get peak usage hour
   */
  private getPeakHour(hourlyUsage: Record<string, number>): string {
    const entries = Object.entries(hourlyUsage);
    if (entries.length === 0) return 'N/A';

    const peak = entries.reduce((max, curr) =>
      curr[1] > max[1] ? curr : max
    );

    return `${peak[0]}:00 (${peak[1]} sessions)`;
  }

  /**
   * Format token metrics and savings report
   */
  private async formatTokenMetrics(daysBack: number): Promise<InternalToolResult> {
    const report = await this.tokenTracker.generateReport(daysBack);

    if (report.totalExecutions === 0) {
      return {
        success: true,
        content: [{
          type: 'text',
          text: '📊 No token usage data available.\n\n' +
                'Token tracking starts after you use find, run, or code tools.'
        }]
      };
    }

    let output = `## 🎯 Token Usage & Savings Report (Last ${daysBack} days)\n\n`;

    // Summary stats
    output += `### Summary\n\n`;
    output += `- **Total Executions**: ${report.totalExecutions}\n`;
    output += `  - find: ${report.breakdown.find}\n`;
    output += `  - run: ${report.breakdown.run}\n`;
    output += `  - code: ${report.breakdown.code}\n`;
    output += `- **Total Tokens Used**: ${report.totalTokensUsed.toLocaleString()}\n`;
    output += `- **Total Tokens Saved**: ${report.totalTokensSaved.toLocaleString()} (via Code-Mode)\n\n`;

    // Code-Mode efficiency
    if (report.codeModeEfficiency.executions > 0) {
      output += `### ⚡ Code-Mode Efficiency\n\n`;
      output += `- **Executions**: ${report.codeModeEfficiency.executions}\n`;
      output += `- **Avg Tools per Execution**: ${report.codeModeEfficiency.avgToolsPerExecution.toFixed(1)}\n`;
      output += `- **Avg Tokens per Execution**: ${Math.round(report.codeModeEfficiency.avgTokensPerExecution)}\n`;
      output += `- **Total Savings**: ${report.codeModeEfficiency.totalSavings.toLocaleString()} tokens\n`;
      output += `- **Savings Rate**: ${report.codeModeEfficiency.percentSavings.toFixed(1)}%\n\n`;

      // Explain the savings
      output += `*Code-Mode executes multiple tools in one call, saving token overhead from repeated find+run cycles.*\n\n`;
    }

    // Average tokens per execution type
    output += `### 📊 Average Tokens per Execution\n\n`;
    output += `| Type | Avg Tokens |\n`;
    output += `|------|------------|\n`;
    output += `| find | ${Math.round(report.avgTokensPerExecution.find)} |\n`;
    output += `| run  | ${Math.round(report.avgTokensPerExecution.run)} |\n`;
    output += `| code | ${Math.round(report.avgTokensPerExecution.code)} |\n\n`;

    // Time range
    output += `*Data from ${new Date(report.timeRange.start).toLocaleDateString()} to ${new Date(report.timeRange.end).toLocaleDateString()}*\n`;

    return {
      success: true,
      content: [{
        type: 'text',
        text: output
      }]
    };
  }
}
