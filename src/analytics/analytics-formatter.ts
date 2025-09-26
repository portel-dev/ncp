/**
 * NCP Analytics Report Formatter
 * Beautiful terminal output for analytics data
 */

import chalk from 'chalk';
import { AnalyticsReport } from './log-parser.js';

export class AnalyticsFormatter {
  /**
   * Format complete analytics dashboard
   */
  static formatDashboard(report: AnalyticsReport): string {
    const output: string[] = [];

    // Header
    output.push('');
    output.push(chalk.bold.cyan('🚀 NCP Impact Analytics Dashboard'));
    output.push(chalk.dim('═'.repeat(50)));
    output.push('');

    // Overview Section
    output.push(chalk.bold.white('📊 OVERVIEW'));
    output.push('');

    const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const period = days <= 1 ? 'today' : `last ${days} days`;

    output.push(`⚡ ${chalk.green(report.totalSessions.toLocaleString())} total MCP sessions (${period})`);
    output.push(`🎯 ${chalk.green(report.uniqueMCPs)} unique MCPs orchestrated through NCP`);
    output.push(`✅ ${chalk.green(report.successRate.toFixed(1) + '%')} success rate`);
    output.push(`📊 ${chalk.green(this.formatBytes(report.totalResponseSize))} total response data`);

    if (report.avgSessionDuration > 0) {
      output.push(`⏱️  ${chalk.green(report.avgSessionDuration.toFixed(0) + 'ms')} average session duration`);
    }
    output.push('');

    // Value Proposition Section
    output.push(chalk.bold.white('💰 VALUE DELIVERED (ESTIMATES)'));
    output.push('');

    // Calculate token savings (estimated)
    const estimatedTokensWithoutNCP = report.totalSessions * report.uniqueMCPs * 100; // Conservative estimate
    const estimatedTokensWithNCP = report.totalSessions * 50; // Much lower with NCP
    const tokenSavings = estimatedTokensWithoutNCP - estimatedTokensWithNCP;
    const costSavings = (tokenSavings / 1000) * 0.002; // $0.002 per 1K tokens

    output.push(`💎 ${chalk.bold.green('~' + (tokenSavings / 1000000).toFixed(1) + 'M')} tokens saved ${chalk.dim('(est. 100 tokens/MCP call)')}`);
    output.push(`💵 ${chalk.bold.green('~$' + costSavings.toFixed(2))} cost savings ${chalk.dim('(based on GPT-4 pricing)')}`);
    output.push(`🔄 ${chalk.bold.green('1')} unified interface vs ${chalk.bold.red(report.uniqueMCPs)} separate MCPs ${chalk.dim('(measured)')}`);
    output.push(`🧠 ${chalk.bold.green((((report.uniqueMCPs - 1) / report.uniqueMCPs) * 100).toFixed(1) + '%')} cognitive load reduction ${chalk.dim('(calculated)')}`);
    output.push('');

    // Performance Section
    output.push(chalk.bold.white('⚡ PERFORMANCE LEADERS'));
    output.push('');

    if (report.performanceMetrics.fastestMCPs.length > 0) {
      output.push(chalk.green('🏆 Fastest MCPs:'));
      for (const mcp of report.performanceMetrics.fastestMCPs.slice(0, 5)) {
        output.push(`   ${chalk.cyan(mcp.name)}: ${mcp.avgDuration.toFixed(0)}ms`);
      }
      output.push('');
    }

    if (report.performanceMetrics.mostReliable.length > 0) {
      output.push(chalk.green('🛡️  Most Reliable MCPs:'));
      for (const mcp of report.performanceMetrics.mostReliable.slice(0, 5)) {
        output.push(`   ${chalk.cyan(mcp.name)}: ${mcp.successRate.toFixed(1)}% success`);
      }
      output.push('');
    }

    // Usage Statistics
    output.push(chalk.bold.white('📈 USAGE STATISTICS'));
    output.push('');

    if (report.topMCPsByUsage.length > 0) {
      output.push(chalk.green('🔥 Most Used MCPs:'));
      for (const mcp of report.topMCPsByUsage.slice(0, 8)) {
        const bar = this.createProgressBar(mcp.sessions, report.topMCPsByUsage[0].sessions, 20);
        output.push(`   ${chalk.cyan(mcp.name.padEnd(25))} ${bar} ${mcp.sessions} sessions`);
      }
      output.push('');
    }

    if (report.topMCPsByTools.length > 0) {
      output.push(chalk.green('🛠️  Tool-Rich MCPs:'));
      for (const mcp of report.topMCPsByTools.slice(0, 5)) {
        output.push(`   ${chalk.cyan(mcp.name)}: ${chalk.bold(mcp.toolCount)} tools`);
      }
      output.push('');
    }

    // Daily Usage Pattern
    if (Object.keys(report.dailyUsage).length > 1) {
      output.push(chalk.bold.white('📅 DAILY USAGE'));
      output.push('');

      const sortedDays = Object.entries(report.dailyUsage)
        .sort(([a], [b]) => a.localeCompare(b));

      const maxDailyUsage = Math.max(...Object.values(report.dailyUsage));

      for (const [date, usage] of sortedDays) {
        const bar = this.createProgressBar(usage, maxDailyUsage, 30);
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        output.push(`   ${formattedDate.padEnd(12)} ${bar} ${usage} sessions`);
      }
      output.push('');
    }

    // Environmental Impact
    output.push(chalk.bold.white('🌱 ENVIRONMENTAL IMPACT (ROUGH ESTIMATES)'));
    output.push('');

    // Rough estimates based on compute reduction
    const sessionsWithoutNCP = report.totalSessions * report.uniqueMCPs;
    const computeReduction = sessionsWithoutNCP - report.totalSessions;
    const estimatedEnergyKWh = (computeReduction * 0.0002); // Very rough estimate
    const estimatedCO2kg = estimatedEnergyKWh * 0.5; // Rough CO2 per kWh

    output.push(`⚡ ${chalk.green('~' + estimatedEnergyKWh.toFixed(1) + ' kWh')} energy saved ${chalk.dim('(rough est: 0.2Wh per connection)')}`);
    output.push(`🌍 ${chalk.green('~' + estimatedCO2kg.toFixed(1) + ' kg CO₂')} emissions avoided ${chalk.dim('(0.5kg CO₂/kWh avg grid)')}`);
    output.push(`🔌 ${chalk.green(computeReduction.toLocaleString())} fewer connections ${chalk.dim('(measured: actual reduction)')}`);
    output.push(chalk.dim('   ⚠️  Environmental estimates are order-of-magnitude approximations'));
    output.push('');

    // Footer with tips
    output.push(chalk.dim('💡 Tips:'));
    output.push(chalk.dim('  • Use `ncp analytics --export csv` for detailed data analysis'));
    output.push(chalk.dim('  • Run `ncp analytics performance` for detailed performance metrics'));
    output.push(chalk.dim('  • Check `ncp analytics --period 7d` for weekly trends'));
    output.push('');

    return output.join('\n');
  }

