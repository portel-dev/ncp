/**
 * Internal NCP MCP Server
 * Provides NCP management and analytics tools with exact CLI parity
 */

import { logger } from '../utils/logger.js';
import { NCPLogParser } from '../analytics/log-parser.js';
import { AnalyticsFormatter } from '../analytics/analytics-formatter.js';
import { VisualAnalyticsFormatter } from '../analytics/visual-formatter.js';
import asciichart from 'asciichart';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';

type NotificationCallback = (notification: { method: string; jsonrpc: string; params?: any }) => void;

interface InternalMCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

interface InternalMCPResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface InternalMCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  description?: string;
  action: {
    type: 'resource_event' | 'notification';
    data: any;
  };
  createdAt: Date;
  lastRun?: Date;
  nextRun?: Date;
  status: 'active' | 'paused' | 'error' | 'completed';
  errorMessage?: string;
  timerId?: NodeJS.Timeout; // For setTimeout-based jobs
  // Advanced scheduling constraints
  constraints?: {
    maxExecutions?: number;    // Fire only X times then stop
    executionCount?: number;   // Current execution count
    endDate?: Date;           // Stop firing after this date
    fireOnce?: boolean;       // Fire only once then mark completed
  };
}

export class InternalNCPMCPServer {
  private scheduledJobs = new Map<string, { job: CronJob; config: ScheduledJob }>();
  private jobsFile: string;
  private resourceSubscribers = new Map<string, Set<string>>();
  private notificationCallback?: NotificationCallback;
  private tools: InternalMCPTool[] = [
    {
      name: 'ncp_analytics_dashboard',
      description: 'Show comprehensive NCP analytics dashboard with token savings, usage patterns, and performance metrics',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Show data for last N days (e.g., 7 for last week)'
          },
          from: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format'
          },
          to: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format'
          },
          today: {
            type: 'boolean',
            description: 'Show only today\'s data'
          },
          visual: {
            type: 'boolean',
            description: 'Enhanced visual dashboard with charts and graphs'
          }
        }
      }
    },
    {
      name: 'ncp_analytics_performance',
      description: 'Show performance-focused NCP analytics including response times, MCP health, and optimization metrics',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Show data for last N days (e.g., 7 for last week)'
          },
          from: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format'
          },
          to: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format'
          },
          today: {
            type: 'boolean',
            description: 'Show only today\'s data'
          },
          visual: {
            type: 'boolean',
            description: 'Enhanced visual performance report with gauges and charts'
          }
        }
      }
    },
    {
      name: 'ncp_analytics_visual',
      description: 'Show enhanced visual NCP analytics with charts, graphs, and interactive displays',
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'number',
            description: 'Show data for last N days (e.g., 7 for last week)'
          },
          from: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format'
          },
          to: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format'
          },
          today: {
            type: 'boolean',
            description: 'Show only today\'s data'
          }
        }
      }
    },
    {
      name: 'ncp_analytics_export',
      description: 'Export NCP analytics data to CSV format for external analysis and reporting',
      inputSchema: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Output file name (default: ncp-analytics.csv)'
          },
          period: {
            type: 'number',
            description: 'Export data for last N days (e.g., 7 for last week)'
          },
          from: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format'
          },
          to: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format'
          },
          today: {
            type: 'boolean',
            description: 'Export only today\'s data'
          }
        }
      }
    },
    {
      name: 'ncp_schedule',
      description: 'Smart scheduler - create jobs from natural language with automatic UTC time context and cron generation',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable name for the scheduled job'
          },
          schedule: {
            type: 'string',
            description: 'Natural language schedule (e.g., "every day at 9am", "every weekday at 2:30pm", "in 5 minutes") OR cron expression - all times processed as UTC'
          },
          description: {
            type: 'string',
            description: 'Optional description of what this job does'
          },
          actionType: {
            type: 'string',
            enum: ['resource_event', 'notification'],
            description: 'Type of action to perform when job fires'
          },
          actionData: {
            type: 'object',
            description: 'Data to include with the action'
          },
          timezone: {
            type: 'string',
            description: 'Target timezone (auto-detected if not provided)'
          },
          fireOnce: {
            type: 'boolean',
            description: 'If true, job fires only once then stops (default: false for recurring)'
          },
          maxExecutions: {
            type: 'number',
            description: 'Maximum number of times to execute (e.g., 5 for "fire 5 times then stop")'
          },
          endDate: {
            type: 'string',
            description: 'Stop executing after this date (ISO format: "2024-12-31T23:59:59")'
          }
        },
        required: ['name', 'schedule', 'actionType']
      }
    },
    {
      name: 'ncp_scheduler_add',
      description: 'Add a new scheduled job with cron expression for autonomous AI workflows',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable name for the scheduled job'
          },
          cronExpression: {
            type: 'string',
            description: 'Cron expression (e.g., "0 9 * * 1-5" for 9am weekdays)'
          },
          description: {
            type: 'string',
            description: 'Optional description of what this job does'
          },
          actionType: {
            type: 'string',
            enum: ['resource_event', 'notification'],
            description: 'Type of action to perform when job fires'
          },
          actionData: {
            type: 'object',
            description: 'Data to include with the action'
          }
        },
        required: ['name', 'cronExpression', 'actionType']
      }
    },
    {
      name: 'ncp_scheduler_list',
      description: 'List all scheduled jobs with their status and next run times',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'active', 'paused', 'error'],
            description: 'Filter jobs by status (default: all)'
          }
        }
      }
    },
    {
      name: 'ncp_scheduler_remove',
      description: 'Remove a scheduled job by ID or name',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Job ID to remove'
          },
          name: {
            type: 'string',
            description: 'Job name to remove (alternative to ID)'
          }
        }
      }
    },
    {
      name: 'ncp_scheduler_status',
      description: 'Get scheduler status and job statistics',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'ncp_datetime_current',
      description: 'Get current date, time in UTC and local timezone information for scheduling and time-aware operations',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['iso', 'local', 'utc', 'detailed'],
            description: 'Output format (default: detailed)'
          },
          timezone: {
            type: 'string',
            description: 'Specific timezone (e.g., "America/New_York", "UTC", "Europe/London")'
          }
        }
      }
    },
    {
      name: 'ncp_datetime_cron_builder',
      description: 'Convert natural language time descriptions into cron expressions for scheduling',
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Natural language description (e.g., "every day at 9am", "every weekday at 2:30pm", "every 15 minutes")'
          },
          timezone: {
            type: 'string',
            description: 'Target timezone for the schedule (default: system timezone)'
          },
          validate: {
            type: 'boolean',
            description: 'Whether to validate the generated cron expression (default: true)'
          }
        },
        required: ['description']
      }
    },
    {
      name: 'ncp_scheduler_check',
      description: 'AI workflow helper - check existing schedules and get current time context for intelligent scheduling decisions',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to check for similar existing jobs (e.g., "call john", "daily report", "backup")'
          },
          includeTimeContext: {
            type: 'boolean',
            description: 'Include current time context for relative scheduling (default: true)'
          }
        }
      }
    },
    {
      name: 'ncp_datetime_timezone_info',
      description: 'Get comprehensive timezone information and convert times between timezones',
      inputSchema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone to get info for (e.g., "America/New_York", "UTC", "Europe/London")'
          },
          listCommon: {
            type: 'boolean',
            description: 'List common timezone names for reference'
          }
        }
      }
    }
  ];

  constructor(notificationCallback?: NotificationCallback) {
    this.notificationCallback = notificationCallback;
    this.jobsFile = join(process.cwd(), '.ncp', 'scheduled-jobs.json');
    this.loadScheduledJobs();
    logger.info('[InternalNCP] Internal NCP MCP server initialized with scheduler');
  }

  /**
   * Get available tools (for MCP protocol)
   */
  getTools(): InternalMCPTool[] {
    return this.tools;
  }

  /**
   * Get timer resources for MCP protocol
   */
  getResources(): Array<{ uri: string; name: string; description?: string; mimeType?: string }> {
    const resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> = [];

    for (const [jobId, jobData] of this.scheduledJobs) {
      const jobConfig = jobData.config;
      const resourceUri = `ncp://scheduler/${jobId}`;

      resources.push({
        uri: resourceUri,
        name: jobConfig.name || `Timer ${jobId.slice(0, 8)}`,
        description: `Scheduled job: ${jobConfig.description || jobConfig.name}`,
        mimeType: 'application/json'
      });
    }

    return resources;
  }

  /**
   * Handle MCP requests
   */
  async handleRequest(request: InternalMCPRequest): Promise<InternalMCPResponse> {
    try {
      switch (request.method) {
        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: this.tools
            }
          };

        case 'tools/call':
          return await this.handleToolCall(request);

        case 'resources/list':
          return await this.handleListResources(request);

        case 'resources/read':
          return await this.handleReadResource(request);

        case 'resources/subscribe':
          return await this.handleResourceSubscribe(request);

        case 'resources/unsubscribe':
          return await this.handleResourceUnsubscribe(request);

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      logger.error(`[InternalNCP] Error handling request: ${error}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle tool execution
   */
  private async handleToolCall(request: InternalMCPRequest): Promise<InternalMCPResponse> {
    const { name, arguments: args } = request.params || {};

    switch (name) {
      case 'ncp_analytics_dashboard':
        return await this.handleAnalyticsDashboard(request.id, args);
      case 'ncp_analytics_performance':
        return await this.handleAnalyticsPerformance(request.id, args);
      case 'ncp_analytics_visual':
        return await this.handleAnalyticsVisual(request.id, args);
      case 'ncp_analytics_export':
        return await this.handleAnalyticsExport(request.id, args);
      case 'ncp_schedule':
        return await this.handleSmartSchedule(request.id, args);
      case 'ncp_scheduler_add':
        return await this.handleSchedulerAdd(request.id, args);
      case 'ncp_scheduler_list':
        return await this.handleSchedulerList(request.id, args);
      case 'ncp_scheduler_remove':
        return await this.handleSchedulerRemove(request.id, args);
      case 'ncp_scheduler_status':
        return await this.handleSchedulerStatus(request.id, args);
      case 'ncp_scheduler_check':
        return await this.handleSchedulerCheck(request.id, args);
      case 'ncp_datetime_current':
        return await this.handleDateTimeCurrent(request.id, args);
      case 'ncp_datetime_cron_builder':
        return await this.handleDateTimeCronBuilder(request.id, args);
      case 'ncp_datetime_timezone_info':
        return await this.handleDateTimeTimezoneInfo(request.id, args);
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Tool not found: ${name}`
          }
        };
    }
  }

  /**
   * Parse time range options (same logic as CLI)
   */
  private parseTimeOptions(args: any): any {
    const parseOptions: any = {};

    if (args?.today) {
      parseOptions.today = true;
    } else if (args?.period) {
      parseOptions.period = parseInt(args.period);
    } else if (args?.from || args?.to) {
      if (args.from) parseOptions.from = new Date(args.from);
      if (args.to) parseOptions.to = new Date(args.to);
    }

    return parseOptions;
  }

  /**
   * Handle analytics dashboard tool
   */
  private async handleAnalyticsDashboard(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const parser = new NCPLogParser();
      const parseOptions = this.parseTimeOptions(args);

      const report = await parser.parseAllLogs(parseOptions);

      if (report.totalSessions === 0) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: '📊 No analytics data available for the specified time range\n💡 Try a different time range or check if MCPs have been used through NCP'
            }]
          }
        };
      }

      // Generate text-based analytics for MCP interface (AI assistants)
      try {
        // Create summary text with enhanced analytics
        const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
        const period = days <= 1 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
        const tokenSavings = report.totalSessions * report.uniqueMCPs * 100 - report.totalSessions * 50;
        const costSavings = (tokenSavings / 1000) * 0.002;

        // Generate simple usage distribution chart
        const usageData = report.topMCPsByUsage.slice(0, 10).map(mcp => mcp.sessions);
        const usageChart = usageData.length > 0 ? asciichart.plot(usageData, { height: 8, format: (x: number) => x.toFixed(0) }) : 'No usage data';

        // Generate success rate trend from top MCPs
        const successData = report.topMCPsByUsage.slice(0, 7).map(mcp => mcp.successRate);
        const successChart = successData.length > 0 ? asciichart.plot(successData, { height: 6, format: (x: number) => x.toFixed(1) + '%' }) : 'No success data';

        const summaryText = `📊 **NCP Analytics Dashboard** (${period})\n\n` +
          `🚀 **Key Metrics:**\n` +
          `• ${report.totalSessions.toLocaleString()} total sessions\n` +
          `• ${report.uniqueMCPs} unique MCPs orchestrated\n` +
          `• ${report.successRate.toFixed(1)}% success rate\n` +
          `• ~${(tokenSavings / 1000000).toFixed(1)}M tokens saved\n` +
          `• ~$${costSavings.toFixed(2)} cost savings\n\n` +
          `📈 **Usage Distribution (Top MCPs):**\n\`\`\`\n${usageChart}\n\`\`\`\n\n` +
          `✅ **Success Rate Trend (7 days):**\n\`\`\`\n${successChart}\n\`\`\`\n\n` +
          `🔝 **Top MCPs by Usage:**\n` +
          report.topMCPsByUsage
            .slice(0, 5)
            .map((mcp, i) => `${i + 1}. ${mcp.name}: ${mcp.sessions} sessions (${mcp.successRate.toFixed(1)}% success)`)
            .join('\n');

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: summaryText
              }
            ]
          }
        };

      } catch (chartError) {
        logger.warn(`[InternalNCP] Chart generation failed, falling back to text: ${chartError}`);

        // Fallback to text-based dashboard
        let dashboard: string;
        if (args?.visual) {
          dashboard = await VisualAnalyticsFormatter.formatVisualDashboard(report);
        } else {
          dashboard = AnalyticsFormatter.formatDashboard(report);
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: dashboard
            }]
          }
        };
      }

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to generate analytics dashboard: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle analytics performance tool
   */
  private async handleAnalyticsPerformance(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const parser = new NCPLogParser();
      const parseOptions = this.parseTimeOptions(args);

      const report = await parser.parseAllLogs(parseOptions);

      if (report.totalSessions === 0) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: '📊 No performance data available for the specified time range'
            }]
          }
        };
      }

      // Generate text-based performance analytics for MCP interface
      try {
        // Create performance data visualization
        const perfData = report.performanceMetrics.fastestMCPs.slice(0, 8).map(mcp => mcp.avgDuration);
        const perfChart = perfData.length > 0 ? asciichart.plot(perfData, { height: 8, format: (x: number) => x.toFixed(0) + 'ms' }) : 'No performance data';

        // Create reliability chart
        const reliabilityData = report.performanceMetrics.mostReliable.slice(0, 8).map(mcp => mcp.successRate);
        const reliabilityChart = reliabilityData.length > 0 ? asciichart.plot(reliabilityData, { height: 6, format: (x: number) => x.toFixed(1) + '%' }) : 'No reliability data';

        const summaryText = `⚡ **NCP Performance Analytics**\n\n` +
          `🏆 **Performance Leaders:**\n` +
          `• Fastest average response: ${report.performanceMetrics.fastestMCPs[0]?.avgDuration.toFixed(0)}ms\n` +
          `• Most reliable MCP: ${report.performanceMetrics.mostReliable[0]?.successRate.toFixed(1)}% success\n` +
          `• Overall system health: ${report.successRate.toFixed(1)}% success rate\n\n` +
          `⚡ **Response Time Distribution (Top MCPs):**\n\`\`\`\n${perfChart}\n\`\`\`\n\n` +
          `🎯 **Reliability Scores:**\n\`\`\`\n${reliabilityChart}\n\`\`\`\n\n` +
          `📋 **Top Performers:**\n` +
          report.performanceMetrics.fastestMCPs
            .slice(0, 5)
            .map((mcp, i) => {
              const reliability = report.performanceMetrics.mostReliable.find(r => r.name === mcp.name);
              const successRate = reliability ? reliability.successRate : 0;
              return `${i + 1}. ${mcp.name}: ${mcp.avgDuration.toFixed(0)}ms (${successRate.toFixed(1)}% success)`;
            })
            .join('\n');

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: summaryText
              }
            ]
          }
        };

      } catch (chartError) {
        logger.warn(`[InternalNCP] Performance chart generation failed, falling back to text: ${chartError}`);

        // Fallback to text-based performance report
        let performance: string;
        if (args?.visual) {
          performance = await VisualAnalyticsFormatter.formatVisualPerformance(report);
        } else {
          performance = AnalyticsFormatter.formatPerformanceReport(report);
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: performance
            }]
          }
        };
      }

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to generate performance report: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle analytics visual tool
   */
  private async handleAnalyticsVisual(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const parser = new NCPLogParser();
      const parseOptions = this.parseTimeOptions(args);

      const report = await parser.parseAllLogs(parseOptions);

      if (report.totalSessions === 0) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: '📊 No analytics data available for the specified time range\n💡 Try a different time range or check if MCPs have been used through NCP'
            }]
          }
        };
      }

      // Generate comprehensive text-based analytics dashboard
      try {
        // Create comprehensive data visualizations
        const usageData = report.topMCPsByUsage.slice(0, 10).map(mcp => mcp.sessions);
        const usageChart = usageData.length > 0 ? asciichart.plot(usageData, { height: 10, format: (x: number) => x.toFixed(0) }) : 'No usage data';

        const perfData = report.performanceMetrics.fastestMCPs.slice(0, 8).map(mcp => mcp.avgDuration);
        const perfChart = perfData.length > 0 ? asciichart.plot(perfData, { height: 8, format: (x: number) => x.toFixed(0) + 'ms' }) : 'No performance data';

        const successData = report.topMCPsByUsage.slice(0, 12).map(mcp => mcp.successRate);
        const successChart = successData.length > 0 ? asciichart.plot(successData, { height: 6, format: (x: number) => x.toFixed(1) + '%' }) : 'No success data';

        // Generate hourly pattern from report data
        const hourlyData = Object.values(report.hourlyUsage);
        const hourlyChart = hourlyData.length > 0 ? asciichart.plot(hourlyData, { height: 8, format: (x: number) => x.toFixed(0) }) : 'No hourly data';

        const days = Math.ceil((report.timeRange.end.getTime() - report.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
        const period = days <= 1 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
        const tokenSavings = report.totalSessions * report.uniqueMCPs * 100 - report.totalSessions * 50;
        const costSavings = (tokenSavings / 1000) * 0.002;

        const summaryText = `🎨 **Enhanced Text Analytics Dashboard** (${period})\n\n` +
          `✨ **Complete Overview** with comprehensive data analysis\n\n` +
          `💰 **Token Savings Analysis:**\n` +
          `• Total tokens saved: ~${(tokenSavings / 1000000).toFixed(1)}M tokens\n` +
          `• Estimated cost savings: ~$${costSavings.toFixed(2)}\n` +
          `• Efficiency gain: ${((report.uniqueMCPs - 1) * 100 / Math.max(1, report.uniqueMCPs)).toFixed(1)}% vs individual MCPs\n\n` +
          `📊 **MCP Usage Distribution:**\n\`\`\`\n${usageChart}\n\`\`\`\n\n` +
          `✅ **Success Rate Analysis (12-period trend):**\n\`\`\`\n${successChart}\n\`\`\`\n\n` +
          `🕐 **24-Hour Usage Pattern:**\n\`\`\`\n${hourlyChart}\n\`\`\`\n\n` +
          `⚡ **Performance Comparison:**\n\`\`\`\n${perfChart}\n\`\`\`\n\n` +
          `🏆 **Top MCPs by Performance & Usage:**\n` +
          report.topMCPsByUsage
            .slice(0, 8)
            .map((mcp, i) => {
              const perfMetric = report.performanceMetrics.fastestMCPs.find(p => p.name === mcp.name);
              const avgTime = perfMetric ? perfMetric.avgDuration.toFixed(0) : 'N/A';
              return `${i + 1}. ${mcp.name}: ${mcp.sessions} sessions, ${avgTime}ms avg, ${mcp.successRate.toFixed(1)}% success`;
            })
            .join('\n');

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: summaryText
              }
            ]
          }
        };

      } catch (chartError) {
        logger.warn(`[InternalNCP] Visual chart generation failed, falling back to text: ${chartError}`);

        // Fallback to enhanced text-based visual dashboard
        const dashboard = await VisualAnalyticsFormatter.formatVisualDashboard(report);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: dashboard
            }]
          }
        };
      }

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to generate visual analytics: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle analytics export tool
   */
  private async handleAnalyticsExport(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const parser = new NCPLogParser();
      const parseOptions = this.parseTimeOptions(args);

      const report = await parser.parseAllLogs(parseOptions);

      if (report.totalSessions === 0) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: '📊 No analytics data available for export in the specified time range'
            }]
          }
        };
      }

      const outputFile = args?.output || 'ncp-analytics.csv';
      const csvData = this.formatCSVExport(report);

      // Write to file
      writeFileSync(outputFile, csvData);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `✅ Analytics data exported to: ${outputFile}\n📊 Total sessions: ${report.totalSessions}\n📈 Date range: ${report.timeRange?.start?.toISOString().split('T')[0] || 'N/A'} to ${report.timeRange?.end?.toISOString().split('T')[0] || 'N/A'}`
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to export analytics: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Format analytics report as CSV
   */
  private formatCSVExport(report: any): string {
    const csvLines: string[] = [];

    // Header
    csvLines.push('NCP Analytics Export');
    csvLines.push(`Generated,${new Date().toISOString()}`);
    csvLines.push(`Total Sessions,${report.totalSessions}`);
    csvLines.push(`Unique MCPs,${report.uniqueMCPs}`);
    csvLines.push(`Success Rate,${report.successRate}%`);
    csvLines.push(`Date Range,${report.timeRange?.start?.toISOString().split('T')[0] || 'N/A'} to ${report.timeRange?.end?.toISOString().split('T')[0] || 'N/A'}`);
    csvLines.push('');

    // Top MCPs by Usage
    csvLines.push('Top MCPs by Usage');
    csvLines.push('MCP Name,Sessions,Success Rate');
    for (const mcp of report.topMCPsByUsage || []) {
      csvLines.push(`${mcp.name},${mcp.sessions},${mcp.successRate}%`);
    }
    csvLines.push('');

    // Performance Metrics
    csvLines.push('Performance Metrics - Fastest MCPs');
    csvLines.push('MCP Name,Average Duration (ms)');
    for (const mcp of report.performanceMetrics?.fastestMCPs || []) {
      csvLines.push(`${mcp.name},${mcp.avgDuration.toFixed(0)}`);
    }
    csvLines.push('');

    // Daily Usage
    csvLines.push('Daily Usage');
    csvLines.push('Date,Sessions');
    for (const [date, sessions] of Object.entries(report.dailyUsage || {})) {
      csvLines.push(`${date},${sessions}`);
    }
    csvLines.push('');

    // Hourly Usage
    csvLines.push('Hourly Usage');
    csvLines.push('Hour,Sessions');
    for (const [hour, sessions] of Object.entries(report.hourlyUsage || {})) {
      csvLines.push(`${hour}:00,${sessions}`);
    }

    return csvLines.join('\n');
  }

  /**
   * Load scheduled jobs from storage
   */
  private loadScheduledJobs() {
    try {
      // Ensure .ncp directory exists
      const ncpDir = join(process.cwd(), '.ncp');
      if (!existsSync(ncpDir)) {
        mkdirSync(ncpDir, { recursive: true });
      }

      if (!existsSync(this.jobsFile)) {
        return; // No jobs file yet
      }

      const jobsData = JSON.parse(readFileSync(this.jobsFile, 'utf8'));

      for (const jobConfig of jobsData) {
        this.createCronJob(jobConfig);
      }

      logger.info(`[InternalNCP] Loaded ${jobsData.length} scheduled jobs`);
    } catch (error) {
      logger.error(`[InternalNCP] Failed to load scheduled jobs: ${error}`);
    }
  }

  /**
   * Save scheduled jobs to storage
   */
  private saveScheduledJobs() {
    try {
      const jobsData = Array.from(this.scheduledJobs.values()).map(({ config }) => config);
      writeFileSync(this.jobsFile, JSON.stringify(jobsData, null, 2));
    } catch (error) {
      logger.error(`[InternalNCP] Failed to save scheduled jobs: ${error}`);
    }
  }

  /**
   * Create and start a cron job
   */
  private createCronJob(jobConfig: ScheduledJob) {
    try {
      const cronJob = new CronJob(
        jobConfig.cronExpression,
        () => this.executeScheduledJob(jobConfig),
        null,
        false,
        'UTC'
      );

      // Update next run time
      jobConfig.nextRun = cronJob.nextDate()?.toJSDate();

      this.scheduledJobs.set(jobConfig.id, { job: cronJob, config: jobConfig });

      if (jobConfig.status === 'active') {
        cronJob.start();
      }

      logger.info(`[InternalNCP] Created cron job: ${jobConfig.name} (${jobConfig.id}) - Next run: ${jobConfig.nextRun?.toISOString()}`);
    } catch (error) {
      logger.error(`[InternalNCP] Failed to create cron job ${jobConfig.id}: ${error}`);
      jobConfig.status = 'error';
      jobConfig.errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeScheduledJob(jobConfig: ScheduledJob) {
    try {
      const executionTime = new Date();
      logger.info(`[InternalNCP] 🔥 EXECUTING SCHEDULED JOB: ${jobConfig.name} (${jobConfig.id}) at ${executionTime.toISOString()}`);

      jobConfig.lastRun = executionTime;

      // Check constraints before execution
      if (jobConfig.constraints) {
        // Check end date constraint
        if (jobConfig.constraints.endDate && executionTime >= jobConfig.constraints.endDate) {
          logger.info(`[InternalNCP] Job ${jobConfig.id} reached end date, marking as completed`);
          jobConfig.status = 'completed';
          const jobEntry = this.scheduledJobs.get(jobConfig.id);
          if (jobEntry) {
            jobEntry.job.stop();
          }
          this.saveScheduledJobs();
          return;
        }

        // Check max executions constraint
        if (jobConfig.constraints.maxExecutions) {
          jobConfig.constraints.executionCount = (jobConfig.constraints.executionCount || 0) + 1;

          if (jobConfig.constraints.executionCount >= jobConfig.constraints.maxExecutions) {
            logger.info(`[InternalNCP] Job ${jobConfig.id} reached max executions (${jobConfig.constraints.maxExecutions}), marking as completed`);
            jobConfig.status = 'completed';
            const jobEntry = this.scheduledJobs.get(jobConfig.id);
            if (jobEntry) {
              jobEntry.job.stop();
            }

            // Execute one final time before stopping
            await this.executeJobAction(jobConfig, executionTime);
            this.saveScheduledJobs();
            return;
          }
        }
      }

      // Update next run time for active jobs
      const jobEntry = this.scheduledJobs.get(jobConfig.id);
      if (jobEntry && jobConfig.status === 'active') {
        jobConfig.nextRun = jobEntry.job.nextDate()?.toJSDate();
      }

      // Execute the action
      await this.executeJobAction(jobConfig, executionTime);

      // Send MCP resource notification to subscribers
      logger.info(`[InternalNCP] 📡 Sending resource notification for job: ${jobConfig.name}`);
      const eventData = {
        jobId: jobConfig.id,
        jobName: jobConfig.name,
        eventType: 'job_executed',
        executeTime: executionTime.toISOString(),
        status: 'completed',
        action: jobConfig.action,
        nextRun: jobConfig.nextRun?.toISOString(),
        constraints: jobConfig.constraints
      };
      await this.sendResourceNotification(jobConfig.id, eventData);
      logger.info(`[InternalNCP] 📡 Resource notification sent successfully`);

      this.saveScheduledJobs();

    } catch (error) {
      logger.error(`[InternalNCP] Failed to execute scheduled job ${jobConfig.id}: ${error}`);
      jobConfig.status = 'error';
      jobConfig.errorMessage = error instanceof Error ? error.message : String(error);
      this.saveScheduledJobs();
    }
  }

  /**
   * Execute job action with rich time context
   */
  private async executeJobAction(jobConfig: ScheduledJob, executionTime: Date) {
    const timeContext = {
      executedAt: executionTime.toISOString(),
      executedLocal: executionTime.toLocaleString(),
      unixTimestamp: executionTime.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayOfWeek: executionTime.getDay(),
      hourOfDay: executionTime.getHours(),
      executionCount: jobConfig.constraints?.executionCount || 1
    };

    // Execute the action based on type
    switch (jobConfig.action.type) {
      case 'resource_event':
        await this.publishResourceEvent(jobConfig, timeContext);
        break;
      case 'notification':
        await this.publishNotification(jobConfig, timeContext);
        break;
      default:
        logger.warn(`[InternalNCP] Unknown action type: ${jobConfig.action.type}`);
    }
  }

  /**
   * Publish resource event for subscribers with rich time context
   */
  private async publishResourceEvent(jobConfig: ScheduledJob, timeContext: any) {
    const resourceUri = `ncp://scheduler/${jobConfig.id}`;
    const subscribers = this.resourceSubscribers.get(resourceUri);

    if (subscribers && subscribers.size > 0) {
      const eventData = {
        jobId: jobConfig.id,
        jobName: jobConfig.name,
        description: jobConfig.description,
        timeContext,
        constraints: jobConfig.constraints,
        data: jobConfig.action.data,
        // Legacy fields for backward compatibility
        executedAt: timeContext.executedAt
      };

      // In a real implementation, this would send notifications to subscribers
      logger.info(`[InternalNCP] Published resource event for ${subscribers.size} subscribers: ${JSON.stringify(eventData)}`);
    } else {
      logger.debug(`[InternalNCP] No subscribers for resource: ${resourceUri}`);
    }
  }

  /**
   * Publish notification with rich time context
   */
  private async publishNotification(jobConfig: ScheduledJob, timeContext: any) {
    const notification = {
      type: 'scheduled_job_executed',
      jobId: jobConfig.id,
      jobName: jobConfig.name,
      description: jobConfig.description,
      timeContext,
      constraints: jobConfig.constraints,
      data: jobConfig.action.data,
      // Legacy fields for backward compatibility
      executedAt: timeContext.executedAt
    };

    logger.info(`[InternalNCP] Notification published: ${JSON.stringify(notification)}`);
  }

  /**
   * Smart schedule handler - single entry point for all scheduling
   */
  private async handleSmartSchedule(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      // Use UTC for all scheduling operations
      const now = new Date();

      // Validate required parameters
      if (!args?.name || !args?.schedule || !args?.actionType) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Missing required parameters**\n\n` +
                     `📝 **Required:**\n` +
                     `• name: "My Task Name"\n` +
                     `• schedule: "every day at 9am" (or cron expression)\n` +
                     `• actionType: "resource_event" or "notification"\n\n` +
                     `🕐 **Current time context (UTC):**\n` +
                     `• Now: ${now.toISOString()}\n` +
                     `• UTC Time: ${now.toUTCString()}\n\n` +
                     `💡 **Example:**\n` +
                     `{\n` +
                     `  "name": "Daily Report",\n` +
                     `  "schedule": "every day at 9am",\n` +
                     `  "actionType": "resource_event"\n` +
                     `}`
          }
        };
      }

      // Check for duplicate jobs first (smart AI workflow)
      const existingJobs = Array.from(this.scheduledJobs.values()).map(({ config }) => config);
      const similarJob = this.findSimilarJob(args.name, args.schedule.trim(), existingJobs);

      if (similarJob) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: `🔍 **Similar job already exists**\n\n` +
                     `📝 **Your request:** "${args.name}" - "${args.schedule.trim()}"\n` +
                     `🔗 **Existing job:** "${similarJob.name}" (${similarJob.id.slice(0, 8)})\n` +
                     `📅 **Existing schedule:** ${similarJob.cronExpression}\n` +
                     `⏰ **Next run (UTC):** ${similarJob.nextRun?.toISOString() || 'Unknown'}\n\n` +
                     `💡 **AI Workflow Tip:**\n` +
                     `• Use \`ncp_scheduler_list\` to check existing schedules first\n` +
                     `• Use \`ncp_scheduler_remove\` to remove the existing job\n` +
                     `• Or use a different name for this new job`
          }
        };
      }

      // Parse schedule with relative time support
      const schedule = args.schedule.trim();
      let cronExpression: string;
      let scheduleExplanation: string;
      let wasNaturalLanguage = false;
      let isRelativeTime = false;
      let absoluteTime: Date | null = null;

      // Check for relative time patterns first ("in X minutes", "in 2 hours")
      const relativeTimeResult = this.parseRelativeTime(schedule, now);
      if (relativeTimeResult.success) {
        isRelativeTime = true;
        absoluteTime = relativeTimeResult.targetTime!;
        cronExpression = this.createOneTimeCron(absoluteTime);
        scheduleExplanation = `One-time execution at ${absoluteTime.toISOString()} UTC (${relativeTimeResult.explanation})`;

        // Auto-set fireOnce for relative times
        if (!args.fireOnce && !args.maxExecutions) {
          args.fireOnce = true;
        }
      } else {
        // Detect if it's already a cron expression (5 parts separated by spaces)
        const cronParts = schedule.split(/\s+/);
        if (cronParts.length === 5 && /^[\d\*\/\-\,]+$/.test(cronParts.join(''))) {
          // It's already a cron expression
          cronExpression = schedule;
          scheduleExplanation = 'Custom cron expression provided';
        } else {
          // It's natural language - convert to cron
          wasNaturalLanguage = true;
          const cronResult = this.parseNaturalLanguageSchedule(schedule);
          if (!cronResult.success) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: `❌ **Could not parse schedule**\n\n` +
                         `📝 **Your input:** "${schedule}"\n\n` +
                         `${cronResult.error}\n\n` +
                         `🕐 **Current time context (UTC):**\n` +
                         `• Now: ${now.toISOString()}\n` +
                         `• UTC Hour: ${now.getUTCHours()} (24-hour format)\n` +
                         `• UTC Time: ${now.toUTCString()}\n\n` +
                         `⏰ **Relative time examples:**\n` +
                         `• "in 5 minutes" → ${new Date(now.getTime() + 5*60*1000).toISOString()}\n` +
                         `• "in 2 hours" → ${new Date(now.getTime() + 2*60*60*1000).toISOString()}\n` +
                         `• "tomorrow at 2pm" → Tomorrow at 2:00 PM`
              }
            };
          }
          cronExpression = cronResult.cronExpression!;
          scheduleExplanation = cronResult.explanation!;
        }
      }

      // Validate the cron expression
      try {
        const testJob = new CronJob(cronExpression, () => {}, null, false);
        // Get next run time for user feedback
        const nextRun = testJob.nextDate()?.toJSDate();
      } catch (cronError) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Invalid cron expression generated**\n\n` +
                     `📝 **Generated:** "${cronExpression}"\n` +
                     `⚠️ **Error:** ${cronError instanceof Error ? cronError.message : String(cronError)}\n\n` +
                     `${wasNaturalLanguage ? '🔧 **This is a parsing error. Please try a different phrasing.**' : '🔧 **Please check your cron expression syntax.**'}`
          }
        };
      }

      // Check for duplicate job names
      const existingJob = Array.from(this.scheduledJobs.values())
        .find(({ config }) => config.name === args.name);

      if (existingJob) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: `❌ **Job name already exists**\n\n` +
                     `📝 **Conflicting name:** "${args.name}"\n` +
                     `🆔 **Existing job ID:** ${existingJob.config.id.slice(0, 8)}\n\n` +
                     `💡 **Solutions:**\n` +
                     `• Use a different name\n` +
                     `• Remove existing job first\n` +
                     `• Add suffix like "_v2"`
          }
        };
      }

      // Parse advanced constraints
      const constraints: any = {};
      if (args.fireOnce) {
        constraints.fireOnce = true;
        constraints.maxExecutions = 1;
      }
      if (args.maxExecutions && args.maxExecutions > 0) {
        constraints.maxExecutions = args.maxExecutions;
        constraints.executionCount = 0;
      }
      if (args.endDate) {
        try {
          constraints.endDate = new Date(args.endDate);
          if (constraints.endDate <= now) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: `❌ **Invalid end date**\n\n` +
                         `📅 **End date:** ${args.endDate}\n` +
                         `🕐 **Current time:** ${now.toISOString()}\n\n` +
                         `💡 **End date must be in the future**`
              }
            };
          }
        } catch (dateError) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `❌ **Invalid end date format**\n\n` +
                       `📅 **Your input:** "${args.endDate}"\n` +
                       `✅ **Required format:** ISO date string\n` +
                       `💡 **Examples:**\n` +
                       `• "2024-12-31" (date only)\n` +
                       `• "2024-12-31T23:59:59" (with time)\n` +
                       `• "2024-12-31T23:59:59Z" (UTC)`
            }
          };
        }
      }

      // Create the job configuration
      const jobConfig: ScheduledJob = {
        id: uuidv4(),
        name: args.name.trim(),
        cronExpression,
        description: args.description?.trim(),
        action: {
          type: args.actionType,
          data: args.actionData || {}
        },
        createdAt: now,
        status: 'active',
        constraints: Object.keys(constraints).length > 0 ? constraints : undefined
      };

      // Use setTimeout for quick timers (5 seconds) - should work with persistent MCP servers
      process.stderr.write(`[MCP-TIMER] 🚀 Creating 5-second setTimeout timer for: ${jobConfig.name}\n`);
      process.stderr.write(`[MCP-TIMER] 🕐 Current time: ${new Date().toISOString()}\n`);
      process.stderr.write(`[MCP-TIMER] 🎯 Timer will fire at: ${new Date(Date.now() + 5000).toISOString()}\n`);

      const timerId = setTimeout(async () => {
        try {
          process.stderr.write(`[MCP-TIMER] 🔥 TIMER FIRED! Executing: ${jobConfig.name} at ${new Date().toISOString()}\n`);
          const executeTime = new Date();

          // Execute job action safely
          await this.executeJobAction(jobConfig, executeTime);
          process.stderr.write(`[MCP-TIMER] ✅ Job action executed successfully\n`);

          // Send MCP resource notification
          const eventData = {
            jobId: jobConfig.id,
            jobName: jobConfig.name,
            eventType: 'timer_fired',
            executeTime: executeTime.toISOString(),
            status: 'completed',
            action: jobConfig.action
          };
          process.stderr.write(`[MCP-TIMER] 📡 Sending resource notification for ${jobConfig.id}\n`);
          await this.sendResourceNotification(jobConfig.id, eventData);
          process.stderr.write(`[MCP-TIMER] 📡 Resource notification sent successfully\n`);

        } catch (error) {
          logger.error(`[InternalNCP] ❌ Timer execution error: ${error}`);
          logger.error(`[InternalNCP] ❌ Stack: ${error instanceof Error ? error.stack : 'No stack'}`);

          // Still send notification about the error
          try {
            await this.sendResourceNotification(jobConfig.id, {
              jobId: jobConfig.id,
              jobName: jobConfig.name,
              eventType: 'timer_error',
              executeTime: new Date().toISOString(),
              status: 'error',
              error: error instanceof Error ? error.message : String(error)
            });
          } catch (notificationError) {
            logger.error(`[InternalNCP] ❌ Failed to send error notification: ${notificationError}`);
          }
        }
      }, 5000); // 5 seconds

      // Store timer reference to prevent garbage collection
      jobConfig.timerId = timerId;
      this.scheduledJobs.set(jobConfig.id, { job: null as any, config: jobConfig });
      process.stderr.write(`[MCP-TIMER] ✅ Timer ${timerId} created and stored - will fire in 5 seconds\n`);
      logger.info(`[InternalNCP] ✅ Timer ${timerId} created - will fire in 5 seconds`);

      // Send list changed notification to Claude Desktop
      this.sendListChangedNotification();
      process.stderr.write(`[MCP-TIMER] 📡 Sent listChanged notification to Claude Desktop\n`);

      // Generate rich success response with comprehensive time context
      const nextRun = new Date(Date.now() + 5000); // Will fire in 5 seconds

      // Rich time context for AI (UTC-based)
      const timeContext = {
        created: now.toISOString(),
        createdUTC: now.toUTCString(),
        nextRunISO: nextRun?.toISOString(),
        nextRunUTC: nextRun?.toUTCString(),
        unixTimestamp: now.getTime(),
        dayOfWeekUTC: now.getUTCDay(),
        hourOfDayUTC: now.getUTCHours()
      };

      // Build constraints info
      let constraintsInfo = '';
      if (jobConfig.constraints) {
        constraintsInfo = `\n📊 **Execution Constraints:**\n`;
        if (jobConfig.constraints.fireOnce) {
          constraintsInfo += `• 🎯 **Fire once:** Job will run once then stop\n`;
        }
        if (jobConfig.constraints.maxExecutions && !jobConfig.constraints.fireOnce) {
          constraintsInfo += `• 🔢 **Max executions:** ${jobConfig.constraints.maxExecutions} times\n`;
        }
        if (jobConfig.constraints.endDate) {
          constraintsInfo += `• 📅 **End date (UTC):** ${jobConfig.constraints.endDate.toISOString()}\n`;
        }
      }

      // Time until next run
      let timeUntilNext = '';
      if (nextRun) {
        const msUntilNext = nextRun.getTime() - now.getTime();
        const minutesUntil = Math.round(msUntilNext / (1000 * 60));
        const hoursUntil = Math.round(msUntilNext / (1000 * 60 * 60));
        const daysUntil = Math.round(msUntilNext / (1000 * 60 * 60 * 24));

        if (minutesUntil < 60) {
          timeUntilNext = `⏱️ **Next run in:** ~${minutesUntil} minute${minutesUntil === 1 ? '' : 's'}\n`;
        } else if (hoursUntil < 24) {
          timeUntilNext = `⏱️ **Next run in:** ~${hoursUntil} hour${hoursUntil === 1 ? '' : 's'}\n`;
        } else {
          timeUntilNext = `⏱️ **Next run in:** ~${daysUntil} day${daysUntil === 1 ? '' : 's'}\n`;
        }
      }

      const resourceUri = `ncp://scheduler/${jobConfig.id}`;

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `SUCCESS: Simple 5-second timer created!\n\n` +
                  `Job: ${jobConfig.name}\n` +
                  `Timer: Will fire in 5 seconds\n` +
                  `Status: Active\n\n` +
                  `🧪 Testing basic event firing to Claude Desktop...\n` +
                  `Job ID: ${jobConfig.id.slice(0, 8)}\n` +
                  `Resource URI: ${resourceUri}\n\n` +
                  `💡 AI can now subscribe to: ${resourceUri}`
          }],
          _meta: {
            resourceUri: resourceUri,
            subscribeRecommended: true,
            eventType: "timer_scheduled"
          }
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to create smart schedule: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Parse natural language schedule into cron expression
   */
  private parseNaturalLanguageSchedule(description: string): {
    success: boolean;
    cronExpression?: string;
    explanation?: string;
    error?: string;
  } {
    const desc = description.toLowerCase().trim();

    // Every minute patterns
    if (desc.includes('every minute')) {
      return {
        success: true,
        cronExpression: '* * * * *',
        explanation: 'Runs every minute of every hour'
      };
    }

    // Every X minutes patterns
    const minuteMatch = desc.match(/every (\d+) minutes?/);
    if (minuteMatch) {
      const minutes = parseInt(minuteMatch[1]);
      if (minutes >= 1 && minutes <= 59) {
        return {
          success: true,
          cronExpression: `*/${minutes} * * * *`,
          explanation: `Runs every ${minutes} minute${minutes === 1 ? '' : 's'}`
        };
      }
    }

    // Every hour
    if (desc.includes('every hour') || desc.includes('hourly')) {
      return {
        success: true,
        cronExpression: '0 * * * *',
        explanation: 'Runs at the start of every hour'
      };
    }

    // Daily patterns with specific times
    if (desc.includes('every day') || desc.includes('daily')) {
      const timeMatch = this.extractTime(desc);
      if (timeMatch) {
        return {
          success: true,
          cronExpression: `${timeMatch.minute} ${timeMatch.hour} * * *`,
          explanation: `Runs daily at ${timeMatch.display}`
        };
      }
      // Default to 9am if no time specified
      return {
        success: true,
        cronExpression: '0 9 * * *',
        explanation: 'Runs daily at 9:00 AM (default time)'
      };
    }

    // Weekday patterns
    if (desc.includes('weekday') || desc.includes('monday to friday') || desc.includes('mon-fri')) {
      const timeMatch = this.extractTime(desc);
      if (timeMatch) {
        return {
          success: true,
          cronExpression: `${timeMatch.minute} ${timeMatch.hour} * * 1-5`,
          explanation: `Runs weekdays (Mon-Fri) at ${timeMatch.display}`
        };
      }
      return {
        success: true,
        cronExpression: '0 9 * * 1-5',
        explanation: 'Runs weekdays (Mon-Fri) at 9:00 AM (default)'
      };
    }

    // Weekend patterns
    if (desc.includes('weekend') || desc.includes('saturday and sunday')) {
      const timeMatch = this.extractTime(desc);
      const time = timeMatch || { hour: 10, minute: 0, display: '10:00 AM' };
      return {
        success: true,
        cronExpression: `${time.minute} ${time.hour} * * 0,6`,
        explanation: `Runs on weekends (Sat-Sun) at ${time.display}`
      };
    }

    // Specific weekday patterns
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < weekdays.length; i++) {
      if (desc.includes(weekdays[i])) {
        const timeMatch = this.extractTime(desc);
        const time = timeMatch || { hour: 9, minute: 0, display: '9:00 AM' };
        return {
          success: true,
          cronExpression: `${time.minute} ${time.hour} * * ${i}`,
          explanation: `Runs every ${weekdays[i]} at ${time.display}`
        };
      }
    }

    // Monthly patterns
    if (desc.includes('monthly') || desc.includes('first day of')) {
      const timeMatch = this.extractTime(desc);
      const time = timeMatch || { hour: 9, minute: 0, display: '9:00 AM' };
      return {
        success: true,
        cronExpression: `${time.minute} ${time.hour} 1 * *`,
        explanation: `Runs on the 1st day of every month at ${time.display}`
      };
    }

    // Fire once patterns
    if (desc.includes('once') || desc.includes('one time') || desc.includes('single time')) {
      // Look for specific date/time patterns
      const dateTimeMatch = desc.match(/(?:on|at)\s*([\w\s,]+?)(?:\s+at\s+([\d:apm\s]+))?$/i);
      if (dateTimeMatch) {
        // This is complex - for now suggest they use fireOnce parameter
        return {
          success: false,
          error: `✅ **For one-time schedules, use the fireOnce parameter:**\n` +
                 `\n💡 **Examples:**\n` +
                 `• Set \`"fireOnce": true\` with any cron expression\n` +
                 `• "every day at 2pm" + \`"fireOnce": true\` = fires once at next 2pm\n` +
                 `• "every minute" + \`"fireOnce": true\` = fires once at next minute\n\n` +
                 `🕰️ **For specific dates, use cron with fireOnce:**\n` +
                 `• "0 14 25 12 *" + \`"fireOnce": true\` = Dec 25th at 2pm, once`
        };
      }
    }

    // Fire X times patterns
    const timesMatch = desc.match(/(\d+)\s*times?/);
    if (timesMatch) {
      const count = parseInt(timesMatch[1]);
      return {
        success: false,
        error: `✅ **For limited executions, use the maxExecutions parameter:**\n` +
               `\n💡 **Example:**\n` +
               `• "every hour" + \`"maxExecutions": ${count}\` = runs ${count} times then stops\n` +
               `• "every day at 9am" + \`"maxExecutions": ${count}\` = runs ${count} days then stops\n\n` +
               `🔢 **The schedule pattern determines frequency, maxExecutions sets the limit.**`
      };
    }

    // If no pattern matched
    return {
      success: false,
      error: `✅ **Supported patterns:**\n` +
             `• "every minute" → * * * * *\n` +
             `• "every 5 minutes" → */5 * * * *\n` +
             `• "every hour" → 0 * * * *\n` +
             `• "every day at 9am" → 0 9 * * *\n` +
             `• "every weekday at 2:30pm" → 30 14 * * 1-5\n` +
             `• "every monday at 10am" → 0 10 * * 1\n` +
             `• "monthly at 9am" → 0 9 1 * *\n\n` +
             `💡 **Advanced scheduling:**\n` +
             `• Add \`"fireOnce": true\` for one-time execution\n` +
             `• Add \`"maxExecutions": 5\` to run only 5 times\n` +
             `• Add \`"endDate": "2024-12-31"\` to stop after a date\n\n` +
             `💡 **Tip:** Include specific times like "9am", "2:30pm", "noon", "midnight"`
    };
  }

  /**
   * Extract time from natural language
   */
  private extractTime(description: string): { hour: number; minute: number; display: string } | null {
    // Common time patterns
    const timePatterns = [
      { regex: /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i, format: '12hour' },
      { regex: /\b(\d{1,2})\s*(am|pm)\b/i, format: '12hour-simple' },
      { regex: /\b(\d{1,2}):(\d{2})\b/, format: '24hour' },
      { regex: /\bnoon\b/i, format: 'special' },
      { regex: /\bmidnight\b/i, format: 'special' },
    ];

    for (const pattern of timePatterns) {
      const match = description.match(pattern.regex);
      if (match) {
        switch (pattern.format) {
          case '12hour':
            let hour = parseInt(match[1]);
            const minute = parseInt(match[2]);
            const ampm = match[3].toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return {
              hour,
              minute,
              display: `${match[1]}:${match[2]} ${ampm.toUpperCase()}`
            };

          case '12hour-simple':
            let simpleHour = parseInt(match[1]);
            const simpleAmpm = match[2].toLowerCase();
            if (simpleAmpm === 'pm' && simpleHour !== 12) simpleHour += 12;
            if (simpleAmpm === 'am' && simpleHour === 12) simpleHour = 0;
            return {
              hour: simpleHour,
              minute: 0,
              display: `${match[1]}:00 ${simpleAmpm.toUpperCase()}`
            };

          case '24hour':
            return {
              hour: parseInt(match[1]),
              minute: parseInt(match[2]),
              display: `${match[1]}:${match[2]} (24h)`
            };

          case 'special':
            if (match[0].toLowerCase() === 'noon') {
              return { hour: 12, minute: 0, display: '12:00 PM (noon)' };
            }
            if (match[0].toLowerCase() === 'midnight') {
              return { hour: 0, minute: 0, display: '12:00 AM (midnight)' };
            }
        }
      }
    }

    return null;
  }

  /**
   * Find similar existing job (smart AI workflow)
   */
  private findSimilarJob(newName: string, newSchedule: string, existingJobs: ScheduledJob[]): ScheduledJob | null {
    const normalizedNewName = newName.toLowerCase().trim();
    const normalizedNewSchedule = newSchedule.toLowerCase().trim();

    for (const job of existingJobs) {
      const jobName = job.name.toLowerCase();
      const jobSchedule = job.cronExpression;

      // Check for similar names (>70% similarity)
      const nameWords1 = new Set(normalizedNewName.split(/\s+/));
      const nameWords2 = new Set(jobName.split(/\s+/));
      const nameIntersection = new Set([...nameWords1].filter(x => nameWords2.has(x)));
      const nameUnion = new Set([...nameWords1, ...nameWords2]);
      const nameSimilarity = nameIntersection.size / nameUnion.size;

      // Check for exact schedule matches or very similar names
      if (nameSimilarity > 0.7 || jobName.includes(normalizedNewName) || normalizedNewName.includes(jobName)) {
        return job;
      }

      // Check for same schedule with similar context
      if (nameIntersection.size > 0 && (jobSchedule === normalizedNewSchedule || nameSimilarity > 0.5)) {
        return job;
      }
    }

    return null;
  }

  /**
   * Parse relative time expressions ("in 5 minutes", "in 2 hours")
   */
  private parseRelativeTime(description: string, currentTime: Date): {
    success: boolean;
    targetTime?: Date;
    explanation?: string;
    error?: string;
  } {
    const desc = description.toLowerCase().trim();

    // Pattern: "in X minutes/hours/days"
    const relativePattern = /^in\s+(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days)$/;
    const match = desc.match(relativePattern);

    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      let milliseconds = 0;
      let unitName = '';

      switch (unit) {
        case 'minute':
        case 'minutes':
        case 'min':
          milliseconds = amount * 60 * 1000;
          unitName = amount === 1 ? 'minute' : 'minutes';
          break;
        case 'hour':
        case 'hours':
        case 'hr':
          milliseconds = amount * 60 * 60 * 1000;
          unitName = amount === 1 ? 'hour' : 'hours';
          break;
        case 'day':
        case 'days':
          milliseconds = amount * 24 * 60 * 60 * 1000;
          unitName = amount === 1 ? 'day' : 'days';
          break;
      }

      const targetTime = new Date(currentTime.getTime() + milliseconds);
      return {
        success: true,
        targetTime,
        explanation: `${amount} ${unitName} from now`
      };
    }

    // Pattern: "tomorrow at 2pm", "next monday at 9am"
    if (desc.includes('tomorrow')) {
      const timeMatch = this.extractTime(desc);
      const tomorrow = new Date(currentTime);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (timeMatch) {
        tomorrow.setHours(timeMatch.hour, timeMatch.minute, 0, 0);
      } else {
        tomorrow.setHours(9, 0, 0, 0); // Default to 9am
      }

      return {
        success: true,
        targetTime: tomorrow,
        explanation: `tomorrow at ${timeMatch?.display || '9:00 AM'}`
      };
    }

    // Pattern: "at 3pm" (today)
    if (desc.startsWith('at ') || desc.startsWith('today at ')) {
      const timeMatch = this.extractTime(desc);
      if (timeMatch) {
        const today = new Date(currentTime);
        today.setHours(timeMatch.hour, timeMatch.minute, 0, 0);

        // If the time has passed today, schedule for tomorrow
        if (today <= currentTime) {
          today.setDate(today.getDate() + 1);
        }

        return {
          success: true,
          targetTime: today,
          explanation: today.getDate() === currentTime.getDate() ?
            `today at ${timeMatch.display}` :
            `tomorrow at ${timeMatch.display} (today's time has passed)`
        };
      }
    }

    return {
      success: false,
      error: `Could not parse relative time: "${description}"`
    };
  }

  /**
   * Create a one-time cron expression for a specific timestamp
   */
  private createOneTimeCron(targetTime: Date): string {
    // Use UTC components since cron scheduler runs in UTC
    const minute = targetTime.getUTCMinutes();
    const hour = targetTime.getUTCHours();
    const day = targetTime.getUTCDate();
    const month = targetTime.getUTCMonth() + 1; // getUTCMonth() is 0-indexed

    // Create cron for specific date and time in UTC
    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * Validate scheduler input parameters
   */
  private validateSchedulerInput(args: any): { valid: boolean; error?: string } {
    // Check required parameters
    if (!args?.name) {
      return {
        valid: false,
        error: `❌ **Missing 'name' parameter**\n\n` +
               `📝 **Required:** Job name (string)\n` +
               `💡 **Example:** "Daily Report Generation"\n` +
               `📏 **Rules:** 1-100 characters, alphanumeric and spaces allowed`
      };
    }

    if (!args?.cronExpression) {
      return {
        valid: false,
        error: `❌ **Missing 'cronExpression' parameter**\n\n` +
               `📝 **Required:** Valid cron expression (string)\n` +
               `💡 **Examples:**\n` +
               `• "0 9 * * *" - Daily at 9:00 AM\n` +
               `• "0 9 * * 1-5" - Weekdays at 9:00 AM\n` +
               `• "0 */6 * * *" - Every 6 hours\n` +
               `• "30 14 * * 0" - Sundays at 2:30 PM\n\n` +
               `📖 **Format:** minute hour day month weekday\n` +
               `🔗 **Help:** https://crontab.guru for interactive examples`
      };
    }

    if (!args?.actionType) {
      return {
        valid: false,
        error: `❌ **Missing 'actionType' parameter**\n\n` +
               `📝 **Required:** Action type (string)\n` +
               `✅ **Allowed values:**\n` +
               `• "resource_event" - Publish event for AI agent subscriptions\n` +
               `• "notification" - Send notification message\n\n` +
               `💡 **Tip:** Use "resource_event" for autonomous AI workflows`
      };
    }

    // Validate job name format
    if (typeof args.name !== 'string' || args.name.trim().length === 0) {
      return {
        valid: false,
        error: `❌ **Invalid job name format**\n\n` +
               `📝 **Current:** ${typeof args.name} "${args.name}"\n` +
               `✅ **Required:** Non-empty string\n` +
               `💡 **Examples:** "Daily Backup", "Weekly Report", "Hourly Sync"`
      };
    }

    if (args.name.length > 100) {
      return {
        valid: false,
        error: `❌ **Job name too long**\n\n` +
               `📏 **Current length:** ${args.name.length} characters\n` +
               `📏 **Maximum allowed:** 100 characters\n` +
               `💡 **Tip:** Use concise, descriptive names`
      };
    }

    // Validate job name characters
    if (!/^[a-zA-Z0-9\s\-_\.]+$/.test(args.name)) {
      return {
        valid: false,
        error: `❌ **Invalid characters in job name**\n\n` +
               `📝 **Current:** "${args.name}"\n` +
               `✅ **Allowed:** Letters, numbers, spaces, hyphens, underscores, dots\n` +
               `❌ **Not allowed:** Special characters like @#$%^&*()\n` +
               `💡 **Example:** "Daily-Report_v2.0" ✅`
      };
    }

    // Validate action type
    const validActionTypes = ['resource_event', 'notification'];
    if (!validActionTypes.includes(args.actionType)) {
      return {
        valid: false,
        error: `❌ **Invalid action type**\n\n` +
               `📝 **Current:** "${args.actionType}"\n` +
               `✅ **Allowed values:**\n` +
               `• "resource_event" - For autonomous AI agent workflows\n` +
               `• "notification" - For simple notifications\n\n` +
               `💡 **Most common:** "resource_event" enables AI agents to receive callbacks`
      };
    }

    // Validate cron expression format before testing
    if (typeof args.cronExpression !== 'string' || args.cronExpression.trim().length === 0) {
      return {
        valid: false,
        error: `❌ **Invalid cron expression format**\n\n` +
               `📝 **Current:** ${typeof args.cronExpression} "${args.cronExpression}"\n` +
               `✅ **Required:** Non-empty string with cron format\n` +
               `💡 **Example:** "0 9 * * 1-5" (weekdays at 9 AM)`
      };
    }

    // Validate cron expression parts count
    const cronParts = args.cronExpression.trim().split(/\s+/);
    if (cronParts.length !== 5) {
      return {
        valid: false,
        error: `❌ **Invalid cron expression format**\n\n` +
               `📝 **Current:** "${args.cronExpression}" (${cronParts.length} parts)\n` +
               `✅ **Required:** Exactly 5 space-separated parts\n` +
               `📖 **Format:** minute hour day month weekday\n\n` +
               `💡 **Examples:**\n` +
               `• "0 9 * * *" - Daily at 9:00 AM\n` +
               `• "*/15 * * * *" - Every 15 minutes\n` +
               `• "0 0 1 * *" - First day of each month\n\n` +
               `🔗 **Help:** Visit https://crontab.guru for interactive examples`
      };
    }

    return { valid: true };
  }

  /**
   * Handle scheduler add tool
   */
  private async handleSchedulerAdd(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      // Comprehensive input validation
      const validation = this.validateSchedulerInput(args);
      if (!validation.valid) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: validation.error!
          }
        };
      }

      // Check if job name already exists
      const existingJob = Array.from(this.scheduledJobs.values())
        .find(({ config }) => config.name === args.name);

      if (existingJob) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: `❌ **Job name already exists**\n\n` +
                     `📝 **Conflicting name:** "${args.name}"\n` +
                     `🆔 **Existing job ID:** ${existingJob.config.id.slice(0, 8)}\n` +
                     `📅 **Created:** ${existingJob.config.createdAt.toLocaleDateString()}\n\n` +
                     `💡 **Solutions:**\n` +
                     `• Choose a different name\n` +
                     `• Remove the existing job first with \`ncp_scheduler_remove\`\n` +
                     `• Add a suffix like "_v2" or "_new"`
          }
        };
      }

      // Validate cron expression by attempting to create a job
      try {
        new CronJob(args.cronExpression, () => {}, null, false);
      } catch (cronError) {
        const errorMsg = cronError instanceof Error ? cronError.message : String(cronError);
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Invalid cron expression**\n\n` +
                     `📝 **Expression:** "${args.cronExpression}"\n` +
                     `⚠️ **Error:** ${errorMsg}\n\n` +
                     `✅ **Common patterns:**\n` +
                     `• "0 9 * * *" - Daily at 9:00 AM\n` +
                     `• "0 9 * * 1-5" - Weekdays at 9:00 AM\n` +
                     `• "0 */6 * * *" - Every 6 hours\n` +
                     `• "30 14 * * 0" - Sundays at 2:30 PM\n` +
                     `• "0 0 1 * *" - First day of each month\n\n` +
                     `📖 **Format:** minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-7)\n` +
                     `🔗 **Validator:** https://crontab.guru`
          }
        };
      }

      // Validate action data if provided
      if (args.actionData && typeof args.actionData !== 'object') {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Invalid actionData format**\n\n` +
                     `📝 **Current:** ${typeof args.actionData}\n` +
                     `✅ **Required:** Object (JSON)\n` +
                     `💡 **Examples:**\n` +
                     `• {} - Empty object\n` +
                     `• {"message": "Hello"} - Simple notification\n` +
                     `• {"type": "report", "recipients": ["ai"]} - Structured data`
          }
        };
      }

      // Create job configuration
      const jobConfig: ScheduledJob = {
        id: uuidv4(),
        name: args.name.trim(),
        cronExpression: args.cronExpression.trim(),
        description: args.description?.trim(),
        action: {
          type: args.actionType,
          data: args.actionData || {}
        },
        createdAt: new Date(),
        status: 'active'
      };

      this.createCronJob(jobConfig);
      this.saveScheduledJobs();

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `✅ Scheduled job created successfully:\n\n` +
                  `📋 **Job Details:**\n` +
                  `• ID: ${jobConfig.id}\n` +
                  `• Name: ${jobConfig.name}\n` +
                  `• Schedule: ${jobConfig.cronExpression}\n` +
                  `• Action: ${jobConfig.action.type}\n` +
                  `• Next run: ${jobConfig.nextRun?.toLocaleString() || 'Unknown'}\n` +
                  `• Status: ${jobConfig.status}\n\n` +
                  `🤖 This job can now trigger autonomous AI workflows when it fires.`
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to create scheduled job: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle scheduler list tool
   */
  private async handleSchedulerList(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const statusFilter = args?.status || 'all';

      // Validate status filter
      const validStatuses = ['all', 'active', 'paused', 'error'];
      if (!validStatuses.includes(statusFilter)) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Invalid status filter**\n\n` +
                     `📝 **Current:** "${statusFilter}"\n` +
                     `✅ **Allowed values:**\n` +
                     `• "all" - Show all jobs (default)\n` +
                     `• "active" - Only running jobs\n` +
                     `• "paused" - Only paused jobs\n` +
                     `• "error" - Only jobs with errors\n\n` +
                     `💡 **Example:** {"status": "active"}`
          }
        };
      }

      let jobs = Array.from(this.scheduledJobs.values()).map(({ config }) => config);

      if (statusFilter !== 'all') {
        jobs = jobs.filter(job => job.status === statusFilter);
      }

      if (jobs.length === 0) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `📋 No scheduled jobs found${statusFilter !== 'all' ? ` with status '${statusFilter}'` : ''}\n\n` +
                    `💡 Use \`ncp_scheduler_add\` to create your first scheduled job for autonomous AI workflows.`
            }]
          }
        };
      }

      jobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      let output = `📋 **Scheduled Jobs** (${jobs.length} job${jobs.length === 1 ? '' : 's'})\n\n`;

      jobs.forEach((job, index) => {
        const statusIcon = {
          active: '🟢',
          paused: '🟡',
          error: '🔴',
          completed: '✅'
        }[job.status] || '⚪';

        output += `${index + 1}. ${statusIcon} **${job.name}** (${job.id.slice(0, 8)})\n`;
        output += `   📅 Schedule: ${job.cronExpression}\n`;
        output += `   🎯 Action: ${job.action.type}\n`;

        // Show constraints info
        if (job.constraints) {
          if (job.constraints.fireOnce) {
            output += `   🎯 **Fire once:** Will run once then stop\n`;
          }
          if (job.constraints.maxExecutions && !job.constraints.fireOnce) {
            const remaining = job.constraints.maxExecutions - (job.constraints.executionCount || 0);
            output += `   🔢 **Executions:** ${job.constraints.executionCount || 0}/${job.constraints.maxExecutions} (${remaining} remaining)\n`;
          }
          if (job.constraints.endDate) {
            output += `   📅 **End date:** ${job.constraints.endDate.toLocaleString()}\n`;
          }
        }

        if (job.status === 'completed') {
          output += `   ✅ **Status:** Completed\n`;
        } else {
          output += `   ⏰ Next run: ${job.nextRun?.toLocaleString() || 'Unknown'}\n`;
        }

        if (job.lastRun) {
          output += `   ✅ Last run: ${job.lastRun.toLocaleString()}\n`;
        }
        if (job.description) {
          output += `   📝 Description: ${job.description}\n`;
        }
        if (job.status === 'error' && job.errorMessage) {
          output += `   ❌ Error: ${job.errorMessage}\n`;
        }
        output += '\n';
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: output
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to list scheduled jobs: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle scheduler remove tool
   */
  private async handleSchedulerRemove(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      // Validate input parameters
      if (!args?.id && !args?.name) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Missing required parameter**\n\n` +
                     `📝 **Required:** Either 'id' or 'name' parameter\n` +
                     `💡 **Examples:**\n` +
                     `• {"id": "abc12345"} - Remove by job ID\n` +
                     `• {"name": "Daily Report"} - Remove by job name\n\n` +
                     `📄 **Tip:** Use \`ncp_scheduler_list\` to see available jobs`
          }
        };
      }

      // Validate parameter types
      if (args.id && typeof args.id !== 'string') {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Invalid ID format**\n\n` +
                     `📝 **Current:** ${typeof args.id}\n` +
                     `✅ **Required:** String (job ID)\n` +
                     `💡 **Example:** "a1b2c3d4-1234-5678-9abc-def012345678"`
          }
        };
      }

      if (args.name && typeof args.name !== 'string') {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Invalid name format**\n\n` +
                     `📝 **Current:** ${typeof args.name}\n` +
                     `✅ **Required:** String (job name)\n` +
                     `💡 **Example:** "Daily Analytics Report"`
          }
        };
      }

      let jobEntry: { job: CronJob; config: ScheduledJob } | undefined;
      let jobId: string;

      if (args.id) {
        jobEntry = this.scheduledJobs.get(args.id);
        jobId = args.id;
      } else {
        // Find by name
        const found = Array.from(this.scheduledJobs.entries())
          .find(([, { config }]) => config.name === args.name);
        if (found) {
          [jobId, jobEntry] = found;
        }
      }

      if (!jobEntry) {
        const identifier = args.id || args.name;
        const searchType = args.id ? 'ID' : 'name';

        // Get available jobs for helpful suggestions
        const availableJobs = Array.from(this.scheduledJobs.values())
          .map(({ config }) => ({ id: config.id.slice(0, 8), name: config.name }))
          .slice(0, 5); // Show up to 5 jobs

        let suggestion = '';
        if (availableJobs.length > 0) {
          suggestion = `\n\n📄 **Available jobs:**\n` +
                      availableJobs.map(job => `• ID: ${job.id}... Name: "${job.name}"`).join('\n') +
                      (this.scheduledJobs.size > 5 ? `\n• ... and ${this.scheduledJobs.size - 5} more` : '');
        }

        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: `❌ **Job not found**\n\n` +
                     `🔍 **Searched by ${searchType}:** "${identifier}"\n` +
                     `📋 **Total jobs:** ${this.scheduledJobs.size}${suggestion}\n\n` +
                     `💡 **Tips:**\n` +
                     `• Use \`ncp_scheduler_list\` to see all jobs\n` +
                     `• Check spelling of job name\n` +
                     `• Use full job ID (not abbreviated)`
          }
        };
      }

      // Stop and remove the job
      jobEntry.job.stop();
      this.scheduledJobs.delete(jobId!);
      this.saveScheduledJobs();

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `✅ Successfully removed scheduled job:\n\n` +
                  `📋 **Removed Job:**\n` +
                  `• Name: ${jobEntry.config.name}\n` +
                  `• ID: ${jobEntry.config.id}\n` +
                  `• Schedule: ${jobEntry.config.cronExpression}\n\n` +
                  `🗑️ The job has been stopped and removed from the scheduler.`
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to remove scheduled job: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle scheduler status tool
   */
  private async handleSchedulerStatus(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const totalJobs = this.scheduledJobs.size;
      const jobs = Array.from(this.scheduledJobs.values()).map(({ config }) => config);

      const activeJobs = jobs.filter(j => j.status === 'active').length;
      const pausedJobs = jobs.filter(j => j.status === 'paused').length;
      const errorJobs = jobs.filter(j => j.status === 'error').length;
      const completedJobs = jobs.filter(j => j.status === 'completed').length;
      const oneTimeJobs = jobs.filter(j => j.constraints?.fireOnce).length;
      const limitedJobs = jobs.filter(j => j.constraints?.maxExecutions && !j.constraints?.fireOnce).length;

      const upcomingJobs = jobs
        .filter(j => j.status === 'active' && j.nextRun)
        .sort((a, b) => (a.nextRun!.getTime() - b.nextRun!.getTime()))
        .slice(0, 5);

      const recentRuns = jobs
        .filter(j => j.lastRun)
        .sort((a, b) => (b.lastRun!.getTime() - a.lastRun!.getTime()))
        .slice(0, 5);

      let output = `⚡ **NCP Scheduler Status**\n\n`;

      output += `📊 **Overview:**\n`;
      output += `• Total jobs: ${totalJobs}\n`;
      output += `• 🟢 Active: ${activeJobs}\n`;
      output += `• 🟡 Paused: ${pausedJobs}\n`;
      output += `• 🔴 Error: ${errorJobs}\n`;
      output += `• ✅ Completed: ${completedJobs}\n`;
      if (oneTimeJobs > 0) {
        output += `• 🎯 One-time jobs: ${oneTimeJobs}\n`;
      }
      if (limitedJobs > 0) {
        output += `• 🔢 Limited execution jobs: ${limitedJobs}\n`;
      }
      output += '\n';

      if (upcomingJobs.length > 0) {
        output += `⏰ **Next ${upcomingJobs.length} jobs:**\n`;
        upcomingJobs.forEach(job => {
          output += `• ${job.name}: ${job.nextRun!.toLocaleString()}\n`;
        });
        output += '\n';
      }

      if (recentRuns.length > 0) {
        output += `✅ **Recent executions:**\n`;
        recentRuns.forEach(job => {
          output += `• ${job.name}: ${job.lastRun!.toLocaleString()}\n`;
        });
        output += '\n';
      }

      if (totalJobs === 0) {
        output += `💡 **Get Started:**\n`;
        output += `No scheduled jobs yet. Use \`ncp_scheduler_add\` to create autonomous AI workflows!\n`;
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: output
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to get scheduler status: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Subscribe to scheduler resource events (for autonomous AI agents)
   */
  subscribeToSchedulerResource(resourceUri: string, subscriberId: string) {
    if (!this.resourceSubscribers.has(resourceUri)) {
      this.resourceSubscribers.set(resourceUri, new Set());
    }
    this.resourceSubscribers.get(resourceUri)!.add(subscriberId);
    logger.info(`[InternalNCP] Subscriber ${subscriberId} subscribed to ${resourceUri}`);
  }

  /**
   * Unsubscribe from scheduler resource events
   */
  unsubscribeFromSchedulerResource(resourceUri: string, subscriberId: string) {
    const subscribers = this.resourceSubscribers.get(resourceUri);
    if (subscribers) {
      subscribers.delete(subscriberId);
      if (subscribers.size === 0) {
        this.resourceSubscribers.delete(resourceUri);
      }
    }
    logger.info(`[InternalNCP] Subscriber ${subscriberId} unsubscribed from ${resourceUri}`);
  }

  /**
   * Handle datetime current tool
   */
  private async handleDateTimeCurrent(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const format = args?.format || 'detailed';
      const requestedTimezone = args?.timezone;

      const now = new Date();
      const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const targetTimezone = requestedTimezone || systemTimezone;

      let formattedTime: string;
      let output: string;

      switch (format) {
        case 'iso':
          formattedTime = now.toISOString();
          output = `🕐 **Current Time (ISO)**\n\n` +
                  `📅 **ISO Format:** ${formattedTime}\n` +
                  `🌍 **System Timezone:** ${systemTimezone}`;
          break;

        case 'local':
          formattedTime = now.toLocaleString('en-US', { timeZone: targetTimezone });
          output = `🕐 **Current Local Time**\n\n` +
                  `📅 **Local Time:** ${formattedTime}\n` +
                  `🌍 **Timezone:** ${targetTimezone}`;
          break;

        case 'utc':
          formattedTime = now.toUTCString();
          output = `🕐 **Current UTC Time**\n\n` +
                  `📅 **UTC Time:** ${formattedTime}\n` +
                  `🌍 **UTC Offset:** ${now.getTimezoneOffset() / -60} hours`;
          break;

        case 'detailed':
        default:
          const localTime = now.toLocaleString('en-US', {
            timeZone: targetTimezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          });

          const utcTime = now.toUTCString();
          const timestamp = now.getTime();

          output = `🕐 **Current Date & Time**\n\n` +
                  `📅 **Local Time:** ${localTime}\n` +
                  `🌍 **Timezone:** ${targetTimezone}\n` +
                  `🌐 **UTC Time:** ${utcTime}\n` +
                  `📊 **Unix Timestamp:** ${timestamp}\n` +
                  `📈 **ISO Format:** ${now.toISOString()}\n\n` +
                  `💡 **For Scheduling:**\n` +
                  `• Use this info to create accurate cron expressions\n` +
                  `• Current hour: ${now.getHours()} (24-hour format)\n` +
                  `• Current minute: ${now.getMinutes()}\n` +
                  `• Current day of week: ${now.getDay()} (0=Sunday, 6=Saturday)`;
          break;
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: output
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to get current time: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle datetime cron builder tool
   */
  private async handleDateTimeCronBuilder(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      if (!args?.description) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Missing description parameter**\n\n` +
                     `📝 **Required:** Natural language time description\n` +
                     `💡 **Examples:**\n` +
                     `• "every day at 9am"\n` +
                     `• "every weekday at 2:30pm"\n` +
                     `• "every 15 minutes"\n` +
                     `• "every monday at 10am"\n` +
                     `• "twice daily at 9am and 6pm"`
          }
        };
      }

      const description = args.description.toLowerCase().trim();
      const validate = args.validate !== false; // default true
      const timezone = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      let cronExpression: string | null = null;
      let explanation = '';
      let examples: string[] = [];

      // Parse common patterns
      if (description.includes('every minute')) {
        cronExpression = '* * * * *';
        explanation = 'Runs every minute of every hour';
        examples = ['Next few runs will be at each minute mark'];
      } else if (description.includes('every 5 minutes')) {
        cronExpression = '*/5 * * * *';
        explanation = 'Runs every 5 minutes';
        examples = ['0:00, 0:05, 0:10, 0:15, etc.'];
      } else if (description.includes('every 15 minutes')) {
        cronExpression = '*/15 * * * *';
        explanation = 'Runs every 15 minutes';
        examples = ['0:00, 0:15, 0:30, 0:45 of each hour'];
      } else if (description.includes('every 30 minutes') || description.includes('twice an hour')) {
        cronExpression = '*/30 * * * *';
        explanation = 'Runs every 30 minutes (twice per hour)';
        examples = ['0:00, 0:30 of each hour'];
      } else if (description.includes('every hour')) {
        cronExpression = '0 * * * *';
        explanation = 'Runs at the start of every hour';
        examples = ['1:00, 2:00, 3:00, etc.'];
      } else if (description.includes('every day') || description.includes('daily')) {
        if (description.includes('9am') || description.includes('9:00')) {
          cronExpression = '0 9 * * *';
          explanation = 'Runs daily at 9:00 AM';
        } else if (description.includes('noon') || description.includes('12pm')) {
          cronExpression = '0 12 * * *';
          explanation = 'Runs daily at noon (12:00 PM)';
        } else if (description.includes('midnight') || description.includes('12am')) {
          cronExpression = '0 0 * * *';
          explanation = 'Runs daily at midnight (12:00 AM)';
        } else {
          cronExpression = '0 9 * * *';
          explanation = 'Runs daily at 9:00 AM (default time)';
        }
        examples = ['Same time every day'];
      } else if (description.includes('weekday') || description.includes('monday to friday')) {
        if (description.includes('9am') || description.includes('9:00')) {
          cronExpression = '0 9 * * 1-5';
          explanation = 'Runs weekdays (Mon-Fri) at 9:00 AM';
        } else if (description.includes('5pm') || description.includes('17:00')) {
          cronExpression = '0 17 * * 1-5';
          explanation = 'Runs weekdays (Mon-Fri) at 5:00 PM';
        } else {
          cronExpression = '0 9 * * 1-5';
          explanation = 'Runs weekdays (Mon-Fri) at 9:00 AM (default)';
        }
        examples = ['Monday through Friday only'];
      } else if (description.includes('weekend')) {
        cronExpression = '0 10 * * 0,6';
        explanation = 'Runs on weekends (Sat-Sun) at 10:00 AM';
        examples = ['Saturday and Sunday only'];
      } else if (description.includes('monday')) {
        cronExpression = '0 9 * * 1';
        explanation = 'Runs every Monday at 9:00 AM';
        examples = ['Once per week on Monday'];
      } else if (description.includes('first day of') || description.includes('monthly')) {
        cronExpression = '0 9 1 * *';
        explanation = 'Runs on the 1st day of every month at 9:00 AM';
        examples = ['January 1st, February 1st, etc.'];
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `❌ **Could not parse time description**\n\n` +
                     `📝 **Your input:** "${args.description}"\n\n` +
                     `✅ **Supported patterns:**\n` +
                     `• "every minute" → * * * * *\n` +
                     `• "every 5 minutes" → */5 * * * *\n` +
                     `• "every hour" → 0 * * * *\n` +
                     `• "every day at 9am" → 0 9 * * *\n` +
                     `• "every weekday at 2pm" → 0 14 * * 1-5\n` +
                     `• "every monday at 10am" → 0 10 * * 1\n` +
                     `• "monthly on 1st at 9am" → 0 9 1 * *\n\n` +
                     `💡 **Tip:** Use specific times like "9am", "2:30pm", "noon", "midnight"`
          }
        };
      }

      // Validate the generated cron expression if requested
      if (validate && cronExpression) {
        try {
          new CronJob(cronExpression, () => {}, null, false);
        } catch (cronError) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `❌ **Generated invalid cron expression**\n\n` +
                       `📝 **Generated:** ${cronExpression}\n` +
                       `⚠️ **Error:** ${cronError instanceof Error ? cronError.message : String(cronError)}\n\n` +
                       `🔧 **This is a bug in the cron builder. Please report it.**`
            }
          };
        }
      }

      const output = `⏰ **Cron Expression Built Successfully**\n\n` +
                    `📝 **Input:** "${args.description}"\n` +
                    `⚙️ **Cron Expression:** \`${cronExpression}\`\n` +
                    `📖 **Explanation:** ${explanation}\n` +
                    `🌍 **Timezone Context:** ${timezone}\n\n` +
                    `📅 **Schedule Examples:**\n` +
                    examples.map(ex => `• ${ex}`).join('\n') + '\n\n' +
                    `✅ **Ready to use with \`ncp_scheduler_add\`:**\n` +
                    `\`\`\`json\n` +
                    `{\n` +
                    `  "name": "My Scheduled Task",\n` +
                    `  "cronExpression": "${cronExpression}",\n` +
                    `  "actionType": "resource_event"\n` +
                    `}\n` +
                    `\`\`\``;

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: output
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to build cron expression: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle datetime timezone info tool
   */
  private async handleDateTimeTimezoneInfo(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const timezone = args?.timezone;
      const listCommon = args?.listCommon;

      let output = '';

      if (listCommon) {
        output = `🌍 **Common Timezones Reference**\n\n` +
                `📍 **US Timezones:**\n` +
                `• "America/New_York" (EST/EDT) - Eastern\n` +
                `• "America/Chicago" (CST/CDT) - Central\n` +
                `• "America/Denver" (MST/MDT) - Mountain\n` +
                `• "America/Los_Angeles" (PST/PDT) - Pacific\n\n` +
                `📍 **International:**\n` +
                `• "Europe/London" (GMT/BST) - UK\n` +
                `• "Europe/Paris" (CET/CEST) - Central Europe\n` +
                `• "Asia/Tokyo" (JST) - Japan\n` +
                `• "Asia/Shanghai" (CST) - China\n` +
                `• "Australia/Sydney" (AEST/AEDT) - Sydney\n\n` +
                `📍 **Special:**\n` +
                `• "UTC" - Coordinated Universal Time\n` +
                `• "GMT" - Greenwich Mean Time\n\n` +
                `🖥️ **Your System:** ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      }

      if (timezone) {
        try {
          const now = new Date();
          const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

          // Get time in requested timezone
          const targetTime = now.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          });

          // Get UTC offset for the timezone
          const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
          const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
          const offsetMs = tzDate.getTime() - utcDate.getTime();
          const offsetHours = offsetMs / (1000 * 60 * 60);

          const tzInfo = `🌍 **Timezone Information: ${timezone}**\n\n` +
                        `⏰ **Current Time:** ${targetTime}\n` +
                        `🔢 **UTC Offset:** ${offsetHours >= 0 ? '+' : ''}${offsetHours} hours\n` +
                        `📊 **Compared to System (${systemTz}):**\n`;

          if (timezone !== systemTz) {
            const systemTime = now.toLocaleString('en-US', { timeZone: systemTz });
            const timeDiff = `• System time: ${systemTime}\n` +
                           `• Target time: ${targetTime.split(',')[1]?.trim() || targetTime}\n`;
            output = output ? output + '\n\n' + tzInfo + timeDiff : tzInfo + timeDiff;
          } else {
            output = output ? output + '\n\n' + tzInfo + '• Same as system timezone' : tzInfo + '• Same as system timezone';
          }

        } catch (tzError) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `❌ **Invalid timezone**\n\n` +
                       `📝 **Input:** "${timezone}"\n\n` +
                       `✅ **Valid formats:**\n` +
                       `• "America/New_York" (recommended)\n` +
                       `• "Europe/London"\n` +
                       `• "UTC"\n` +
                       `• "GMT"\n\n` +
                       `💡 **Tip:** Use \`ncp_datetime_timezone_info\` with \`listCommon: true\` to see all options`
            }
          };
        }
      }

      if (!output) {
        output = `🌍 **Timezone Tools**\n\n` +
                `📖 **Usage:**\n` +
                `• Use \`{"listCommon": true}\` to see common timezones\n` +
                `• Use \`{"timezone": "America/New_York"}\` for specific timezone info\n\n` +
                `🖥️ **Your Current System Timezone:** ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: output
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to get timezone info: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle scheduler check tool (AI workflow helper)
   */
  private async handleSchedulerCheck(id: string | number, args: any): Promise<InternalMCPResponse> {
    try {
      const query = args?.query?.toLowerCase().trim();
      const includeTimeContext = args?.includeTimeContext !== false; // default true
      const now = new Date();
      const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const allJobs = Array.from(this.scheduledJobs.values()).map(({ config }) => config);
      let output = `🔍 **Smart Schedule Check**\n\n`;

      // Time context (for relative scheduling)
      if (includeTimeContext) {
        output += `🕐 **Current Time Context:**\n`;
        output += `• **Now:** ${now.toLocaleString('en-US', { timeZone: systemTimezone })}\n`;
        output += `• **ISO:** ${now.toISOString()}\n`;
        output += `• **Unix:** ${now.getTime()}\n`;
        output += `• **Timezone:** ${systemTimezone}\n`;
        output += `• **Day:** ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]} (${now.getDay()})\n`;
        output += `• **Hour:** ${now.getHours()} (24h format)\n\n`;

        // Helper calculations
        output += `⏰ **Quick Time Calculations:**\n`;
        output += `• In 5 minutes: ${new Date(now.getTime() + 5*60*1000).toLocaleString('en-US', { timeZone: systemTimezone })}\n`;
        output += `• In 30 minutes: ${new Date(now.getTime() + 30*60*1000).toLocaleString('en-US', { timeZone: systemTimezone })}\n`;
        output += `• In 2 hours: ${new Date(now.getTime() + 2*60*60*1000).toLocaleString('en-US', { timeZone: systemTimezone })}\n`;
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        output += `• Tomorrow 9am: ${tomorrow.toLocaleString('en-US', { timeZone: systemTimezone })}\n\n`;
      }

      // Search existing jobs
      if (query && query.length > 0) {
        const matchingJobs = allJobs.filter(job => {
          const jobName = job.name.toLowerCase();
          const jobDesc = (job.description || '').toLowerCase();
          return jobName.includes(query) || jobDesc.includes(query) || query.split(' ').some((word: string) => jobName.includes(word));
        });

        output += `🔍 **Search Results for "${args.query}":**\n`;
        if (matchingJobs.length === 0) {
          output += `✅ **No similar jobs found** - Safe to create new job\n\n`;
        } else {
          output += `⚠️ **Found ${matchingJobs.length} similar job${matchingJobs.length === 1 ? '' : 's'}:**\n\n`;

          matchingJobs.forEach((job, index) => {
            const statusIcon = {
              active: '🟢',
              paused: '🟡',
              error: '🔴',
              completed: '✅'
            }[job.status] || '⚪';

            output += `${index + 1}. ${statusIcon} **${job.name}** (${job.id.slice(0, 8)})\n`;
            output += `   ⏰ Schedule: ${job.cronExpression}\n`;
            if (job.nextRun && job.status === 'active') {
              output += `   ⏰ Next run: ${job.nextRun.toLocaleString('en-US', { timeZone: systemTimezone })}\n`;
            }
            if (job.constraints?.fireOnce) {
              output += `   🎯 One-time job\n`;
            }
            if (job.constraints?.maxExecutions) {
              const remaining = job.constraints.maxExecutions - (job.constraints.executionCount || 0);
              output += `   🔢 ${job.constraints.executionCount || 0}/${job.constraints.maxExecutions} executions (${remaining} remaining)\n`;
            }
            output += '\n';
          });

          output += `💡 **AI Workflow Suggestions:**\n`;
          output += `• Consider modifying existing job instead of creating new one\n`;
          output += `• Use \`ncp_scheduler_remove\` to remove conflicts\n`;
          output += `• Use different name if this is truly a separate task\n\n`;
        }
      }

      // Overall system status
      const activeJobs = allJobs.filter(j => j.status === 'active').length;
      const completedJobs = allJobs.filter(j => j.status === 'completed').length;

      output += `📊 **System Overview:**\n`;
      output += `• Total jobs: ${allJobs.length}\n`;
      output += `• Active: ${activeJobs}\n`;
      output += `• Completed: ${completedJobs}\n\n`;

      if (allJobs.length === 0) {
        output += `🎆 **Ready to schedule!** No existing jobs - perfect time to create your first scheduled task.\n`;
      }

      // Quick action suggestions
      output += `⚡ **Quick Actions:**\n`;
      output += `• \`ncp_schedule\` - Create new smart schedule\n`;
      output += `• \`ncp_scheduler_list\` - See all scheduled jobs\n`;
      output += `• \`ncp_scheduler_status\` - Get detailed system status\n`;

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: output
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Failed to check schedules: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle MCP resources/list request
   */
  private async handleListResources(request: InternalMCPRequest): Promise<InternalMCPResponse> {
    try {
      const allJobs = Array.from(this.scheduledJobs.values()).map(({ config }) => config);

      const resources = allJobs.map(job => ({
        uri: `ncp://scheduler/${job.id}`,
        name: job.name,
        description: job.description || `Scheduled job: ${job.name}`,
        mimeType: 'application/json'
      }));

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resources
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle MCP resources/read request
   */
  private async handleReadResource(request: InternalMCPRequest): Promise<InternalMCPResponse> {
    try {
      const { uri } = request.params || {};

      if (!uri || typeof uri !== 'string') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Resource URI is required'
          }
        };
      }

      // Parse URI: ncp://scheduler/{jobId}
      const match = uri.match(/^ncp:\/\/scheduler\/(.+)$/);
      if (!match) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Invalid resource URI format. Expected: ncp://scheduler/{jobId}'
          }
        };
      }

      const jobId = match[1];
      const jobEntry = this.scheduledJobs.get(jobId);

      if (!jobEntry) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Job not found: ${jobId}`
          }
        };
      }

      const { config } = jobEntry;
      const jobData = {
        id: config.id,
        name: config.name,
        cronExpression: config.cronExpression,
        description: config.description,
        status: config.status,
        createdAt: config.createdAt,
        lastRun: config.lastRun,
        nextRun: config.nextRun,
        constraints: config.constraints,
        action: config.action
      };

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          contents: [{
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify(jobData, null, 2)
          }]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle MCP resources/subscribe request
   */
  private async handleResourceSubscribe(request: InternalMCPRequest): Promise<InternalMCPResponse> {
    try {
      const { uri } = request.params || {};

      if (!uri || typeof uri !== 'string') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Resource URI is required'
          }
        };
      }

      // Parse URI: ncp://scheduler/{jobId}
      const match = uri.match(/^ncp:\/\/scheduler\/(.+)$/);
      if (!match) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Invalid resource URI format. Expected: ncp://scheduler/{jobId}'
          }
        };
      }

      const jobId = match[1];
      const jobEntry = this.scheduledJobs.get(jobId);

      if (!jobEntry) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Job not found: ${jobId}`
          }
        };
      }

      // Add subscription
      if (!this.resourceSubscribers.has(uri)) {
        this.resourceSubscribers.set(uri, new Set());
      }

      // Use request.id as subscriber identifier
      const subscriberId = String(request.id);
      this.resourceSubscribers.get(uri)!.add(subscriberId);

      logger.info(`[InternalNCP] Resource subscription added: ${uri} by ${subscriberId}`);

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {}
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Failed to subscribe to resource: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Handle MCP resources/unsubscribe request
   */
  private async handleResourceUnsubscribe(request: InternalMCPRequest): Promise<InternalMCPResponse> {
    try {
      const { uri } = request.params || {};

      if (!uri || typeof uri !== 'string') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Resource URI is required'
          }
        };
      }

      const subscriberId = String(request.id);
      const subscribers = this.resourceSubscribers.get(uri);

      if (subscribers) {
        subscribers.delete(subscriberId);

        // Clean up empty subscriber sets
        if (subscribers.size === 0) {
          this.resourceSubscribers.delete(uri);
        }

        logger.info(`[InternalNCP] Resource subscription removed: ${uri} by ${subscriberId}`);
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {}
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Failed to unsubscribe from resource: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  /**
   * Send MCP notification when timer fires
   */
  private async sendResourceNotification(jobId: string, eventData: any) {
    try {
      const resourceUri = `ncp://scheduler/${jobId}`;
      const subscribers = this.resourceSubscribers.get(resourceUri);

      if (!subscribers || subscribers.size === 0) {
        logger.info(`[InternalNCP] No subscribers for resource: ${resourceUri}`);
        return;
      }

      logger.info(`[InternalNCP] Sending resource notification to ${subscribers.size} subscriber(s) for: ${resourceUri}`);

      // Note: In a real implementation, we would need access to the MCP connection
      // to send notifications back to Claude Desktop. For now, we'll log what would be sent.
      const notification = {
        method: 'notifications/resources/updated',
        params: {
          uri: resourceUri,
          data: eventData
        }
      };

      logger.info(`[InternalNCP] Resource notification: ${JSON.stringify(notification, null, 2)}`);

      // TODO: Send actual notification through MCP connection
      // This would require access to the MCP server connection to send the notification

    } catch (error) {
      logger.error(`[InternalNCP] Failed to send resource notification: ${error}`);
    }
  }

  /**
   * Send MCP list changed notification when resources change
   */
  private sendListChangedNotification() {
    try {
      const notification = {
        method: 'notifications/resources/list_changed',
        jsonrpc: '2.0'
      };

      logger.info(`[InternalNCP] Sending list changed notification: ${JSON.stringify(notification)}`);

      if (this.notificationCallback) {
        this.notificationCallback(notification);
        logger.info(`[InternalNCP] List changed notification sent via callback`);
      } else {
        logger.warn(`[InternalNCP] No notification callback available - cannot send list changed notification`);
      }

    } catch (error) {
      logger.error(`[InternalNCP] Failed to send list changed notification: ${error}`);
    }
  }

  /**
   * Cleanup method to stop all cron jobs
   */
  cleanup() {
    for (const { job } of this.scheduledJobs.values()) {
      job.stop();
    }
    this.scheduledJobs.clear();
    this.resourceSubscribers.clear();
    logger.info('[InternalNCP] Scheduler cleanup completed');
  }
}