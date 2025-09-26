/**
 * NCP Visual Analytics Formatter
 * Enhanced terminal output with CLI charts and graphs
 */

import chalk from 'chalk';
import { AnalyticsReport } from './log-parser.js';

export class VisualAnalyticsFormatter {
  /**
   * Format analytics dashboard with visual charts
   */
  static async formatVisualDashboard(report: AnalyticsReport): Promise<string> {
    const output: string[] = [];

    // Header with enhanced styling
    output.push('');
    output.push(chalk.bold.cyan('🚀 NCP Impact Analytics Dashboard (Visual)'));
    output.push(chalk.dim('═'.repeat(60)));
    output.push('');

    // Overview Section with Key Metrics
    output.push(chalk.bold.white('📊 KEY METRICS OVERVIEW'));
    output.push('');

    const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const period = days <= 1 ? 'today' : `last ${days} days`;

    // Create metrics display with visual bars
    const metrics = [
      { label: 'Total Sessions', value: report.totalSessions, unit: 'sessions', color: chalk.green },
      { label: 'Unique MCPs', value: report.uniqueMCPs, unit: 'servers', color: chalk.cyan },
      { label: 'Success Rate', value: Math.round(report.successRate), unit: '%', color: chalk.yellow },
      { label: 'Response Data', value: Math.round(report.totalResponseSize / 1024 / 1024), unit: 'MB', color: chalk.blue }
    ];

    for (const metric of metrics) {
      const bar = this.createHorizontalBar(metric.value, Math.max(...metrics.map(m => m.value)), 25);
      output.push(`${metric.color(metric.label.padEnd(15))}: ${bar} ${metric.color(metric.value.toLocaleString())} ${chalk.dim(metric.unit)}`);
    }
    output.push('');

    // Usage Trends Chart
    if (Object.keys(report.dailyUsage).length > 3) {
      output.push(chalk.bold.white('📈 DAILY USAGE TRENDS'));
      output.push('');

      const dailyData = Object.entries(report.dailyUsage)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([_, usage]) => usage);

      if (dailyData.length > 1) {
        // Create simple ASCII line chart
        const chart = this.createLineChart(dailyData, 8, 40);
        output.push(chalk.green(chart));
        output.push(chalk.dim('   └─ Sessions per day over time'));
      }
      output.push('');
    }

    // Top MCPs Usage Chart
    if (report.topMCPsByUsage.length > 0) {
      output.push(chalk.bold.white('🔥 TOP MCP USAGE DISTRIBUTION'));
      output.push('');

      const topMCPs = report.topMCPsByUsage.slice(0, 8);
      const maxSessions = Math.max(...topMCPs.map(mcp => mcp.sessions));

      for (const mcp of topMCPs) {
        const percentage = ((mcp.sessions / report.totalSessions) * 100).toFixed(1);
        const bar = this.createColorfulBar(mcp.sessions, maxSessions, 30);
        const successIcon = mcp.successRate >= 95 ? '✅' : mcp.successRate >= 80 ? '⚠️' : '❌';

        output.push(`${chalk.cyan(mcp.name.padEnd(20))} ${bar} ${chalk.white(mcp.sessions.toString().padStart(3))} ${chalk.dim(`(${percentage}%)`)} ${successIcon}`);
      }
      output.push('');
    }

    // Performance Distribution
    if (report.performanceMetrics.fastestMCPs.length > 0) {
      output.push(chalk.bold.white('⚡ PERFORMANCE DISTRIBUTION'));
      output.push('');

      // Create performance buckets
      const performanceData = report.performanceMetrics.fastestMCPs.concat(report.performanceMetrics.slowestMCPs);
      const durations = performanceData.map(mcp => mcp.avgDuration).filter(d => d > 0);

      if (durations.length > 3) {
        // Create performance distribution chart
        const chart = this.createLineChart(durations.slice(0, 20), 6, 35);
        output.push(chalk.yellow(chart));
        output.push(chalk.dim('   └─ Response times across MCPs (ms)'));
      }
      output.push('');
    }

    // Value Delivered Section with Visual Impact
    output.push(chalk.bold.white('💰 VALUE IMPACT VISUALIZATION (ESTIMATES)'));
    output.push('');

    // Calculate savings
    const estimatedTokensWithoutNCP = report.totalSessions * report.uniqueMCPs * 100;
    const estimatedTokensWithNCP = report.totalSessions * 50;
    const tokenSavings = estimatedTokensWithoutNCP - estimatedTokensWithNCP;
    const costSavings = (tokenSavings / 1000) * 0.002;

