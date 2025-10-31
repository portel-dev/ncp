/**
 * Scheduler Internal MCP
 *
 * Provides tools for scheduling MCP tool executions with cron/launchd/Task Scheduler.
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { Scheduler } from '../services/scheduler/scheduler.js';
import { logger } from '../utils/logger.js';

export class SchedulerMCP implements InternalMCP {
  name = 'schedule';
  description = 'Schedule MCP tool executions with cron (built-in, Unix/Linux/macOS only)';

  /**
   * Announce validation capability following MCP protocol
   * This makes the scheduler a reference implementation for capability-based validation
   */
  capabilities = {
    experimental: {
      toolValidation: {
        supported: true,
        method: 'validate'
      }
    }
  };

  private scheduler: Scheduler;
  private orchestrator?: any; // NCPOrchestrator

  constructor() {
    this.scheduler = new Scheduler(); // No orchestrator yet - will be injected later
  }

  /**
   * Set the orchestrator instance (called by MCP server after initialization)
   */
  setOrchestrator(orchestrator: any): void {
    logger.info('[SchedulerMCP] Orchestrator injected - re-creating scheduler with orchestrator');
    this.orchestrator = orchestrator;
    this.scheduler = new Scheduler(orchestrator);
  }

  tools: InternalTool[] = [
    {
      name: 'validate',
      description: 'Validate tool parameters before scheduling (dry-run). REFERENCE IMPLEMENTATION for MCP validation protocol.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description: 'Tool to validate in format "mcp:tool" (e.g., "filesystem:read_file")'
          },
          parameters: {
            type: 'object',
            description: 'Tool parameters to validate'
          },
          schedule: {
            type: 'string',
            description: 'Schedule to validate (optional). Supports: "in 5 minutes", "in 2 hours", "every day at 2pm", cron expressions, or RFC 3339 datetimes'
          }
        },
        required: ['tool', 'parameters']
      }
    },
    {
      name: 'create',
      description: 'Create a new scheduled job. Uses same parameters as run, plus schedule and active flag.',
      inputSchema: {
        type: 'object',
        properties: {
          // SAME AS RUN
          tool: {
            type: 'string',
            description: 'MCP tool in format "mcp:tool" (e.g., "filesystem:read_file")'
          },
          parameters: {
            type: 'object',
            description: 'Tool parameters (same as you would pass to run)'
          },

          // SCHEDULER-SPECIFIC
          name: {
            type: 'string',
            description: 'Human-readable job name (e.g., "Daily Backup")'
          },
          schedule: {
            type: 'string',
            description: 'Schedule in one of these formats:\n' +
              '1. Relative time: "in 5 minutes", "in 2 hours", "in 3 days" (one-time execution)\n' +
              '2. One-time: RFC 3339 datetime with timezone (e.g., "2025-12-25T15:00:00-05:00" or "2025-12-25T20:00:00Z")\n' +
              '3. Recurring: Cron expression (e.g., "0 14 * * *") - uses timezone parameter\n' +
              '4. Natural language: "every day at 2pm", "every monday at 9am", "every 5 minutes" - uses timezone parameter\n' +
              `System timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n` +
              `Current server time: ${new Date().toISOString()}`
          },
          timezone: {
            type: 'string',
            description: 'IANA timezone for recurring schedules (e.g., "America/New_York", "Europe/London", "UTC"). ' +
              `Defaults to system timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. ` +
              'Ignored if schedule is RFC 3339 datetime (timezone is in the datetime string).'
          },
          active: {
            type: 'boolean',
            description: 'Start active (true, default) or paused (false). Create paused to test manually first.',
            default: true
          },

          // OPTIONAL
          description: {
            type: 'string',
            description: 'Optional description of what this job does'
          },
          fireOnce: {
            type: 'boolean',
            description: 'Execute only once then stop (default: false for recurring)',
            default: false
          },
          maxExecutions: {
            type: 'number',
            description: 'Maximum number of executions before stopping'
          },
          endDate: {
            type: 'string',
            description: 'Stop executing after this date (ISO 8601: "2025-12-31T23:59:59Z")'
          },
          testRun: {
            type: 'boolean',
            description: 'Execute tool once as test before scheduling',
            default: false
          },
          skipValidation: {
            type: 'boolean',
            description: 'Skip parameter validation (not recommended)',
            default: false
          }
        },
        required: ['tool', 'parameters', 'name', 'schedule']
      }
    },
    {
      name: 'retrieve',
      description: 'Get scheduled jobs and/or execution history with search and filtering',
      inputSchema: {
        type: 'object',
        properties: {
          include: {
            type: 'string',
            enum: ['jobs', 'executions', 'both'],
            description: 'What to return: jobs (schedules), executions (history), or both',
            default: 'jobs'
          },
          query: {
            type: 'string',
            description: 'Search term to filter results (optional - omit to list all)'
          },
          job_id: {
            type: 'string',
            description: 'Filter to specific job by ID or name (optional)'
          },
          execution_id: {
            type: 'string',
            description: 'Get specific execution details (optional)'
          },
          status: {
            type: 'string',
            enum: ['active', 'paused', 'completed', 'error', 'all', 'success', 'failure', 'timeout'],
            description: 'Filter by status (for jobs: active/paused/completed/error, for executions: success/failure/timeout)',
            default: 'all'
          },
          page: {
            type: 'number',
            description: 'Page number for pagination',
            default: 1
          },
          limit: {
            type: 'number',
            description: 'Maximum results per page',
            default: 50
          }
        }
      }
    },
    {
      name: 'update',
      description: 'Update scheduled job (can change timing, parameters, or active state for pause/resume)',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'Job ID or name to update'
          },

          // Can update any of these
          name: {
            type: 'string',
            description: 'New job name'
          },
          schedule: {
            type: 'string',
            description: 'New schedule (natural language or cron)'
          },
          tool: {
            type: 'string',
            description: 'New tool to execute'
          },
          parameters: {
            type: 'object',
            description: 'New tool parameters'
          },
          active: {
            type: 'boolean',
            description: 'Activate (true) or pause (false) the job'
          },
          description: {
            type: 'string',
            description: 'New description'
          },
          fireOnce: {
            type: 'boolean',
            description: 'New fireOnce setting'
          },
          maxExecutions: {
            type: 'number',
            description: 'New maxExecutions limit'
          },
          endDate: {
            type: 'string',
            description: 'New end date'
          }
        },
        required: ['job_id']
      }
    },
    {
      name: 'delete',
      description: 'Permanently delete a scheduled job',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'Job ID or name to delete'
          }
        },
        required: ['job_id']
      }
    },
    {
      name: 'list',
      description: 'List all scheduled jobs (simpler alternative to retrieve). Matches CLI: ncp schedule list',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'paused', 'completed', 'error', 'all'],
            description: 'Filter by job status',
            default: 'all'
          }
        }
      }
    },
    {
      name: 'get',
      description: 'Get details for a specific scheduled job (simpler alternative to retrieve). Matches CLI: ncp schedule get <id>',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'Job ID or name to retrieve'
          }
        },
        required: ['job_id']
      }
    },
    {
      name: 'pause',
      description: 'Pause a scheduled job (stops future executions). Matches CLI: ncp schedule pause <id>',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'Job ID or name to pause'
          }
        },
        required: ['job_id']
      }
    },
    {
      name: 'resume',
      description: 'Resume a paused job (re-enables future executions). Matches CLI: ncp schedule resume <id>',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'Job ID or name to resume'
          }
        },
        required: ['job_id']
      }
    },
    {
      name: 'executions',
      description: 'View execution history for all jobs or specific job. Matches CLI: ncp schedule executions',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'Filter to specific job by ID or name (optional - omit for all jobs)'
          },
          status: {
            type: 'string',
            enum: ['success', 'failure', 'timeout', 'all'],
            description: 'Filter by execution status',
            default: 'all'
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return',
            default: 50
          }
        }
      }
    }
  ];

  async executeTool(toolName: string, args: any): Promise<InternalToolResult> {
    try {
      // Check if scheduler is available on this platform
      if (!this.scheduler.isAvailable()) {
        return {
          success: false,
          error: 'Scheduler not available on this platform',
          content: [{
            type: 'text',
            text: '❌ Scheduler not available on this platform (Windows not supported). Scheduling requires Unix/Linux/macOS with cron.'
          }]
        };
      }

      switch (toolName) {
        case 'validate':
          return await this.handleValidate(args);
        case 'create':
          return await this.handleCreate(args);
        case 'retrieve':
          return await this.handleRetrieve(args);
        case 'update':
          return await this.handleUpdate(args);
        case 'delete':
          return await this.handleDelete(args);

        // CLI-style action tools
        case 'list':
          return await this.handleList(args);
        case 'get':
          return await this.handleGet(args);
        case 'pause':
          return await this.handlePause(args);
        case 'resume':
          return await this.handleResume(args);
        case 'executions':
          return await this.handleExecutions(args);

        default:
          return {
            success: false,
            error: `Unknown scheduler tool: ${toolName}`,
            content: [{
              type: 'text',
              text: `❌ Unknown scheduler tool: ${toolName}`
            }]
          };
      }
    } catch (error) {
      logger.error(`[SchedulerMCP] Tool execution error: ${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        content: [{
          type: 'text',
          text: `❌ Error: ${errorMessage}`
        }]
      };
    }
  }

  /**
   * REFERENCE IMPLEMENTATION: tools/validate
   *
   * This demonstrates capability-based validation for the MCP protocol.
   * Validates the TOOL being scheduled (e.g., filesystem:read_file), not the schedule itself.
   */
  private async handleValidate(args: any): Promise<InternalToolResult> {
    const { tool, parameters, schedule } = args;

    if (!tool || !parameters) {
      return {
        success: true,
        content: JSON.stringify({
          valid: false,
          errors: ['Missing required parameters: tool and parameters'],
          warnings: []
        })
      };
    }

    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Validate schedule if provided
      if (schedule) {
        const { NaturalLanguageParser } = await import('../services/scheduler/natural-language-parser.js');
        const scheduleResult = NaturalLanguageParser.parseSchedule(schedule);

        if (!scheduleResult.success) {
          errors.push(`Invalid schedule: ${scheduleResult.error}`);
        }
      }

      // Use ToolValidator to validate the tool being scheduled
      const { ToolValidator } = await import('../services/scheduler/tool-validator.js');
      const validator = new ToolValidator(this.orchestrator);

      const result = await validator.validateTool(tool, parameters);

      return {
        success: true,
        content: JSON.stringify({
          valid: result.valid && errors.length === 0,
          errors: [...errors, ...result.errors],
          warnings: [...warnings, ...result.warnings],
          validationMethod: result.validationMethod,
          schema: result.schema
        })
      };
    } catch (error) {
      return {
        success: true,
        content: JSON.stringify({
          valid: false,
          errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
          warnings: []
        })
      };
    }
  }

  /**
   * Create a new scheduled job
   * Uses same parameters as run + schedule + active flag
   */
  private async handleCreate(args: any): Promise<InternalToolResult> {
    try {
      // Default active to true if not provided
      const active = args.active !== false;

      const job = await this.scheduler.createJob({
        name: args.name,
        schedule: args.schedule,
        timezone: args.timezone, // IANA timezone or defaults to system
        tool: args.tool,
        parameters: args.parameters,
        description: args.description,
        fireOnce: args.fireOnce,
        maxExecutions: args.maxExecutions,
        endDate: args.endDate,
        testRun: args.testRun,
        skipValidation: args.skipValidation
      });

      // If created as paused, pause it immediately
      if (!active) {
        this.scheduler.pauseJob(job.id);
      }

      let successMessage = `✅ Scheduled job created successfully!\n\n` +
                          `📋 Job Details:\n` +
                          `  • Name: ${job.name}\n` +
                          `  • ID: ${job.id}\n` +
                          `  • Tool: ${job.tool}\n` +
                          `  • Schedule: ${job.cronExpression}\n` +
                          `${job.timezone ? `  • Timezone: ${job.timezone}\n` : ''}` +
                          `  • Status: ${active ? 'active' : 'paused'}\n` +
                          `  • Type: ${job.fireOnce ? 'One-time' : 'Recurring'}\n` +
                          `${job.description ? `  • Description: ${job.description}\n` : ''}` +
                          `${job.maxExecutions ? `  • Max Executions: ${job.maxExecutions}\n` : ''}` +
                          `${job.endDate ? `  • End Date: ${job.endDate}\n` : ''}`;

      // Add validation info
      if (args.testRun) {
        successMessage += `\n✅ Test execution completed successfully - parameters validated\n`;
      } else if (!args.skipValidation) {
        successMessage += `\n✅ Parameters validated against tool schema\n`;
      }

      if (active) {
        successMessage += `\n💡 The job will execute automatically according to its schedule.\n`;
      } else {
        successMessage += `\n⏸️ Job created in paused state. Use update with active:true to start execution.\n`;
      }

      successMessage += `📊 Use retrieve with job_id="${job.id}" to monitor execution results.`;

      return {
        success: true,
        content: [{
          type: 'text',
          text: successMessage
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        content: [{
          type: 'text',
          text: `❌ Failed to create scheduled job\n\n` +
                `Error: ${errorMessage}\n\n` +
                `💡 Tips:\n` +
                `  • Verify the tool exists: use find to search\n` +
                `  • Check parameter types match the tool's schema\n` +
                `  • Use testRun: true to verify parameters before scheduling\n` +
                `  • Use validate tool to dry-run test parameters`
        }]
      };
    }
  }

  /**
   * Retrieve jobs and/or executions with search and filtering
   * Unified retrieval for all scheduler data
   */
  private async handleRetrieve(args: any): Promise<InternalToolResult> {
    const include = args.include || 'jobs';
    const query = args.query;
    const jobId = args.job_id;
    const executionId = args.execution_id;
    const status = args.status || 'all';
    const limit = args.limit || 50;

    let result = '';

    try {
      // Handle specific execution lookup
      if (executionId) {
        return this.getExecutionDetails(executionId);
      }

      // Handle specific job lookup
      if (jobId && include === 'jobs') {
        return this.getJobDetails(jobId);
      }

      // Handle jobs
      if (include === 'jobs' || include === 'both') {
        const jobsResult = await this.retrieveJobs({ query, jobId, status, limit });
        result += jobsResult;
      }

      // Handle executions
      if (include === 'executions' || include === 'both') {
        if (result) result += '\n\n';
        const execResult = await this.retrieveExecutions({ query, jobId, status, limit });
        result += execResult;
      }

      return {
        success: true,
        content: [{
          type: 'text',
          text: result || 'No results found matching the criteria.'
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        content: [{
          type: 'text',
          text: `❌ Retrieve failed: ${errorMessage}`
        }]
      };
    }
  }

  /**
   * Update existing job (including active state for pause/resume)
   */
  private async handleUpdate(args: any): Promise<InternalToolResult> {
    let jobId = args.job_id;

    // Try to find by name if not found by ID
    let job = this.scheduler.getJob(jobId);
    if (!job) {
      job = this.scheduler.getJobByName(jobId);
      if (job) {
        jobId = job.id;
      }
    }

    if (!job) {
      return {
        success: false,
        error: `Job not found: ${args.job_id}`,
        content: [{
          type: 'text',
          text: `❌ Job not found: ${args.job_id}`
        }]
      };
    }

    try {
      // Handle active state change (pause/resume)
      if (args.active !== undefined) {
        if (args.active) {
          this.scheduler.resumeJob(jobId);
        } else {
          this.scheduler.pauseJob(jobId);
        }
      }

      // Update other fields if provided
      if (args.name || args.schedule || args.tool || args.parameters ||
          args.description !== undefined || args.fireOnce !== undefined ||
          args.maxExecutions !== undefined || args.endDate !== undefined) {

        const updatedJob = await this.scheduler.updateJob(jobId, {
          name: args.name,
          schedule: args.schedule,
          tool: args.tool,
          parameters: args.parameters,
          description: args.description,
          fireOnce: args.fireOnce,
          maxExecutions: args.maxExecutions,
          endDate: args.endDate
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: `✅ Job updated successfully!\n\n` +
                  `📋 ${updatedJob.name}\n` +
                  `  • Schedule: ${updatedJob.cronExpression}\n` +
                  `  • Tool: ${updatedJob.tool}\n` +
                  `  • Status: ${updatedJob.status}`
          }]
        };
      } else {
        // Only status change
        const updatedJob = this.scheduler.getJob(jobId)!;
        return {
          success: true,
          content: [{
            type: 'text',
            text: `✅ Job ${args.active ? 'resumed' : 'paused'}: ${updatedJob.name}\n\n` +
                  `Status: ${updatedJob.status}${args.active ? ' - will execute according to schedule' : ' - execution stopped'}`
          }]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        content: [{
          type: 'text',
          text: `❌ Update failed: ${errorMessage}`
        }]
      };
    }
  }

  /**
   * Delete a scheduled job permanently
   */
  private async handleDelete(args: any): Promise<InternalToolResult> {
    let jobId = args.job_id;
    let job = this.scheduler.getJob(jobId);
    if (!job) {
      job = this.scheduler.getJobByName(jobId);
      if (job) jobId = job.id;
    }

    if (!job) {
      return {
        success: false,
        error: `Job not found: ${args.job_id}`,
        content: [{
          type: 'text',
          text: `❌ Job not found: ${args.job_id}`
        }]
      };
    }

    try {
      this.scheduler.deleteJob(jobId);

      return {
        success: true,
        content: [{
          type: 'text',
          text: `✅ Job deleted: ${job.name}\n\nThe job has been permanently removed from the schedule.`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        content: [{
          type: 'text',
          text: `❌ Delete failed: ${errorMessage}`
        }]
      };
    }
  }

  // Helper: Retrieve jobs with filtering
  private async retrieveJobs(filters: { query?: string; jobId?: string; status?: string; limit?: number }): Promise<string> {
    const statusFilter = filters.status === 'all' ? undefined : filters.status as 'active' | 'paused' | 'completed' | 'error' | undefined;
    let jobs = this.scheduler.listJobs(statusFilter);

    // Filter by query
    if (filters.query) {
      const q = filters.query.toLowerCase();
      jobs = jobs.filter(job =>
        job.name.toLowerCase().includes(q) ||
        job.tool.toLowerCase().includes(q) ||
        job.description?.toLowerCase().includes(q)
      );
    }

    // Filter by job ID
    if (filters.jobId) {
      const job = this.scheduler.getJob(filters.jobId) || this.scheduler.getJobByName(filters.jobId);
      jobs = job ? [job] : [];
    }

    // Apply limit
    const limit = filters.limit || 50;
    const limited = jobs.slice(0, limit);

    if (limited.length === 0) {
      return '📋 No jobs found matching the criteria.';
    }

    const jobsList = limited.map(job => {
      const execInfo = job.executionCount > 0
        ? `Executed ${job.executionCount} time${job.executionCount === 1 ? '' : 's'}`
        : 'Not yet executed';

      return `• ${job.name} (${job.status})\n` +
             `  ID: ${job.id}\n` +
             `  Tool: ${job.tool}\n` +
             `  Schedule: ${job.cronExpression}\n` +
             `  ${execInfo}\n` +
             `${job.lastExecutionAt ? `  Last: ${job.lastExecutionAt}\n` : ''}`;
    }).join('\n');

    const stats = this.scheduler.getJobStatistics();

    return `📋 Scheduled Jobs (${limited.length} of ${jobs.length})\n\n` +
           jobsList +
           `\n📊 Statistics:\n` +
           `  • Active: ${stats.active}\n` +
           `  • Paused: ${stats.paused}\n` +
           `  • Completed: ${stats.completed}\n` +
           `  • Error: ${stats.error}`;
  }

  // Helper: Retrieve executions with filtering
  private async retrieveExecutions(filters: { query?: string; jobId?: string; status?: string; limit?: number }): Promise<string> {
    let jobId = filters.jobId;
    if (jobId) {
      let job = this.scheduler.getJob(jobId);
      if (!job) {
        job = this.scheduler.getJobByName(jobId);
        if (job) jobId = job.id;
      }
    }

    const executions = this.scheduler.queryExecutions({
      jobId,
      status: filters.status === 'all' ? undefined : filters.status
    });

    // Filter by query
    let filtered = executions;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      filtered = executions.filter(exec =>
        exec.jobName.toLowerCase().includes(q) ||
        exec.tool.toLowerCase().includes(q)
      );
    }

    const limit = filters.limit || 50;
    const limited = filtered.slice(0, limit);

    if (limited.length === 0) {
      return '📊 No executions found matching the criteria.';
    }

    const executionsList = limited.map(exec => {
      const status = exec.status === 'success' ? '✅' : exec.status === 'failure' ? '❌' : '⏱️';
      const duration = exec.duration ? `${exec.duration}ms` : 'N/A';
      return `${status} ${exec.jobName}\n` +
             `  ID: ${exec.executionId}\n` +
             `  Time: ${exec.startedAt}\n` +
             `  Duration: ${duration}\n` +
             `${exec.errorMessage ? `  Error: ${exec.errorMessage}\n` : ''}`;
    }).join('\n');

    return `📊 Executions (${limited.length} of ${filtered.length})\n\n${executionsList}`;
  }

  // Helper: Get detailed job info
  private getJobDetails(jobId: string): InternalToolResult {
    let job = this.scheduler.getJob(jobId);
    if (!job) {
      job = this.scheduler.getJobByName(jobId);
    }

    if (!job) {
      return {
        success: false,
        error: `Job not found: ${jobId}`,
        content: [{
          type: 'text',
          text: `❌ Job not found: ${jobId}`
        }]
      };
    }

    const execStats = this.scheduler.getExecutionStatistics(job.id);

    return {
      success: true,
      content: [{
        type: 'text',
        text: `📋 Job: ${job.name}\n\n` +
              `🆔 ID: ${job.id}\n` +
              `🔧 Tool: ${job.tool}\n` +
              `⏰ Schedule: ${job.cronExpression}\n` +
              `📊 Status: ${job.status}\n` +
              `🔄 Type: ${job.fireOnce ? 'One-time' : 'Recurring'}\n` +
              `${job.description ? `📝 Description: ${job.description}\n` : ''}` +
              `${job.maxExecutions ? `🔢 Max Executions: ${job.maxExecutions}\n` : ''}` +
              `${job.endDate ? `📅 End Date: ${job.endDate}\n` : ''}` +
              `\n📈 Execution Statistics:\n` +
              `  • Total: ${execStats.total}\n` +
              `  • Success: ${execStats.success}\n` +
              `  • Failure: ${execStats.failure}\n` +
              `  • Timeout: ${execStats.timeout}\n` +
              `${execStats.avgDuration ? `  • Avg Duration: ${Math.round(execStats.avgDuration)}ms\n` : ''}` +
              `\n⚙️ Parameters:\n${JSON.stringify(job.parameters, null, 2)}`
      }]
    };
  }

  // Helper: Get execution details
  private getExecutionDetails(executionId: string): InternalToolResult {
    const execution = this.scheduler.executionRecorder.getExecution(executionId);

    if (!execution) {
      return {
        success: false,
        error: `Execution not found: ${executionId}`,
        content: [{
          type: 'text',
          text: `❌ Execution not found: ${executionId}`
        }]
      };
    }

    const status = execution.status === 'success' ? '✅ Success' :
                   execution.status === 'failure' ? '❌ Failure' :
                   execution.status === 'timeout' ? '⏱️ Timeout' : '🔄 Running';

    return {
      success: true,
      content: [{
        type: 'text',
        text: `📊 Execution: ${execution.executionId}\n\n` +
              `📋 Job: ${execution.jobName} (${execution.jobId})\n` +
              `🔧 Tool: ${execution.tool}\n` +
              `📊 Status: ${status}\n` +
              `⏰ Started: ${execution.startedAt}\n` +
              `${execution.completedAt ? `✅ Completed: ${execution.completedAt}\n` : ''}` +
              `${execution.duration ? `⏱️ Duration: ${execution.duration}ms\n` : ''}` +
              `\n⚙️ Parameters:\n${JSON.stringify(execution.parameters, null, 2)}\n` +
              `${execution.result ? `\n📤 Result:\n${JSON.stringify(execution.result, null, 2)}` : ''}` +
              `${execution.error ? `\n❌ Error: ${execution.error.message}` : ''}`
      }]
    };
  }

  /**
   * List all jobs (simpler alternative to retrieve)
   * Delegates to handleRetrieve with include='jobs'
   */
  private async handleList(args: any): Promise<InternalToolResult> {
    return await this.handleRetrieve({
      include: 'jobs',
      status: args?.status || 'all'
    });
  }

  /**
   * Get specific job details
   * Delegates to handleRetrieve with job_id filter
   */
  private async handleGet(args: any): Promise<InternalToolResult> {
    if (!args?.job_id) {
      return {
        success: false,
        error: 'job_id parameter is required',
        content: [{
          type: 'text',
          text: '❌ job_id parameter is required'
        }]
      };
    }

    return await this.handleRetrieve({
      include: 'jobs',
      job_id: args.job_id
    });
  }

  /**
   * Pause a job (set active=false)
   * Delegates to handleUpdate with active=false
   */
  private async handlePause(args: any): Promise<InternalToolResult> {
    if (!args?.job_id) {
      return {
        success: false,
        error: 'job_id parameter is required',
        content: [{
          type: 'text',
          text: '❌ job_id parameter is required'
        }]
      };
    }

    return await this.handleUpdate({
      job_id: args.job_id,
      active: false
    });
  }

  /**
   * Resume a job (set active=true)
   * Delegates to handleUpdate with active=true
   */
  private async handleResume(args: any): Promise<InternalToolResult> {
    if (!args?.job_id) {
      return {
        success: false,
        error: 'job_id parameter is required',
        content: [{
          type: 'text',
          text: '❌ job_id parameter is required'
        }]
      };
    }

    return await this.handleUpdate({
      job_id: args.job_id,
      active: true
    });
  }

  /**
   * View execution history
   * Delegates to handleRetrieve with include='executions'
   */
  private async handleExecutions(args: any): Promise<InternalToolResult> {
    return await this.handleRetrieve({
      include: 'executions',
      job_id: args?.job_id,
      status: args?.status || 'all',
      limit: args?.limit || 50
    });
  }
}
