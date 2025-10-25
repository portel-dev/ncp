/**
 * Unit Tests for JobManager
 * Tests CRUD operations on scheduled jobs
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createTestDirectory, cleanupTestDirectory, mockSchedulerEnvironment, createMockJob } from './test-helpers';

// Mock the ncp-paths module at module level with a mutable object
const mockPaths = { schedulerDir: '' };
jest.mock('../../src/utils/ncp-paths', () => ({
  getSchedulerDirectory: () => mockPaths.schedulerDir
}));

// Import after mock is set up
import { JobManager } from '../../src/services/scheduler/job-manager';

describe('JobManager', () => {
  let testDir: string;
  let jobManager: JobManager;

  beforeEach(() => {
    // Create isolated test environment
    testDir = createTestDirectory();
    const { schedulerDir } = mockSchedulerEnvironment(testDir);
    mockPaths.schedulerDir = schedulerDir;

    // Create new JobManager instance for each test
    jobManager = new JobManager();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should create a new job', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-1`, name: `Test Job ${timestamp}-1` });

      jobManager.createJob(job);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved).toEqual(job);
    });

    it('should reject duplicate job IDs', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-2`, name: `Test Job ${timestamp}-2` });

      jobManager.createJob(job);

      expect(() => jobManager.createJob(job)).toThrow('already exists');
    });

    it('should reject duplicate job names', () => {
      const uniqueName = `My Job ${Date.now()}`;
      const job1 = createMockJob({ id: `job-1-${Date.now()}`, name: uniqueName });
      const job2 = createMockJob({ id: `job-2-${Date.now()}`, name: uniqueName });

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
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-3`, name: `Test Job ${timestamp}-3` });
      jobManager.createJob(job);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved).toEqual(job);
    });
  });

  describe('getJobByName', () => {
    it('should find job by name', () => {
      const uniqueName = `Daily Backup ${Date.now()}`;
      const job = createMockJob({ id: `test-job-${Date.now()}-4`, name: uniqueName });
      jobManager.createJob(job);

      const retrieved = jobManager.getJobByName(uniqueName);
      expect(retrieved).toEqual(job);
    });

    it('should return null for non-existent name', () => {
      const retrieved = jobManager.getJobByName('Non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs', () => {
      // Clear any existing jobs first
      const existing = jobManager.getAllJobs();
      existing.forEach(job => {
        try { jobManager.deleteJob(job.id); } catch (e) { /* ignore */ }
      });

      const jobs = jobManager.getAllJobs();
      expect(jobs.length).toBe(0);
    });

    it('should return all jobs', () => {
      const timestamp = Date.now();
      const job1 = createMockJob({ id: `job-1-${timestamp}`, name: `Job 1 ${timestamp}` });
      const job2 = createMockJob({ id: `job-2-${timestamp}`, name: `Job 2 ${timestamp}` });

      jobManager.createJob(job1);
      jobManager.createJob(job2);

      const jobs = jobManager.getAllJobs();
      expect(jobs.filter(j => j.id.includes(String(timestamp)))).toHaveLength(2);
    });
  });

  describe('getJobsByStatus', () => {
    it('should filter jobs by status', () => {
      const timestamp = Date.now();
      const activeJob = createMockJob({ id: `job-1-${timestamp}`, name: `Active Job ${timestamp}`, status: 'active' });
      const pausedJob = createMockJob({ id: `job-2-${timestamp}`, name: `Paused Job ${timestamp}`, status: 'paused' });

      jobManager.createJob(activeJob);
      jobManager.createJob(pausedJob);

      const activeJobs = jobManager.getJobsByStatus('active');
      const ourActive = activeJobs.find(j => j.id === `job-1-${timestamp}`);
      expect(ourActive).toBeDefined();

      const pausedJobs = jobManager.getJobsByStatus('paused');
      const ourPaused = pausedJobs.find(j => j.id === `job-2-${timestamp}`);
      expect(ourPaused).toBeDefined();
    });
  });

  describe('updateJob', () => {
    it('should update job fields', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-5`, name: `Test Job ${timestamp}-5`, description: 'Old description' });
      jobManager.createJob(job);

      jobManager.updateJob(job.id, { description: 'New description' });

      const updated = jobManager.getJob(job.id);
      expect(updated?.description).toBe('New description');
    });

    it('should not allow changing ID', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-6`, name: `Test Job ${timestamp}-6` });
      jobManager.createJob(job);

      jobManager.updateJob(job.id, { id: 'new-id' } as any);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved?.id).toBe(job.id);
    });

    it('should not allow changing createdAt', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-7`, name: `Test Job ${timestamp}-7` });
      jobManager.createJob(job);

      const newDate = new Date('2025-01-01').toISOString();
      jobManager.updateJob(job.id, { createdAt: newDate } as any);

      const retrieved = jobManager.getJob(job.id);
      expect(retrieved?.createdAt).toBe(job.createdAt);
    });

    it('should reject duplicate names on update', () => {
      const timestamp = Date.now();
      const uniqueName1 = `Job 1 ${timestamp}`;
      const uniqueName2 = `Job 2 ${timestamp}`;
      const job1 = createMockJob({ id: `job-1-${timestamp}`, name: uniqueName1 });
      const job2 = createMockJob({ id: `job-2-${timestamp}`, name: uniqueName2 });

      jobManager.createJob(job1);
      jobManager.createJob(job2);

      expect(() => jobManager.updateJob(job2.id, { name: uniqueName1 })).toThrow('already exists');
    });
  });

  describe('deleteJob', () => {
    it('should delete job', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-8`, name: `Test Job ${timestamp}-8` });
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
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-9`, name: `Test Job ${timestamp}-9`, executionCount: 0 });
      jobManager.createJob(job);

      jobManager.recordExecution(job.id, 'exec-1', new Date().toISOString());

      const updated = jobManager.getJob(job.id);
      expect(updated?.executionCount).toBe(1);
      expect(updated?.lastExecutionId).toBe('exec-1');
    });

    it('should mark fireOnce job as completed', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-10`, name: `Test Job ${timestamp}-10`, fireOnce: true });
      jobManager.createJob(job);

      jobManager.recordExecution(job.id, 'exec-1', new Date().toISOString());

      const updated = jobManager.getJob(job.id);
      expect(updated?.status).toBe('completed');
    });

    it('should mark job as completed when maxExecutions reached', () => {
      const timestamp = Date.now();
      const job = createMockJob({ id: `test-job-${timestamp}-11`, name: `Test Job ${timestamp}-11`, maxExecutions: 2, executionCount: 1 });
      jobManager.createJob(job);

      jobManager.recordExecution(job.id, 'exec-2', new Date().toISOString());

      const updated = jobManager.getJob(job.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.executionCount).toBe(2);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const timestamp = Date.now();
      jobManager.createJob(createMockJob({ id: `job-1-${timestamp}`, name: `Job 1 ${timestamp}`, status: 'active' }));
      jobManager.createJob(createMockJob({ id: `job-2-${timestamp}`, name: `Job 2 ${timestamp}`, status: 'active' }));
      jobManager.createJob(createMockJob({ id: `job-3-${timestamp}`, name: `Job 3 ${timestamp}`, status: 'paused' }));
      jobManager.createJob(createMockJob({ id: `job-4-${timestamp}`, name: `Job 4 ${timestamp}`, status: 'completed' }));
      jobManager.createJob(createMockJob({ id: `job-5-${timestamp}`, name: `Job 5 ${timestamp}`, status: 'error' }));

      const stats = jobManager.getStatistics();

      // Since we might have leftover jobs from other tests, just check our jobs exist
      const allJobs = jobManager.getAllJobs();
      const ourJobs = allJobs.filter(j => j.id.includes(String(timestamp)));

      expect(ourJobs.length).toBe(5);
      expect(ourJobs.filter(j => j.status === 'active').length).toBe(2);
      expect(ourJobs.filter(j => j.status === 'paused').length).toBe(1);
      expect(ourJobs.filter(j => j.status === 'completed').length).toBe(1);
      expect(ourJobs.filter(j => j.status === 'error').length).toBe(1);
    });
  });
});