    // Visual representation of savings
    const savingsData = [
      { label: 'Without NCP', value: estimatedTokensWithoutNCP, color: chalk.red },
      { label: 'With NCP', value: estimatedTokensWithNCP, color: chalk.green }
    ];

    const maxTokens = Math.max(...savingsData.map(s => s.value));
    for (const saving of savingsData) {
      const bar = this.createHorizontalBar(saving.value, maxTokens, 40);
      output.push(`${saving.label.padEnd(12)}: ${bar} ${saving.color((saving.value / 1000000).toFixed(1))}M tokens`);
    }

    output.push('');
    output.push(`💎 ${chalk.bold.green((tokenSavings / 1000000).toFixed(1))}M tokens saved = ${chalk.bold.green('$' + costSavings.toFixed(2))} cost reduction`);
    output.push(`🧠 ${chalk.bold.green((((report.uniqueMCPs - 1) / report.uniqueMCPs) * 100).toFixed(1) + '%')} cognitive load reduction`);
    output.push('');

    // Environmental Impact with Visual Scale
    output.push(chalk.bold.white('🌱 ENVIRONMENTAL IMPACT SCALE (ROUGH ESTIMATES)'));
    output.push('');

    const sessionsWithoutNCP = report.totalSessions * report.uniqueMCPs;
    const computeReduction = sessionsWithoutNCP - report.totalSessions;
    const estimatedEnergyKWh = computeReduction * 0.0002;
    const estimatedCO2kg = estimatedEnergyKWh * 0.5;

    // Visual representation of environmental savings
    const envData = [
      { label: 'Energy Saved', value: estimatedEnergyKWh, unit: 'kWh', icon: '⚡' },
      { label: 'CO₂ Avoided', value: estimatedCO2kg, unit: 'kg', icon: '🌍' },
      { label: 'Connections Saved', value: computeReduction / 1000, unit: 'k', icon: '🔌' }
    ];

    const maxEnvValue = Math.max(...envData.map(e => e.value));
    for (const env of envData) {
      const bar = this.createGreenBar(env.value, maxEnvValue, 25);
      output.push(`${env.icon} ${env.label.padEnd(18)}: ${bar} ${chalk.green(env.value.toFixed(1))} ${chalk.dim(env.unit)}`);
    }
    output.push('');

    // Footer with enhanced tips
    output.push(chalk.bold.white('💡 INTERACTIVE COMMANDS'));
    output.push('');
    output.push(chalk.dim('  📊 ') + chalk.cyan('ncp analytics performance') + chalk.dim(' - Detailed performance metrics'));
    output.push(chalk.dim('  📁 ') + chalk.cyan('ncp analytics export') + chalk.dim(' - Export data to CSV'));
    output.push(chalk.dim('  🔄 ') + chalk.cyan('ncp analytics dashboard') + chalk.dim(' - Refresh this dashboard'));
    output.push('');

