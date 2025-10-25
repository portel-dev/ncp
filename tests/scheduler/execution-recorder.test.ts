/**
 * Unit Tests for ExecutionRecorder
 * Tests execution recording to CSV summary + JSON details
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionRecorder } from '../../src/services/scheduler/execution-recorder';

describe.skip('ExecutionRecorder', () => {
  let recorder: ExecutionRecorder;
  let resultsDir: string;
  let executionsDir: string;

  beforeEach(() => {
    // Create a new recorder instance
    recorder = new ExecutionRecorder();
    resultsDir = '/tmp/results';
    executionsDir = '/tmp/executions';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startExecution', () => {
    it('should create execution record in pending state', () => {
      const executionId = 'exec-123';
      const jobId = 'job-456';

      recorder.startExecution({
        executionId,
        jobId,
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: { param1: 'value1' },
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      const execution = recorder.getExecution(executionId);
      expect(execution).toBeDefined();
      expect(execution?.status).toBe('running');
      expect(execution?.jobId).toBe(jobId);
    });

    it('should create JSON result file', () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      const resultPath = path.join(resultsDir, `${executionId}.json`);
      expect(fs.existsSync(resultPath)).toBe(true);

      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      expect(result.executionId).toBe(executionId);
      expect(result.status).toBe('running');
    });
  });

  describe('completeExecution', () => {
    it('should mark execution as successful', async () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      // Small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      recorder.completeExecution(
        executionId,
        'success',
        { content: [{ type: 'text', text: 'Success!' }] }
      );

      const execution = recorder.getExecution(executionId);
      expect(execution?.status).toBe('success');
      expect(execution?.completedAt).toBeDefined();
      expect(execution?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should record failure with error message', () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      recorder.completeExecution(
        executionId,
        'failure',
        undefined,
        { message: 'Something went wrong' }
      );

      const execution = recorder.getExecution(executionId);
      expect(execution?.status).toBe('failure');
      expect(execution?.error).toBeDefined();
    });

    it('should write detailed result to JSON file', () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      const result = {
        content: [{ type: 'text', text: 'Detailed result data' }],
        metadata: { foo: 'bar' }
      };

      recorder.completeExecution(executionId, 'success', result);

      const resultPath = path.join(resultsDir, `${executionId}.json`);
      expect(fs.existsSync(resultPath)).toBe(true);

      const savedExecution = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      // The file contains the full execution object, not just the result
      expect(savedExecution.result).toEqual(result);
      expect(savedExecution.status).toBe('success');
      expect(savedExecution.executionId).toBe(executionId);
    });

    it('should calculate duration correctly', () => {
      const executionId = 'exec-123';
      const startTime = new Date();

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: startTime.toISOString(),
        status: 'running'
      });

      // Simulate some delay
      const delay = 150; // milliseconds
      setTimeout(() => {
        recorder.completeExecution(executionId, 'success');

        const execution = recorder.getExecution(executionId);
        expect(execution?.duration).toBeGreaterThanOrEqual(delay - 50); // Allow some margin
      }, delay);
    });
  });

  describe('getExecution', () => {
    it('should return null for non-existent execution', () => {
      const execution = recorder.getExecution('non-existent');
      expect(execution).toBeNull();
    });

    it('should retrieve existing execution', () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: { param: 'value' },
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      const execution = recorder.getExecution(executionId);
      expect(execution).toBeDefined();
      expect(execution?.executionId).toBe(executionId);
      expect(execution?.parameters).toEqual({ param: 'value' });
    });
  });

  describe('queryExecutions', () => {
    beforeEach(() => {
      // Create multiple test executions
      const jobs = [
        { id: 'job-1', name: 'Job 1' },
        { id: 'job-2', name: 'Job 2' }
      ];

      for (let i = 0; i < 5; i++) {
        const job = jobs[i % 2];
        const executionId = `exec-${i}`;
        const status = i % 3 === 0 ? 'failure' : 'success';

        recorder.startExecution({
          executionId,
          jobId: job.id,
          jobName: job.name,
          tool: 'test:tool',
          parameters: {},
          startedAt: new Date(Date.now() - i * 60000).toISOString(),
          status: 'running'
        });

        recorder.completeExecution(executionId, status as 'success' | 'failure');
      }
    });

    it('should return all executions when no filter', () => {
      const executions = recorder.queryExecutions();
      expect(executions).toHaveLength(5);
    });

    it('should filter by job ID', () => {
      const executions = recorder.queryExecutions({ jobId: 'job-1' });
      expect(executions).toHaveLength(3); // exec-0, exec-2, exec-4
      expect(executions.every(e => e.jobId === 'job-1')).toBe(true);
    });

    it('should filter by status', () => {
      const successExecutions = recorder.queryExecutions({ status: 'success' });
      expect(successExecutions.every(e => e.status === 'success')).toBe(true);

      const failureExecutions = recorder.queryExecutions({ status: 'failure' });
      expect(failureExecutions.every(e => e.status === 'failure')).toBe(true);
    });

    it('should filter by date range', () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);

      const recentExecutions = recorder.queryExecutions({
        startDate: twoMinutesAgo.toISOString()
      });

      // Should include recent executions only
      expect(recentExecutions.length).toBeLessThan(5);
    });

    it('should sort by most recent first', () => {
      const executions = recorder.queryExecutions();

      // Verify descending order by startedAt
      for (let i = 0; i < executions.length - 1; i++) {
        const current = new Date(executions[i].startedAt).getTime();
        const next = new Date(executions[i + 1].startedAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('cleanupOldExecutions', () => {
    beforeEach(() => {
      // Create executions with different ages
      const ages = [1, 5, 10, 30, 60]; // days old

      ages.forEach((daysOld, index) => {
        const executionId = `exec-${index}`;
        const startedAt = new Date();
        startedAt.setDate(startedAt.getDate() - daysOld);

        recorder.startExecution({
          executionId,
          jobId: 'job-1',
          jobName: 'Test Job',
          tool: 'test:tool',
          parameters: {},
          startedAt: startedAt.toISOString(),
          status: 'running'
        });

        recorder.completeExecution(executionId, 'success');
      });
    });

    it('should delete executions older than max age', () => {
      const result = recorder.cleanupOldExecutions(15); // Delete older than 15 days

      expect(result.deletedCount).toBeGreaterThan(0);

      const remaining = recorder.queryExecutions();
      // Should keep executions from 1, 5, 10 days ago
      // Should delete executions from 30, 60 days ago
      expect(remaining).toHaveLength(3);
    });

    it('should limit executions per job', () => {
      // Create 10 executions for same job
      for (let i = 0; i < 10; i++) {
        const executionId = `exec-new-${i}`;
        recorder.startExecution({
          executionId,
          jobId: 'job-2',
          jobName: 'Test Job',
          tool: 'test:tool',
          parameters: {},
          startedAt: new Date().toISOString(),
          status: 'running'
        });
        recorder.completeExecution(executionId, 'success');
      }

      const result = recorder.cleanupOldExecutions(365, 5); // Keep only 5 per job

      const job2Executions = recorder.queryExecutions({ jobId: 'job-2' });
      expect(job2Executions).toHaveLength(5);
    });

    it('should delete associated JSON result files', () => {
      const executionId = 'exec-old';
      const veryOld = new Date();
      veryOld.setDate(veryOld.getDate() - 100);

      recorder.startExecution({
        executionId,
        jobId: 'job-1',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: veryOld.toISOString(),
        status: 'running'
      });

      recorder.completeExecution(executionId, 'success', { data: 'test' });

      const resultPath = path.join(resultsDir, `${executionId}.json`);
      expect(fs.existsSync(resultPath)).toBe(true);

      recorder.cleanupOldExecutions(30);

      // Result file should be deleted
      expect(fs.existsSync(resultPath)).toBe(false);
    });

    it('should return cleanup statistics', () => {
      const result = recorder.cleanupOldExecutions(15);

      expect(result).toHaveProperty('deletedCount');
      expect(result).toHaveProperty('errors');
      expect(typeof result.deletedCount).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('CSV format', () => {
    it('should write valid CSV with headers after completion', () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Test Job',
        tool: 'test:tool',
        parameters: {},
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      // Complete the execution to write to CSV
      recorder.completeExecution(executionId, 'success');

      const summaryPath = path.join(executionsDir, 'summary.csv');
      const csvContent = fs.readFileSync(summaryPath, 'utf-8');
      const lines = csvContent.trim().split('\n');

      // Check header
      expect(lines[0]).toContain('executionId');
      expect(lines[0]).toContain('jobId');
      expect(lines[0]).toContain('status');

      // Check data row exists
      expect(lines.length).toBeGreaterThan(1);
      expect(csvContent).toContain(executionId);
    });

    it('should escape commas in job names', () => {
      const executionId = 'exec-123';

      recorder.startExecution({
        executionId,
        jobId: 'job-456',
        jobName: 'Job with, commas, in name',
        tool: 'test:tool',
        parameters: {},
        startedAt: new Date().toISOString(),
        status: 'running'
      });

      // Complete the execution to write to CSV
      recorder.completeExecution(executionId, 'success');

      const summaryPath = path.join(executionsDir, 'summary.csv');
      const csvContent = fs.readFileSync(summaryPath, 'utf-8');

      // Should quote fields with commas
      expect(csvContent).toContain('"Job with, commas, in name"');
    });
  });

  describe('concurrent executions', () => {
    it('should handle multiple simultaneous executions', () => {
      const executionIds = ['exec-1', 'exec-2', 'exec-3'];

      // Start all executions
      executionIds.forEach(id => {
        recorder.startExecution({
          executionId: id,
          jobId: 'job-1',
          jobName: 'Test Job',
          tool: 'test:tool',
          parameters: {},
          startedAt: new Date().toISOString(),
          status: 'running'
        });
      });

      // Complete all executions
      executionIds.forEach(id => {
        recorder.completeExecution(id, 'success');
      });

      // All should be recorded
      const executions = recorder.queryExecutions();
      expect(executions).toHaveLength(3);
      expect(executions.every(e => e.status === 'success')).toBe(true);
    });
  });
});