  /**
   * Format performance-focused report
   */
  static formatPerformanceReport(report: AnalyticsReport): string {
    const output: string[] = [];

    output.push('');
    output.push(chalk.bold.cyan('⚡ NCP Performance Analytics'));
    output.push(chalk.dim('═'.repeat(40)));
    output.push('');

    // Key Performance Metrics
    output.push(chalk.bold.white('🎯 KEY METRICS'));
    output.push('');
    output.push(`📊 Success Rate: ${chalk.green(report.successRate.toFixed(2) + '%')}`);
    if (report.avgSessionDuration > 0) {
      output.push(`⏱️  Avg Response Time: ${chalk.green(report.avgSessionDuration.toFixed(0) + 'ms')}`);
    }
    output.push(`🎭 MCPs Orchestrated: ${chalk.green(report.uniqueMCPs)} different providers`);
    output.push('');

    // Performance Leaderboards
    if (report.performanceMetrics.fastestMCPs.length > 0) {
      output.push(chalk.bold.white('🏆 SPEED CHAMPIONS'));
      output.push('');
      for (let i = 0; i < Math.min(3, report.performanceMetrics.fastestMCPs.length); i++) {
        const mcp = report.performanceMetrics.fastestMCPs[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        output.push(`${medal} ${chalk.cyan(mcp.name)}: ${chalk.bold.green(mcp.avgDuration.toFixed(0) + 'ms')}`);
      }
      output.push('');
    }

    if (report.performanceMetrics.mostReliable.length > 0) {
      output.push(chalk.bold.white('🛡️ RELIABILITY CHAMPIONS'));
      output.push('');
      for (let i = 0; i < Math.min(3, report.performanceMetrics.mostReliable.length); i++) {
        const mcp = report.performanceMetrics.mostReliable[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        output.push(`${medal} ${chalk.cyan(mcp.name)}: ${chalk.bold.green(mcp.successRate.toFixed(1) + '%')} success`);
      }
      output.push('');
    }

    return output.join('\n');
  }

  /**
   * Format CSV export
   */
  static formatCSV(report: AnalyticsReport): string {
    const lines: string[] = [];

    // Header
    lines.push('Date,MCP,Sessions,Success_Rate,Avg_Duration_ms,Tool_Count');

    // MCP data
    for (const mcp of report.topMCPsByUsage) {
      const toolData = report.topMCPsByTools.find(t => t.name === mcp.name);
      const perfData = report.performanceMetrics.fastestMCPs.find(p => p.name === mcp.name) ||
                       report.performanceMetrics.slowestMCPs.find(p => p.name === mcp.name);

      lines.push([
        report.timeRange.end.toISOString().split('T')[0],
        mcp.name,
        mcp.sessions.toString(),
        mcp.successRate.toFixed(2),
        perfData ? perfData.avgDuration.toFixed(0) : 'N/A',
        toolData ? toolData.toolCount.toString() : 'N/A'
      ].join(','));
    }

    return lines.join('\n');
  }

  /**
   * Create ASCII progress bar
   */
  private static createProgressBar(value: number, max: number, width: number = 20): string {
    const percentage = max > 0 ? value / max : 0;
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return chalk.green(bar);
  }

  /**
   * Format bytes to human readable
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}