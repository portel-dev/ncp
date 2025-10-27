/**
 * Analytics Internal MCP
 *
 * Provides usage analytics and metrics for AI consumption.
 * Returns data in markdown tables for AI parsing.
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { NCPLogParser, AnalyticsReport } from '../analytics/log-parser.js';
import { logger } from '../utils/logger.js';

export class AnalyticsMCP implements InternalMCP {
  name = 'analytics';
  description = 'View NCP usage analytics, token savings, and performance metrics';

  private parser: NCPLogParser;

  constructor() {
    this.parser = new NCPLogParser();
  }

  tools: InternalTool[] = [
    {
      name: 'get_dashboard',
      description: 'Get comprehensive analytics dashboard with usage stats, token savings, and performance metrics',
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
      name: 'get_performance',
      description: 'Get performance-focused metrics: fastest MCPs, most reliable MCPs, response times',
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
      name: 'get_usage',
      description: 'Get usage statistics: most used MCPs, tool counts, hourly patterns',
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
    }
  ];

  async executeTool(toolName: string, args: any): Promise<InternalToolResult> {
    try {
      // Parse time range options
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
        case 'get_dashboard':
          return this.formatDashboard(report);

        case 'get_performance':
          return this.formatPerformance(report);

        case 'get_usage':
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
   * Format dashboard as markdown
   */
  private formatDashboard(report: AnalyticsReport): InternalToolResult {
    const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const period = days <= 1 ? 'today' : `${days} days`;

    // Calculate token savings
    const estimatedTokensWithoutNCP = report.totalSessions * report.uniqueMCPs * 100;
    const estimatedTokensWithNCP = report.totalSessions * 50;
    const tokenSavings = estimatedTokensWithoutNCP - estimatedTokensWithNCP;
    const costSavings = (tokenSavings / 1000) * 0.002;

    const markdown = `# 🚀 NCP Analytics Dashboard

## 📊 Overview (${period})

| Metric | Value |
|--------|-------|
| Total Sessions | ${report.totalSessions.toLocaleString()} |
| Unique MCPs | ${report.uniqueMCPs} |
| Success Rate | ${report.successRate.toFixed(1)}% |
| Total Response Data | ${this.formatBytes(report.totalResponseSize)} |
| Avg Session Duration | ${report.avgSessionDuration.toFixed(0)}ms |

## 💰 Value Delivered

| Metric | Value |
|--------|-------|
| Tokens Saved (est.) | ~${(tokenSavings / 1000000).toFixed(1)}M |
| Cost Savings (est.) | ~$${costSavings.toFixed(2)} |
| Interface Reduction | 1 unified vs ${report.uniqueMCPs} separate |
| Cognitive Load Reduction | ${(((report.uniqueMCPs - 1) / report.uniqueMCPs) * 100).toFixed(1)}% |

## 🔥 Most Used MCPs

| MCP | Sessions | Share |
|-----|----------|-------|
${report.topMCPsByUsage.slice(0, 5).map(mcp =>
  `| ${mcp.name} | ${mcp.sessions} | ${((mcp.sessions / report.totalSessions) * 100).toFixed(1)}% |`
).join('\n')}

## ⚡ Performance Leaders

### Fastest MCPs
${report.performanceMetrics.fastestMCPs.slice(0, 5).map((mcp, i) =>
  `${i + 1}. **${mcp.name}**: ${mcp.avgDuration.toFixed(0)}ms`
).join('\n')}

### Most Reliable MCPs
${report.performanceMetrics.mostReliable.slice(0, 5).map((mcp, i) =>
  `${i + 1}. **${mcp.name}**: ${mcp.successRate.toFixed(1)}% success rate`
).join('\n')}
`;

    return {
      success: true,
      content: [{
        type: 'text',
        text: markdown
      }]
    };
  }

  /**
   * Format performance metrics as markdown
   */
  private formatPerformance(report: AnalyticsReport): InternalToolResult {
    const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));

    const markdown = `# ⚡ NCP Performance Metrics (${days} days)

## 🏆 Fastest MCPs

| Rank | MCP | Avg Duration |
|------|-----|--------------|
${report.performanceMetrics.fastestMCPs.slice(0, 10).map((mcp, i) =>
  `| ${i + 1} | ${mcp.name} | ${mcp.avgDuration.toFixed(0)}ms |`
).join('\n')}

## 🛡️ Most Reliable MCPs

| Rank | MCP | Success Rate |
|------|-----|--------------|
${report.performanceMetrics.mostReliable.slice(0, 10).map((mcp, i) =>
  `| ${i + 1} | ${mcp.name} | ${mcp.successRate.toFixed(1)}% |`
).join('\n')}

## 📊 Overall Performance

| Metric | Value |
|--------|-------|
| Avg Response Time | ${report.avgSessionDuration.toFixed(0)}ms |
| Success Rate | ${report.successRate.toFixed(1)}% |
| Total Sessions | ${report.totalSessions.toLocaleString()} |
| Total Data Transferred | ${this.formatBytes(report.totalResponseSize)} |
`;

    return {
      success: true,
      content: [{
        type: 'text',
        text: markdown
      }]
    };
  }

  /**
   * Format usage statistics as markdown
   */
  private formatUsage(report: AnalyticsReport): InternalToolResult {
    const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));

    const markdown = `# 📈 NCP Usage Statistics (${days} days)

## 🔥 Most Used MCPs

| Rank | MCP | Sessions | % of Total |
|------|-----|----------|------------|
${report.topMCPsByUsage.slice(0, 10).map((mcp, i) =>
  `| ${i + 1} | ${mcp.name} | ${mcp.sessions} | ${((mcp.sessions / report.totalSessions) * 100).toFixed(1)}% |`
).join('\n')}

## 🛠️ Tool-Rich MCPs

| Rank | MCP | Tool Count |
|------|-----|------------|
${report.topMCPsByTools.slice(0, 10).map((mcp, i) =>
  `| ${i + 1} | ${mcp.name} | ${mcp.toolCount} |`
).join('\n')}

## ⏰ Hourly Usage Pattern

| Hour | Sessions |
|------|----------|
${Object.entries(report.hourlyUsage)
  .sort(([a], [b]) => parseInt(a) - parseInt(b))
  .map(([hour, count]) => `| ${hour}:00 | ${count} |`)
  .join('\n')}

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Sessions | ${report.totalSessions.toLocaleString()} |
| Unique MCPs | ${report.uniqueMCPs} |
| Peak Hour | ${this.getPeakHour(report.hourlyUsage)} |
| Avg Sessions/Day | ${(report.totalSessions / days).toFixed(0)} |
`;

    return {
      success: true,
      content: [{
        type: 'text',
        text: markdown
      }]
    };
  }

  /**
   * Format bytes to human-readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
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
}
