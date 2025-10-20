/**
 * Job Manager - CRUD operations for scheduled jobs
 * Uses simple JSON file storage at ~/.ncp/scheduler/jobs.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getSchedulerDirectory } from '../../utils/ncp-paths.js';
import { ScheduledJob, JobsStorage } from '../../types/scheduler.js';
import { logger } from '../../utils/logger.js';

export class JobManager {
  private jobsFile: string;
  private static STORAGE_VERSION = '1.0.0';

  constructor() {
    const schedulerDir = getSchedulerDirectory();
    this.jobsFile = join(schedulerDir, 'jobs.json');

    // Ensure scheduler directory exists
    if (!existsSync(schedulerDir)) {
      mkdirSync(schedulerDir, { recursive: true });
      logger.info(`[JobManager] Created scheduler directory: ${schedulerDir}`);
    }
  }

  /**
   * Load all jobs from storage
   */
  private loadJobs(): JobsStorage {
    if (!existsSync(this.jobsFile)) {
      return {
        version: JobManager.STORAGE_VERSION,
        jobs: {}
      };
    }

    try {
      const content = readFileSync(this.jobsFile, 'utf-8');
      const storage: JobsStorage = JSON.parse(content);

      // Validate storage version
      if (storage.version !== JobManager.STORAGE_VERSION) {
        logger.warn(`[JobManager] Storage version mismatch. Expected ${JobManager.STORAGE_VERSION}, got ${storage.version}`);
      }

      return storage;
    } catch (error) {
      logger.error(`[JobManager] Failed to load jobs: ${error instanceof Error ? error.message : String(error)}`);
      // Return empty storage on error
      return {
        version: JobManager.STORAGE_VERSION,
        jobs: {}
      };
    }
  }

  /**
   * Save jobs to storage
   */
  private saveJobs(storage: JobsStorage): void {
    try {
      const content = JSON.stringify(storage, null, 2);
      writeFileSync(this.jobsFile, content, 'utf-8');
      logger.debug(`[JobManager] Saved ${Object.keys(storage.jobs).length} jobs to storage`);
    } catch (error) {
      logger.error(`[JobManager] Failed to save jobs: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to save jobs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new job
   */
  createJob(job: ScheduledJob): void {
    const storage = this.loadJobs();

    // Check for duplicate ID
    if (storage.jobs[job.id]) {
      throw new Error(`Job with ID "${job.id}" already exists`);
    }

    // Check for duplicate name
    const existingJobWithName = Object.values(storage.jobs).find(j => j.name === job.name);
    if (existingJobWithName) {
      throw new Error(`Job with name "${job.name}" already exists (ID: ${existingJobWithName.id})`);
    }

    storage.jobs[job.id] = job;
    this.saveJobs(storage);
    logger.info(`[JobManager] Created job: ${job.name} (${job.id})`);
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): ScheduledJob | null {
    const storage = this.loadJobs();
    return storage.jobs[jobId] || null;
  }

  /**
   * Get a job by name
   */
  getJobByName(name: string): ScheduledJob | null {
    const storage = this.loadJobs();
    const job = Object.values(storage.jobs).find(j => j.name === name);
    return job || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): ScheduledJob[] {
    const storage = this.loadJobs();
    return Object.values(storage.jobs);
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: ScheduledJob['status']): ScheduledJob[] {
    const storage = this.loadJobs();
    return Object.values(storage.jobs).filter(job => job.status === status);
  }

  /**
   * Update a job
   */
  updateJob(jobId: string, updates: Partial<ScheduledJob>): void {
    const storage = this.loadJobs();
    const job = storage.jobs[jobId];

    if (!job) {
      throw new Error(`Job with ID "${jobId}" not found`);
    }

    // Don't allow changing ID or createdAt
    const { id, createdAt, ...allowedUpdates } = updates;

    // If name is being changed, check for duplicates
    if (updates.name && updates.name !== job.name) {
      const existingJobWithName = Object.values(storage.jobs).find(
        j => j.name === updates.name && j.id !== jobId
      );
      if (existingJobWithName) {
        throw new Error(`Job with name "${updates.name}" already exists (ID: ${existingJobWithName.id})`);
      }
    }

    storage.jobs[jobId] = { ...job, ...allowedUpdates };
    this.saveJobs(storage);
    logger.info(`[JobManager] Updated job: ${job.name} (${jobId})`);
  }

  /**
   * Delete a job
   */
  deleteJob(jobId: string): void {
    const storage = this.loadJobs();
    const job = storage.jobs[jobId];

    if (!job) {
      throw new Error(`Job with ID "${jobId}" not found`);
    }

    delete storage.jobs[jobId];
    this.saveJobs(storage);
    logger.info(`[JobManager] Deleted job: ${job.name} (${jobId})`);
  }

  /**
   * Increment execution count and update last execution metadata
   */
  recordExecution(jobId: string, executionId: string, executionTime: string): void {
    const storage = this.loadJobs();
    const job = storage.jobs[jobId];

    if (!job) {
      logger.warn(`[JobManager] Cannot record execution: Job ${jobId} not found`);
      return;
    }

    job.executionCount++;
    job.lastExecutionId = executionId;
    job.lastExecutionAt = executionTime;

    // Check if job should be marked as completed
    if (job.fireOnce) {
      job.status = 'completed';
      logger.info(`[JobManager] Job ${job.name} marked as completed (fireOnce=true)`);
    } else if (job.maxExecutions && job.executionCount >= job.maxExecutions) {
      job.status = 'completed';
      logger.info(`[JobManager] Job ${job.name} marked as completed (maxExecutions=${job.maxExecutions} reached)`);
    } else if (job.endDate) {
      const now = new Date();
      const endDate = new Date(job.endDate);
      if (now >= endDate) {
        job.status = 'completed';
        logger.info(`[JobManager] Job ${job.name} marked as completed (endDate reached)`);
      }
    }

    this.saveJobs(storage);
  }

  /**
   * Mark a job as errored
   */
  markJobAsErrored(jobId: string, errorMessage: string): void {
    this.updateJob(jobId, {
      status: 'error',
      errorMessage
    });
  }

  /**
   * Get job statistics
   */
  getStatistics(): {
    total: number;
    active: number;
    paused: number;
    completed: number;
    error: number;
  } {
    const jobs = this.getAllJobs();
    return {
      total: jobs.length,
      active: jobs.filter(j => j.status === 'active').length,
      paused: jobs.filter(j => j.status === 'paused').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      error: jobs.filter(j => j.status === 'error').length
    };
  }
}
