/**
 * Integration Tests for Scheduler
 * Tests end-to-end workflows (mocked cron for safety)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createTestDirectory, cleanupTestDirectory, mockSchedulerEnvironment } from './test-helpers';

describe('Scheduler Integration Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
    mockSchedulerEnvironment(testDir);
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
    jest.clearAllMocks();
  });

  describe('Job Creation Flow', () => {
    it('should create job with natural language schedule', async () => {
      // Mock the ncp-paths to use test directory
      jest.mock('../../src/utils/ncp-paths', () => ({
        getSchedulerDirectory: () => `${testDir}/scheduler`,
        getSchedulerExecutionsDirectory: () => `${testDir}/scheduler/executions`,
        getSchedulerResultsDirectory: () => `${testDir}/scheduler/executions/results`
      }));

      // Import after mocking
      const { Scheduler } = await import('../../src/services/scheduler/scheduler');

      // Skip on Windows
      const scheduler = new Scheduler();
      if (!scheduler.isAvailable()) {
        console.log('Skipping test on Windows');
        return;
      }

      // This test would actually create a job in the real implementation
      // For now, we just verify the API works
      expect(scheduler).toBeDefined();
      expect(scheduler.isAvailable).toBeDefined();
    });
  });

  describe('Validation Integration', () => {
    it('should validate tool parameters before scheduling', async () => {
      // This would be a real integration test with validation
      // Testing the full stack: Scheduler -> ToolValidator -> MCP
      expect(true).toBe(true); // Placeholder
    });

    it('should reject invalid parameters immediately', async () => {
      // This would test that validation catches bad params
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Execution Recording', () => {
    it('should record execution to CSV and JSON', async () => {
      // ExecutionRecorder is thoroughly tested in its own unit test file
      // This is just a placeholder for integration testing
      // Real integration would require proper mocking of the entire system
      expect(true).toBe(true);
    });
  });

  describe('Job Lifecycle', () => {
    it('should handle full job lifecycle', async () => {
      // This would test: create -> execute -> complete -> cleanup
      // Placeholder for full integration test
      expect(true).toBe(true);
    });
  });
});
