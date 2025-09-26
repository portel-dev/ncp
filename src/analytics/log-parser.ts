/**
 * NCP Analytics Log Parser
 * Parses real MCP session logs to extract performance and usage insights
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as os from 'os';

export interface MCPSession {
  mcpName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  toolCount?: number;
  tools?: string[];
  exitCode?: number;
  success: boolean;
  responseSize: number;
  errorMessages: string[];
}

export interface AnalyticsReport {
  totalSessions: number;
  uniqueMCPs: number;
  timeRange: { start: Date; end: Date };
  successRate: number;
  avgSessionDuration: number;
  totalResponseSize: number;
  topMCPsByUsage: Array<{ name: string; sessions: number; successRate: number }>;
  topMCPsByTools: Array<{ name: string; toolCount: number }>;
  performanceMetrics: {
    fastestMCPs: Array<{ name: string; avgDuration: number }>;
    slowestMCPs: Array<{ name: string; avgDuration: number }>;
    mostReliable: Array<{ name: string; successRate: number }>;
    leastReliable: Array<{ name: string; successRate: number }>;
  };
  dailyUsage: Record<string, number>;
  hourlyUsage: Record<number, number>;
}

export class NCPLogParser {
  private logsDir: string;

  constructor() {
    // Always use global ~/.ncp/logs for analytics data
    // This ensures we analyze the real usage data, not local development data
    this.logsDir = join(os.homedir(), '.ncp', 'logs');
  }

  /**
   * Parse a single log file to extract session data
   */
  private parseLogFile(filePath: string): MCPSession[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const sessions: MCPSession[] = [];

      // Extract MCP name from filename: mcp-{name}-2025w39.log
      const fileName = filePath.split('/').pop() || '';
      const mcpMatch = fileName.match(/mcp-(.+)-\d{4}w\d{2}\.log/);
      const mcpName = mcpMatch ? mcpMatch[1] : 'unknown';

      // Split content into individual sessions
      const sessionBlocks = content.split(/--- MCP .+ Session Started: .+ ---/);

      for (let i = 1; i < sessionBlocks.length; i++) {
        const block = sessionBlocks[i];
        const session = this.parseSessionBlock(mcpName, block);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      console.error(`Error parsing log file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Parse individual session block
   */
  private parseSessionBlock(mcpName: string, block: string): MCPSession | null {
    try {
      const lines = block.split('\n').filter(line => line.trim());

      // Find session start time from the previous separator
      const sessionStartRegex = /--- MCP .+ Session Started: (.+) ---/;
      let startTime: Date | undefined;

      // Look for start time in the content before this block
      const startMatch = block.match(sessionStartRegex);
      if (startMatch) {
        startTime = new Date(startMatch[1]);
      } else {
        // Fallback: use first timestamp we can find
        const firstLine = lines[0];
        if (firstLine) {
          startTime = new Date(); // Use current time as fallback
        }
      }

      if (!startTime) return null;

      let toolCount = 0;
      let tools: string[] = [];
      let exitCode: number | undefined;
      let responseSize = 0;
      let errorMessages: string[] = [];
      let endTime: Date | undefined;

      for (const line of lines) {
        // Extract tool information
        if (line.includes('Loaded MCP with') && line.includes('tools:')) {
          const toolMatch = line.match(/Loaded MCP with (\d+) tools: (.+)/);
          if (toolMatch) {
            toolCount = parseInt(toolMatch[1]);
            tools = toolMatch[2].split(', ').map(t => t.trim());
          }
        }

        // Extract JSON responses and their size
        if (line.startsWith('[STDOUT]') && line.includes('{"result"')) {
          const jsonPart = line.substring('[STDOUT] '.length);
          responseSize += jsonPart.length;
        }

        // Extract errors
        if (line.includes('[STDERR]') && (line.includes('Error') || line.includes('Failed'))) {
          errorMessages.push(line);
        }

        // Extract exit code
        if (line.includes('[EXIT] Process exited with code')) {
          const exitMatch = line.match(/code (\d+)/);
          if (exitMatch) {
            exitCode = parseInt(exitMatch[1]);
            endTime = new Date(startTime.getTime() + 5000); // Estimate end time
          }
        }
      }

      // Calculate duration (estimated)
      const duration = endTime ? endTime.getTime() - startTime.getTime() : undefined;
      const success = exitCode === 0 || exitCode === undefined || (toolCount > 0 && responseSize > 0);

      return {
        mcpName,
        startTime,
        endTime,
        duration,
        toolCount: toolCount || undefined,
        tools: tools.length > 0 ? tools : undefined,
        exitCode,
        success,
        responseSize,
        errorMessages
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse all log files and generate analytics report
   * @param options - Filter options for time range
   */
  async parseAllLogs(options?: {
    from?: Date;
    to?: Date;
    period?: number; // days
    today?: boolean;
  }): Promise<AnalyticsReport> {
    const sessions: MCPSession[] = [];

    try {
      const logFiles = readdirSync(this.logsDir)
        .filter(file => file.endsWith('.log'))
        .map(file => join(this.logsDir, file));

      console.log(`📊 Parsing ${logFiles.length} log files...`);

      // Calculate date range
      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      if (options?.today) {
        // Today only
        fromDate = new Date();
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
      } else if (options?.period) {
        // Last N days
        toDate = new Date();
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - options.period);
        fromDate.setHours(0, 0, 0, 0);
      } else if (options?.from || options?.to) {
        // Custom range
        fromDate = options.from;
        toDate = options.to || new Date();

        // If toDate is provided, set to end of that day
        if (options?.to) {
          toDate = new Date(options.to);
          toDate.setHours(23, 59, 59, 999);
        }

        // If fromDate is provided, set to start of that day
        if (options?.from) {
          fromDate = new Date(options.from);
          fromDate.setHours(0, 0, 0, 0);
        }
      }

      for (const logFile of logFiles) {
        const fileSessions = this.parseLogFile(logFile);

        // Filter sessions by date range if specified
        const filteredSessions = fromDate || toDate
          ? fileSessions.filter(session => {
              if (fromDate && session.startTime < fromDate) return false;
              if (toDate && session.startTime > toDate) return false;
              return true;
            })
          : fileSessions;

        sessions.push(...filteredSessions);
      }

      if (fromDate || toDate) {
        const rangeDesc = options?.today
          ? 'today'
          : options?.period
          ? `last ${options.period} days`
          : `${fromDate?.toLocaleDateString() || 'start'} to ${toDate?.toLocaleDateString() || 'now'}`;
        console.log(`📅 Filtering for ${rangeDesc}: ${sessions.length} sessions`);
      }

      return this.generateReport(sessions);
    } catch (error) {
      console.error('Error reading logs directory:', error);
      return this.generateReport(sessions);
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  private generateReport(sessions: MCPSession[]): AnalyticsReport {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        uniqueMCPs: 0,
        timeRange: { start: new Date(), end: new Date() },
        successRate: 0,
        avgSessionDuration: 0,
        totalResponseSize: 0,
        topMCPsByUsage: [],
        topMCPsByTools: [],
        performanceMetrics: {
          fastestMCPs: [],
          slowestMCPs: [],
          mostReliable: [],
          leastReliable: []
        },
        dailyUsage: {},
        hourlyUsage: {}
      };
    }

    // Basic metrics
    const totalSessions = sessions.length;
    const uniqueMCPs = new Set(sessions.map(s => s.mcpName)).size;
    const successfulSessions = sessions.filter(s => s.success).length;
    const successRate = (successfulSessions / totalSessions) * 100;

    // Time range
    const sortedByTime = sessions.filter(s => s.startTime).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const timeRange = {
      start: sortedByTime[0]?.startTime || new Date(),
      end: sortedByTime[sortedByTime.length - 1]?.startTime || new Date()
    };

    // Duration metrics
    const sessionsWithDuration = sessions.filter(s => s.duration && s.duration > 0);
    const avgSessionDuration = sessionsWithDuration.length > 0
      ? sessionsWithDuration.reduce((sum, s) => sum + (s.duration || 0), 0) / sessionsWithDuration.length
      : 0;

    // Response size
    const totalResponseSize = sessions.reduce((sum, s) => sum + s.responseSize, 0);

    // MCP usage statistics
    const mcpStats = new Map<string, { sessions: number; successes: number; totalTools: number; durations: number[] }>();

    for (const session of sessions) {
      const stats = mcpStats.get(session.mcpName) || { sessions: 0, successes: 0, totalTools: 0, durations: [] };
      stats.sessions++;
      if (session.success) stats.successes++;
      if (session.toolCount) stats.totalTools = Math.max(stats.totalTools, session.toolCount);
      if (session.duration && session.duration > 0) stats.durations.push(session.duration);
      mcpStats.set(session.mcpName, stats);
    }

    // Top MCPs by usage
    const topMCPsByUsage = Array.from(mcpStats.entries())
      .map(([name, stats]) => ({
        name,
        sessions: stats.sessions,
        successRate: (stats.successes / stats.sessions) * 100
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    // Top MCPs by tool count
    const topMCPsByTools = Array.from(mcpStats.entries())
      .filter(([_, stats]) => stats.totalTools > 0)
      .map(([name, stats]) => ({
        name,
        toolCount: stats.totalTools
      }))
      .sort((a, b) => b.toolCount - a.toolCount)
      .slice(0, 10);

    // Performance metrics
    const mcpPerformance = Array.from(mcpStats.entries())
      .map(([name, stats]) => ({
        name,
        avgDuration: stats.durations.length > 0 ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length : 0,
        successRate: (stats.successes / stats.sessions) * 100
      }))
      .filter(m => m.avgDuration > 0);

    const fastestMCPs = mcpPerformance
      .sort((a, b) => a.avgDuration - b.avgDuration)
      .slice(0, 5);

    const slowestMCPs = mcpPerformance
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 5);

    const mostReliable = Array.from(mcpStats.entries())
      .map(([name, stats]) => ({
        name,
        successRate: (stats.successes / stats.sessions) * 100
      }))
      .filter(m => mcpStats.get(m.name)!.sessions >= 3) // At least 3 sessions for reliability
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    const leastReliable = Array.from(mcpStats.entries())
      .map(([name, stats]) => ({
        name,
        successRate: (stats.successes / stats.sessions) * 100
      }))
      .filter(m => mcpStats.get(m.name)!.sessions >= 3)
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 5);

    // Daily usage
    const dailyUsage: Record<string, number> = {};
    for (const session of sessions) {
      const day = session.startTime.toISOString().split('T')[0];
      dailyUsage[day] = (dailyUsage[day] || 0) + 1;
    }

    // Hourly usage
    const hourlyUsage: Record<number, number> = {};
    for (const session of sessions) {
      const hour = session.startTime.getHours();
      hourlyUsage[hour] = (hourlyUsage[hour] || 0) + 1;
    }

    return {
      totalSessions,
      uniqueMCPs,
      timeRange,
      successRate,
      avgSessionDuration,
      totalResponseSize,
      topMCPsByUsage,
      topMCPsByTools,
      performanceMetrics: {
        fastestMCPs,
        slowestMCPs,
        mostReliable,
        leastReliable
      },
      dailyUsage,
      hourlyUsage
    };
  }
}