/**
 * Task Manager - CRUD operations for scheduled tasks and timing groups
 * Uses simple JSON file storage at ~/.ncp/scheduler/schedule.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getSchedulerDirectory } from '../../utils/ncp-paths.js';
import { ScheduledTask, TimingGroup, SchedulerStorage } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';
import { cronToTimingId, cronToTimingName, normalizeCronExpression } from './cron-expression-utils.js';

export class TaskManager {
  private scheduleFile: string | null = null;
  private initialized: boolean = false;
  private static STORAGE_VERSION = '2.0.0';
  private customSchedulerDir?: string;

  constructor(customSchedulerDir?: string) {
    // Lazy initialization - don't traverse directories during construction
    this.customSchedulerDir = customSchedulerDir;
  }

  /**
   * Initialize paths and directories on first use
   */
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    const schedulerDir = this.customSchedulerDir || getSchedulerDirectory();
    this.scheduleFile = join(schedulerDir, 'schedule.json');

    // Ensure scheduler directory exists
    if (!existsSync(schedulerDir)) {
      mkdirSync(schedulerDir, { recursive: true });
      logger.info(`[TaskManager] Created scheduler directory: ${schedulerDir}`);
    }

    this.initialized = true;
  }

  /**
   * Load all tasks and timings from storage
   */
  private loadStorage(): SchedulerStorage {
    this.ensureInitialized();
    if (!existsSync(this.scheduleFile!)) {
      return {
        version: TaskManager.STORAGE_VERSION,
        tasks: {},
        timings: {}
      };
    }

    try {
      const content = readFileSync(this.scheduleFile!, 'utf-8');
      const storage: SchedulerStorage = JSON.parse(content);

      // Validate storage version
      if (storage.version !== TaskManager.STORAGE_VERSION) {
        logger.warn(`[TaskManager] Storage version mismatch. Expected ${TaskManager.STORAGE_VERSION}, got ${storage.version}`);
      }

      return storage;
    } catch (error) {
      logger.error(`[TaskManager] Failed to load storage: ${error instanceof Error ? error.message : String(error)}`);
      // Return empty storage on error
      return {
        version: TaskManager.STORAGE_VERSION,
        tasks: {},
        timings: {}
      };
    }
  }

  /**
   * Save tasks and timings to storage
   */
  private saveStorage(storage: SchedulerStorage): void {
    this.ensureInitialized();
    try {
      const content = JSON.stringify(storage, null, 2);
      writeFileSync(this.scheduleFile!, content, 'utf-8');
      logger.debug(`[TaskManager] Saved ${Object.keys(storage.tasks).length} tasks and ${Object.keys(storage.timings).length} timings to storage`);
    } catch (error) {
      logger.error(`[TaskManager] Failed to save storage: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to save storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // =============================================================================
  // TIMING GROUP MANAGEMENT
  // =============================================================================

  /**
   * Get or create a timing group for the given cron expression
   * Returns the timing ID
   */
  getOrCreateTimingGroup(cronExpression: string, timezone?: string): string {
    const storage = this.loadStorage();
    const normalized = normalizeCronExpression(cronExpression);
    const timingId = cronToTimingId(normalized);

    // Check if timing group already exists
    if (storage.timings[timingId]) {
      logger.debug(`[TaskManager] Using existing timing group: ${timingId}`);
      return timingId;
    }

    // Create new timing group
    const timingGroup: TimingGroup = {
      id: timingId,
      name: cronToTimingName(normalized),
      cronExpression: normalized,
      timezone,
      taskIds: [],
      createdAt: new Date().toISOString()
    };

    storage.timings[timingId] = timingGroup;
    this.saveStorage(storage);
    logger.info(`[TaskManager] Created timing group: ${timingGroup.name} (${timingId})`);

    return timingId;
  }

  /**
   * Get a timing group by ID
   */
  getTimingGroup(timingId: string): TimingGroup | null {
    const storage = this.loadStorage();
    return storage.timings[timingId] || null;
  }

  /**
   * Get all timing groups
   */
  getAllTimingGroups(): TimingGroup[] {
    const storage = this.loadStorage();
    return Object.values(storage.timings);
  }

  /**
   * Add a task to a timing group
   */
  addTaskToTiming(taskId: string, timingId: string): void {
    const storage = this.loadStorage();
    const timing = storage.timings[timingId];

    if (!timing) {
      throw new Error(`Timing group "${timingId}" not found`);
    }

    if (!timing.taskIds.includes(taskId)) {
      timing.taskIds.push(taskId);
      this.saveStorage(storage);
      logger.debug(`[TaskManager] Added task ${taskId} to timing ${timingId}`);
    }
  }

  /**
   * Remove a task from a timing group
   * If this was the last task, delete the timing group
   */
  removeTaskFromTiming(taskId: string, timingId: string): boolean {
    const storage = this.loadStorage();
    const timing = storage.timings[timingId];

    if (!timing) {
      return false;
    }

    // Remove task from timing's taskIds array
    timing.taskIds = timing.taskIds.filter(id => id !== taskId);

    // If timing group is now empty, delete it
    if (timing.taskIds.length === 0) {
      delete storage.timings[timingId];
      this.saveStorage(storage);
      logger.info(`[TaskManager] Deleted empty timing group: ${timingId}`);
      return true; // Indicate timing should be removed from OS scheduler
    }

    this.saveStorage(storage);
    logger.debug(`[TaskManager] Removed task ${taskId} from timing ${timingId}`);
    return false;
  }

  /**
   * Get all tasks for a timing group
   */
  getTasksForTiming(timingId: string): ScheduledTask[] {
    const storage = this.loadStorage();
    const timing = storage.timings[timingId];

    if (!timing) {
      return [];
    }

    return timing.taskIds
      .map(taskId => storage.tasks[taskId])
      .filter(task => task !== undefined);
  }

  /**
   * Get all active tasks for a timing group
   */
  getActiveTasksForTiming(timingId: string): ScheduledTask[] {
    return this.getTasksForTiming(timingId).filter(task => task.status === 'active');
  }

  // =============================================================================
  // TASK MANAGEMENT
  // =============================================================================

  /**
   * Create a new task
   */
  createTask(task: ScheduledTask): void {
    const storage = this.loadStorage();

    // Check for duplicate ID
    if (storage.tasks[task.id]) {
      throw new Error(`Task with ID "${task.id}" already exists`);
    }

    // Check for duplicate name
    const existingTaskWithName = Object.values(storage.tasks).find(t => t.name === task.name);
    if (existingTaskWithName) {
      throw new Error(`Task with name "${task.name}" already exists (ID: ${existingTaskWithName.id})`);
    }

    // Verify timing group exists
    if (!storage.timings[task.timingId]) {
      throw new Error(`Timing group "${task.timingId}" not found. Create timing group first.`);
    }

    // Add task to storage
    storage.tasks[task.id] = task;

    // Add task ID to timing group
    if (!storage.timings[task.timingId].taskIds.includes(task.id)) {
      storage.timings[task.timingId].taskIds.push(task.id);
    }

    // Save once with both changes
    this.saveStorage(storage);
    logger.info(`[TaskManager] Created task: ${task.name} (${task.id}) with timing ${task.timingId}`);
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): ScheduledTask | null {
    const storage = this.loadStorage();
    return storage.tasks[taskId] || null;
  }

  /**
   * Get a task by name
   */
  getTaskByName(name: string): ScheduledTask | null {
    const storage = this.loadStorage();
    const task = Object.values(storage.tasks).find(t => t.name === name);
    return task || null;
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ScheduledTask[] {
    const storage = this.loadStorage();
    return Object.values(storage.tasks);
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: ScheduledTask['status']): ScheduledTask[] {
    const storage = this.loadStorage();
    return Object.values(storage.tasks).filter(task => task.status === status);
  }

  /**
   * Update a task
   */
  updateTask(taskId: string, updates: Partial<ScheduledTask>): void {
    const storage = this.loadStorage();
    const task = storage.tasks[taskId];

    if (!task) {
      throw new Error(`Task with ID "${taskId}" not found`);
    }

    // Don't allow changing ID, createdAt, or timingId
    const { id, createdAt, timingId, ...allowedUpdates } = updates;

    // If name is being changed, check for duplicates
    if (updates.name && updates.name !== task.name) {
      const existingTaskWithName = Object.values(storage.tasks).find(
        t => t.name === updates.name && t.id !== taskId
      );
      if (existingTaskWithName) {
        throw new Error(`Task with name "${updates.name}" already exists (ID: ${existingTaskWithName.id})`);
      }
    }

    storage.tasks[taskId] = { ...task, ...allowedUpdates };
    this.saveStorage(storage);
    logger.info(`[TaskManager] Updated task: ${task.name} (${taskId})`);
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    const storage = this.loadStorage();
    const task = storage.tasks[taskId];

    if (!task) {
      throw new Error(`Task with ID "${taskId}" not found`);
    }

    // Remove task from storage
    delete storage.tasks[taskId];

    // Remove from timing group
    const timing = storage.timings[task.timingId];
    let shouldRemoveTiming = false;

    if (timing) {
      timing.taskIds = timing.taskIds.filter(id => id !== taskId);

      // If timing group is now empty, delete it
      if (timing.taskIds.length === 0) {
        delete storage.timings[task.timingId];
        shouldRemoveTiming = true;
        logger.info(`[TaskManager] Deleted empty timing group: ${task.timingId}`);
      }
    }

    // Save once with all changes
    this.saveStorage(storage);
    logger.info(`[TaskManager] Deleted task: ${task.name} (${taskId})`);

    return shouldRemoveTiming;
  }

  /**
   * Increment execution count and update last execution metadata
   */
  recordExecution(taskId: string, executionId: string, executionTime: string): void {
    const storage = this.loadStorage();
    const task = storage.tasks[taskId];

    if (!task) {
      logger.warn(`[TaskManager] Cannot record execution: Task ${taskId} not found`);
      return;
    }

    task.executionCount++;
    task.lastExecutionId = executionId;
    task.lastExecutionAt = executionTime;

    // Check if task should be marked as completed
    if (task.fireOnce) {
      task.status = 'completed';
      logger.info(`[TaskManager] Task ${task.name} marked as completed (fireOnce=true)`);
    } else if (task.maxExecutions && task.executionCount >= task.maxExecutions) {
      task.status = 'completed';
      logger.info(`[TaskManager] Task ${task.name} marked as completed (maxExecutions=${task.maxExecutions} reached)`);
    } else if (task.endDate) {
      const now = new Date();
      const endDate = new Date(task.endDate);
      if (now >= endDate) {
        task.status = 'completed';
        logger.info(`[TaskManager] Task ${task.name} marked as completed (endDate reached)`);
      }
    }

    this.saveStorage(storage);

    // Update timing group's last execution time
    const timing = storage.timings[task.timingId];
    if (timing) {
      timing.lastExecutionAt = executionTime;
      this.saveStorage(storage);
    }
  }

  /**
   * Mark a task as errored
   */
  markTaskAsErrored(taskId: string, errorMessage: string): void {
    this.updateTask(taskId, {
      status: 'error',
      errorMessage
    });
  }

  /**
   * Get task statistics
   */
  getStatistics(): {
    totalTasks: number;
    activeTasks: number;
    pausedTasks: number;
    completedTasks: number;
    errorTasks: number;
    totalTimings: number;
  } {
    const tasks = this.getAllTasks();
    const timings = this.getAllTimingGroups();

    return {
      totalTasks: tasks.length,
      activeTasks: tasks.filter(t => t.status === 'active').length,
      pausedTasks: tasks.filter(t => t.status === 'paused').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      errorTasks: tasks.filter(t => t.status === 'error').length,
      totalTimings: timings.length
    };
  }
}
