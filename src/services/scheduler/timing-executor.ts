/**
 * Timing Executor - Execute all active tasks for a timing group in parallel
 * Executes multiple tasks concurrently using isolated child processes for safety
 */

import { TaskManager } from './task-manager.js';
import { ExecutionRecorder } from './execution-recorder.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { ScheduledTask } from '../../types/scheduler.js';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

export interface TaskExecutionResult {
  taskId: string;
  taskName: string;
  executionId: string;
  status: 'success' | 'failure' | 'timeout';
  result?: any;
  error?: string;
  duration: number;
}

export interface TimingExecutionSummary {
  timingId: string;
  totalTasks: number;
  activeTasks: number;
  executedTasks: number;
  successfulTasks: number;
  failedTasks: number;
  skippedTasks: number;
  results: TaskExecutionResult[];
  totalDuration: number;
}

export class TimingExecutor {
  private taskManager: TaskManager;
  private executionRecorder: ExecutionRecorder;
  private defaultTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.taskManager = new TaskManager();
    this.executionRecorder = new ExecutionRecorder();
  }

  /**
   * Execute a single task immediately
   */
  async executeSingleTask(taskId: string, timeout?: number): Promise<TaskExecutionResult> {
    const task = this.taskManager.getTask(taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    logger.info(`[TimingExecutor] Executing single task: ${task.name} (${task.id})`);
    
    // Execute in child process for isolation
    return this.executeTaskInChildProcess(task, timeout);
  }

  /**
   * Execute all active tasks for a timing group in parallel
   */
  async executeTimingGroup(timingId: string, timeout?: number): Promise<TimingExecutionSummary> {
    const startTime = Date.now();

    logger.info(`[TimingExecutor] Starting execution for timing group: ${timingId}`);

    // Load timing group
    const timing = this.taskManager.getTimingGroup(timingId);
    if (!timing) {
      logger.error(`[TimingExecutor] Timing group ${timingId} not found`);
      return {
        timingId,
        totalTasks: 0,
        activeTasks: 0,
        executedTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        skippedTasks: 0,
        results: [],
        totalDuration: Date.now() - startTime
      };
    }

    // Get all tasks for this timing
    const allTasks = this.taskManager.getTasksForTiming(timingId);
    const activeTasks = allTasks.filter(task => task.status === 'active');

    logger.info(`[TimingExecutor] Timing ${timing.name}: ${activeTasks.length} active tasks out of ${allTasks.length} total`);

    if (activeTasks.length === 0) {
      logger.info(`[TimingExecutor] No active tasks to execute for timing ${timingId}`);
      return {
        timingId,
        totalTasks: allTasks.length,
        activeTasks: 0,
        executedTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        skippedTasks: allTasks.length,
        results: [],
        totalDuration: Date.now() - startTime
      };
    }

    // Execute all active tasks in parallel using ISOLATED child processes
    // This ensures if one task crashes, it doesn't affect other tasks
    logger.info(`[TimingExecutor] Executing ${activeTasks.length} tasks in parallel (isolated processes)...`);
    const executionPromises = activeTasks.map(task =>
      this.executeTaskInChildProcess(task, timeout).catch(error => ({
        taskId: task.id,
        taskName: task.name,
        executionId: uuidv4(),
        status: 'failure' as const,
        error: error instanceof Error ? error.message : String(error),
        duration: 0
      }))
    );

    const results = await Promise.allSettled(executionPromises);

    // Process results
    const taskResults: TaskExecutionResult[] = [];
    let successfulTasks = 0;
    let failedTasks = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        taskResults.push(result.value);
        if (result.value.status === 'success') {
          successfulTasks++;
        } else {
          failedTasks++;
        }
      } else {
        // This shouldn't happen due to catch above, but handle it anyway
        failedTasks++;
        logger.error(`[TimingExecutor] Unexpected promise rejection: ${result.reason}`);
      }
    }

    const totalDuration = Date.now() - startTime;

    logger.info(
      `[TimingExecutor] Timing ${timingId} execution completed: ` +
      `${successfulTasks} successful, ${failedTasks} failed, ` +
      `${allTasks.length - activeTasks.length} skipped (${totalDuration}ms)`
    );

    return {
      timingId,
      totalTasks: allTasks.length,
      activeTasks: activeTasks.length,
      executedTasks: taskResults.length,
      successfulTasks,
      failedTasks,
      skippedTasks: allTasks.length - activeTasks.length,
      results: taskResults,
      totalDuration
    };
  }

  /**
   * Get the path to ncp executable
   */
  private getNCPExecutablePath(): string {
    try {
      const ncpPath = execSync('which ncp', { encoding: 'utf-8' }).trim();
      return ncpPath;
    } catch {
      return 'npx ncp';
    }
  }

  /**
   * Execute a single task in an isolated child process
   * This ensures if one task crashes, it doesn't affect other tasks
   */
  private async executeTaskInChildProcess(task: ScheduledTask, timeout?: number): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const executionTimeout = timeout || this.defaultTimeout;

    logger.info(`[TimingExecutor] Starting task ${task.name} (${task.id}) in isolated child process`);

    return new Promise((resolve) => {
      const ncpPath = this.getNCPExecutablePath();

      // Spawn child process to execute the task
      // This provides complete isolation - if the task crashes, only this process dies
      const child = spawn(ncpPath, ['_task-execute', task.id], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
          NCP_TASK_EXECUTION: 'true' // Flag to indicate this is task execution
        }
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, executionTimeout);

      // Capture output
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process exit
      child.on('exit', (code, signal) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        if (killed) {
          logger.warn(`[TimingExecutor] Task ${task.name} timed out after ${executionTimeout}ms`);
          resolve({
            taskId: task.id,
            taskName: task.name,
            executionId: uuidv4(),
            status: 'timeout',
            error: `Task execution timeout after ${executionTimeout}ms`,
            duration
          });
        } else if (code === 0) {
          logger.info(`[TimingExecutor] Task ${task.name} completed successfully (${duration}ms)`);
          resolve({
            taskId: task.id,
            taskName: task.name,
            executionId: uuidv4(),
            status: 'success',
            result: stdout,
            duration
          });
        } else {
          const errorMsg = stderr || `Process exited with code ${code}` + (signal ? ` (signal: ${signal})` : '');
          logger.error(`[TimingExecutor] Task ${task.name} failed: ${errorMsg}`);
          resolve({
            taskId: task.id,
            taskName: task.name,
            executionId: uuidv4(),
            status: 'failure',
            error: errorMsg,
            duration
          });
        }
      });

      // Handle spawn errors
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        logger.error(`[TimingExecutor] Failed to spawn process for task ${task.name}: ${error.message}`);
        resolve({
          taskId: task.id,
          taskName: task.name,
          executionId: uuidv4(),
          status: 'failure',
          error: `Failed to spawn process: ${error.message}`,
          duration
        });
      });
    });
  }

  /**
   * Execute a single task (in-process - legacy, kept for backward compatibility)
   * @deprecated Use executeTaskInChildProcess for better isolation
   */
  private async executeTask(task: ScheduledTask, timeout?: number): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();
    const executionTimeout = timeout || this.defaultTimeout;

    logger.info(`[TimingExecutor] Starting execution ${executionId} for task ${task.name} (${task.id})`);

    // Start execution recording
    this.executionRecorder.startExecution({
      executionId,
      jobId: task.id, // Use taskId for backward compatibility with execution recorder
      jobName: task.name,
      tool: task.tool,
      parameters: task.parameters,
      startedAt: new Date().toISOString(),
      status: 'running'
    });

    // Track original working directory for restoration
    const originalCwd = process.cwd();

    try {
      logger.info(`[TimingExecutor] Executing ${task.tool} with parameters: ${JSON.stringify(task.parameters)}`);

      // Change to home directory to use global ~/.ncp config
      const { homedir } = await import('os');
      const homeDirectory = homedir();
      if (homeDirectory !== originalCwd) {
        process.chdir(homeDirectory);
        logger.debug(`[TimingExecutor] Changed working directory from ${originalCwd} to ${homeDirectory}`);
      }

      // Extract MCP name from tool (e.g., "apple-mcp" from "apple-mcp:mail")
      const mcpName = task.tool.includes(':') ? task.tool.split(':')[0] : null;
      logger.debug(`[TimingExecutor] Tool: ${task.tool}, MCP: ${mcpName || 'none'}`);

      // Create orchestrator with specific MCP profile
      const { NCPOrchestrator } = await import('../../orchestrator/ncp-orchestrator.js');
      const orchestrator = new NCPOrchestrator(mcpName || 'all', true); // Silent mode

      // Initialize and wait for background init to complete (with timeout)
      await orchestrator.initialize();
      await this.executeWithTimeout(
        () => orchestrator.waitForInitialization(),
        30000
      );

      // Execute tool with timeout
      const execResult = await this.executeWithTimeout<any>(
        () => orchestrator.run(task.tool, task.parameters),
        executionTimeout
      );

      // Cleanup orchestrator
      await orchestrator.cleanup();

      // Restore original working directory
      process.chdir(originalCwd);

      if (!execResult.success) {
        throw new Error(execResult.error || 'Tool execution failed');
      }

      const result = execResult.content;

      // Record successful execution
      const duration = Date.now() - startTime;
      this.executionRecorder.completeExecution(executionId, 'success', result);

      // Update task metadata
      this.taskManager.recordExecution(task.id, executionId, new Date().toISOString());

      logger.info(`[TimingExecutor] Task ${task.name} execution ${executionId} completed successfully in ${duration}ms`);

      return {
        taskId: task.id,
        taskName: task.name,
        executionId,
        status: 'success',
        result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      const status = isTimeout ? 'timeout' : 'failure';
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`[TimingExecutor] Task ${task.name} execution ${executionId} failed: ${errorMessage}`);

      // Restore original working directory
      try {
        process.chdir(originalCwd);
      } catch (chdirError) {
        logger.warn(`[TimingExecutor] Failed to restore working directory: ${chdirError}`);
      }

      // Record failed execution
      this.executionRecorder.completeExecution(
        executionId,
        status,
        undefined,
        { message: errorMessage }
      );

      // Mark task as errored if it's not a timeout
      if (!isTimeout) {
        this.taskManager.markTaskAsErrored(task.id, errorMessage);
      }

      return {
        taskId: task.id,
        taskName: task.name,
        executionId,
        status,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Clean up old executions based on retention policy
   */
  async cleanupOldExecutions(maxAgeDays: number = 30, maxExecutionsPerTask: number = 100): Promise<void> {
    logger.info(`[TimingExecutor] Starting cleanup: maxAge=${maxAgeDays} days, maxPerTask=${maxExecutionsPerTask}`);

    const result = this.executionRecorder.cleanupOldExecutions(maxAgeDays, maxExecutionsPerTask);

    if (result.errors.length > 0) {
      logger.warn(`[TimingExecutor] Cleanup completed with ${result.errors.length} errors`);
      result.errors.forEach(err => logger.warn(`  - ${err}`));
    } else {
      logger.info(`[TimingExecutor] Cleanup completed successfully: deleted ${result.deletedCount} executions`);
    }
  }
}
