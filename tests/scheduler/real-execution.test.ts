/**
 * Real MCP Execution Tests
 * Tests scheduler with actual MCP tool calls
 *
 * These are integration tests that:
 * 1. Set up real MCP configuration
 * 2. Create scheduled tasks with real tools
 * 3. Execute them via timing executor
 * 4. Verify actual results
 *
 * Note: These tests require:
 * - MCP servers to be available
 * - Actual tool execution (slower)
 * - Network access for some tools
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestDirectory, cleanupTestDirectory, mockSchedulerEnvironment } from './test-helpers';
import { TaskManager } from '../../src/services/scheduler/task-manager';
import { TimingExecutor } from '../../src/services/scheduler/timing-executor';
import { v4 as uuidv4 } from 'uuid';
import { ScheduledTask } from '../../src/types/scheduler';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Real MCP Execution Tests', () => {
  let testDir: string;
  let schedulerDir: string;
  let ncpConfigDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
    const env = mockSchedulerEnvironment(testDir);
    schedulerDir = env.schedulerDir;

    // Create NCP config directory for test
    ncpConfigDir = join(testDir, '.ncp');
    mkdirSync(ncpConfigDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  describe('Simple Test MCP', () => {
    beforeEach(() => {
      // Create a minimal test MCP server that echoes parameters
      const testMCPPath = join(testDir, 'test-mcp-server.mjs');
      const testMCPCode = `#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'test-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Simple echo tool that returns what you send it
server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'echo',
    description: 'Echo back the input',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to echo' }
      },
      required: ['message']
    }
  }, {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    }
  }]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    return {
      content: [{
        type: 'text',
        text: \`Echo: \${args.message}\`
      }]
    };
  } else if (name === 'add') {
    const result = args.a + args.b;
    return {
      content: [{
        type: 'text',
        text: \`Result: \${result}\`
      }]
    };
  }

  throw new Error(\`Unknown tool: \${name}\`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;

      writeFileSync(testMCPPath, testMCPCode, { mode: 0o755 });

      // Create NCP configuration with test MCP
      const ncpConfig = {
        mcpServers: {
          'test-mcp': {
            command: 'node',
            args: [testMCPPath]
          }
        }
      };

      writeFileSync(
        join(ncpConfigDir, 'config.json'),
        JSON.stringify(ncpConfig, null, 2)
      );
    });

    it.skip('should execute echo tool via scheduler', async () => {
      const taskManager = new TaskManager(schedulerDir);
      const timingExecutor = new TimingExecutor();

      // Create timing group (every minute for testing)
      const cronExpression = '* * * * *';
      const timingId = taskManager.getOrCreateTimingGroup(cronExpression);

      // Create task that calls test MCP echo tool
      const task: ScheduledTask = {
        id: uuidv4(),
        name: `Test Echo Task ${Date.now()}`,
        timingId,
        cronExpression,
        tool: 'test-mcp:echo',
        parameters: {
          message: 'Hello from scheduler!'
        },
        fireOnce: false,
        createdAt: new Date().toISOString(),
        status: 'active',
        executionCount: 0
      };

      taskManager.createTask(task);

      // Execute the timing group (this will spawn child process)
      const result = await timingExecutor.executeTimingGroup(timingId, 10000);

      // Verify execution
      expect(result.executedTasks).toBe(1);
      expect(result.successfulTasks).toBe(1);
      expect(result.failedTasks).toBe(0);

      // Verify task result
      const taskResult = result.results.find(r => r.taskId === task.id);
      expect(taskResult).toBeDefined();
      expect(taskResult?.status).toBe('success');
      expect(taskResult?.result).toContain('Echo: Hello from scheduler!');
    }, 30000);

    it.skip('should execute multiple tasks in parallel', async () => {
      const taskManager = new TaskManager(schedulerDir);
      const timingExecutor = new TimingExecutor();

      const cronExpression = '* * * * *';
      const timingId = taskManager.getOrCreateTimingGroup(cronExpression);

      // Create multiple tasks
      const timestamp = Date.now();
      const tasks = [
        {
          id: uuidv4(),
          name: `Echo Task 1 ${timestamp}`,
          tool: 'test-mcp:echo',
          parameters: { message: 'Task 1' }
        },
        {
          id: uuidv4(),
          name: `Echo Task 2 ${timestamp}`,
          tool: 'test-mcp:echo',
          parameters: { message: 'Task 2' }
        },
        {
          id: uuidv4(),
          name: `Add Task ${timestamp}`,
          tool: 'test-mcp:add',
          parameters: { a: 5, b: 3 }
        }
      ];

      for (const taskData of tasks) {
        const task: ScheduledTask = {
          ...taskData,
          timingId,
          cronExpression,
          fireOnce: false,
          createdAt: new Date().toISOString(),
          status: 'active',
          executionCount: 0
        };
        taskManager.createTask(task);
      }

      // Execute all tasks in parallel
      const result = await timingExecutor.executeTimingGroup(timingId, 10000);

      // Verify all executed successfully
      expect(result.executedTasks).toBe(3);
      expect(result.successfulTasks).toBe(3);
      expect(result.failedTasks).toBe(0);

      // Verify individual results
      const echoResult1 = result.results.find(r => r.taskName.includes('Echo Task 1'));
      expect(echoResult1?.result).toContain('Task 1');

      const addResult = result.results.find(r => r.taskName.includes('Add Task'));
      expect(addResult?.result).toContain('Result: 8');
    }, 30000);

    it.skip('should handle task failure without affecting others', async () => {
      const taskManager = new TaskManager(schedulerDir);
      const timingExecutor = new TimingExecutor();

      const cronExpression = '* * * * *';
      const timingId = taskManager.getOrCreateTimingGroup(cronExpression);

      const timestamp = Date.now();

      // Create one failing task and one succeeding task
      const tasks = [
        {
          id: uuidv4(),
          name: `Good Task ${timestamp}`,
          tool: 'test-mcp:echo',
          parameters: { message: 'Success!' }
        },
        {
          id: uuidv4(),
          name: `Bad Task ${timestamp}`,
          tool: 'test-mcp:nonexistent', // This will fail
          parameters: {}
        },
        {
          id: uuidv4(),
          name: `Another Good Task ${timestamp}`,
          tool: 'test-mcp:add',
          parameters: { a: 10, b: 20 }
        }
      ];

      for (const taskData of tasks) {
        const task: ScheduledTask = {
          ...taskData,
          timingId,
          cronExpression,
          fireOnce: false,
          createdAt: new Date().toISOString(),
          status: 'active',
          executionCount: 0
        };
        taskManager.createTask(task);
      }

      // Execute - one should fail but others should succeed
      const result = await timingExecutor.executeTimingGroup(timingId, 10000);

      expect(result.executedTasks).toBe(3);
      expect(result.successfulTasks).toBe(2);
      expect(result.failedTasks).toBe(1);

      // Verify the failing task
      const badResult = result.results.find(r => r.taskName.includes('Bad Task'));
      expect(badResult?.status).toBe('failure');
      expect(badResult?.error).toBeDefined();

      // Verify good tasks still succeeded
      const goodResults = result.results.filter(r => !r.taskName.includes('Bad Task'));
      expect(goodResults.every(r => r.status === 'success')).toBe(true);
    }, 30000);
  });

  describe('Documentation and Usage', () => {
    it('should provide example of how to test with real MCPs', () => {
      // This test serves as documentation

      const steps = `
To test scheduler with real MCP calls:

1. Set up test MCP server (see beforeEach above)
2. Configure NCP with test MCP in config.json
3. Create tasks using TaskManager
4. Execute via TimingExecutor
5. Verify results

Example:
  const taskManager = new TaskManager(schedulerDir);
  const timingExecutor = new TimingExecutor();

  const timingId = taskManager.getOrCreateTimingGroup('* * * * *');

  const task: ScheduledTask = {
    id: uuidv4(),
    name: 'My Task',
    timingId,
    cronExpression: '* * * * *',
    tool: 'test-mcp:echo',
    parameters: { message: 'Hello!' },
    status: 'active',
    // ... other fields
  };

  taskManager.createTask(task);
  const result = await timingExecutor.executeTimingGroup(timingId);

Note: Tests are skipped by default because they require:
- @modelcontextprotocol/sdk to be installed
- Actual process spawning and execution
- More time to run

To enable: Remove .skip from tests above
      `;

      expect(steps).toBeDefined();
    });
  });
});
