/**
 * NCP Orchestrator - Real MCP Connections
 * Based on commercial NCP implementation
 */

import { readFileSync, existsSync } from 'fs';
import { getCacheDirectory } from '../utils/ncp-paths.js';
import { join } from 'path';
import * as path from 'path';
import { createHash } from 'crypto';
import ProfileManager from '../profiles/profile-manager.js';
import { logger } from '../utils/logger.js';
import { version } from '../utils/version.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { DiscoveryEngine } from '../discovery/engine.js';
import { MCPHealthMonitor } from '../utils/health-monitor.js';
import { SearchEnhancer } from '../discovery/search-enhancer.js';
import { mcpWrapper } from '../utils/mcp-wrapper.js';
import { withFilteredOutput } from '../transports/filtered-stdio-transport.js';
import { ToolSchemaParser, ParameterInfo } from '../services/tool-schema-parser.js';
import { InternalMCPManager } from '../internal-mcps/internal-mcp-manager.js';
import { ToolContextResolver } from '../services/tool-context-resolver.js';
import type { OAuthConfig } from '../auth/oauth-device-flow.js';
import { getRuntimeForExtension, logRuntimeInfo } from '../utils/runtime-detector.js';
import { getFileWatcher } from '../services/file-watcher.js';
// Simple string similarity for tool name matching
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Exact match
  if (s1 === s2) return 1.0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }

  // Simple Levenshtein-based similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(s1, s2);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
import { CachePatcher } from '../cache/cache-patcher.js';
import { CSVCache, CachedTool } from '../cache/csv-cache.js';
import { spinner } from '../utils/progress-spinner.js';
import { MCPUpdateChecker } from '../utils/mcp-update-checker.js';
import { CodeExecutor } from '../code-mode/code-executor.js';
import { NetworkPolicyManager, SECURE_NETWORK_POLICY, type ElicitationFunction } from '../code-mode/network-policy.js';
import type { ElicitationServer } from '../utils/elicitation-helper.js';
import { loadGlobalSettings } from '../utils/global-settings.js';

interface DiscoveryResult {
  toolName: string;
  mcpName: string;
  confidence: number;
  description?: string;
  schema?: any;
}

interface ExecutionResult {
  success: boolean;
  content?: any;
  error?: string;
}

interface MCPConfig {
  name: string;
  command?: string;  // Optional: for stdio transport
  args?: string[];
  env?: Record<string, string>;
  url?: string;  // Optional: for HTTP/SSE transport (Claude Desktop native)
  auth?: {
    type: 'oauth' | 'bearer' | 'apiKey' | 'basic';
    oauth?: OAuthConfig;  // OAuth 2.0 Device Flow configuration
    token?: string;       // Bearer token or API key
    username?: string;    // Basic auth username
    password?: string;    // Basic auth password
  };
}

interface Profile {
  name: string;
  description: string;
  mcpServers: Record<string, {
    command?: string;  // Optional: for stdio transport
    args?: string[];
    env?: Record<string, string>;
    url?: string;  // Optional: for HTTP/SSE transport
    auth?: {
      type: 'oauth' | 'bearer' | 'apiKey' | 'basic';
      oauth?: OAuthConfig;  // OAuth 2.0 Device Flow configuration
      token?: string;       // Bearer token or API key
      username?: string;    // Basic auth username
      password?: string;    // Basic auth password
    };
  }>;
  metadata?: any;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: Array<{name: string; description: string}>;
  serverInfo?: {
    name: string;
    title?: string;
    version: string;
    description?: string;
    websiteUrl?: string;
  };
  lastUsed: number;
  connectTime: number;
  executionCount: number;
}

interface MCPDefinition {
  name: string;
  config: MCPConfig;
  tools: Array<{name: string; description: string; inputSchema?: any}>;
  serverInfo?: {
    name: string;
    title?: string;
    version: string;
    description?: string;
    websiteUrl?: string;
  };
}

export class NCPOrchestrator {
  private definitions: Map<string, MCPDefinition> = new Map();
  private connections: Map<string, MCPConnection> = new Map();
  private toolToMCP: Map<string, string> = new Map();
  private allTools: Array<{ name: string; description: string; mcpName: string }> = [];
  private profileName: string;
  private readonly QUICK_PROBE_TIMEOUT = 8000; // 8 seconds - first attempt
  private readonly SLOW_PROBE_TIMEOUT = 30000; // 30 seconds - retry for slow MCPs
  private readonly CONNECTION_TIMEOUT = 10000; // 10 seconds
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // Check every minute
  private readonly MAX_CONNECTIONS = 50; // Maximum concurrent connections (prevents memory leaks)
  private readonly MAX_EXECUTIONS_PER_CONNECTION = 1000; // Force reconnect after this many uses
  private cleanupTimer?: NodeJS.Timeout;
  private discovery: DiscoveryEngine;
  private healthMonitor: MCPHealthMonitor;
  private cachePatcher: CachePatcher;
  private csvCache: CSVCache;
  private updateChecker: MCPUpdateChecker;
  private showProgress: boolean;
  private indexingProgress: { current: number; total: number; currentMCP: string; estimatedTimeRemaining?: number } | null = null;
  private indexingStartTime: number = 0;
  private profileManager: ProfileManager | null = null;
  private internalMCPManager: InternalMCPManager;
  private backgroundInitPromise: Promise<void> | null = null;
  private newlyIndexedMCPs: Set<string> = new Set();  // Track MCPs indexed in current run
  private cliScanner: any = null; // CLIScanner instance for query-specific enhancement
  private codeExecutor: CodeExecutor;
  private skillsManager: any = null; // SkillsManager instance for loading agent skills
  private skillPrompts: Map<string, any> = new Map(); // Store loaded skill objects
  private fileWatcher: any = null; // FileWatcher instance for dynamic skill/photon discovery

  private forceRetry: boolean = false;

  // Actual client info (passthrough to downstream MCPs for transparency)
  private clientInfo: { name: string; version: string } = { name: 'ncp-oss', version: version };

  /**
   * ⚠️ CRITICAL: Default profile MUST be 'all' - DO NOT CHANGE!
   *
   * The 'all' profile is the universal profile that contains all MCPs.
   * This default is used by MCPServer and all CLI commands.
   *
   * DO NOT change this to 'default' or any other name - it will break everything.
   */
  constructor(profileName: string = 'all', showProgress: boolean = false, forceRetry: boolean = false) {
    this.profileName = profileName;
    this.discovery = new DiscoveryEngine();
    this.healthMonitor = new MCPHealthMonitor();
    this.cachePatcher = new CachePatcher();
    this.csvCache = new CSVCache(getCacheDirectory(), profileName);
    this.updateChecker = new MCPUpdateChecker();
    this.showProgress = showProgress;
    this.forceRetry = forceRetry;
    this.internalMCPManager = new InternalMCPManager();

    // Initialize CodeExecutor with tools provider, executor, and Photon instances
    this.codeExecutor = new CodeExecutor(
      // Tools provider - returns all available tools
      async () => {
        const tools: any[] = [];

        // Add NCP core tools for progressive disclosure
        tools.push({
          name: 'ncp:find',
          description: 'Search or list tools. Progressive disclosure pattern.',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Search query or MCP filter. Omit to list all.'
              },
              limit: {
                type: 'number',
                description: 'Max results (default: 5 search, 20 list)'
              },
              page: {
                type: 'number',
                description: 'Page number (default: 1)'
              },
              confidence_threshold: {
                type: 'number',
                description: 'Min confidence 0.0-1.0 (default: 0.35)'
              },
              depth: {
                type: 'number',
                description: 'Detail: 0=names, 1=+desc, 2=+params (default: 2)'
              }
            }
          }
        });

