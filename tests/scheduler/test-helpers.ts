/**
 * Test Helpers for Scheduler Tests
 * Provides utilities for isolated testing of scheduler components
 */

import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Create isolated test directory
 */
export function createTestDirectory(): string {
  const testDir = join(tmpdir(), `ncp-scheduler-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * Cleanup test directory
 */
export function cleanupTestDirectory(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Mock environment for scheduler
 */
export function mockSchedulerEnvironment(testDir: string) {
  const schedulerDir = join(testDir, 'scheduler');
  const executionsDir = join(schedulerDir, 'executions');
  const resultsDir = join(executionsDir, 'results');

  mkdirSync(schedulerDir, { recursive: true });
  mkdirSync(executionsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  // Create empty jobs file
  writeFileSync(join(schedulerDir, 'jobs.json'), JSON.stringify({ version: '1.0.0', jobs: {} }));

  // Create empty CSV
  writeFileSync(
    join(executionsDir, 'summary.csv'),
    'executionId,jobId,jobName,tool,startedAt,duration,status,errorMessage\n'
  );

  return {
    schedulerDir,
    executionsDir,
    resultsDir
  };
}

/**
 * Create mock job
 */
export function createMockJob(overrides: Partial<any> = {}): any {
  return {
    id: 'test-job-123',
    name: 'Test Job',
    description: 'Test job description',
    cronExpression: '0 9 * * *',
    tool: 'test:tool',
    parameters: { param1: 'value1' },
    fireOnce: false,
    createdAt: new Date().toISOString(),
    status: 'active',
    executionCount: 0,
    ...overrides
  };
}

/**
 * Create mock execution
 */
export function createMockExecution(overrides: Partial<any> = {}): any {
  return {
    executionId: 'exec-123',
    jobId: 'test-job-123',
    jobName: 'Test Job',
    tool: 'test:tool',
    parameters: { param1: 'value1' },
    startedAt: new Date().toISOString(),
    status: 'running',
    ...overrides
  };
}

/**
 * Mock crontab helper (for platforms without cron)
 */
export class MockCrontab {
  private entries: Map<string, { cronExpression: string; command: string }> = new Map();

  add(jobId: string, cronExpression: string, command: string): void {
    this.entries.set(jobId, { cronExpression, command });
  }

  remove(jobId: string): void {
    this.entries.delete(jobId);
  }

  has(jobId: string): boolean {
    return this.entries.has(jobId);
  }

  get(jobId: string): { cronExpression: string; command: string } | undefined {
    return this.entries.get(jobId);
  }

  getAll(): Array<{ id: string; cronExpression: string; command: string }> {
    return Array.from(this.entries.entries()).map(([id, entry]) => ({
      id,
      ...entry
    }));
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Create mock orchestrator for validation tests
 */
export function createMockOrchestrator() {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    run: jest.fn().mockResolvedValue({ success: true, content: [] }),
    executeTool: jest.fn().mockResolvedValue({ success: true, content: [] }),
    getToolSchema: jest.fn().mockResolvedValue({
      name: 'mock-tool',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    }),
    internalMCPManager: {
      isInternalMCP: jest.fn().mockReturnValue(false),
      executeInternalTool: jest.fn().mockResolvedValue({ success: false })
    }
  };
}
