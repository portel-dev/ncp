/**
 * Token Metrics Tracker
 * Tracks token usage for find, run, and code-mode to measure efficiency gains
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

export interface TokenMetric {
  timestamp: string;
  type: 'find' | 'run' | 'code';
  estimatedTokens: number;

  // For find
  toolsFound?: number;
  query?: string;

  // For run
  toolExecuted?: string;

  // For code
  toolsExecuted?: number; // Number of tools called in code
  linesOfCode?: number;

  // Calculated savings
  savings?: {
    wouldHaveCost: number; // What find+run would have cost
    actualCost: number; // What code-mode cost
    saved: number; // Difference
  };
}

export interface TokenMetricsReport {
  totalExecutions: number;
  breakdown: {
    find: number;
    run: number;
    code: number;
  };
  totalTokensUsed: number;
  totalTokensSaved: number; // From code-mode
  avgTokensPerExecution: {
    find: number;
    run: number;
    code: number;
  };
  codeModeEfficiency: {
    executions: number;
    avgToolsPerExecution: number;
    avgTokensPerExecution: number;
    totalSavings: number;
    percentSavings: number; // vs find+run pattern
  };
  timeRange: {
    start: string;
    end: string;
  };
}

export class TokenMetricsTracker {
  private metricsFile: string;
  private metrics: TokenMetric[] = [];
  private loaded = false;

  // Token estimation constants (approximate)
  private static readonly AVG_TOKENS_PER_CHAR = 0.25; // ~4 chars per token
  private static readonly AVG_FIND_RESPONSE_TOKENS = 200; // Average find response
  private static readonly AVG_RUN_RESPONSE_TOKENS = 150; // Average run response

  constructor() {
    const baseDir = getNcpBaseDirectory();
    this.metricsFile = join(baseDir, 'token-metrics.json');
  }

  /**
   * Estimate tokens in a text string
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length * TokenMetricsTracker.AVG_TOKENS_PER_CHAR);
  }

  /**
   * Load metrics from disk
   */
  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.metricsFile, 'utf-8');
      this.metrics = JSON.parse(data);
      this.loaded = true;
    } catch (error) {
      // File doesn't exist yet - start with empty array
      this.metrics = [];
      this.loaded = true;
    }
  }

  /**
   * Save metrics to disk
   */
  private async save(): Promise<void> {
    try {
      // Keep only last 10,000 metrics to prevent unbounded growth
      if (this.metrics.length > 10000) {
        this.metrics = this.metrics.slice(-10000);
      }

      await fs.writeFile(
        this.metricsFile,
        JSON.stringify(this.metrics, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save token metrics:', error);
    }
  }

  /**
   * Track a find operation
   */
  async trackFind(response: string, toolsFound: number, query?: string): Promise<void> {
    await this.load();

    const metric: TokenMetric = {
      timestamp: new Date().toISOString(),
      type: 'find',
      estimatedTokens: TokenMetricsTracker.estimateTokens(response),
      toolsFound,
      query
    };

    this.metrics.push(metric);
    await this.save();
  }

  /**
   * Track a run operation
   */
  async trackRun(response: string, toolExecuted: string): Promise<void> {
    await this.load();

    const metric: TokenMetric = {
      timestamp: new Date().toISOString(),
      type: 'run',
      estimatedTokens: TokenMetricsTracker.estimateTokens(response),
      toolExecuted
    };

    this.metrics.push(metric);
    await this.save();
  }

  /**
   * Track a code-mode operation
   */
  async trackCode(response: string, code: string, toolsExecuted: number): Promise<void> {
    await this.load();

    const linesOfCode = code.split('\n').length;
    const actualCost = TokenMetricsTracker.estimateTokens(response);

    // Calculate what find+run would have cost
    // Assumption: each tool would require 1 find + 1 run call
    const wouldHaveCost = toolsExecuted * (
      TokenMetricsTracker.AVG_FIND_RESPONSE_TOKENS +
      TokenMetricsTracker.AVG_RUN_RESPONSE_TOKENS
    );

    const saved = Math.max(0, wouldHaveCost - actualCost);

    const metric: TokenMetric = {
      timestamp: new Date().toISOString(),
      type: 'code',
      estimatedTokens: actualCost,
      toolsExecuted,
      linesOfCode,
      savings: {
        wouldHaveCost,
        actualCost,
        saved
      }
    };

    this.metrics.push(metric);
    await this.save();
  }

  /**
   * Generate analytics report
   */
  async generateReport(daysBack: number = 7): Promise<TokenMetricsReport> {
    await this.load();

    // Filter to time range
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const filtered = this.metrics.filter(m => new Date(m.timestamp) >= cutoff);

    if (filtered.length === 0) {
      return {
        totalExecutions: 0,
        breakdown: { find: 0, run: 0, code: 0 },
        totalTokensUsed: 0,
        totalTokensSaved: 0,
        avgTokensPerExecution: { find: 0, run: 0, code: 0 },
        codeModeEfficiency: {
          executions: 0,
          avgToolsPerExecution: 0,
          avgTokensPerExecution: 0,
          totalSavings: 0,
          percentSavings: 0
        },
        timeRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        }
      };
    }

    // Calculate breakdown
    const breakdown = {
      find: filtered.filter(m => m.type === 'find').length,
      run: filtered.filter(m => m.type === 'run').length,
      code: filtered.filter(m => m.type === 'code').length
    };

    // Calculate total tokens
    const totalTokensUsed = filtered.reduce((sum, m) => sum + m.estimatedTokens, 0);

    // Calculate code-mode savings
    const codeMetrics = filtered.filter(m => m.type === 'code');
    const totalTokensSaved = codeMetrics.reduce(
      (sum, m) => sum + (m.savings?.saved || 0),
      0
    );

    // Calculate averages
    const avgTokensPerExecution = {
      find: breakdown.find > 0
        ? filtered.filter(m => m.type === 'find').reduce((sum, m) => sum + m.estimatedTokens, 0) / breakdown.find
        : 0,
      run: breakdown.run > 0
        ? filtered.filter(m => m.type === 'run').reduce((sum, m) => sum + m.estimatedTokens, 0) / breakdown.run
        : 0,
      code: breakdown.code > 0
        ? codeMetrics.reduce((sum, m) => sum + m.estimatedTokens, 0) / breakdown.code
        : 0
    };

    // Code-mode efficiency stats
    const avgToolsPerExecution = breakdown.code > 0
      ? codeMetrics.reduce((sum, m) => sum + (m.toolsExecuted || 0), 0) / breakdown.code
      : 0;

    const totalWouldHaveCost = codeMetrics.reduce(
      (sum, m) => sum + (m.savings?.wouldHaveCost || 0),
      0
    );

    const percentSavings = totalWouldHaveCost > 0
      ? (totalTokensSaved / totalWouldHaveCost) * 100
      : 0;

    return {
      totalExecutions: filtered.length,
      breakdown,
      totalTokensUsed,
      totalTokensSaved,
      avgTokensPerExecution,
      codeModeEfficiency: {
        executions: breakdown.code,
        avgToolsPerExecution,
        avgTokensPerExecution: avgTokensPerExecution.code,
        totalSavings: totalTokensSaved,
        percentSavings
      },
      timeRange: {
        start: filtered[0].timestamp,
        end: filtered[filtered.length - 1].timestamp
      }
    };
  }

  /**
   * Clear old metrics (older than specified days)
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    await this.load();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const before = this.metrics.length;
    this.metrics = this.metrics.filter(m => new Date(m.timestamp) >= cutoff);
    const removed = before - this.metrics.length;

    if (removed > 0) {
      await this.save();
    }

    return removed;
  }
}