        tools.push({
          name: 'ncp:run',
          description: 'Execute tool by name (mcp:tool). Use for dynamic execution.',
          inputSchema: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                description: 'Tool (format: mcp:tool)'
              },
              parameters: {
                type: 'object',
                description: 'Tool parameters'
              }
            },
            required: ['tool']
          }
        });

        // Add all tools from definitions (external MCPs)
        for (const [mcpName, definition] of this.definitions.entries()) {
          for (const tool of definition.tools) {
            tools.push({
              name: `${mcpName}:${tool.name}`,
              description: tool.description || '',
              inputSchema: tool.inputSchema || { type: 'object', properties: {} }
            });
          }
        }

        // Add internal MCP tools
        const internalMCPs = this.internalMCPManager.getAllEnabledInternalMCPs();
        for (const internalMCP of internalMCPs) {
          for (const tool of internalMCP.tools) {
            tools.push({
              name: `${internalMCP.name}:${tool.name}`,
              description: tool.description || '',
              inputSchema: tool.inputSchema || { type: 'object', properties: {} }
            });
          }
        }

        // Add individual skill tools (Agent Skills from ~/.ncp/skills)
        // Note: SkillsManagementMCP provides skills:find/list/add/remove for managing skills
        // Individual loaded skills are exposed as skill:skillName tools (singular)
        for (const [skillName, skill] of this.skillPrompts.entries()) {
          tools.push({
            name: `skill:${skillName}`,
            description: skill.metadata.description || 'Anthropic Agent Skill',
            inputSchema: {
              type: 'object',
              properties: {
                depth: {
                  type: 'number',
                  enum: [1, 2, 3],
                  default: 2,
                  description: 'Progressive disclosure level: 1=metadata, 2=+content, 3=+files'
                }
              }
            }
          });
        }

        return tools;
      },
      // Tool executor - executes a tool by name
      async (toolName: string, params: any) => {
        // Handle NCP core tools specially
        if (toolName === 'ncp:find') {
          const { ToolFinder } = await import('../services/tool-finder.js');
          const { ToolSchemaParser } = await import('../services/tool-schema-parser.js');
          const findResultTypes = await import('../types/find-result.js');

          const finder = new ToolFinder(this);
          const findResult = await finder.find({
            query: params.description || '',
            page: params.page || 1,
            limit: params.limit || (params.description ? 5 : 20),
            depth: params.depth !== undefined ? params.depth : 2,
            confidenceThreshold: params.confidence_threshold !== undefined ? params.confidence_threshold : 0.35
          });

          // Convert to structured format for Code-Mode
          const healthStatus = this.getMCPHealthStatus();
          const indexingProgress = this.getIndexingProgress();

          // Convert tools to structured format
          const structuredTools = findResult.tools.map(tool => {
            const [mcpName, ...toolParts] = tool.toolName.split(':');
            const toolName = toolParts.join(':');

            // Parse parameters from schema
            let parameters: any[] = [];
            if (tool.schema) {
              const parsedParams = ToolSchemaParser.parseParameters(tool.schema);
              parameters = parsedParams.map(p => ({
                name: p.name,
                type: p.type,
                description: p.description,
                required: p.required
              }));
            }

            return {
              name: tool.toolName,
              mcp: mcpName,
              tool: toolName,
              description: tool.description || '',
              confidence: tool.confidence || 1.0,
              parameters,
              schema: tool.schema,
              healthy: tool.healthy !== false
            };
          });

          const structured = {
            tools: structuredTools,
            pagination: {
              page: findResult.pagination.page,
              totalPages: findResult.pagination.totalPages,
              totalResults: findResult.pagination.totalResults,
              resultsInPage: findResult.pagination.resultsInPage
            },
            health: {
              total: healthStatus.total,
              healthy: healthStatus.healthy,
              unhealthy: healthStatus.unhealthy,
              mcps: healthStatus.mcps.map(mcp => ({
                name: mcp.name,
                healthy: mcp.healthy
              }))
            },
            indexing: indexingProgress ? {
              current: indexingProgress.current,
              total: indexingProgress.total,
              currentMCP: indexingProgress.currentMCP,
              estimatedTimeRemaining: indexingProgress.estimatedTimeRemaining
            } : undefined,
            mcpFilter: findResult.mcpFilter || undefined,
            query: params.description || undefined,
            isListing: findResult.isListing
          };

          return structured;
        } else if (toolName === 'ncp:run') {
          const result = await this.run(params.tool, params.parameters || {});
          if (result.success) {
            return result.content;
          } else {
            // Provide better error messages when error field is missing
            const errorMessage = result.error ||
              (typeof result.content === 'string' && result.content ? result.content : `Failed to execute tool: ${params.tool}`);
            throw new Error(errorMessage);
          }
        }

        // Handle scheduler tools specially in Code-Mode - return structured objects
        if (toolName.startsWith('schedule:')) {
          const schedulerTool = toolName.replace('schedule:', '');
          const schedulerMCP = this.internalMCPManager.getAllEnabledInternalMCPs().find(mcp => mcp.name === 'schedule');

          if (!schedulerMCP || !('scheduler' in schedulerMCP)) {
            throw new Error('Scheduler MCP not available');
          }

          const scheduler = (schedulerMCP as any).scheduler;

          // Handle each scheduler tool with structured responses
          switch (schedulerTool) {
            case 'create': {
              const task = await scheduler.createTask({
                name: params.name,
                schedule: params.schedule,
                timezone: params.timezone,
                tool: params.tool,
                parameters: params.parameters,
                description: params.description,
                fireOnce: params.fireOnce,
                maxExecutions: params.maxExecutions,
                endDate: params.endDate,
                testRun: params.testRun,
                skipValidation: params.skipValidation
              });

              // If created as paused, pause it immediately
              if (params.active === false) {
                scheduler.pauseTask(task.id);
              }

              return {
                success: true,
                task: {
                  id: task.id,
                  name: task.name,
                  tool: task.tool,
                  schedule: task.cronExpression,
                  timezone: task.timezone,
                  status: params.active === false ? 'paused' : task.status,
                  fireOnce: task.fireOnce,
                  description: task.description,
                  maxExecutions: task.maxExecutions,
                  endDate: task.endDate,
                  createdAt: task.createdAt,
                  executionCount: task.executionCount
                }
              };
            }

            case 'list': {
              const statusFilter = params.status === 'all' ? undefined : params.status;
              const tasks = scheduler.listTasks(statusFilter);
              const stats = scheduler.getTaskStatistics();

              return {
                success: true,
                tasks: tasks.map((task: any) => ({
                  id: task.id,
                  name: task.name,
                  tool: task.tool,
                  schedule: task.cronExpression,
                  timezone: task.timezone,
                  status: task.status,
                  executionCount: task.executionCount,
                  lastExecutionAt: task.lastExecutionAt,
                  createdAt: task.createdAt
                })),
                statistics: {
                  total: stats.totalTasks,
                  active: stats.activeTasks,
                  paused: stats.pausedTasks,
                  completed: stats.completedTasks,
                  error: stats.errorTasks
                }
              };
            }

            case 'get': {
              let task = scheduler.getTask(params.job_id);
              if (!task) {
                task = scheduler.getTaskByName(params.job_id);
              }

              if (!task) {
                throw new Error(`Task not found: ${params.job_id}`);
              }

              const execStats = scheduler.getExecutionStatistics(task.id);

              return {
                success: true,
                task: {
                  id: task.id,
                  name: task.name,
                  tool: task.tool,
                  parameters: task.parameters,
                  schedule: task.cronExpression,
                  timezone: task.timezone,
                  status: task.status,
                  fireOnce: task.fireOnce,
                  description: task.description,
                  maxExecutions: task.maxExecutions,
                  endDate: task.endDate,
                  createdAt: task.createdAt,
                  executionCount: task.executionCount,
                  lastExecutionAt: task.lastExecutionAt,
                  lastExecutionId: task.lastExecutionId
                },
                statistics: {
                  total: execStats.total,
                  success: execStats.success,
                  failure: execStats.failure,
                  timeout: execStats.timeout,
                  avgDuration: execStats.avgDuration
                }
              };
            }

            case 'update': {
              const updatedTask = await scheduler.updateTask(params.job_id, {
                name: params.name,
                schedule: params.schedule,
                timezone: params.timezone,
                tool: params.tool,
                parameters: params.parameters,
                description: params.description,
                fireOnce: params.fireOnce,
                maxExecutions: params.maxExecutions,
                endDate: params.endDate
              });

              // Handle active state change separately
              if (params.active !== undefined) {
                if (params.active) {
                  scheduler.resumeTask(params.job_id);
                } else {
                  scheduler.pauseTask(params.job_id);
                }
              }

              // Get fresh task after status change
              const task = scheduler.getTask(updatedTask.id);

              return {
                success: true,
                task: {
                  id: task.id,
                  name: task.name,
                  tool: task.tool,
                  schedule: task.cronExpression,
                  timezone: task.timezone,
                  status: task.status,
                  fireOnce: task.fireOnce,
                  description: task.description,
                  createdAt: task.createdAt,
                  executionCount: task.executionCount
                }
              };
            }

            case 'delete': {
              let task = scheduler.getTask(params.job_id);
              if (!task) {
                task = scheduler.getTaskByName(params.job_id);
              }

              if (!task) {
                throw new Error(`Task not found: ${params.job_id}`);
              }

              scheduler.deleteTask(task.id);

              return {
                success: true,
                deleted: {
                  id: task.id,
                  name: task.name
                }
              };
            }

            case 'pause': {
              let task = scheduler.getTask(params.job_id);
              if (!task) {
                task = scheduler.getTaskByName(params.job_id);
              }

              if (!task) {
                throw new Error(`Task not found: ${params.job_id}`);
              }

              scheduler.pauseTask(task.id);

              return {
                success: true,
                task: {
                  id: task.id,
                  name: task.name,
                  status: 'paused'
                }
              };
            }

            case 'resume': {
              let task = scheduler.getTask(params.job_id);
              if (!task) {
                task = scheduler.getTaskByName(params.job_id);
              }

              if (!task) {
                throw new Error(`Task not found: ${params.job_id}`);
              }

              scheduler.resumeTask(task.id);

              return {
                success: true,
                task: {
                  id: task.id,
                  name: task.name,
                  status: 'active'
                }
              };
            }

            case 'executions': {
              const executions = scheduler.queryExecutions({
                jobId: params.job_id,
                status: params.status === 'all' ? undefined : params.status
              });

              const limited = executions.slice(0, params.limit || 50);

              return {
                success: true,
                executions: limited.map((exec: any) => ({
                  executionId: exec.executionId,
                  taskId: exec.taskId || exec.jobId,
                  taskName: exec.taskName || exec.jobName,
                  tool: exec.tool,
                  status: exec.status,
                  startedAt: exec.startedAt,
                  duration: exec.duration,
                  errorMessage: exec.errorMessage
                })),
                total: limited.length
              };
            }

            case 'validate': {
              const { ToolValidator } = await import('../services/scheduler/tool-validator.js');
              const validator = new ToolValidator(this);

              const result = await validator.validateTool(params.tool, params.parameters);

              // Validate schedule if provided
              if (params.schedule) {
                const { NaturalLanguageParser } = await import('../services/scheduler/natural-language-parser.js');
                const scheduleResult = NaturalLanguageParser.parseSchedule(params.schedule);

                if (!scheduleResult.success) {
                  result.valid = false;
                  result.errors.push(`Invalid schedule: ${scheduleResult.error}`);
                }
              }

              return {
                success: true,
                validation: {
                  valid: result.valid,
                  errors: result.errors,
                  warnings: result.warnings,
                  validationMethod: result.validationMethod,
                  schema: result.schema
                }
              };
            }

            default:
              throw new Error(`Unknown scheduler tool: ${schedulerTool}`);
          }
        }

        // Handle regular tools
        const result = await this.run(toolName, params);
        if (result.success) {
          return result.content;
        } else {
          // Provide better error messages when error field is missing
          const errorMessage = result.error ||
            (typeof result.content === 'string' && result.content ? result.content : `Failed to execute tool: ${toolName}`);
          throw new Error(errorMessage);
        }
      },
      // Photon instances provider - provides direct access to Photon class instances
      async () => {
        const photons: any[] = [];
        const internalMCPs = this.internalMCPManager.getAllEnabledInternalMCPs();

        for (const internalMCP of internalMCPs) {
          // Check if this is a Photon (has instance property)
          if ('instance' in internalMCP && internalMCP.instance) {
            const methods = internalMCP.tools.map(tool => tool.name);
            photons.push({
              name: internalMCP.name,
              instance: internalMCP.instance,
              methods
            });
          }
        }

        return photons;
      }
                );
            }
          
            private async loadProfile(): Promise<Profile | null> {    try {
      // Create and store ProfileManager instance (reused for auto-import)
      if (!this.profileManager) {
        this.profileManager = new ProfileManager();
        await this.profileManager.initialize();

        // Load global settings and set environment variables BEFORE loading photons
        // This ensures NCP_ENABLE_PHOTON_RUNTIME is set correctly
        await loadGlobalSettings();

        // Initialize internal MCPs with ProfileManager
        this.internalMCPManager.initialize(this.profileManager);

        // Load Photon classes from standard directories
        await this.internalMCPManager.loadPhotons();

        // Inject orchestrator into SchedulerMCP for tool validation (Phase 1 Step 4)
        const allInternalMCPs = this.internalMCPManager.getAllEnabledInternalMCPs();

        // Inject orchestrator into SchedulerMCP
        const schedulerMCP = allInternalMCPs.find(mcp => mcp.name === 'schedule');
        if (schedulerMCP && 'setOrchestrator' in schedulerMCP) {
          logger.info('[NCPOrchestrator] Injecting orchestrator into SchedulerMCP');
          (schedulerMCP as any).setOrchestrator(this);
        }

        // Inject orchestrator into IntelligenceMCP
        const intelligenceMCP = allInternalMCPs.find(mcp => mcp.name === 'intelligence');
        if (intelligenceMCP && 'setOrchestrator' in intelligenceMCP) {
          logger.info('[NCPOrchestrator] Injecting orchestrator into IntelligenceMCP');
          (intelligenceMCP as any).setOrchestrator(this);
        }

        // Inject orchestrator into CodeMCP
        const codeMCP = allInternalMCPs.find(mcp => mcp.name === 'ncp');
        if (codeMCP && 'setOrchestratorOnCodeMCP' in this.internalMCPManager) {
          logger.info('[NCPOrchestrator] Injecting orchestrator into CodeMCP');
          this.internalMCPManager.setOrchestratorOnCodeMCP(this);
        }
      }

      const profile = await this.profileManager.getProfile(this.profileName);

      if (!profile) {
        logger.error(`Profile not found: ${this.profileName}`);
        return null;
      }

      return profile;
    } catch (error: any) {
      logger.error(`Failed to load profile: ${error.message}`);
      return null;
    }
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    this.indexingStartTime = startTime;

    // Clear newly indexed MCPs set for this initialization run
    this.newlyIndexedMCPs.clear();

    // Debug logging
    if (process.env.NCP_DEBUG === 'true') {
      logger.debug(`[DEBUG ORC] Initializing with profileName: ${this.profileName}`);
      logger.debug(`[DEBUG ORC] Cache will use: ${this.csvCache ? 'csvCache exists' : 'NO CACHE'}`);
    }

    logger.info(`Initializing NCP orchestrator with profile: ${this.profileName}`);

    // Log runtime detection info (how NCP is running)
    if (process.env.NCP_DEBUG === 'true') {
      logRuntimeInfo();
    }

    // Initialize progress immediately to prevent race condition
    // Total will be updated once we know how many MCPs need indexing
    this.indexingProgress = {
      current: 0,
      total: 0,
      currentMCP: 'initializing...'
    };

    const profile = await this.loadProfile();

    if (process.env.NCP_DEBUG === 'true') {
      logger.debug(`[DEBUG ORC] Loaded profile: ${profile ? 'YES' : 'NO'}`);
      if (profile) {
        logger.debug(`[DEBUG ORC] Profile MCPs: ${Object.keys(profile.mcpServers || {}).join(', ')}`);
      }
    }

    if (!profile) {
      logger.error('Failed to load profile');
      this.indexingProgress = null;
      return;
    }

    // CRITICAL FIX: Load cached tool definitions IMMEDIATELY so code-mode has MCP namespaces available
    // This is fast (just reading JSON) and prevents "gmail is not defined" errors
    try {
      const mcpConfigs: MCPConfig[] = Object.entries(profile.mcpServers).map(([name, config]) => ({
        name,
        command: config.command,
        args: config.args,
        env: config.env || {},
        url: config.url
      }));

      // Initialize CSV cache
      await this.csvCache.initialize();

      // Get profile hash for cache validation
      const profileHash = CSVCache.hashProfile(profile.mcpServers);

      // Check if cache is valid
      const cacheValid = await this.csvCache.validateCache(profileHash);

      if (cacheValid) {
        // Load from cache immediately so tools are available for code-mode
        logger.info('Loading tools from CSV cache for immediate availability...');
        await this.loadFromCSVCache(mcpConfigs);
        logger.info(`Loaded ${this.definitions.size} MCPs from cache`);
      } else {
        logger.info('Cache invalid - tools will be available after background indexing');
      }
    } catch (error: any) {
      logger.warn(`Failed to load cached tools: ${error.message} - code-mode may have limited namespaces initially`);
    }

    // CRITICAL: Run ALL heavy initialization in background to avoid blocking MCP startup
    // MCP protocol requires fast startup - Claude Desktop will timeout and disconnect otherwise
    this.backgroundInitPromise = this.runBackgroundInitialization(profile).catch(err => {
      logger.error(`Background initialization failed: ${err}`);
      throw err; // Re-throw to propagate to waiters
    });

    logger.info('MCP server ready - background initialization in progress');
  }

  /**
   * Run heavy initialization in background (non-blocking)
   */
  private async runBackgroundInitialization(profile: Profile): Promise<void> {
    // Initialize discovery engine (loads embeddings from disk - can be slow)
    await this.discovery.initialize();

    // Connect RAG engine to InternalMCPManager for smart re-indexing
    const ragEngine = (this.discovery as any).ragEngine;
    if (ragEngine) {
      this.internalMCPManager.setRAGEngine(ragEngine);
    }

    // Check environment variables and disable internal MCPs if requested
    const enableScheduleMCP = process.env.NCP_ENABLE_SCHEDULE_MCP !== 'false';
    const enableMcpManagement = process.env.NCP_ENABLE_MCP_MANAGEMENT !== 'false';
    const enableSkills = process.env.NCP_ENABLE_SKILLS !== 'false';

    if (!enableScheduleMCP) {
      logger.info('Schedule MCP disabled via configuration');
      await this.internalMCPManager.disableInternalMCP('schedule');
    }

    if (!enableMcpManagement) {
      logger.info('MCP Management disabled via configuration');
      await this.internalMCPManager.disableInternalMCP('mcp');
    }

    // Add internal MCPs immediately so they're always available
    await this.addInternalMCPsToDiscovery();

    // Load skills from ~/.ncp/skills
    if (enableSkills) {
      await this.loadSkills();
    } else {
      logger.info('Skills disabled via configuration');
    }

    // Note: Cache initialization and loading moved to initialize() for immediate availability
    // Get profile hash to check if we need re-indexing
    const profileHash = CSVCache.hashProfile(profile.mcpServers);
    const cacheValid = await this.csvCache.validateCache(profileHash);

    const mcpConfigs: MCPConfig[] = Object.entries(profile.mcpServers).map(([name, config]) => ({
      name,
      command: config.command,
      args: config.args,
      env: config.env || {},
      url: config.url  // HTTP/SSE transport support
    }));

    if (!cacheValid) {
      // Cache invalid - clear it to force full re-indexing
      logger.info('Cache invalid, clearing for full re-index...');
      await this.csvCache.clear();
      await this.csvCache.initialize();
    }

    const startTime = this.indexingStartTime;

    // Get list of MCPs that need indexing
    const indexedMCPs = this.csvCache.getIndexedMCPs();
    const mcpsToIndex = mcpConfigs.filter(config => {
      // Skip CLI tools - they are loaded from cache only, no connection needed
      if (config.env && config.env.NCP_CLI_TOOL === 'true') {
        logger.debug(`Skipping connection for CLI tool: ${config.name}`);
        return false;
      }

      const tools = profile.mcpServers[config.name];
      const currentHash = CSVCache.hashProfile(tools);

      // Check if already indexed
      if (this.csvCache.isMCPIndexed(config.name, currentHash)) {
        return false;
      }

      // Check if failed and should retry
      return this.csvCache.shouldRetryFailed(config.name, this.forceRetry);
    });

    if (mcpsToIndex.length > 0) {
      // Update progress tracking with actual count
      if (this.indexingProgress) {
        this.indexingProgress.total = mcpsToIndex.length;
      }

      if (this.showProgress) {
        const action = 'Indexing';
        const cachedCount = this.csvCache.getIndexedMCPs().size;

        // Count only failed MCPs that are NOT being retried in this run
        const allFailedCount = this.csvCache.getFailedMCPsCount();
        const retryingNowCount = mcpsToIndex.filter(config => {
          // Check if this MCP is in the failed list (being retried)
          return this.csvCache.isMCPFailed(config.name);
        }).length;
        const failedNotRetryingCount = allFailedCount - retryingNowCount;

        const totalProcessed = cachedCount + failedNotRetryingCount;
        const statusMsg = `${action} MCPs: ${totalProcessed}/${mcpConfigs.length}`;
        spinner.start(statusMsg);
        spinner.updateSubMessage('Initializing discovery engine...');
      }

      // Start incremental cache writing
      await this.csvCache.startIncrementalWrite(profileHash);

      // Index only the MCPs that need it
      await this.discoverMCPTools(mcpsToIndex, profile, true, mcpConfigs.length);

      // Finalize cache
      await this.csvCache.finalize();

      // Save tool metadata (including schemas) to optimized cache
      await this.saveToCache(profile);

      if (this.showProgress) {
        const successfulMCPs = this.definitions.size;
        const failedMCPs = this.csvCache.getFailedMCPsCount();
        const totalProcessed = successfulMCPs + failedMCPs;

        if (failedMCPs > 0) {
          spinner.success(`Indexed ${this.allTools.length} tools from ${successfulMCPs} MCPs | ${failedMCPs} failed (will retry later)`);
        } else {
          spinner.success(`Indexed ${this.allTools.length} tools from ${successfulMCPs} MCPs`);
        }
      }
    }

    // Clear progress tracking once complete
    this.indexingProgress = null;

    // Start cleanup timer for idle connections
    this.cleanupTimer = setInterval(
      () => this.cleanupIdleConnections(),
      this.CLEANUP_INTERVAL
    );

    const externalMCPs = this.definitions.size;
    const internalMCPs = this.internalMCPManager.getAllInternalMCPs().length;
    const loadTime = Date.now() - startTime;
    logger.info(`🚀 NCP initialized in ${loadTime}ms with ${this.allTools.length} tools from ${externalMCPs} external + ${internalMCPs} internal MCPs`);

    // Code-Mode tools are now loaded dynamically on each execution (UTCP pattern)
    logger.info('✅ Code-Mode ready (tools loaded on-demand)');

    // Trigger CLI auto-discovery if shell access is available
    await this.maybeAutoScanCLITools();

    // Start FileWatcher for dynamic skill and photon discovery
    await this.startFileWatcher();
  }

  /**
   * Set elicitation server for runtime network permissions
   * Creates adapter to convert ElicitationServer format to NetworkPolicy format
   * Called from MCPServer after construction to wire up elicitation support
   */
  setElicitationServer(elicitationServer: ElicitationServer): void {
    logger.info('🔐 Wiring up elicitation function for runtime network permissions');

    // Create adapter function that converts ElicitationServer.elicitInput
    // to NetworkPolicy's ElicitationFunction format
    const elicitationAdapter: ElicitationFunction = async (params) => {
      try {
        // Call elicitInput with our schema format
        const result = await elicitationServer.elicitInput({
          message: params.message,
          requestedSchema: {
            type: 'object',
            properties: {
              choice: {
                type: 'string',
                enum: params.options || ['Allow Once', 'Allow Always', 'Deny'],
                description: params.title || 'Network Access Permission'
              }
            },
            required: ['choice']
          }
        });

        // Convert result to string format expected by NetworkPolicyManager
        if (result.action === 'accept' && result.content && result.content.choice) {
          return result.content.choice;
        }

        // User declined or cancelled - treat as Deny
        return 'Deny';
      } catch (error: any) {
        logger.warn(`Elicitation failed: ${error.message}`);
        // If elicitation fails, deny access (fail-safe)
        return 'Deny';
      }
    };

    // Create NetworkPolicyManager with elicitation support
    const networkPolicy = new NetworkPolicyManager(
      SECURE_NETWORK_POLICY,
      elicitationAdapter
    );

    // Update CodeExecutor with new NetworkPolicyManager
    this.codeExecutor.setNetworkPolicyManager(networkPolicy);

    logger.info('✅ Runtime network permissions enabled via elicitations');
  }

  /**
   * Conditionally trigger CLI auto-discovery
   * Enhances vector search by indexing available CLI tools when shell MCP is present
   * Enable with: export NCP_CLI_AUTOSCAN=true
   */
  private async maybeAutoScanCLITools(): Promise<void> {
    // Opt-in only - disabled by default
    if (process.env.NCP_CLI_AUTOSCAN !== 'true') {
      logger.debug('CLI auto-scan not enabled (set NCP_CLI_AUTOSCAN=true to enable)');
      return;
    }

    // Check if shell access is available (external or internal MCPs)
    const hasExternalShell = this.definitions.has('Shell') ||
                             this.definitions.has('desktop-commander');
    const hasInternalShell = this.internalMCPManager.isInternalMCP('shell') &&
                             !this.internalMCPManager.isInternalMCPDisabled('shell');

    const hasShellAccess = hasExternalShell || hasInternalShell;

    if (!hasShellAccess) {
      logger.debug('No shell MCP detected, skipping CLI auto-scan');
      return;
    }

    logger.info('🔍 Shell MCP detected, scanning CLI tools to enhance search...');

    // Run scan in background (non-blocking)
    this.runBackgroundCliScan().catch(err => {
      logger.warn(`CLI auto-scan failed: ${err}`);
    });
  }


  /**
   * Load and register agent skills from ~/.ncp/skills
   *
   * Skills are discoverable via find (like internal MCPs) with skill: prefix
   * Each skill is ONE discoverable entity with progressive disclosure via depth parameter
   */
  private async loadSkills(): Promise<void> {
    try {
      const { SkillsManager } = await import('../services/skills-manager.js');
      this.skillsManager = new SkillsManager();

      const skills = await this.skillsManager.loadAllSkills();

      // Add each skill to discovery (like internal MCPs/Photons)
      const skillTools = [];
      for (const skill of skills) {
        // Store full skill object for execution
        this.skillPrompts.set(skill.metadata.name, skill);

        // Add to discovery with skill: prefix (like mcp-name:tool)
        const skillToolName = `skill:${skill.metadata.name}`;

        this.allTools.push({
          name: skillToolName,
          description: skill.metadata.description || 'Anthropic Agent Skill',
          mcpName: '__skills__',  // Special namespace like internal MCPs
        });

        // Collect for indexing (use unprefixed name - indexMCPTools will add prefix)
        skillTools.push({
          name: skill.metadata.name,
          description: skill.metadata.description || 'Anthropic Agent Skill'
        });

        // Map both skill:name and skill.name for lookup (support both notations)
        this.toolToMCP.set(skillToolName, '__skills__');
        this.toolToMCP.set(`skill.${skill.metadata.name}`, '__skills__');
        this.toolToMCP.set(skill.metadata.name, '__skills__');

        logger.debug(`  ✓ skill:${skill.metadata.name}${skill.metadata.description ? ': ' + skill.metadata.description : ''}`);
      }

      if (skills.length > 0) {
        // Index skills for semantic search
        // We need special handling because skills use 'skill:name' format but are stored under '__skills__'
        // Add id property to tools so RAG engine uses correct IDs
        const skillToolsWithIds = skillTools.map(tool => ({
          ...tool,
          id: `skill:${tool.name}`  // Ensure RAG uses 'skill:' prefix, not '__skills__:'
        }));

        // Debug: Log what we're indexing
        logger.debug(`[SKILLS DEBUG] Indexing ${skillToolsWithIds.length} skills:`);
        skillToolsWithIds.forEach(t => logger.debug(`  - id: ${t.id}, name: ${t.name}`));

        // Index using discovery engine (handles both fallback and RAG indexing)
        await this.discovery.indexMCPTools('skill', skillToolsWithIds);

        logger.info(`📚 Loaded ${skills.length} skill(s) into discovery`);
      }
    } catch (error: any) {
      logger.warn(`Failed to load skills: ${error.message}`);
    }
  }

  /**
   * Dynamically add a skill (for file watching)
   */
  async addSkill(skillName: string, skillPath: string): Promise<void> {
    try {
      if (!this.skillsManager) return;

      // Load the skill
      const skill = await this.skillsManager.loadSkill(path.basename(path.dirname(skillPath)));
      if (!skill) {
        logger.warn(`Failed to load skill: ${skillName}`);
        return;
      }

      // Store the skill
      this.skillPrompts.set(skill.metadata.name, skill);

      // Add to allTools
      const skillToolName = `skill:${skill.metadata.name}`;
      this.allTools.push({
        name: skillToolName,
        description: skill.metadata.description || 'Anthropic Agent Skill',
        mcpName: '__skills__',
      });

      // Add to toolToMCP mappings
      this.toolToMCP.set(skillToolName, '__skills__');
      this.toolToMCP.set(`skill.${skill.metadata.name}`, '__skills__');
      this.toolToMCP.set(skill.metadata.name, '__skills__');

      // Index in discovery
      await this.discovery.indexMCPTools('skill', [{
        id: `skill:${skill.metadata.name}`,
        name: skill.metadata.name,
        description: skill.metadata.description || 'Anthropic Agent Skill'
      }]);

      logger.info(`✨ Dynamically added skill: ${skill.metadata.name}`);
    } catch (error: any) {
      logger.error(`Failed to dynamically add skill ${skillName}: ${error.message}`);
    }
  }

  /**
   * Dynamically remove a skill (for file watching)
   */
  async removeSkill(skillName: string): Promise<void> {
    try {
      // Remove from skillPrompts
      this.skillPrompts.delete(skillName);

      // Remove from allTools
      const skillToolName = `skill:${skillName}`;
      this.allTools = this.allTools.filter(t => t.name !== skillToolName);

      // Remove from toolToMCP
      this.toolToMCP.delete(skillToolName);
      this.toolToMCP.delete(`skill.${skillName}`);
      this.toolToMCP.delete(skillName);

      logger.info(`✨ Dynamically removed skill: ${skillName}`);
    } catch (error: any) {
      logger.error(`Failed to dynamically remove skill ${skillName}: ${error.message}`);
    }
  }

  /**
   * Dynamically update a skill (for file watching)
   */
  async updateSkill(skillName: string, skillPath: string): Promise<void> {
    try {
      // Remove old version
      await this.removeSkill(skillName);
      // Add new version
      await this.addSkill(skillName, skillPath);
    } catch (error: any) {
      logger.error(`Failed to dynamically update skill ${skillName}: ${error.message}`);
    }
  }

  /**
   * Dynamically add a photon (for file watching)
   */
  async addPhoton(photonName: string, photonPath: string): Promise<void> {
    try {
      // Reload photons from disk via internal MCP manager
      if (!this.internalMCPManager) return;

      await this.internalMCPManager.loadPhotons();
      logger.info(`✨ Dynamically added photon: ${photonName}`);
    } catch (error: any) {
      logger.error(`Failed to dynamically add photon ${photonName}: ${error.message}`);
    }
  }

  /**
   * Dynamically remove a photon (for file watching)
   */
  async removePhoton(photonName: string): Promise<void> {
    try {
      // Find and remove photon from allTools
      const photonTools = this.allTools.filter(t => t.mcpName === photonName);
      for (const tool of photonTools) {
        const idx = this.allTools.indexOf(tool);
        if (idx > -1) {
          this.allTools.splice(idx, 1);
        }
        this.toolToMCP.delete(tool.name);
      }

      logger.info(`✨ Dynamically removed photon: ${photonName}`);
    } catch (error: any) {
      logger.error(`Failed to dynamically remove photon ${photonName}: ${error.message}`);
    }
  }

  /**
   * Dynamically update a photon (for file watching)
   */
  async updatePhoton(photonName: string, photonPath: string): Promise<void> {
    try {
      // Remove old version
      await this.removePhoton(photonName);
      // Reload all photons to pick up changes
      if (this.internalMCPManager) {
        await this.internalMCPManager.loadPhotons();
      }
      logger.info(`✨ Dynamically updated photon: ${photonName}`);
    } catch (error: any) {
      logger.error(`Failed to dynamically update photon ${photonName}: ${error.message}`);
    }
  }

  /**
   * Start FileWatcher for dynamic skill and photon discovery
   * Watches ~/.ncp/skills/ and ~/.ncp/photons/ directories for changes
   * Automatically loads/unloads skills and photons without requiring restart
   */
  private async startFileWatcher(): Promise<void> {
    try {
      // Check if skills or photon runtime are enabled
      const enableSkills = process.env.NCP_ENABLE_SKILLS !== 'false';
      const enablePhotonRuntime = process.env.NCP_ENABLE_PHOTON_RUNTIME === 'true';

      if (!enableSkills && !enablePhotonRuntime) {
        logger.debug('Skills and Photon runtime both disabled - FileWatcher not started');
        return;
      }

      // Get FileWatcher singleton with callbacks
      this.fileWatcher = getFileWatcher({
        // Skill callbacks
        onSkillAdded: async (skillName: string, skillPath: string) => {
          logger.debug(`FileWatcher detected skill added: ${skillName}`);
          try {
            await this.addSkill(skillName, skillPath);
          } catch (error: any) {
            logger.error(`Failed to add skill ${skillName}: ${error.message}`);
          }
        },
        onSkillModified: async (skillName: string, skillPath: string) => {
          logger.debug(`FileWatcher detected skill modified: ${skillName}`);
          try {
            await this.updateSkill(skillName, skillPath);
          } catch (error: any) {
            logger.error(`Failed to update skill ${skillName}: ${error.message}`);
          }
        },
        onSkillRemoved: async (skillName: string) => {
          logger.debug(`FileWatcher detected skill removed: ${skillName}`);
          try {
            await this.removeSkill(skillName);
          } catch (error: any) {
            logger.error(`Failed to remove skill ${skillName}: ${error.message}`);
          }
        },
        // Photon callbacks
        onPhotonAdded: async (photonName: string, photonPath: string) => {
          logger.debug(`FileWatcher detected photon added: ${photonName}`);
          try {
            await this.addPhoton(photonName, photonPath);
          } catch (error: any) {
            logger.error(`Failed to add photon ${photonName}: ${error.message}`);
          }
        },
        onPhotonModified: async (photonName: string, photonPath: string) => {
          logger.debug(`FileWatcher detected photon modified: ${photonName}`);
          try {
            await this.updatePhoton(photonName, photonPath);
          } catch (error: any) {
            logger.error(`Failed to update photon ${photonName}: ${error.message}`);
          }
        },
        onPhotonRemoved: async (photonName: string) => {
          logger.debug(`FileWatcher detected photon removed: ${photonName}`);
          try {
            await this.removePhoton(photonName);
          } catch (error: any) {
            logger.error(`Failed to remove photon ${photonName}: ${error.message}`);
          }
        },
        // Error callback
        onError: (error: Error) => {
          logger.error(`FileWatcher error: ${error.message}`);
        }
      });

      // Start watching
      await this.fileWatcher.start();
      logger.info('📁 Dynamic discovery enabled - watching for skill and photon changes');
    } catch (error: any) {
      logger.error(`Failed to start FileWatcher: ${error.message}`);
    }
  }

  /**
   * Stop FileWatcher for cleanup
   * Called during orchestrator shutdown to prevent resource leaks
   */
  async stopFileWatcher(): Promise<void> {
    if (!this.fileWatcher || !this.fileWatcher.isRunning()) {
      return;
    }

    try {
      await this.fileWatcher.stop();
      logger.info('📁 File watcher stopped');
    } catch (error: any) {
      logger.error(`Failed to stop FileWatcher: ${error.message}`);
    }
  }

  /**
   * Execute a skill with progressive disclosure
   * Skills return content based on depth parameter:
   * - depth=1: Metadata only
   * - depth=2: + Full SKILL.md content (default)
   * - depth=3: + File tree listing
   */
  private async executeSkill(skillName: string, parameters: any): Promise<ExecutionResult> {
    // Remove skill: or skill. prefix if present
    const cleanSkillName = skillName.replace(/^skill[.:]/, '');

    const skill = this.skillPrompts.get(cleanSkillName);
    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${cleanSkillName}. Use 'ncp find skill' to see available skills.`
      };
    }

    const depth = parameters?.depth ?? 2;  // Default to level 2 (learn)

    try {
      // Build response based on depth
      let output = `## 📚 ${skill.metadata.name}\n\n`;
      output += `**Description:** ${skill.metadata.description || '(no description)'}\n\n`;

      // Level 1: Metadata (always included)
      if (skill.metadata.version) {
        output += `**Version:** ${skill.metadata.version}\n`;
      }
      if (skill.metadata.author) {
        output += `**Author:** ${skill.metadata.author}\n`;
      }
      if (skill.metadata.tools && skill.metadata.tools.length > 0) {
        output += `**Tools:** ${skill.metadata.tools.join(', ')}\n`;
      }

      // Level 2: Full SKILL.md content (AI learns the skill!)
      if (depth >= 2) {
        output += `\n**Full Content:**\n\n`;
        output += '```markdown\n';
        output += skill.content;
        output += '\n```\n';
      }

      // Level 3: File tree listing
      if (depth >= 3) {
        const fileTree = await this.getSkillFileTree(skill.directory);
        if (fileTree.length > 0) {
          output += `\n**Available Files:**\n`;
          for (const file of fileTree) {
            output += `- ${file}\n`;
          }
          output += `\n💡 Use \`skills:read_resource\` to read specific files.\n`;
        }
      }

      return {
        success: true,
        content: output
      };
    } catch (error: any) {
      logger.error(`Skill execution failed for ${cleanSkillName}:`, error);
      return {
        success: false,
        error: error.message || 'Skill execution failed'
      };
    }
  }

  /**
   * Get file tree for a skill directory
   */
  private async getSkillFileTree(skillDir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(skillDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === 'SKILL.md') continue; // Already shown in content

        if (entry.isDirectory()) {
          // Recursively list directory contents
          const subFiles = await this.listSkillDirectoryRecursive(
            join(skillDir, entry.name),
            entry.name
          );
          files.push(...subFiles);
        } else {
          files.push(entry.name);
        }
      }
    } catch (error: any) {
      logger.debug(`Failed to list skill files: ${error.message}`);
    }

    return files.sort();
  }

  /**
   * Recursively list directory contents for skills
   */
  private async listSkillDirectoryRecursive(dirPath: string, prefix: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = `${prefix}/${entry.name}`;

        if (entry.isDirectory()) {
          const subFiles = await this.listSkillDirectoryRecursive(
            join(dirPath, entry.name),
            relativePath
          );
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch (error: any) {
      logger.debug(`Failed to list directory: ${error.message}`);
    }

    return files;
  }

  /**
   * Run CLI scan in background to enhance vector search
   * Discovered tools are indexed as capabilities to help AI understand shell possibilities
   */
  /**
   * Background CLI scan - Only scans and caches CLI tools
   * Enhancement happens dynamically during search (query-specific)
   */
  private async runBackgroundCliScan(): Promise<void> {
    const { CLIScanner } = await import('../services/cli-scanner.js');

    // Store scanner instance for query-specific enhancement
    this.cliScanner = new CLIScanner();

    try {
      // Scan system and cache results
      const tools = await this.cliScanner.scanSystem(false);
      logger.info(`✅ CLI scan complete: discovered ${tools.length} tools (cached for query-specific enhancement)`);

      // Check if shell MCPs exist
      const shellMCPs = Array.from(this.definitions.keys()).filter(mcpName => {
        const lower = mcpName.toLowerCase();
        return lower.includes('shell') ||
               lower.includes('command') ||
               lower.includes('terminal') ||
               lower.includes('cli');
      });

      if (shellMCPs.length === 0) {
        logger.debug('No shell MCPs found - CLI tools cached but won\'t be used');
      } else {
        logger.debug(`CLI tools ready for dynamic enhancement with ${shellMCPs.length} shell MCP(s)`);
      }
    } catch (error: any) {
      logger.warn(`CLI scan error: ${error.message}`);
    }
  }

  /**
   * Get relevant CLI tools for a query (query-specific matching)
   * Returns CLI tool descriptions that match the query
   */
  private async getRelevantCLITools(query: string, limit: number = 3): Promise<string[]> {
    if (!this.cliScanner) {
      return [];
    }

    try {
      // Search cached CLI tools for query-relevant matches
      const matches = await this.cliScanner.searchTools(query);

      // Return top N matches with their descriptions
      return matches.slice(0, limit).map((tool: any) => {
        const capabilities = tool.capabilities.slice(0, 3).join(', ');
        return `${tool.name} (${capabilities}): ${tool.description || 'command-line tool'}`;
      });
    } catch (error: any) {
      logger.debug(`CLI tool search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Load cached tools from CSV
   */
  private async loadFromCSVCache(mcpConfigs: MCPConfig[]): Promise<number> {
    const cachedTools = await this.csvCache.loadCachedTools();

    // Load tool metadata (including schemas) from cache
    const metadataCache = await this.cachePatcher.loadToolMetadataCache();

    // Group tools by MCP
    const toolsByMCP = new Map<string, CachedTool[]>();
    for (const tool of cachedTools) {
      if (!toolsByMCP.has(tool.mcpName)) {
        toolsByMCP.set(tool.mcpName, []);
      }
      toolsByMCP.get(tool.mcpName)!.push(tool);
    }

    let loadedMCPCount = 0;

    // Rebuild definitions and tool mappings from cache
    for (const config of mcpConfigs) {
      const mcpTools = toolsByMCP.get(config.name) || [];

      // Get MCP metadata for schemas
      const mcpMetadata = metadataCache.mcps[config.name];

      // Special handling for CLI tools: they're in metadata cache but not CSV cache
      if (mcpTools.length === 0 && mcpMetadata && config.env && config.env.NCP_CLI_TOOL === 'true') {
        logger.info(`Loading CLI tool ${config.name} from metadata cache only`);

        // Build tools array from metadata
        const cliTools: CachedTool[] = mcpMetadata.tools.map((tool: any) => ({
          mcpName: config.name,
          toolId: `${config.name}:${tool.name}`,
          toolName: tool.name,
          description: tool.description,
          hash: '',
          timestamp: new Date().toISOString()
        }));

        // Add to toolsByMCP so it's processed below
        toolsByMCP.set(config.name, cliTools);
        // Continue to process this CLI tool below
      } else if (mcpTools.length === 0) {
        // No tools in CSV cache and not a CLI tool
        continue;
      }

      // Get tools again (may have been added above for CLI tools)
      const tools = toolsByMCP.get(config.name) || [];
      if (tools.length === 0) continue;

      // CRITICAL: If metadata cache doesn't have this MCP's schemas, skip loading from cache
      // This forces re-indexing to populate the metadata cache with schemas
      if (!mcpMetadata || !mcpMetadata.tools || mcpMetadata.tools.length === 0) {
        logger.info(`Metadata cache missing for ${config.name}, will re-index to populate schemas`);
        this.csvCache.removeMCPFromIndex(config.name);  // Remove from CSV index to trigger re-indexing
        continue;
      }

      loadedMCPCount++;

      // Create definition with schemas from metadata cache
      this.definitions.set(config.name, {
        name: config.name,
        config,
        tools: tools.map(t => {
          // Find schema in metadata cache
          const toolMetadata = mcpMetadata?.tools?.find(mt => mt.name === t.toolName);
          return {
            name: t.toolName,
            description: t.description,
            inputSchema: toolMetadata?.inputSchema  // Use schema from metadata cache
          };
        }),
        serverInfo: mcpMetadata?.serverInfo
      });

      // Add to all tools and create mappings
      for (const cachedTool of tools) {
        const tool = {
          name: cachedTool.toolName,
          description: cachedTool.description,
          mcpName: config.name
        };
        this.allTools.push(tool);
        // Map both formats for backward compatibility
        this.toolToMCP.set(cachedTool.toolName, config.name);  // Unprefixed: "mail" -> "apple-mcp"
        this.toolToMCP.set(cachedTool.toolId, config.name);     // Prefixed: "apple-mcp:mail" -> "apple-mcp"
      }

      // Index tools in discovery engine
      const discoveryTools = tools.map(t => ({
        id: t.toolId,
        name: t.toolName,
        description: t.description
      }));

      // Use async indexing to avoid blocking
      this.discovery.indexMCPTools(config.name, discoveryTools);
    }

    logger.info(`Loaded ${this.allTools.length} tools from CSV cache`);
    return loadedMCPCount;
  }

  private async discoverMCPTools(mcpConfigs: MCPConfig[], profile?: Profile, incrementalMode: boolean = false, totalMCPCount?: number): Promise<void> {
    // Only clear allTools if not in incremental mode
    if (!incrementalMode) {
      this.allTools = [];
    }

    const displayTotal = totalMCPCount || mcpConfigs.length;

    for (let i = 0; i < mcpConfigs.length; i++) {
      const config = mcpConfigs[i];
      try {
        logger.info(`Discovering tools from MCP: ${config.name}`);

        if (this.showProgress) {
          spinner.updateSubMessage(`Connecting to ${config.name}...`);
        }

        let result;
        try {
          // First attempt with quick timeout
          result = await this.probeMCPTools(config, this.QUICK_PROBE_TIMEOUT);
        } catch (firstError: any) {
          // If it timed out (not connection error), retry with longer timeout
          if (firstError.message.includes('Probe timeout') || firstError.message.includes('timeout')) {
            logger.debug(`${config.name} timed out on first attempt, retrying with longer timeout...`);
            if (this.showProgress) {
              spinner.updateSubMessage(`Retrying ${config.name} (heavy initialization)...`);
            }
            // Second attempt with slow timeout for heavy MCPs
            result = await this.probeMCPTools(config, this.SLOW_PROBE_TIMEOUT);
          } else {
            // Not a timeout - it's a real error (connection refused, etc), don't retry
            throw firstError;
          }
        }

        // Store definition - preserve actual schemas
        this.definitions.set(config.name, {
          name: config.name,
          config,
          tools: result.tools.map(tool => ({
            ...tool,
            inputSchema: tool.inputSchema  // Preserve as-is, don't default to {}
          })),
          serverInfo: result.serverInfo
        });

        // Track that this MCP was newly indexed in this run
        this.newlyIndexedMCPs.add(config.name);

        // Add to all tools and create mappings
        const discoveryTools = [];
        for (const tool of result.tools) {
          // Store with prefixed name for consistency with commercial version
          const prefixedToolName = `${config.name}:${tool.name}`;
          const prefixedDescription = `${config.name}: ${tool.description || 'No description available'}`;

          this.allTools.push({
            name: prefixedToolName,
            description: prefixedDescription,
            mcpName: config.name
          });

          // Map both formats for backward compatibility
          this.toolToMCP.set(tool.name, config.name);
          this.toolToMCP.set(prefixedToolName, config.name);

          // Prepare for discovery engine indexing
          // Pass unprefixed name and description - RAG engine will add the prefix
          discoveryTools.push({
            id: prefixedToolName,
            name: tool.name,  // Use unprefixed name here
            description: tool.description || 'No description available',  // Use unprefixed description
            mcpServer: config.name,
            inputSchema: tool.inputSchema || {}
          });
        }

        if (this.showProgress) {
          // Add time estimate to indexing sub-message for parity
          let timeDisplay = '';
          if (this.indexingProgress?.estimatedTimeRemaining) {
            const remainingSeconds = Math.ceil(this.indexingProgress.estimatedTimeRemaining / 1000);
            timeDisplay = ` (~${remainingSeconds}s remaining)`;
          }
          spinner.updateSubMessage(`Indexing ${result.tools.length} tools from ${config.name}...${timeDisplay}`);
        }

        // Index tools with discovery engine for vector search
        await this.discovery.indexMCPTools(config.name, discoveryTools);

        // Append to CSV cache incrementally (if in incremental mode)
        if (incrementalMode && profile) {
          const mcpHash = CSVCache.hashProfile(profile.mcpServers[config.name]);
          const cachedTools: CachedTool[] = result.tools.map(tool => ({
            mcpName: config.name,
            toolId: `${config.name}:${tool.name}`,
            toolName: tool.name,
            description: tool.description || 'No description available',
            hash: this.hashString(tool.description || ''),
            timestamp: new Date().toISOString()
          }));

          await this.csvCache.appendMCP(config.name, cachedTools, mcpHash);
        }

        // Update indexing progress AFTER successfully appending to cache
        if (this.indexingProgress) {
          this.indexingProgress.current = i + 1;
          this.indexingProgress.currentMCP = config.name;

          // Estimate remaining time based on average time per MCP so far
          const elapsedTime = Date.now() - this.indexingStartTime;
          const averageTimePerMCP = elapsedTime / (i + 1);
          const remainingMCPs = mcpConfigs.length - (i + 1);
          this.indexingProgress.estimatedTimeRemaining = remainingMCPs * averageTimePerMCP;
        }

        if (this.showProgress) {
          // Calculate absolute position
          const cachedCount = displayTotal - mcpConfigs.length;
          const currentAbsolute = cachedCount + (i + 1);
          const percentage = Math.round((currentAbsolute / displayTotal) * 100);

          // Add time estimate
          let timeDisplay = '';
          if (this.indexingProgress?.estimatedTimeRemaining) {
            const remainingSeconds = Math.ceil(this.indexingProgress.estimatedTimeRemaining / 1000);
            timeDisplay = ` ~${remainingSeconds}s remaining`;
          }

          spinner.updateMessage(`Indexing MCPs: ${currentAbsolute}/${displayTotal} (${percentage}%)${timeDisplay}`);
        }

        logger.info(`Discovered ${result.tools.length} tools from ${config.name}`);
      } catch (error: any) {
        // Probe failures are expected - don't alarm users with error messages
        logger.debug(`Failed to discover tools from ${config.name}: ${error.message}`);

        // Mark MCP as failed for scheduled retry (if in incremental mode)
        if (incrementalMode && profile) {
          this.csvCache.markFailed(config.name, error);
        }

        // Update indexing progress even for failed MCPs
        if (this.indexingProgress) {
          this.indexingProgress.current = i + 1;
          this.indexingProgress.currentMCP = config.name;

          // Estimate remaining time based on average time per MCP so far
          const elapsedTime = Date.now() - this.indexingStartTime;
          const averageTimePerMCP = elapsedTime / (i + 1);
          const remainingMCPs = mcpConfigs.length - (i + 1);
          this.indexingProgress.estimatedTimeRemaining = remainingMCPs * averageTimePerMCP;
        }

        if (this.showProgress) {
          // Calculate absolute position
          const cachedCount = displayTotal - mcpConfigs.length;
          const currentAbsolute = cachedCount + (i + 1);
          const percentage = Math.round((currentAbsolute / displayTotal) * 100);

          // Add time estimate
          let timeDisplay = '';
          if (this.indexingProgress?.estimatedTimeRemaining) {
            const remainingSeconds = Math.ceil(this.indexingProgress.estimatedTimeRemaining / 1000);
            timeDisplay = ` ~${remainingSeconds}s remaining`;
          }

          spinner.updateMessage(`Indexing MCPs: ${currentAbsolute}/${displayTotal} (${percentage}%)${timeDisplay}`);
          spinner.updateSubMessage(`Skipped ${config.name} (connection failed)`);
        }

        // Update health monitor with the actual error for import feedback
        this.healthMonitor.markUnhealthy(config.name, error.message);
      }
    }
  }

  /**
   * Create appropriate transport based on config
   * Supports both stdio (command/args) and HTTP/SSE (url) transports
   * Handles OAuth authentication for HTTP/SSE connections
   */
  private async createTransport(config: MCPConfig, env?: Record<string, string>): Promise<StdioClientTransport | SSEClientTransport> {
    if (config.url) {
      // HTTP/SSE transport (Claude Desktop native support)
      const url = new URL(config.url);
      const headers: Record<string, string> = {};

      // Handle authentication
      if (config.auth) {
        const token = await this.getAuthToken(config);

        switch (config.auth.type) {
          case 'oauth':
          case 'bearer':
            headers['Authorization'] = `Bearer ${token}`;
            break;
          case 'apiKey':
            // API key can be in header or query param - assume header for now
            headers['X-API-Key'] = token;
            break;
          case 'basic':
            if (config.auth.username && config.auth.password) {
              const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
              headers['Authorization'] = `Basic ${credentials}`;
            }
            break;
        }
      }

      // Use requestInit to add custom headers to POST requests
      // and eventSourceInit to add headers to the initial SSE connection
      const options = Object.keys(headers).length > 0 ? {
        requestInit: { headers },
        eventSourceInit: { headers } as EventSourceInit
      } : undefined;

      return new SSEClientTransport(url, options);
    }

    if (config.command) {
      // stdio transport (local process)
      const resolvedCommand = getRuntimeForExtension(config.command);
      const wrappedCommand = mcpWrapper.createWrapper(
        config.name,
        resolvedCommand,
        config.args || []
      );

      // Ensure PATH includes all necessary directories (critical for Claude Desktop extension sandbox)
      // Claude Desktop may provide limited PATH that doesn't include Homebrew, npm global, etc.
      // This matches what Claude Desktop provides when spawning MCPs directly
      const processEnv = env as Record<string, string>;
      const platform = process.platform;

      // Get platform-specific path separator and standard paths
      const pathSeparator = platform === 'win32' ? ';' : ':';
      let standardPaths: string;
      let pathCheckNeeded = false;

      if (platform === 'darwin') {
        // macOS: Include both Homebrew locations (Intel and Apple Silicon)
        standardPaths = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';
        // Check if Homebrew directories are missing
        pathCheckNeeded = !!processEnv.PATH &&
          !processEnv.PATH.includes('/opt/homebrew/bin') &&
          !processEnv.PATH.includes('/usr/local/bin');
      } else if (platform === 'win32') {
        // Windows: Standard system paths
        standardPaths = 'C:\\Windows\\System32;C:\\Windows;C:\\Program Files\\nodejs';
        // Check if standard Windows directories are missing
        pathCheckNeeded = !!processEnv.PATH &&
          !processEnv.PATH.includes('C:\\Windows\\System32') &&
          !processEnv.PATH.includes('C:\\Program Files\\nodejs');
      } else {
        // Linux: Standard system paths
        standardPaths = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
        // Check if standard Linux directories are missing
        pathCheckNeeded = !!processEnv.PATH &&
          !processEnv.PATH.includes('/usr/local/bin') &&
          !processEnv.PATH.includes('/usr/bin');
      }

      // Set or augment PATH
      if (!processEnv.PATH) {
        // No PATH at all - set standard paths
        processEnv.PATH = standardPaths;
        logger.debug(`Set PATH for ${config.name}: ${processEnv.PATH}`);
      } else if (pathCheckNeeded) {
        // PATH exists but doesn't include standard directories - prepend them
        processEnv.PATH = `${standardPaths}${pathSeparator}${processEnv.PATH}`;
        logger.debug(`Augmented PATH for ${config.name}: ${processEnv.PATH}`);
      }

      return new StdioClientTransport({
        command: wrappedCommand.command,
        args: wrappedCommand.args,
        env: processEnv
      });
    }

    throw new Error(`Invalid config for ${config.name}: must have either 'command' or 'url'`);
  }

  /**
   * Get authentication token for MCP
   * Handles OAuth Device Flow and token refresh
   */
  private async getAuthToken(config: MCPConfig): Promise<string> {
    if (!config.auth) {
      throw new Error('No auth configuration provided');
    }

    // For non-OAuth auth types, return the token directly
    if (config.auth.type !== 'oauth') {
      return config.auth.token || '';
    }

    // OAuth flow
    if (!config.auth.oauth) {
      throw new Error('OAuth configuration missing');
    }

    const { getTokenStore } = await import('../auth/token-store.js');
    const tokenStore = getTokenStore();

    // Check for existing valid token
    const existingToken = await tokenStore.getToken(config.name);
    if (existingToken) {
      return existingToken.access_token;
    }

    // No valid token - trigger OAuth Device Flow
    const { DeviceFlowAuthenticator } = await import('../auth/oauth-device-flow.js');
    const authenticator = new DeviceFlowAuthenticator(config.auth.oauth);

    logger.info(`No valid token found for ${config.name}, starting OAuth Device Flow...`);
    const tokenResponse = await authenticator.authenticate();

    // Store token for future use
    await tokenStore.storeToken(config.name, tokenResponse);

    return tokenResponse.access_token;
  }

  // Based on commercial NCP's probeMCPTools method
  private async probeMCPTools(config: MCPConfig, timeout: number = this.QUICK_PROBE_TIMEOUT): Promise<{
    tools: Array<{name: string; description: string; inputSchema?: any}>;
    serverInfo?: {
      name: string;
      title?: string;
      version: string;
      description?: string;
      websiteUrl?: string;
    };
  }> {
    if (!config.command && !config.url) {
      throw new Error(`Invalid config for ${config.name}: must have either 'command' or 'url'`);
    }

    let client: Client | null = null;
    let transport: StdioClientTransport | SSEClientTransport | null = null;

    try {
      // Create temporary connection for discovery
      const silentEnv = {
        ...process.env,
        ...(config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      transport = await this.createTransport(config, silentEnv);

      // Use actual client info for transparent passthrough to downstream MCPs
      client = new Client(
        this.clientInfo,
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client!.connect(transport!),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Probe timeout')), timeout)
          )
        ]);
      });

      // Capture server info after connection
      const serverInfo = client!.getServerVersion();

      // Get tool list with filtered output
      const response = await withFilteredOutput(async () => {
        return await client!.listTools();
      });

      const tools = response.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema  // Preserve schema as-is
      }));

      // Disconnect immediately
      await client.close();

      return {
        tools,
        serverInfo: serverInfo ? {
          name: serverInfo.name || config.name,
          title: serverInfo.title,
          version: serverInfo.version || 'unknown',
          description: serverInfo.title || serverInfo.name || undefined,
          websiteUrl: serverInfo.websiteUrl
        } : undefined
      };

    } catch (error: any) {
      // Clean up on error
      if (client) {
        try { await client.close(); } catch {}
      }

      // Log full error details for debugging
      logger.debug(`Full error details for ${config.name}: ${JSON.stringify({
        message: error.message,
        code: error.code,
        data: error.data,
        stack: error.stack?.split('\n')[0]
      })}`);

      throw error;
    }
  }

  async find(query: string, limit: number = 5, detailed: boolean = false, confidenceThreshold: number = 0.35): Promise<DiscoveryResult[]> {
    // Wait for background initialization to complete (this is where indexing + spinner happens)
    await this.waitForInitialization();

    if (!query) {
      // No query = list all tools, filtered by health
      const healthyTools = this.allTools.filter(tool => this.healthMonitor.getHealthyMCPs([tool.mcpName]).length > 0);
      const results = healthyTools.slice(0, limit).map(tool => {
        // Ensure toolName is always prefixed with mcpName:toolName format
        const prefixedName = tool.name.includes(':') ? tool.name : `${tool.mcpName}:${tool.name}`;
        const actualToolName = tool.name.includes(':') ? tool.name.split(':', 2)[1] : tool.name;
        return {
          toolName: prefixedName, // Always return prefixed name (mcpName:toolName)
          mcpName: tool.mcpName,
          confidence: 1.0,
          description: detailed ? tool.description : undefined,
          schema: detailed ? this.getToolSchema(tool.mcpName, actualToolName) : undefined
        };
      });
      return results;
    }

    // Use battle-tested vector search from commercial NCP
    // DOUBLE SEARCH TECHNIQUE: Request 2x results to account for filtering disabled MCPs
    try {
      const doubleLimit = limit * 2; // Request double to account for filtered MCPs
      const vectorResults = await this.discovery.findRelevantTools(query, doubleLimit, confidenceThreshold);

      // Apply universal term frequency scoring boost
      const adjustedResults = this.adjustScoresUniversally(query, vectorResults);

      // Parse and filter results
      const parsedResults = adjustedResults.map(result => {
        // Parse tool format: "mcp:tool" - result.name is set to RAG's toolId via discovery wrapper
        const parts = result.name.includes(':') ? result.name.split(':', 2) : [this.toolToMCP.get(result.name) || 'unknown', result.name];
        let mcpName = parts[0];
        const toolName = parts[1] || result.name;

        // Special case: skills use "skill:" prefix but are stored under "__skills__" mcpName
        const actualMcpName = mcpName === 'skill' ? '__skills__' : mcpName;

        // Find the tool - it should be stored with prefixed name
        const prefixedToolName = `${mcpName}:${toolName}`;
        const fullTool = this.allTools.find(t =>
          (t.name === prefixedToolName || t.name === toolName) && t.mcpName === actualMcpName
        );
        return {
          toolName: fullTool?.name || prefixedToolName, // Return the stored (prefixed) name
          mcpName: actualMcpName,  // Use actualMcpName for health filtering
          confidence: result.confidence,
          description: detailed ? fullTool?.description : undefined,
          schema: detailed ? this.getToolSchema(actualMcpName, toolName) : undefined
        };
      });

      // HEALTH FILTERING: Remove tools from disabled MCPs
      const healthyResults = parsedResults.filter(result => {
        return this.healthMonitor.getHealthyMCPs([result.mcpName]).length > 0;
      });

      // SORT by confidence (highest first) after our scoring adjustments
      const sortedResults = healthyResults.sort((a, b) => b.confidence - a.confidence);

      // Return up to the original limit after filtering and sorting
      let finalResults = sortedResults.slice(0, limit);

      // DYNAMIC CLI ENHANCEMENT: Enhance shell tools with query-specific CLI tool info
      if (this.cliScanner && finalResults.length > 0 && detailed) {
        const relevantCLITools = await this.getRelevantCLITools(query, 3);

        if (relevantCLITools.length > 0) {
          // Check which results are from shell MCPs
          finalResults = finalResults.map(result => {
            const isShellMCP = result.mcpName.toLowerCase().includes('shell') ||
                              result.mcpName.toLowerCase().includes('command') ||
                              result.mcpName.toLowerCase().includes('terminal') ||
                              result.mcpName.toLowerCase().includes('cli');

            const isExecutionTool = result.toolName.toLowerCase().includes('execute') ||
                                   result.toolName.toLowerCase().includes('run') ||
                                   result.toolName.toLowerCase().includes('command');

            // Enhance shell execution tools with relevant CLI tool info
            if (isShellMCP && isExecutionTool && result.description) {
              const cliInfo = relevantCLITools.join('; ');
              result.description = `${result.description}. Relevant CLI tools for "${query}": ${cliInfo}`;
              logger.debug(`Enhanced ${result.toolName} with CLI info: ${relevantCLITools.length} tools`);
            }

            return result;
          });
        }
      }

      // FALLBACK: If no results and shell access available, try CLI scan + retry
      if (finalResults.length === 0 && process.env.NCP_DISABLE_CLI_SCAN !== 'true') {
        const hasShellAccess = this.definitions.has('Shell') || this.definitions.has('desktop-commander');

        if (hasShellAccess) {
          logger.info(`🔍 No results found for "${query}", triggering CLI scan...`);

          // Trigger CLI scan and wait for completion
          try {
            await this.runBackgroundCliScan();

            // Retry search once after scan
            const retryResults = await this.discovery.findRelevantTools(query, doubleLimit, confidenceThreshold);
            const retryAdjusted = this.adjustScoresUniversally(query, retryResults);
            const retryParsed = retryAdjusted.map(result => {
              const parts = result.name.includes(':') ? result.name.split(':', 2) : [this.toolToMCP.get(result.name) || 'unknown', result.name];
              const mcpName = parts[0];
              const toolName = parts[1] || result.name;
              const prefixedToolName = `${mcpName}:${toolName}`;
              const fullTool = this.allTools.find(t =>
                (t.name === prefixedToolName || t.name === toolName) && t.mcpName === mcpName
              );
              return {
                toolName: fullTool?.name || prefixedToolName,
                mcpName,
                confidence: result.confidence,
                description: detailed ? fullTool?.description : undefined,
                schema: detailed ? this.getToolSchema(mcpName, toolName) : undefined
              };
            });

            const retryHealthy = retryParsed.filter(result => {
              return this.healthMonitor.getHealthyMCPs([result.mcpName]).length > 0;
            });

            finalResults = retryHealthy.sort((a, b) => b.confidence - a.confidence).slice(0, limit);

            // Enhance retry results with CLI info if detailed
            if (finalResults.length > 0) {
              logger.info(`✅ Found ${finalResults.length} tools after CLI scan`);

              // Apply same dynamic enhancement to retry results
              if (this.cliScanner && detailed) {
                const relevantCLITools = await this.getRelevantCLITools(query, 3);

                if (relevantCLITools.length > 0) {
                  finalResults = finalResults.map(result => {
                    const isShellMCP = result.mcpName.toLowerCase().includes('shell') ||
                                      result.mcpName.toLowerCase().includes('command') ||
                                      result.mcpName.toLowerCase().includes('terminal') ||
                                      result.mcpName.toLowerCase().includes('cli');

                    const isExecutionTool = result.toolName.toLowerCase().includes('execute') ||
                                           result.toolName.toLowerCase().includes('run') ||
                                           result.toolName.toLowerCase().includes('command');

                    if (isShellMCP && isExecutionTool && result.description) {
                      const cliInfo = relevantCLITools.join('; ');
                      result.description = `${result.description}. Relevant CLI tools for "${query}": ${cliInfo}`;
                      logger.debug(`Enhanced ${result.toolName} with CLI info (retry): ${relevantCLITools.length} tools`);
                    }

                    return result;
                  });
                }
              }
            }
          } catch (error: any) {
            logger.warn(`CLI fallback scan failed: ${error}`);
          }
        }
      }

      if (healthyResults.length < parsedResults.length) {
        logger.debug(`Health filtering: ${parsedResults.length - healthyResults.length} tools filtered out from disabled MCPs`);
      }

      return finalResults;

    } catch (error: any) {
      logger.error(`Vector search failed: ${error.message}`);

      // Fallback to healthy tools only
      const healthyTools = this.allTools.filter(tool => this.healthMonitor.getHealthyMCPs([tool.mcpName]).length > 0);
      return healthyTools.slice(0, limit).map(tool => {
        // Extract actual tool name from prefixed format for schema lookup
        const actualToolName = tool.name.includes(':') ? tool.name.split(':', 2)[1] : tool.name;
        return {
          toolName: tool.name, // Return prefixed name
          mcpName: tool.mcpName,
          confidence: 0.5,
          description: detailed ? tool.description : undefined,
          schema: detailed ? this.getToolSchema(tool.mcpName, actualToolName) : undefined
        };
      });
    }
  }

  async run(toolName: string, parameters: any, meta?: Record<string, any>): Promise<ExecutionResult> {
    // Parse tool format: "mcp:tool" or just "tool"
    let mcpName: string;
    let actualToolName: string;

    if (toolName.includes(':')) {
      [mcpName, actualToolName] = toolName.split(':', 2);
    } else {
      actualToolName = toolName;
      mcpName = this.toolToMCP.get(toolName) || '';
    }

    if (!mcpName) {
      const similarTools = this.findSimilarTools(toolName);
      let errorMessage = `Tool '${toolName}' not found.`;

      if (similarTools.length > 0) {
        errorMessage += ` Did you mean: ${similarTools.join(', ')}?`;
      }

      errorMessage += ` Use 'ncp find "${toolName}"' to search for similar tools or 'ncp find --depth 0' to list all available tools.`;

      return {
        success: false,
        error: errorMessage
      };
    }

    // Check if this is a skill execution (skill:name or skill.name)
    if (mcpName === '__skills__' || toolName.startsWith('skill:') || toolName.startsWith('skill.')) {
      return await this.executeSkill(actualToolName, parameters);
    }

    // Check if this is an internal MCP
    if (this.internalMCPManager.isInternalMCP(mcpName)) {
      try {
        const result = await this.internalMCPManager.executeInternalTool(mcpName, actualToolName, parameters);
        return {
          success: result.success,
          content: result.content,
          error: result.error
        };
      } catch (error: any) {
        logger.error(`Internal tool execution failed for ${toolName}:`, error);
        return {
          success: false,
          error: error.message || 'Internal tool execution failed'
        };
      }
    }

    const definition = this.definitions.get(mcpName);
    if (!definition) {
      const availableMcps = Array.from(this.definitions.keys()).join(', ');
      return {
        success: false,
        error: `MCP '${mcpName}' not found. Available MCPs: ${availableMcps}. Use 'ncp find' to discover tools or check your profile configuration.`
      };
    }

    try {
      // Get or create pooled connection
      const connection = await this.getOrCreateConnection(mcpName);

      // Validate parameters before execution
      const validationError = this.validateToolParameters(mcpName, actualToolName, parameters);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Execute tool with filtered output to suppress MCP server console messages
      // Forward _meta transparently to support session_id and other protocol-level metadata
      const result = await withFilteredOutput(async () => {
        return await connection.client.callTool({
          name: actualToolName,
          arguments: parameters,
          _meta: meta
        });
      });

      // Mark MCP as healthy on successful execution
      this.healthMonitor.markHealthy(mcpName);

      // Check for MCP updates asynchronously (non-blocking)
      // Only show notification if one hasn't been shown in 24 hours
      setImmediate(async () => {
        try {
          if (this.updateChecker.shouldShowNotification(mcpName)) {
            // Get the MCP definition to find version info
            const definition = this.definitions.get(mcpName);
            const mcpVersion = definition?.serverInfo?.version || 'unknown';

            const updateInfo = await this.updateChecker.checkMCPUpdate(
              mcpName,
              mcpVersion,
              undefined // Will use default package name pattern
            );

            if (updateInfo.hasUpdate) {
              const notification = this.updateChecker.getUpdateNotification(updateInfo);
              if (notification) {
                console.log('\n' + notification);
                this.updateChecker.markNotificationShown(mcpName);
              }
            }
          }
        } catch (error) {
          // Silently ignore version check errors - don't block tool execution
          logger.debug(`Failed to check MCP updates for ${mcpName}: ${error}`);
        }
      });

      return {
        success: true,
        content: result.content
      };

    } catch (error: any) {
      logger.error(`Tool execution failed for ${toolName}:`, error);

      // Mark MCP as unhealthy on execution failure
      this.healthMonitor.markUnhealthy(mcpName, error.message);

      return {
        success: false,
        error: this.enhanceErrorMessage(error, actualToolName, mcpName)
      };
    }
  }

  private async getOrCreateConnection(mcpName: string): Promise<MCPConnection> {
    // Check if existing connection exists and is still healthy
    const existing = this.connections.get(mcpName);
    if (existing) {
      // Force reconnect if connection has been used too many times (prevents resource leaks)
      if (existing.executionCount >= this.MAX_EXECUTIONS_PER_CONNECTION) {
        logger.info(`🔄 Reconnecting ${mcpName} (reached ${existing.executionCount} executions)`);
        await this.disconnectMCP(mcpName);
        // Fall through to create new connection
      } else {
        existing.lastUsed = Date.now();
        existing.executionCount++;
        return existing;
      }
    }

    // Before creating new connection, check if we're at the limit
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      await this.evictLRUConnection();
    }

    const definition = this.definitions.get(mcpName);
    if (!definition) {
      const availableMcps = Array.from(this.definitions.keys()).join(', ');
      throw new Error(`MCP '${mcpName}' not found. Available MCPs: ${availableMcps}. Use 'ncp find' to discover tools or check your profile configuration.`);
    }

    logger.info(`🔌 Connecting to ${mcpName} (for execution)...`);
    const connectStart = Date.now();

    try {
      // Add environment variables
      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        // These may still help some servers
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = await this.createTransport(definition.config, silentEnv);

      // Use actual client info for transparent passthrough to downstream MCPs
      const client = new Client(
        this.clientInfo,
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
          )
        ]);
      });

      // Capture server info after successful connection
      const serverInfo = client.getServerVersion();

      const connection: MCPConnection = {
        client,
        transport,
        tools: [], // Will be populated if needed
        serverInfo: serverInfo ? {
          name: serverInfo.name || mcpName,
          title: serverInfo.title,
          version: serverInfo.version || 'unknown',
          description: serverInfo.title || serverInfo.name || undefined,
          websiteUrl: serverInfo.websiteUrl
        } : undefined,
        lastUsed: Date.now(),
        connectTime: Date.now() - connectStart,
        executionCount: 1
      };

      // Store connection for reuse
      this.connections.set(mcpName, connection);
      logger.info(`✅ Connected to ${mcpName} in ${connection.connectTime}ms`);

      return connection;
    } catch (error: any) {
      logger.error(`❌ Failed to connect to ${mcpName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * New optimized cache loading with profile hash validation
   * This is the key optimization - skips re-indexing when profile hasn't changed
   */
  private async loadFromOptimizedCache(profile: Profile): Promise<boolean> {
    try {
      // 1. Validate cache integrity first
      const integrity = await this.cachePatcher.validateAndRepairCache();
      if (!integrity.valid) {
        logger.warn('Cache integrity check failed - rebuilding required');
        return false;
      }

      // 2. Check if cache is valid using profile hash validation
      const currentProfileHash = this.cachePatcher.generateProfileHash(profile);
      const cacheIsValid = await this.cachePatcher.validateCacheWithProfile(currentProfileHash);

      if (!cacheIsValid) {
        logger.info('Cache invalid or missing - profile changed');
        return false;
      }

      // 3. Load tool metadata cache directly
      const toolMetadataCache = await this.cachePatcher.loadToolMetadataCache();

      if (!toolMetadataCache.mcps || Object.keys(toolMetadataCache.mcps).length === 0) {
        logger.info('Tool metadata cache empty');
        return false;
      }

      logger.info(`✅ Using valid cache (${Object.keys(toolMetadataCache.mcps).length} MCPs, hash: ${currentProfileHash.substring(0, 8)}...)`);

      // 4. Load MCPs and tools from cache directly (no re-indexing)
      // IMPORTANT: Preserve skills and internal MCPs that were loaded before cache
      const skillsAndInternalTools = this.allTools.filter(tool =>
        tool.mcpName === '__skills__' || tool.mcpName === '__internal__'
      );
      this.allTools = [...skillsAndInternalTools];
      let loadedMCPCount = 0;
      let loadedToolCount = 0;

      for (const [mcpName, mcpData] of Object.entries(toolMetadataCache.mcps)) {
        try {
          // Validate MCP data structure
          if (!mcpData.tools || !Array.isArray(mcpData.tools)) {
            logger.warn(`Skipping ${mcpName}: invalid tools data in cache`);
            continue;
          }

          // Check if MCP still exists in current profile
          if (!profile.mcpServers[mcpName]) {
            logger.debug(`Skipping ${mcpName}: removed from profile`);
            continue;
          }

          this.definitions.set(mcpName, {
            name: mcpName,
            config: {
              name: mcpName,
              ...profile.mcpServers[mcpName]
            },
            tools: mcpData.tools.map(tool => ({
              ...tool,
              inputSchema: tool.inputSchema || {}
            })),
            serverInfo: mcpData.serverInfo || { name: mcpName, version: 'unknown' }
          });

          // Build allTools array and tool mappings
          const discoveryTools = [];
          for (const tool of mcpData.tools) {
            try {
              const prefixedToolName = `${mcpName}:${tool.name}`;
              const prefixedDescription = tool.description.startsWith(`${mcpName}:`)
                ? tool.description
                : `${mcpName}: ${tool.description || 'No description available'}`;

              this.allTools.push({
                name: prefixedToolName,
                description: prefixedDescription,
                mcpName: mcpName
              });

              // Create tool mappings
              this.toolToMCP.set(tool.name, mcpName);
              this.toolToMCP.set(prefixedToolName, mcpName);

              discoveryTools.push({
                id: prefixedToolName,
                name: tool.name,
                description: prefixedDescription,
                mcpServer: mcpName,
                inputSchema: tool.inputSchema || {}
              });

              loadedToolCount++;
            } catch (toolError: any) {
              logger.warn(`Error loading tool ${tool.name} from ${mcpName}: ${toolError.message}`);
            }
          }

          // Use fast indexing (load from embeddings cache, don't regenerate)
          if (discoveryTools.length > 0) {
            // Ensure discovery engine is fully initialized before indexing
            await this.discovery.initialize();
            await this.discovery.indexMCPToolsFromCache(mcpName, discoveryTools);
            loadedMCPCount++;
          }

        } catch (mcpError: any) {
          logger.warn(`Error loading MCP ${mcpName} from cache: ${mcpError.message}`);
        }
      }

      if (loadedMCPCount === 0) {
        logger.warn('No valid MCPs loaded from cache');
        return false;
      }

      logger.info(`⚡ Loaded ${loadedToolCount} tools from ${loadedMCPCount} MCPs (optimized cache)`);
      return true;

    } catch (error: any) {
      logger.warn(`Optimized cache load failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Legacy cache loading (kept for fallback)
   */
  private async loadFromCache(profile: Profile): Promise<boolean> {
    try {
      const cacheDir = getCacheDirectory();
      const cachePath = join(cacheDir, `${this.profileName}-tools.json`);

      if (!existsSync(cachePath)) {
        return false;
      }

      const content = readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(content);

      // Use cache if less than 24 hours old
      if (Date.now() - cache.timestamp > 24 * 60 * 60 * 1000) {
        logger.info('Cache expired, will refresh tools');
        return false;
      }

      logger.info(`Using cached tools (${Object.keys(cache.mcps).length} MCPs)`)

      // Load MCPs and tools from cache
      for (const [mcpName, mcpData] of Object.entries(cache.mcps)) {
        const data = mcpData as any;

        this.definitions.set(mcpName, {
          name: mcpName,
          config: {
            name: mcpName,
            ...profile.mcpServers[mcpName]
          },
          tools: data.tools || [],
          serverInfo: data.serverInfo
        });

        // Add tools to allTools and create mappings
        const discoveryTools = [];
        for (const tool of data.tools || []) {
          // Handle both old (unprefixed) and new (prefixed) formats in cache
          const isAlreadyPrefixed = tool.name.startsWith(`${mcpName}:`);
          const prefixedToolName = isAlreadyPrefixed ? tool.name : `${mcpName}:${tool.name}`;
          const actualToolName = isAlreadyPrefixed ? tool.name.substring(mcpName.length + 1) : tool.name;

          // Ensure description is prefixed
          const hasPrefixedDesc = tool.description?.startsWith(`${mcpName}: `);
          const prefixedDescription = hasPrefixedDesc ? tool.description : `${mcpName}: ${tool.description || 'No description available'}`;

          this.allTools.push({
            name: prefixedToolName,
            description: prefixedDescription,
            mcpName: mcpName
          });

          // Map both formats for backward compatibility
          this.toolToMCP.set(actualToolName, mcpName);
          this.toolToMCP.set(prefixedToolName, mcpName);

          // Prepare for discovery engine indexing
          // Pass unprefixed name - RAG engine will add the prefix
          discoveryTools.push({
            id: prefixedToolName,
            name: actualToolName,  // Use unprefixed name here
            description: prefixedDescription,
            mcpServer: mcpName,
            inputSchema: {}
          });
        }

        // Index tools with discovery engine
        await this.discovery.indexMCPTools(mcpName, discoveryTools);
      }

      logger.info(`✅ Loaded ${this.allTools.length} tools from cache`);
      return true;

    } catch (error: any) {
      logger.warn(`Cache load failed: ${error.message}`);
      return false;
    }
  }

  private async saveToCache(profile: Profile): Promise<void> {
    try {
      // Use new optimized cache saving with profile hash
      await this.saveToOptimizedCache(profile);

    } catch (error: any) {
      logger.warn(`Cache save failed: ${error.message}`);
    }
  }

  /**
   * New optimized cache saving with profile hash and structured format
   */
  private async saveToOptimizedCache(profile: Profile): Promise<void> {
    try {
      // Only save MCPs that were newly indexed in this run
      if (this.newlyIndexedMCPs.size === 0) {
        logger.info('No new MCPs to save to cache');
        return;
      }

      logger.info(`💾 Saving ${this.newlyIndexedMCPs.size} newly indexed MCP(s) to optimized cache...`);

      // Save only newly indexed MCP definitions to tool metadata cache
      for (const mcpName of this.newlyIndexedMCPs) {
        const definition = this.definitions.get(mcpName);
        const mcpConfig = profile.mcpServers[mcpName];
        if (definition && mcpConfig) {
          await this.cachePatcher.patchAddMCP(
            mcpName,
            mcpConfig,
            definition.tools,
            definition.serverInfo
          );
        }
      }

      // Update profile hash
      const profileHash = this.cachePatcher.generateProfileHash(profile);
      await this.cachePatcher.updateProfileHash(profileHash);

      logger.info(`💾 Saved ${this.allTools.length} tools to optimized cache with profile hash: ${profileHash.substring(0, 8)}...`);

    } catch (error: any) {
      logger.error(`Optimized cache save failed: ${error.message}`);
      throw error;
    }
  }

  private getToolSchema(mcpName: string, toolName: string): any {
    // First, try to get schema from definitions (most reliable source)
    const definition = this.definitions.get(mcpName);
    if (definition) {
      const tool = definition.tools.find(t => t.name === toolName);
      if (tool && (tool as any).inputSchema) {
        return (tool as any).inputSchema;
      }
    }

    // Fallback to connection if available
    const connection = this.connections.get(mcpName);
    if (connection?.tools) {
      const tool = connection.tools.find(t => t.name === toolName);
      if (tool && (tool as any).inputSchema) {
        return (tool as any).inputSchema;
      }
    }

    return undefined;
  }

  /**
   * Get tool schema by tool identifier (e.g., "mcp:tool")
   */
  getToolSchemaByIdentifier(toolIdentifier: string): any {
    const [mcpName, toolName] = toolIdentifier.split(':');
    if (!mcpName || !toolName) return undefined;
    return this.getToolSchema(mcpName, toolName);
  }

  /**
   * Check if a tool requires parameters
   */
  toolRequiresParameters(toolIdentifier: string): boolean {
    const [mcpName, toolName] = toolIdentifier.split(':');
    if (!mcpName || !toolName) return false;

    const schema = this.getToolSchema(mcpName, toolName);
    return ToolSchemaParser.hasRequiredParameters(schema);
  }

  /**
   * Get tool parameters for interactive prompting
   */
  getToolParameters(toolIdentifier: string): ParameterInfo[] {
    const [mcpName, toolName] = toolIdentifier.split(':');
    if (!mcpName || !toolName) return [];

    const schema = this.getToolSchema(mcpName, toolName);
    return ToolSchemaParser.parseParameters(schema);
  }

  /**
   * Validate tool parameters before execution
   */
  private validateToolParameters(mcpName: string, toolName: string, parameters: any): string | null {
    const schema = this.getToolSchema(mcpName, toolName);
    if (!schema) {
      // No schema available, allow execution (tool may not require validation)
      return null;
    }

    const requiredParams = ToolSchemaParser.getRequiredParameters(schema);
    const missingParams: string[] = [];

    // Check for missing required parameters
    for (const param of requiredParams) {
      if (parameters === null || parameters === undefined || !(param.name in parameters) || parameters[param.name] === null || parameters[param.name] === undefined || parameters[param.name] === '') {
        missingParams.push(param.name);
      }
    }

    if (missingParams.length > 0) {
      // Enhanced error message with diagnostic information
      const receivedKeys = parameters ? Object.keys(parameters) : [];
      const diagnostics = [
        `Missing required parameters: ${missingParams.join(', ')}`,
        `Received parameters: ${receivedKeys.length > 0 ? receivedKeys.join(', ') : '(none)'}`,
        `Parameter types: ${JSON.stringify(
          receivedKeys.reduce((acc, key) => ({ ...acc, [key]: typeof parameters[key] }), {})
        )}`,
        `Use 'ncp find "${mcpName}:${toolName}" --depth 2' to see parameter details.`
      ];
      return diagnostics.join('\n');
    }

    return null; // Validation passed
  }

  /**
   * Get tool context for parameter prediction
   */
  getToolContext(toolIdentifier: string): string {
    return ToolContextResolver.getContext(toolIdentifier);
  }

  /**
   * Find similar tool names using fuzzy matching
   */
  private findSimilarTools(targetTool: string, maxSuggestions: number = 3): string[] {
    const allTools = Array.from(this.toolToMCP.keys());
    const similarities = allTools.map(tool => ({
      tool,
      similarity: calculateSimilarity(targetTool, tool)
    }));

    return similarities
      .filter(item => item.similarity > 0.4) // Only suggest if reasonably similar
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxSuggestions)
      .map(item => item.tool);
  }

  /**
   * Generate hash for each MCP configuration
   */
  private generateConfigHashes(profile: Profile): Record<string, string> {
    const hashes: Record<string, string> = {};
    const crypto = require('crypto');

    for (const [mcpName, config] of Object.entries(profile.mcpServers)) {
      // Hash command + args + env + url for change detection
      const configString = JSON.stringify({
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        url: config.url  // Include HTTP/SSE URL in hash
      });

      hashes[mcpName] = crypto.createHash('sha256').update(configString).digest('hex');
    }

    return hashes;
  }

  /**
   * Get current indexing progress
   */
  getIndexingProgress(): { current: number; total: number; currentMCP: string; estimatedTimeRemaining?: number } | null {
    return this.indexingProgress;
  }

  /**
   * Wait for background initialization to complete
   * This is useful for operations that need all MCPs to be indexed before proceeding
   */
  async waitForInitialization(): Promise<void> {
    if (this.backgroundInitPromise) {
      logger.info('[NCPOrchestrator] Waiting for background initialization to complete...');
      await this.backgroundInitPromise;
      logger.info('[NCPOrchestrator] Background initialization completed');
    }
  }

  /**
   * Get MCP health status summary
   */
  getMCPHealthStatus(): { total: number; healthy: number; unhealthy: number; mcps: Array<{name: string; healthy: boolean}> } {
    const allMCPs = Array.from(this.definitions.keys());
    const healthyMCPs = this.healthMonitor.getHealthyMCPs(allMCPs);

    const mcpStatus = allMCPs.map(mcp => ({
      name: mcp,
      healthy: healthyMCPs.includes(mcp)
    }));

    return {
      total: allMCPs.length,
      healthy: healthyMCPs.length,
      unhealthy: allMCPs.length - healthyMCPs.length,
      mcps: mcpStatus
    };
  }

  /**
   * Enhance generic error messages with better context
   */
  private enhanceErrorMessage(error: any, toolName: string, mcpName: string): string {
    const errorMessage = error.message || error.toString() || 'Unknown error';

    // Build detailed error message with all available error information
    let enhancedMessage = `Tool '${toolName}' failed in MCP '${mcpName}': ${errorMessage}`;

    // Include error code if available (MCP protocol errors)
    if (error.code !== undefined) {
      enhancedMessage += `\nError Code: ${error.code}`;
    }

    // Include error data if available (additional context from MCP)
    if (error.data) {
      const errorData = typeof error.data === 'string' ? error.data : JSON.stringify(error.data, null, 2);
      enhancedMessage += `\nDetails: ${errorData}`;
    }

    // Include stack trace for debugging (first few lines only)
    if (error.stack && process.env.NCP_DEBUG === 'true') {
      const stackLines = error.stack.split('\n').slice(0, 3).join('\n');
      enhancedMessage += `\n\nStack Trace:\n${stackLines}`;
    }

    // Add generic troubleshooting guidance
    const troubleshootingTips = [
      `• Check MCP '${mcpName}' status and configuration`,
      `• Use 'ncp find "${mcpName}:${toolName}" --depth 2' to verify tool parameters`,
      `• Ensure MCP server is running and accessible`
    ];

    enhancedMessage += `\n\nTroubleshooting:\n${troubleshootingTips.join('\n')}`;

    return enhancedMessage;
  }

  /**
   * Get all resources from active MCPs
   */
  async getAllResources(): Promise<Array<any>> {
    const resources: Array<any> = [];
    const allMCPs = Array.from(this.definitions.keys());
    const healthyMCPs = this.healthMonitor.getHealthyMCPs(allMCPs);

    for (const mcpName of healthyMCPs) {
      try {
        const mcpResources = await this.getResourcesFromMCP(mcpName);
        if (mcpResources && Array.isArray(mcpResources)) {
          // Add MCP source information to each resource with prefix
          const enrichedResources = mcpResources.map(resource => ({
            ...resource,
            name: `${mcpName}:${resource.name}`, // Add MCP prefix
            _source: mcpName
          }));
          resources.push(...enrichedResources);
        }
      } catch (error) {
        logger.warn(`Failed to get resources from ${mcpName}: ${error}`);
      }
    }

    return resources;
  }

  /**
   * Get all prompts from active MCPs
   */
  async getAllPrompts(): Promise<Array<any>> {
    const prompts: Array<any> = [];
    const allMCPs = Array.from(this.definitions.keys());
    const healthyMCPs = this.healthMonitor.getHealthyMCPs(allMCPs);

    for (const mcpName of healthyMCPs) {
      try {
        const mcpPrompts = await this.getPromptsFromMCP(mcpName);
        if (mcpPrompts && Array.isArray(mcpPrompts)) {
          // Add MCP source information to each prompt with prefix
          const enrichedPrompts = mcpPrompts.map(prompt => ({
            ...prompt,
            name: `${mcpName}:${prompt.name}`, // Add MCP prefix
            _source: mcpName
          }));
          prompts.push(...enrichedPrompts);
        }
      } catch (error) {
        logger.warn(`Failed to get prompts from ${mcpName}: ${error}`);
      }
    }

    return prompts;
  }

  /**
   * Get resources from a specific MCP
   */
  private async getResourcesFromMCP(mcpName: string): Promise<Array<any>> {
    try {
      const definition = this.definitions.get(mcpName);
      if (!definition) {
        return [];
      }

      // Create temporary connection for resources request
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = await this.createTransport(definition.config, silentEnv);

      // Use actual client info for transparent passthrough to downstream MCPs
      const client = new Client(
        this.clientInfo,
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Resources connection timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Get resources list with filtered output
      const response = await withFilteredOutput(async () => {
        return await client.listResources();
      });
      await client.close();

      return response.resources || [];

    } catch (error) {
      logger.debug(`Resources probe failed for ${mcpName}: ${error}`);
      return [];
    }
  }

  /**
   * Get prompts from a specific MCP
   */
  private async getPromptsFromMCP(mcpName: string): Promise<Array<any>> {
    try {
      const definition = this.definitions.get(mcpName);
      if (!definition) {
        return [];
      }

      // Create temporary connection for prompts request
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = await this.createTransport(definition.config, silentEnv);

      // Use actual client info for transparent passthrough to downstream MCPs
      const client = new Client(
        this.clientInfo,
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Prompts connection timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Get prompts list with filtered output
      const response = await withFilteredOutput(async () => {
        return await client.listPrompts();
      });
      await client.close();

      return response.prompts || [];

    } catch (error) {
      logger.debug(`Prompts probe failed for ${mcpName}: ${error}`);
      return [];
    }
  }

  /**
   * Get a specific prompt from an MCP and execute it
   * Used when client requests a prefixed prompt like "github:pr-template"
   */
  async getPromptFromMCP(mcpName: string, promptName: string, args: Record<string, any>): Promise<any> {
    try {
      const definition = this.definitions.get(mcpName);
      if (!definition) {
        throw new Error(`MCP '${mcpName}' not found`);
      }

      // Create temporary connection for prompt request
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = await this.createTransport(definition.config, silentEnv);

      // Use actual client info for transparent passthrough to downstream MCPs
      const client = new Client(
        this.clientInfo,
        { capabilities: {} }
      );

      // Connect with timeout and filtered output
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Prompt connection timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Get the specific prompt with filtered output
      const response = await withFilteredOutput(async () => {
        return await client.getPrompt({ name: promptName, arguments: args });
      });
      await client.close();

      // Return the prompt response with description and messages
      return {
        description: response.description,
        messages: response.messages
      };

    } catch (error: any) {
      logger.error(`Failed to get prompt ${promptName} from ${mcpName}: ${error.message}`);
      throw new Error(`Failed to get prompt from ${mcpName}: ${error.message}`);
    }
  }

  /**
   * Evict least recently used connection when pool is full
   * Implements LRU (Least Recently Used) eviction policy
   */
  private async evictLRUConnection(): Promise<void> {
    if (this.connections.size === 0) return;

    // Find the least recently used connection
    let lruName: string | null = null;
    let oldestLastUsed = Infinity;

    for (const [name, connection] of this.connections) {
      if (connection.lastUsed < oldestLastUsed) {
        oldestLastUsed = connection.lastUsed;
        lruName = name;
      }
    }

    if (lruName) {
      const idleTime = Date.now() - oldestLastUsed;
      logger.info(`🔄 Evicting LRU connection: ${lruName} (idle for ${Math.round(idleTime / 1000)}s, pool at limit)`);
      await this.disconnectMCP(lruName);
    }
  }

  /**
   * Clean up idle connections and enforce pool health
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const toDisconnect: string[] = [];

    for (const [name, connection] of this.connections) {
      const idleTime = now - connection.lastUsed;

      // Disconnect if idle too long
      if (idleTime > this.IDLE_TIMEOUT) {
        logger.info(`🧹 Disconnecting idle MCP: ${name} (idle for ${Math.round(idleTime / 1000)}s)`);
        toDisconnect.push(name);
      }
      // Also disconnect if execution count is too high (should have been caught earlier, but safety check)
      else if (connection.executionCount >= this.MAX_EXECUTIONS_PER_CONNECTION) {
        logger.info(`🧹 Disconnecting overused MCP: ${name} (${connection.executionCount} executions)`);
        toDisconnect.push(name);
      }
    }

    // Disconnect marked connections
    for (const name of toDisconnect) {
      await this.disconnectMCP(name);
    }

    // Log pool health stats periodically (every 10 cleanups = 10 minutes)
    if (Math.random() < 0.1) {
      logger.debug(`Connection pool: ${this.connections.size}/${this.MAX_CONNECTIONS} connections active`);
    }
  }

  /**
   * Disconnect a specific MCP
   */
  private async disconnectMCP(mcpName: string): Promise<void> {
    const connection = this.connections.get(mcpName);
    if (!connection) return;

    try {
      await connection.client.close();
      this.connections.delete(mcpName);
      logger.debug(`Disconnected ${mcpName}`);
    } catch (error) {
      logger.error(`Error disconnecting ${mcpName}:`, error);
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Shutting down NCP Orchestrator...');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Finalize cache if it's being written
    if (this.csvCache) {
      try {
        await this.csvCache.finalize();
      } catch (error) {
        // Ignore finalize errors
      }
    }

    // Stop progress spinner if active
    if (this.showProgress) {
      const { spinner } = await import('../utils/progress-spinner.js');
      spinner.stop();
    }

    // Close any active connections
    for (const connection of this.connections.values()) {
      try {
        await connection.client.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.connections.clear();
    logger.info('NCP orchestrator cleanup completed');
  }

  /**
   * Get server descriptions for all configured MCPs
   */
  getServerDescriptions(): Record<string, string> {
    const descriptions: Record<string, string> = {};

    // From active connections
    for (const [mcpName, connection] of this.connections) {
      if (connection.serverInfo?.description) {
        descriptions[mcpName] = connection.serverInfo.description;
      } else if (connection.serverInfo?.title) {
        descriptions[mcpName] = connection.serverInfo.title;
      }
    }

    // From cached definitions
    for (const [mcpName, definition] of this.definitions) {
      if (!descriptions[mcpName] && definition.serverInfo?.description) {
        descriptions[mcpName] = definition.serverInfo.description;
      } else if (!descriptions[mcpName] && definition.serverInfo?.title) {
        descriptions[mcpName] = definition.serverInfo.title;
      }
    }

    return descriptions;
  }

  /**
   * Apply universal term frequency scoring boost with action word weighting
   * Uses SearchEnhancer for clean, extensible term classification and semantic mapping
   */
  private adjustScoresUniversally(query: string, results: any[]): any[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2); // Skip very short terms

    return results.map(result => {
      const toolName = result.name.toLowerCase();
      const toolDescription = (result.description || '').toLowerCase();

      let nameBoost = 0;
      let descBoost = 0;

      // Process each query term with SearchEnhancer classification
      for (const term of queryTerms) {
        const termType = SearchEnhancer.classifyTerm(term);
        const weight = SearchEnhancer.getTypeWeights(termType);

        // Apply scoring based on term type
        if (toolName.includes(term)) {
          nameBoost += weight.name;
        }
        if (toolDescription.includes(term)) {
          descBoost += weight.desc;
        }

        // Apply semantic action matching for ACTION terms
        if (termType === 'ACTION') {
          const semantics = SearchEnhancer.getActionSemantics(term);
          for (const semanticMatch of semantics) {
            if (toolName.includes(semanticMatch)) {
              nameBoost += weight.name * 1.2; // 120% of full action weight for semantic matches (boosted)
            }
            if (toolDescription.includes(semanticMatch)) {
              descBoost += weight.desc * 1.2;
            }
          }

          // Apply intent penalties for conflicting actions
          const penalty = SearchEnhancer.getIntentPenalty(term, toolName);
          nameBoost -= penalty;
        }
      }

      // Apply diminishing returns to prevent excessive stacking
      const baseWeight = 0.15; // Base weight for diminishing returns calculation
      const finalNameBoost = nameBoost > 0 ? nameBoost * Math.pow(0.8, Math.max(0, nameBoost / baseWeight - 1)) : 0;
      const finalDescBoost = descBoost > 0 ? descBoost * Math.pow(0.8, Math.max(0, descBoost / (baseWeight / 2) - 1)) : 0;

      const totalBoost = 1 + finalNameBoost + finalDescBoost;

      return {
        ...result,
        confidence: result.confidence * totalBoost
      };
    });
  }

  /**
   * Trigger auto-import from MCP client
   * Called by MCPServer after it receives clientInfo from initialize request
   * Re-indexes any new MCPs that were added by auto-import
   */
  async triggerAutoImport(
    clientName: string,
    elicitationServer?: any,
    notificationManager?: any
  ): Promise<void> {
    if (!this.profileManager) {
      // ProfileManager not initialized yet, skip auto-import
      logger.warn('ProfileManager not initialized, skipping auto-import');
      return;
    }

    try {
      // Get current MCPs before auto-import
      const profileBefore = await this.profileManager.getProfile(this.profileName);
      if (!profileBefore) {
        return;
      }
      const mcpsBefore = new Set(Object.keys(profileBefore.mcpServers));

      // Run auto-import (adds new MCPs to profile)
      // Pass elicitation server and notification manager for config replacement flow
      await this.profileManager.tryAutoImportFromClient(
        clientName,
        elicitationServer,
        notificationManager
      );

      // Get updated profile after auto-import
      const profileAfter = await this.profileManager.getProfile(this.profileName);
      if (!profileAfter) {
        return;
      }

      // Find new MCPs that were added
      const newMCPs: MCPConfig[] = [];
      for (const [name, config] of Object.entries(profileAfter.mcpServers)) {
        if (!mcpsBefore.has(name)) {
          newMCPs.push({
            name,
            command: config.command,
            args: config.args,
            env: config.env || {},
            url: config.url
          });
        }
      }

      // If new MCPs were added, index them
      if (newMCPs.length > 0) {
        logger.info(`Indexing ${newMCPs.length} new MCPs from auto-import...`);

        // Update profile hash in cache
        const profileHash = CSVCache.hashProfile(profileAfter.mcpServers);
        await this.csvCache.startIncrementalWrite(profileHash);

        // Index new MCPs (incremental mode)
        await this.discoverMCPTools(newMCPs, profileAfter, true, Object.keys(profileAfter.mcpServers).length);

        // Finalize cache
        await this.csvCache.finalize();

        logger.info(`Successfully indexed ${newMCPs.length} new MCPs`);
      }
    } catch (error: any) {
      logger.error(`Auto-import failed: ${error.message}`);
    }
  }

  /**
   * Add internal MCPs to tool discovery
   * Called after external MCPs are indexed
   */
  private async addInternalMCPsToDiscovery(): Promise<void> {
    // Only get enabled internal MCPs (respects user configuration)
    const internalMCPs = this.internalMCPManager.getAllEnabledInternalMCPs();

    for (const mcp of internalMCPs) {
      // Add to definitions (for consistency with external MCPs)
      this.definitions.set(mcp.name, {
        name: mcp.name,
        config: {
          name: mcp.name,
          command: 'internal',
          args: []
        },
        tools: mcp.tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema  // Include schema for parameter visibility
        })),
        serverInfo: {
          name: mcp.name,
          version: version,
          description: mcp.description
        }
      });

      // Add tools to allTools and discovery
      for (const tool of mcp.tools) {
        const toolId = `${mcp.name}:${tool.name}`;
        const prefixedDescription = `${mcp.name}: ${tool.description}`;

        // Add to allTools with prefixed name (consistent with external MCPs)
        this.allTools.push({
          name: toolId,  // Prefixed: "ncp:add", "ncp:remove", etc.
          description: prefixedDescription,
          mcpName: mcp.name
        });

        // Add to toolToMCP mapping (both prefixed and unprefixed for consistency)
        this.toolToMCP.set(tool.name, mcp.name);       // Unprefixed: "add" -> "ncp"
        this.toolToMCP.set(toolId, mcp.name);          // Prefixed: "ncp:add" -> "ncp"
      }

      // Index in discovery engine with prefixed descriptions
      const discoveryTools = mcp.tools.map(t => ({
        id: `${mcp.name}:${t.name}`,
        name: t.name,
        description: t.description  // Use unprefixed description for discovery
      }));

      await this.discovery.indexMCPTools(mcp.name, discoveryTools);

      logger.info(`Added internal MCP "${mcp.name}" with ${mcp.tools.length} tools`);
    }
  }

  /**
   * Get the ProfileManager instance
   * Used by MCP server for management operations (add/remove MCPs)
   */
  getProfileManager(): ProfileManager | null {
    return this.profileManager;
  }

  /**
   * Get the InternalMCPManager instance
   * Used by MCP server to wire up elicitation for credential collection
   */
  getInternalMCPManager() {
    return this.internalMCPManager;
  }

  /**
   * Get the profile name
   * Used by MCP server for resource generation
   */
  getProfileName(): string {
    return this.profileName;
  }

  /**
   * Read a resource from an MCP by URI
   * Used by MCP server to handle resources/read requests
   */
  async readResource(uri: string): Promise<string> {
    // Parse URI to extract MCP name and resource path
    // Format: mcp_name:resource_path or full URI
    const uriParts = uri.split(':');
    if (uriParts.length < 2) {
      throw new Error(`Invalid resource URI format: ${uri}`);
    }

    const mcpName = uriParts[0];
    const resourceUri = uriParts.slice(1).join(':'); // Rejoin in case URI has multiple colons

    const definition = this.definitions.get(mcpName);
    if (!definition) {
      throw new Error(`MCP '${mcpName}' not found`);
    }

    // Create temporary connection to read resource
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

      const silentEnv = {
        ...process.env,
        ...(definition.config.env || {}),
        MCP_SILENT: 'true',
        QUIET: 'true',
        NO_COLOR: 'true'
      };

      const transport = await this.createTransport(definition.config, silentEnv);

      // Use actual client info for transparent passthrough to downstream MCPs
      const client = new Client(
        this.clientInfo,
        { capabilities: {} }
      );

      // Connect with timeout
      await withFilteredOutput(async () => {
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Resource connection timeout')), this.QUICK_PROBE_TIMEOUT)
          )
        ]);
      });

      // Read resource
      const response = await withFilteredOutput(async () => {
        return await client.readResource({ uri: resourceUri });
      });

      await client.close();

      // Return the first content item's text
      if (response.contents && response.contents.length > 0) {
        const content = response.contents[0];
        if (content && typeof content.text === 'string') {
          return content.text;
        }
        if (content && content.text) {
          return String(content.text);
        }
      }

      return '';
    } catch (error: any) {
      logger.error(`Failed to read resource ${uri}: ${error.message}`);
      throw new Error(`Failed to read resource from ${mcpName}: ${error.message}`);
    }
  }

  /**
   * Get auto-import summary
   * Returns summary of last auto-import operation (if any)
   */
  getAutoImportSummary(): { count: number; source?: string; profile?: string; timestamp?: string; mcps?: Array<{ name: string; transport: string }>; skipped?: number } | null {
    // For Phase 1, return null to show "no auto-import yet" message
    // In the future, this could track actual auto-import data
    // For now, we'll just return null which will trigger the appropriate message in the resource
    return null;
  }

  /**
   * Set actual client information for transparent passthrough to downstream MCPs
   * Called by MCPServer after receiving clientInfo from initialize request
   */
  setClientInfo(clientInfo: { name: string; version: string }): void {
    this.clientInfo = clientInfo;
    logger.debug(`Client info updated: ${clientInfo.name} v${clientInfo.version}`);
  }

  /**
   * Execute TypeScript code with access to all MCPs and Photons as namespaces
   * Implements UTCP Code-Mode for 60% faster execution, 68% fewer tokens
   */
  async executeCode(code: string, timeout?: number): Promise<{
    result: any;
    logs: string[];
    error?: string;
  }> {
    return await this.codeExecutor.executeCode(code, timeout);
  }


  /**
   * Hash a string for change detection
   */
  private hashString(str: string): string {
    return createHash('sha256').update(str).digest('hex');
  }
}

export default NCPOrchestrator;