    return output.join('\\n');
  }

  /**
   * Create horizontal progress bar with custom styling
   */
  private static createHorizontalBar(value: number, max: number, width: number): string {
    const percentage = max > 0 ? value / max : 0;
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    const filledChar = '█';
    const emptyChar = '░';

    return chalk.green(filledChar.repeat(filled)) + chalk.dim(emptyChar.repeat(empty));
  }

  /**
   * Create colorful bar with gradient effect
   */
  private static createColorfulBar(value: number, max: number, width: number): string {
    const percentage = max > 0 ? value / max : 0;
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    // Create gradient effect based on value
    let coloredBar = '';
    for (let i = 0; i < filled; i++) {
      const progress = i / width;
      if (progress < 0.3) {
        coloredBar += chalk.red('█');
      } else if (progress < 0.6) {
        coloredBar += chalk.yellow('█');
      } else {
        coloredBar += chalk.green('█');
      }
    }

    return coloredBar + chalk.dim('░'.repeat(empty));
  }

  /**
   * Create green-themed bar for environmental metrics
   */
  private static createGreenBar(value: number, max: number, width: number): string {
    const percentage = max > 0 ? value / max : 0;
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    const filledBar = chalk.bgGreen.black('█'.repeat(filled));
    const emptyBar = chalk.dim('░'.repeat(empty));

    return filledBar + emptyBar;
  }

  /**
   * Format performance report with enhanced visuals
   */
  static async formatVisualPerformance(report: AnalyticsReport): Promise<string> {
    const output: string[] = [];

    output.push('');
    output.push(chalk.bold.cyan('⚡ NCP Performance Analytics (Visual)'));
    output.push(chalk.dim('═'.repeat(50)));
    output.push('');

    // Performance Overview with Gauges
    output.push(chalk.bold.white('🎯 PERFORMANCE GAUGES'));
    output.push('');

    const performanceMetrics = [
      { label: 'Success Rate', value: report.successRate, max: 100, unit: '%', color: chalk.green },
      { label: 'Avg Response', value: report.avgSessionDuration || 5000, max: 10000, unit: 'ms', color: chalk.yellow },
      { label: 'MCPs Active', value: report.uniqueMCPs, max: 2000, unit: 'servers', color: chalk.cyan }
    ];

    for (const metric of performanceMetrics) {
      const gauge = this.createGauge(metric.value, metric.max);
      output.push(`${metric.label.padEnd(15)}: ${gauge} ${metric.color(metric.value.toFixed(1))}${metric.unit}`);
    }
    output.push('');

    // Performance Leaderboard with Visual Ranking
    if (report.performanceMetrics.fastestMCPs.length > 0) {
      output.push(chalk.bold.white('🏆 SPEED CHAMPIONS PODIUM'));
      output.push('');

      const topPerformers = report.performanceMetrics.fastestMCPs.slice(0, 5);
      const medals = ['🥇', '🥈', '🥉', '🏅', '🎖️'];

      for (let i = 0; i < topPerformers.length; i++) {
        const mcp = topPerformers[i];
        const medal = medals[i] || '⭐';
        const speedBar = this.createSpeedBar(mcp.avgDuration, 10000);

        output.push(`${medal} ${chalk.cyan(mcp.name.padEnd(20))} ${speedBar} ${chalk.bold.green(mcp.avgDuration.toFixed(0))}ms`);
      }
      output.push('');
    }

    // Reliability Champions
    if (report.performanceMetrics.mostReliable.length > 0) {
      output.push(chalk.bold.white('🛡️ RELIABILITY CHAMPIONS'));
      output.push('');

      const reliablePerformers = report.performanceMetrics.mostReliable.slice(0, 5);

      for (let i = 0; i < reliablePerformers.length; i++) {
        const mcp = reliablePerformers[i];
        const reliabilityBar = this.createReliabilityBar(mcp.successRate);
        const shield = mcp.successRate >= 99 ? '🛡️' : mcp.successRate >= 95 ? '🔰' : '⚡';

        output.push(`${shield} ${chalk.cyan(mcp.name.padEnd(20))} ${reliabilityBar} ${chalk.bold.green(mcp.successRate.toFixed(1))}%`);
      }
      output.push('');
    }

    return output.join('\\n');
  }

  /**
   * Create gauge visualization
   */
  private static createGauge(value: number, max: number): string {
    const percentage = Math.min(value / max, 1);
    const gaugeWidth = 20;
    const filled = Math.round(percentage * gaugeWidth);

    // Create gauge with different colors based on performance
    let gauge = '[';
    for (let i = 0; i < gaugeWidth; i++) {
      if (i < filled) {
        if (percentage > 0.8) gauge += chalk.green('█');
        else if (percentage > 0.5) gauge += chalk.yellow('█');
        else gauge += chalk.red('█');
      } else {
        gauge += chalk.dim('░');
      }
    }
    gauge += ']';

    return gauge;
  }

  /**
   * Create speed bar (faster = more green)
   */
  private static createSpeedBar(duration: number, maxDuration: number): string {
    const speed = Math.max(0, 1 - (duration / maxDuration)); // Invert: faster = higher score
    const barWidth = 15;
    const filled = Math.round(speed * barWidth);

    return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(barWidth - filled));
  }

  /**
   * Create reliability bar
   */
  private static createReliabilityBar(successRate: number): string {
    const barWidth = 15;
    const filled = Math.round((successRate / 100) * barWidth);

    return chalk.blue('█'.repeat(filled)) + chalk.dim('░'.repeat(barWidth - filled));
  }

  /**
   * Create simple ASCII line chart
   */
  private static createLineChart(data: number[], height: number, width: number): string {
    if (data.length === 0) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const lines: string[] = [];

    // Create chart grid
    for (let row = 0; row < height; row++) {
      const threshold = max - (row / (height - 1)) * range;
      let line = '   ';

      for (let col = 0; col < Math.min(data.length, width); col++) {
        const value = data[col];
        const prevValue = col > 0 ? data[col - 1] : value;

        // Determine character based on value relative to threshold
        if (value >= threshold) {
          // Different characters for trends
          if (col > 0) {
            if (value > prevValue) line += '╱'; // Rising
            else if (value < prevValue) line += '╲'; // Falling
            else line += '─'; // Flat
          } else {
            line += '●'; // Start point
          }
        } else {
          line += ' '; // Empty space
        }
      }
      lines.push(line);
    }

    // Add axis
    const axis = '   ' + '─'.repeat(Math.min(data.length, width));
    lines.push(axis);

    return lines.join('\n');
  }
}