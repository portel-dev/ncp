/**
 * Tests for MCPHealthMonitor - Health tracking functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPHealthMonitor } from '../src/utils/health-monitor.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// Mock filesystem operations
jest.mock('fs/promises');
jest.mock('fs');

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('MCPHealthMonitor', () => {
  let healthMonitor: MCPHealthMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('{}');
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    healthMonitor = new MCPHealthMonitor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create health monitor', () => {
      expect(healthMonitor).toBeDefined();
    });

    it('should handle file loading', async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow async init
      expect(mockReadFile).toHaveBeenCalled();
    });
  });

  describe('health tracking', () => {
    it('should mark MCP as healthy', () => {
      healthMonitor.markHealthy('test-mcp');

      const healthyMCPs = healthMonitor.getHealthyMCPs(['test-mcp']);
      expect(healthyMCPs).toContain('test-mcp');
    });

    it('should mark MCP as unhealthy', () => {
      healthMonitor.markUnhealthy('test-mcp', 'Connection failed');

      const healthyMCPs = healthMonitor.getHealthyMCPs(['test-mcp']);
      expect(healthyMCPs).not.toContain('test-mcp');
    });

    it('should handle multiple MCPs', () => {
      healthMonitor.markHealthy('mcp1');
      healthMonitor.markHealthy('mcp2');
      healthMonitor.markUnhealthy('mcp3', 'Error');

      const healthyMCPs = healthMonitor.getHealthyMCPs(['mcp1', 'mcp2', 'mcp3']);
      expect(healthyMCPs).toEqual(['mcp1', 'mcp2']);
    });

    it('should return unknown MCPs as healthy by default', () => {
      const healthyMCPs = healthMonitor.getHealthyMCPs(['unknown']);
      expect(healthyMCPs).toEqual(['unknown']); // Unknown MCPs are treated as healthy
    });
  });

  describe('health status queries', () => {
    beforeEach(() => {
      healthMonitor.markHealthy('healthy-mcp');
      healthMonitor.markUnhealthy('unhealthy-mcp', 'Test error');
    });

    it('should return health data for healthy MCPs', () => {
      const health = healthMonitor.getMCPHealth('healthy-mcp');
      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
    });

    it('should return health data for unhealthy MCPs', () => {
      const health = healthMonitor.getMCPHealth('unhealthy-mcp');
      expect(health).toBeDefined();
      expect(health?.status).toBe('unhealthy');
      expect(health?.lastError).toBe('Test error');
    });

    it('should return undefined for unknown MCPs', () => {
      const health = healthMonitor.getMCPHealth('unknown-mcp');
      expect(health).toBeUndefined();
    });

    it('should include error count for unhealthy MCPs', () => {
      const health = healthMonitor.getMCPHealth('unhealthy-mcp');
      expect(health?.errorCount).toBeGreaterThan(0);
    });

    it('should include last check timestamp', () => {
      const health = healthMonitor.getMCPHealth('healthy-mcp');
      expect(health?.lastCheck).toBeDefined();
      expect(typeof health?.lastCheck).toBe('string');
    });
  });

  describe('file persistence', () => {
    it('should handle file reading errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const newMonitor = new MCPHealthMonitor();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(newMonitor).toBeDefined();
    });

    it('should handle file writing errors gracefully', async () => {
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      healthMonitor.markHealthy('test-mcp');
      // Should not throw error
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle directory creation', async () => {
      // Reset mocks and set up the scenario where directory doesn't exist
      jest.clearAllMocks();
      mockExistsSync.mockReturnValue(false); // Directory doesn't exist
      mockReadFile.mockResolvedValue('{}');
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);

      const newMonitor = new MCPHealthMonitor();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.ncp'),
        { recursive: true }
      );
    });
  });

  describe('health history', () => {
    it('should maintain health status over time', () => {
      healthMonitor.markHealthy('test-mcp');
      expect(healthMonitor.getMCPHealth('test-mcp')?.status).toBe('healthy');

      healthMonitor.markUnhealthy('test-mcp', 'Network error');
      expect(healthMonitor.getMCPHealth('test-mcp')?.status).toBe('unhealthy');

      healthMonitor.markHealthy('test-mcp');
      expect(healthMonitor.getMCPHealth('test-mcp')?.status).toBe('healthy');
    });

    it('should update error messages', () => {
      healthMonitor.markUnhealthy('test-mcp', 'First error');
      expect(healthMonitor.getMCPHealth('test-mcp')?.lastError).toBe('First error');

      healthMonitor.markUnhealthy('test-mcp', 'Second error');
      expect(healthMonitor.getMCPHealth('test-mcp')?.lastError).toBe('Second error');
    });

    it('should increment error count on repeated failures', () => {
      healthMonitor.markUnhealthy('test-mcp', 'First error');
      const firstError = healthMonitor.getMCPHealth('test-mcp');
      expect(firstError?.errorCount).toBe(1);

      healthMonitor.markUnhealthy('test-mcp', 'Second error');
      const secondError = healthMonitor.getMCPHealth('test-mcp');
      expect(secondError?.errorCount).toBe(2);
    });
  });

  describe('bulk operations', () => {
    it('should filter multiple MCPs by health', () => {
      const mcps = ['healthy1', 'healthy2', 'unhealthy1', 'unknown'];

      healthMonitor.markHealthy('healthy1');
      healthMonitor.markHealthy('healthy2');
      healthMonitor.markUnhealthy('unhealthy1', 'Error');

      const healthyMCPs = healthMonitor.getHealthyMCPs(mcps);
      expect(healthyMCPs).toEqual(['healthy1', 'healthy2', 'unknown']); // Unknown included
    });

    it('should handle empty MCP list', () => {
      const healthyMCPs = healthMonitor.getHealthyMCPs([]);
      expect(healthyMCPs).toEqual([]);
    });
  });

  describe('health management operations', () => {
    beforeEach(() => {
      healthMonitor.markHealthy('test-mcp');
    });

    it('should enable MCP', async () => {
      await expect(healthMonitor.enableMCP('test-mcp')).resolves.not.toThrow();
    });

    it('should disable MCP with reason', async () => {
      await expect(healthMonitor.disableMCP('test-mcp', 'Test disable')).resolves.not.toThrow();
      const health = healthMonitor.getMCPHealth('test-mcp');
      expect(health?.status).toBe('disabled');
      expect((health as any)?.disabledReason).toBe('Test disable');
    });

    it('should clear health history', async () => {
      healthMonitor.markHealthy('mcp1');
      healthMonitor.markHealthy('mcp2');

      await healthMonitor.clearHealthHistory();

      expect(healthMonitor.getMCPHealth('mcp1')).toBeUndefined();
      expect(healthMonitor.getMCPHealth('mcp2')).toBeUndefined();
    });

    it('should generate health report', () => {
      healthMonitor.markHealthy('healthy1');
      healthMonitor.markUnhealthy('unhealthy1', 'Error');

      const report = healthMonitor.generateHealthReport();

      expect(report).toBeDefined();
      expect(report.healthy).toBeGreaterThan(0);
      expect(report.unhealthy).toBeGreaterThan(0);
      expect(report.timestamp).toBeDefined();
      expect(report.totalMCPs).toBeGreaterThan(0);
      expect(Array.isArray(report.details)).toBe(true);
    });

    it('should check multiple MCPs health', async () => {
      const mcps = [
        { name: 'test1', command: 'echo', args: ['test'] },
        { name: 'test2', command: 'echo', args: ['test'] }
      ];

      const report = await healthMonitor.checkMultipleMCPs(mcps);

      expect(report).toBeDefined();
      expect(typeof report.healthy).toBe('number');
      expect(typeof report.unhealthy).toBe('number');
      expect(report.timestamp).toBeDefined();
    });
  });

  describe('auto-disable functionality', () => {
    it('should handle enable/disable state transitions', async () => {
      // First disable it
      await healthMonitor.disableMCP('transitionTest', 'Test disable');
      let health = healthMonitor.getMCPHealth('transitionTest');
      expect(health?.status).toBe('disabled');

      // Then enable it
      await healthMonitor.enableMCP('transitionTest');
      health = healthMonitor.getMCPHealth('transitionTest');
      expect(health?.status).toBe('unknown'); // enableMCP sets to unknown status initially
    });

    it('should handle health marking', () => {
      // Test marking healthy
      healthMonitor.markHealthy('healthyTest');
      let health = healthMonitor.getMCPHealth('healthyTest');
      expect(health?.status).toBe('healthy');

      // Test marking unhealthy
      healthMonitor.markUnhealthy('unhealthyTest', 'Test error');
      health = healthMonitor.getMCPHealth('unhealthyTest');
      expect(health?.status).toBe('unhealthy');
    });

    it('should handle health report generation', () => {
      // Add some MCPs with different states
      healthMonitor.markHealthy('healthy1');
      healthMonitor.markUnhealthy('failed1', 'Test error');

      const report = healthMonitor.generateHealthReport();
      expect(report).toBeDefined();
      expect(typeof report.healthy).toBe('number');
      expect(typeof report.unhealthy).toBe('number');
    });

    it('should clear health history', async () => {
      // Add some health data
      healthMonitor.markHealthy('clearTest1');
      healthMonitor.markUnhealthy('clearTest2', 'Test error');

      // Clear history
      await healthMonitor.clearHealthHistory();

      // Verify cleared
      const health1 = healthMonitor.getMCPHealth('clearTest1');
      const health2 = healthMonitor.getMCPHealth('clearTest2');

      // After clearing, these should be undefined or have default values
      expect(health1 === undefined || health1.status === 'unknown').toBe(true);
      expect(health2 === undefined || health2.status === 'unknown').toBe(true);
    });
  });
});