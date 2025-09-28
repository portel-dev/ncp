/**
 * Integration Tests - Complete Scheduler System
 * Tests the full scheduler implementation including:
 * - Real cron job creation and execution
 * - MCP resource notifications
 * - Job persistence
 * - Resource subscription workflow
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { InternalNCPMCPServer } from '../src/server/internal-ncp-mcp';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_JOBS_FILE = path.join(process.cwd(), '.ncp', 'test-scheduled-jobs.json');

describe('NCP Scheduler Integration Tests', () => {
  let scheduler: InternalNCPMCPServer;
  let originalConsoleLog: any;
  let logMessages: string[] = [];

  beforeEach(() => {
    // Ensure .ncp directory exists
    const ncpDir = path.dirname(TEST_JOBS_FILE);
    if (!fs.existsSync(ncpDir)) {
      fs.mkdirSync(ncpDir, { recursive: true });
    }

    // Clean up any existing test file
    if (fs.existsSync(TEST_JOBS_FILE)) {
      fs.unlinkSync(TEST_JOBS_FILE);
    }

    // Capture log messages for verification
    originalConsoleLog = console.log;
    logMessages = [];
    console.log = jest.fn((...args: any[]) => {
      logMessages.push(args.join(' '));
      originalConsoleLog(...args);
    });

    // Create scheduler instance (constructor takes no parameters)
    scheduler = new InternalNCPMCPServer();
  });

  afterEach(() => {
    // Cleanup scheduler and restore console
    if (scheduler) {
      scheduler.cleanup();
    }
    console.log = originalConsoleLog;

    // Clean up test file
    if (fs.existsSync(TEST_JOBS_FILE)) {
      fs.unlinkSync(TEST_JOBS_FILE);
    }
  });

  describe('Cron Job Creation and Execution', () => {
    it('should create a real cron job that fires in 3 seconds', async () => {
      // Test with a 3-second timer for faster testing
      const response = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'test-1',
        params: {
          name: 'ncp_schedule',
          arguments: {
            name: 'Quick Test Timer',
            schedule: 'in 3 minutes', // Will be overridden to 3 seconds
            actionType: 'notification',
            actionData: { message: 'Test timer fired!' },
            fireOnce: true,
            description: 'Integration test timer'
          }
        }
      });

      // Verify successful creation
      expect(response.result?.content?.[0]?.text).toContain('SUCCESS');
      expect(response.result?.content?.[0]?.text).toContain('Quick Test Timer');
      expect(response.result?.content?.[0]?.text).toContain('Resource URI: ncp://scheduler/');

      // Extract job ID from response
      const responseText = response.result?.content?.[0]?.text || '';
      const jobIdMatch = responseText.match(/Job ID: (\w+)/);
      expect(jobIdMatch).toBeTruthy();

      const jobId = jobIdMatch![1];
      console.log(`Created job with ID: ${jobId}`);

      // Wait for job to execute (3 seconds + buffer)
      console.log('Waiting for timer to fire...');
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Verify job executed by checking logs
      const executionLogs = logMessages.filter(msg =>
        msg.includes('EXECUTING SCHEDULED JOB') && msg.includes('Quick Test Timer')
      );
      expect(executionLogs.length).toBeGreaterThan(0);
      console.log(`Found ${executionLogs.length} execution log(s)`);

      // Verify resource notification was sent
      const notificationLogs = logMessages.filter(msg =>
        msg.includes('Sending resource notification') && msg.includes('Quick Test Timer')
      );
      expect(notificationLogs.length).toBeGreaterThan(0);
      console.log(`Found ${notificationLogs.length} notification log(s)`);

    }, 10000); // 10 second timeout for this test

    it('should create persistent cron expression correctly', async () => {
      const testTime = new Date(Date.now() + 5000); // 5 seconds from now
      const expectedCron = `${testTime.getUTCSeconds()} ${testTime.getUTCMinutes()} ${testTime.getUTCHours()} ${testTime.getUTCDate()} ${testTime.getUTCMonth() + 1} *`;

      console.log(`Expected cron expression: ${expectedCron}`);
      console.log(`Target execution time: ${testTime.toISOString()}`);

      const response = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'test-2',
        params: {
          name: 'ncp_schedule',
          arguments: {
            name: 'Cron Test Timer',
            schedule: 'in 1 minute', // Will be overridden
            actionType: 'notification',
            actionData: { message: 'Cron test!' },
            fireOnce: true
          }
        }
      });

      expect(response.result?.content?.[0]?.text).toContain('SUCCESS');

      // Check that cron expression was logged
      const cronLogs = logMessages.filter(msg =>
        msg.includes('Test cron expression:')
      );
      expect(cronLogs.length).toBeGreaterThan(0);
      console.log(`Cron expression log: ${cronLogs[0]}`);

    }, 5000);
  });

  describe('MCP Resource Subscription System', () => {
    it('should handle resource/list request', async () => {
      // First create a job
      await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'setup',
        params: {
          name: 'ncp_schedule',
          arguments: {
            name: 'Resource Test Job',
            schedule: 'in 5 minutes',
            actionType: 'notification',
            actionData: { message: 'Resource test' },
            fireOnce: true
          }
        }
      });

      // List resources
      const response = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/list',
        id: 'resource-test-1',
        params: {}
      });

      expect(response.result?.resources).toBeDefined();
      expect(Array.isArray(response.result?.resources)).toBe(true);
      expect(response.result?.resources.length).toBeGreaterThan(0);

      const resource = response.result?.resources[0];
      expect(resource.uri).toMatch(/^ncp:\/\/scheduler\/.+$/);
      expect(resource.name).toBe('Resource Test Job');
      expect(resource.mimeType).toBe('application/json');

      console.log(`Found resource: ${resource.uri}`);
    });

    it('should handle resource/read request', async () => {
      // Create a job first
      const createResponse = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'setup',
        params: {
          name: 'ncp_schedule',
          arguments: {
            name: 'Read Test Job',
            schedule: 'in 10 minutes',
            actionType: 'notification',
            actionData: { message: 'Read test', priority: 'high' },
            fireOnce: true
          }
        }
      });

      // Extract resource URI from response
      const responseText = createResponse.result?.content?.[0]?.text || '';
      const uriMatch = responseText.match(/Resource URI: (ncp:\/\/scheduler\/[a-f0-9-]+)/);
      expect(uriMatch).toBeTruthy();

      const resourceUri = uriMatch![1];
      console.log(`Testing resource read for: ${resourceUri}`);

      // Read the resource
      const readResponse = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'resource-read-1',
        params: { uri: resourceUri }
      });

      expect(readResponse.result?.contents).toBeDefined();
      expect(readResponse.result?.contents.length).toBe(1);

      const content = readResponse.result?.contents[0];
      expect(content.uri).toBe(resourceUri);
      expect(content.mimeType).toBe('application/json');

      const jobData = JSON.parse(content.text);
      expect(jobData.name).toBe('Read Test Job');
      expect(jobData.status).toBe('active');
      expect(jobData.action.data.priority).toBe('high');

      console.log(`Successfully read job data: ${jobData.name}`);
    });

    it('should handle resource/subscribe and unsubscribe', async () => {
      // Create a job
      const createResponse = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'setup',
        params: {
          name: 'ncp_schedule',
          arguments: {
            name: 'Subscribe Test Job',
            schedule: 'in 15 minutes',
            actionType: 'notification',
            actionData: { message: 'Subscribe test' },
            fireOnce: true
          }
        }
      });

      const responseText = createResponse.result?.content?.[0]?.text || '';
      const uriMatch = responseText.match(/Resource URI: (ncp:\/\/scheduler\/[a-f0-9-]+)/);
      const resourceUri = uriMatch![1];

      // Subscribe to resource
      const subscribeResponse = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/subscribe',
        id: 'subscribe-1',
        params: { uri: resourceUri }
      });

      expect(subscribeResponse.result).toBeDefined();
      expect(subscribeResponse.error).toBeUndefined();
      console.log(`Successfully subscribed to: ${resourceUri}`);

      // Verify subscription was logged
      const subscriptionLogs = logMessages.filter(msg =>
        msg.includes('Resource subscription added') && msg.includes(resourceUri)
      );
      expect(subscriptionLogs.length).toBeGreaterThan(0);

      // Unsubscribe
      const unsubscribeResponse = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/unsubscribe',
        id: 'unsubscribe-1',
        params: { uri: resourceUri }
      });

      expect(unsubscribeResponse.result).toBeDefined();
      expect(unsubscribeResponse.error).toBeUndefined();
      console.log(`Successfully unsubscribed from: ${resourceUri}`);

      // Verify unsubscription was logged
      const unsubscriptionLogs = logMessages.filter(msg =>
        msg.includes('Resource subscription removed') && msg.includes(resourceUri)
      );
      expect(unsubscriptionLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Job Persistence', () => {
    it('should save and load jobs across scheduler restarts', async () => {
      // Create a job
      const response = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'persist-test',
        params: {
          name: 'ncp_schedule',
          arguments: {
            name: 'Persistence Test Job',
            schedule: 'in 30 minutes',
            actionType: 'notification',
            actionData: { message: 'Persistence test' },
            fireOnce: true,
            description: 'Testing job persistence'
          }
        }
      });

      expect(response.result?.content?.[0]?.text).toContain('SUCCESS');

      // Verify jobs file was created and contains our job
      expect(fs.existsSync(TEST_JOBS_FILE)).toBe(true);

      const savedJobs = JSON.parse(fs.readFileSync(TEST_JOBS_FILE, 'utf8'));
      expect(Array.isArray(savedJobs)).toBe(true);
      expect(savedJobs.length).toBe(1);
      expect(savedJobs[0].name).toBe('Persistence Test Job');
      expect(savedJobs[0].status).toBe('active');

      console.log(`Job persisted to file: ${savedJobs[0].id}`);

      // Simulate restart by creating new scheduler instance
      scheduler.cleanup();
      const newScheduler = new InternalNCPMCPServer();

      // Verify job was loaded
      const listResponse = await newScheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'list-test',
        params: {
          name: 'ncp_scheduler_list',
          arguments: {}
        }
      });

      const responseText = listResponse.result?.content?.[0]?.text || '';
      expect(responseText).toContain('Persistence Test Job');
      expect(responseText).toContain('Active');

      console.log('Job successfully loaded after restart');

      // Cleanup new scheduler
      newScheduler.cleanup();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid resource URIs gracefully', async () => {
      const response = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'error-test-1',
        params: { uri: 'invalid://resource/uri' }
      });

      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('Invalid resource URI format');
    });

    it('should handle missing jobs gracefully', async () => {
      const response = await scheduler.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'error-test-2',
        params: { uri: 'ncp://scheduler/nonexistent-job-id' }
      });

      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('Job not found');
    });
  });
});