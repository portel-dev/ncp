/**
 * Unit Tests for JobManager
 * Tests CRUD operations on scheduled jobs
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { JobManager } from '../../src/services/scheduler/job-manager';
import { createTestDirectory, cleanupTestDirectory, mockSchedulerEnvironment, createMockJob } from './test-helpers';

describe('JobManager', () => {
  let testDir: string;
  let jobManager: JobManager;
  let originalGetSchedulerDirectory: any;

  beforeEach(() => {
    // Create isolated test environment
    testDir = createTestDirectory();
    const { schedulerDir } = mockSchedulerEnvironment(testDir);

    // Mock the ncp-paths module to use test directory
    jest.mock('../../src/utils/ncp-paths', () => ({
      getSchedulerDirectory: () => schedulerDir
    }));

    // Force re-import to use mocked path
    jest.resetModules();
    const { JobManager: JobManagerClass } = require('../../src/services/scheduler/job-manager');
    jobManager = new JobManagerClass();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should create a new job', () => {
      const job = createMockJob();

      jobManager.createJob(job);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved).toEqual(job);
    });

    it('should reject duplicate job IDs', () => {
      const job = createMockJob();

      jobManager.createJob(job);

      expect(() => jobManager.createJob(job)).toThrow('already exists');
    });

    it('should reject duplicate job names', () => {
      const job1 = createMockJob({ id: 'job-1', name: 'My Job' });
      const job2 = createMockJob({ id: 'job-2', name: 'My Job' });

      jobManager.createJob(job1);

      expect(() => jobManager.createJob(job2)).toThrow('already exists');
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', () => {
      const retrieved = jobManager.getJob('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should retrieve existing job', () => {
      const job = createMockJob();
      jobManager.createJob(job);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved).toEqual(job);
    });
  });

  describe('getJobByName', () => {
    it('should find job by name', () => {
      const job = createMockJob({ name: 'Daily Backup' });
      jobManager.createJob(job);

      const retrieved = jobManager.getJobByName('Daily Backup');
      expect(retrieved).toEqual(job);
    });

    it('should return null for non-existent name', () => {
      const retrieved = jobManager.getJobByName('Non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs', () => {
      const jobs = jobManager.getAllJobs();
      expect(jobs).toEqual([]);
    });

    it('should return all jobs', () => {
      const job1 = createMockJob({ id: 'job-1', name: 'Job 1' });
      const job2 = createMockJob({ id: 'job-2', name: 'Job 2' });

      jobManager.createJob(job1);
      jobManager.createJob(job2);

      const jobs = jobManager.getAllJobs();
      expect(jobs).toHaveLength(2);
      expect(jobs).toContainEqual(job1);
      expect(jobs).toContainEqual(job2);
    });
  });

  describe('getJobsByStatus', () => {
    it('should filter jobs by status', () => {
      const activeJob = createMockJob({ id: 'job-1', name: 'Active Job', status: 'active' });
      const pausedJob = createMockJob({ id: 'job-2', name: 'Paused Job', status: 'paused' });

      jobManager.createJob(activeJob);
      jobManager.createJob(pausedJob);

      const activeJobs = jobManager.getJobsByStatus('active');
      expect(activeJobs).toHaveLength(1);
      expect(activeJobs[0].id).toBe('job-1');

      const pausedJobs = jobManager.getJobsByStatus('paused');
      expect(pausedJobs).toHaveLength(1);
      expect(pausedJobs[0].id).toBe('job-2');
    });
  });

  describe('updateJob', () => {
    it('should update job fields', () => {
      const job = createMockJob({ description: 'Old description' });
      jobManager.createJob(job);

      jobManager.updateJob(job.id, { description: 'New description' });

      const updated = jobManager.getJob(job.id);
      expect(updated?.description).toBe('New description');
    });

    it('should not allow changing ID', () => {
      const job = createMockJob();
      jobManager.createJob(job);

      jobManager.updateJob(job.id, { id: 'new-id' } as any);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved?.id).toBe(job.id);
    });

    it('should not allow changing createdAt', () => {
      const job = createMockJob();
      jobManager.createJob(job);

      const newDate = new Date('2025-01-01').toISOString();
      jobManager.updateJob(job.id, { createdAt: newDate } as any);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved?.createdAt).toBe(job.createdAt);
    });

    it('should reject duplicate names on update', () => {
      const job1 = createMockJob({ id: 'job-1', name: 'Job 1' });
      const job2 = createMockJob({ id: 'job-2', name: 'Job 2' });

      jobManager.createJob(job1);
      jobManager.createJob(job2);

      expect(() => jobManager.updateJob(job2.id, { name: 'Job 1' })).toThrow('already exists');
    });
  });

  describe('deleteJob', () => {
    it('should delete job', () => {
      const job = createMockJob();
      jobManager.createJob(job);

      jobManager.deleteJob(job.id);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved).toBeNull();
    });

    it('should throw for non-existent job', () => {
      expect(() => jobManager.deleteJob('non-existent')).toThrow('not found');
    });
  });

  describe('recordExecution', () => {
    it('should increment execution count', () => {
      const job = createMockJob({ executionCount: 0 });
      jobManager.createJob(job);

      jobManager.recordExecution(job.id, 'exec-1', new Date().toISOString());

      const updated = jobManager.getJob(job.id);
      expect(updated?.executionCount).toBe(1);
      expect(updated?.lastExecutionId).toBe('exec-1');
    });

    it('should mark fireOnce job as completed', () => {
      const job = createMockJob({ fireOnce: true });
      jobManager.createJob(job);

      jobManager.recordExecution(job.id, 'exec-1', new Date().toISOString());

      const updated = jobManager.getJob(job.id);
      expect(updated?.status).toBe('completed');
    });

    it('should mark job as completed when maxExecutions reached', () => {
      const job = createMockJob({ maxExecutions: 2, executionCount: 1 });
      jobManager.createJob(job);

      jobManager.recordExecution(job.id, 'exec-2', new Date().toISOString());

      const updated = jobManager.getJob(job.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.executionCount).toBe(2);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      jobManager.createJob(createMockJob({ id: 'job-1', name: 'Job 1', status: 'active' }));
      jobManager.createJob(createMockJob({ id: 'job-2', name: 'Job 2', status: 'active' }));
      jobManager.createJob(createMockJob({ id: 'job-3', name: 'Job 3', status: 'paused' }));
      jobManager.createJob(createMockJob({ id: 'job-4', name: 'Job 4', status: 'completed' }));
      jobManager.createJob(createMockJob({ id: 'job-5', name: 'Job 5', status: 'error' }));

      const stats = jobManager.getStatistics();

      expect(stats.total).toBe(5);
      expect(stats.active).toBe(2);
      expect(stats.paused).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.error).toBe(1);
    });
  });
});
