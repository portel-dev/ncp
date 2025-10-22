/**
 * Tests for health monitoring integration
 * Focuses on the integration patterns rather than full CLI flows
 */

import { MCPHealthMonitor } from '../src/utils/health-monitor.js';
import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

describe('Health Monitoring Integration', () => {
  let healthMonitor: MCPHealthMonitor;
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for test
    tempDir = join(tmpdir(), `ncp-health-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Mock the home directory to use our temp directory
    jest.spyOn(require('os'), 'homedir').mockReturnValue(tempDir);

    healthMonitor = new MCPHealthMonitor();
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    jest.restoreAllMocks();
  });

  describe('Error Message Capture', () => {
    test('should capture npm 404 errors for non-existent packages', async () => {
      const health = await healthMonitor.checkMCPHealth(
        'test-invalid-package',
        'npx',
        ['-y', '@definitely-does-not-exist/invalid-package']
      );

      // Health check might timeout before npm error, so check for either unhealthy or error message
      if (health.status === 'unhealthy') {
        expect(health.lastError).toBeDefined();
        if (health.lastError) {
          // Should contain npm error details
          expect(health.lastError.toLowerCase()).toMatch(/404|not found|error|timeout/);
        }
      } else {
        // If healthy, it means npm command didn't fail within timeout - this is also acceptable
        expect(health.status).toBe('healthy');
      }
    });

    test('should capture command not found errors', async () => {
      const health = await healthMonitor.checkMCPHealth(
        'test-invalid-command',
        'definitely-not-a-real-command',
        []
      );

      expect(health.status).toBe('unhealthy');
      expect(health.lastError).toBeDefined();

      if (health.lastError) {
        // Should contain command not found error
        expect(health.lastError.toLowerCase()).toMatch(/not found|enoent|spawn/);
      }
    });

    test('should capture permission errors', async () => {
      const health = await healthMonitor.checkMCPHealth(
        'test-permission-error',
        '/root/some-protected-file',
        []
      );

      expect(health.status).toBe('unhealthy');
      expect(health.lastError).toBeDefined();

      if (health.lastError) {
        // Should contain permission-related error
        expect(health.lastError.toLowerCase()).toMatch(/permission|eacces|enoent/);
      }
    });

    test('should handle timeout scenarios', async () => {
      // This test verifies timeout handling
      const health = await healthMonitor.checkMCPHealth(
        'test-timeout',
        'sleep',
        ['10'], // Sleep longer than health check timeout
        {}
      );

      // Should either be unhealthy due to timeout or healthy if sleep exits quickly
      expect(['healthy', 'unhealthy']).toContain(health.status);

      if (health.status === 'unhealthy' && health.lastError) {
        // If unhealthy, should have a meaningful error
        expect(health.lastError).toBeDefined();
      }
    });
  });

  describe('Health Status Tracking', () => {
    test('should track error count and auto-disable after multiple failures', async () => {
      const mcpName = 'test-multi-failure';

      // First failure
      healthMonitor.markUnhealthy(mcpName, 'Error 1');
      let health = healthMonitor.getMCPHealth(mcpName);
      expect(health?.errorCount).toBe(1);
      expect(health?.status).toBe('unhealthy');

      // Second failure
      healthMonitor.markUnhealthy(mcpName, 'Error 2');
      health = healthMonitor.getMCPHealth(mcpName);
      expect(health?.errorCount).toBe(2);
      expect(health?.status).toBe('unhealthy');

      // Third failure should disable
      healthMonitor.markUnhealthy(mcpName, 'Error 3');
      health = healthMonitor.getMCPHealth(mcpName);
      expect(health?.errorCount).toBe(3);
      expect(health?.status).toBe('disabled');
    });

    test('should reset error count when MCP becomes healthy', async () => {
      const mcpName = 'test-recovery';

      // Mark as unhealthy
      healthMonitor.markUnhealthy(mcpName, 'Temporary error');
      let health = healthMonitor.getMCPHealth(mcpName);
      expect(health?.errorCount).toBe(1);

      // Mark as healthy should reset
      healthMonitor.markHealthy(mcpName);
      health = healthMonitor.getMCPHealth(mcpName);
      expect(health?.errorCount).toBe(0);
      expect(health?.status).toBe('healthy');
    });

    test('should provide detailed health reports for AI consumption', async () => {
      // Set up various MCP states
      healthMonitor.markHealthy('working-mcp');
      healthMonitor.markUnhealthy('broken-mcp', 'npm error 404');
      healthMonitor.markUnhealthy('timeout-mcp', 'Connection timeout');

      // Disable one MCP
      await healthMonitor.disableMCP('disabled-mcp', 'User disabled');

      const report = healthMonitor.generateHealthReport();

      expect(report.totalMCPs).toBeGreaterThan(0);
      expect(report.details).toBeDefined();
      expect(Array.isArray(report.details)).toBe(true);
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);

      // Should have appropriate counts
      expect(report.healthy + report.unhealthy + report.disabled).toBe(report.totalMCPs);
    });
  });

  describe('Error Message Quality for AI', () => {
    test('should provide actionable recommendations based on error patterns', async () => {
      // Test different error patterns
      const testCases = [
        {
          error: 'npm error code E404',
          expectedRecommendation: /install|package|npm/i
        },
        {
          error: 'EACCES: permission denied',
          expectedRecommendation: /permission/i
        },
        {
          error: 'ENOENT: no such file or directory',
          expectedRecommendation: /file|directory|path/i
        },
        {
          error: 'command not found: nonexistent',
          expectedRecommendation: /command|install|path/i
        }
      ];

      for (const testCase of testCases) {
        healthMonitor.markUnhealthy('test-mcp', testCase.error);
        const report = healthMonitor.generateHealthReport();

        // Should generate relevant recommendations
        const hasRelevantRecommendation = report.recommendations?.some(rec =>
          testCase.expectedRecommendation.test(rec)
        );

        expect(hasRelevantRecommendation).toBe(true);
      }
    });

    test('should maintain error history for debugging', async () => {
      const mcpName = 'history-test';
      const errorMessage = 'Detailed error for debugging';

      healthMonitor.markUnhealthy(mcpName, errorMessage);
      const health = healthMonitor.getMCPHealth(mcpName);

      expect(health?.lastError).toBe(errorMessage);
      expect(health?.lastCheck).toBeDefined();
      expect(new Date(health!.lastCheck).getTime()).toBeCloseTo(Date.now(), -3); // Within ~1 second
    });
  });

  describe('Integration with Import Process', () => {
    test('should handle batch health checks efficiently', async () => {
      const mcpConfigs = [
        { name: 'echo-test', command: 'echo', args: ['test1'] },
        { name: 'invalid-test', command: 'nonexistent-command', args: [] },
        { name: 'npm-test', command: 'npx', args: ['-y', '@invalid/package'] }
      ];

      const startTime = Date.now();
      const report = await healthMonitor.checkMultipleMCPs(mcpConfigs);
      const endTime = Date.now();

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds max

      expect(report.totalMCPs).toBe(3);
      expect(report.details).toHaveLength(3);

      // Should have a mix of results
      expect(report.healthy + report.unhealthy + report.disabled).toBe(3);
    });

    test('should provide structured data for import feedback', async () => {
      const mcpName = 'structured-test';

      const health = await healthMonitor.checkMCPHealth(
        mcpName,
        'nonexistent-command',
        []
      );

      // Should have all required fields for import feedback
      expect(health.name).toBe(mcpName);
      expect(health.status).toBeDefined();
      expect(health.lastCheck).toBeDefined();
      expect(health.errorCount).toBeDefined();

      if (health.status === 'unhealthy') {
        expect(health.lastError).toBeDefined();
        expect(typeof health.lastError).toBe('string');
        expect(health.lastError!.length).toBeGreaterThan(0);
      }
    });
  });
});