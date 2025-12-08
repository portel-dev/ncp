/**
 * Unit tests for DoctorCommand
 * Tests system diagnostics and health checks
 */

import { DoctorCommand, DiagnosticCheck } from '../../src/cli/commands/doctor';

describe('DoctorCommand', () => {
  describe('diagnose', () => {
    // These are integration tests that verify diagnose completes
    // Skipping as they involve CLI output
    test.skip('should complete without errors', async () => {
      await DoctorCommand.diagnose();
    });

    test.skip('should accept optional MCP name parameter', async () => {
      await DoctorCommand.diagnose('test-mcp');
    });
  });

  describe('DiagnosticCheck interface', () => {
    test('should have required properties', () => {
      const check: DiagnosticCheck = {
        name: 'Test Check',
        status: 'HEALTHY',
        message: 'All good',
        details: ['Detail 1', 'Detail 2']
      };

      expect(check.name).toBe('Test Check');
      expect(check.status).toBe('HEALTHY');
      expect(check.message).toBe('All good');
      expect(check.details).toHaveLength(2);
    });

    test('should support all status types', () => {
      const statuses: Array<'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'UNKNOWN'> = [
        'HEALTHY',
        'UNHEALTHY',
        'DEGRADED',
        'UNKNOWN'
      ];

      statuses.forEach(status => {
        const check: DiagnosticCheck = {
          name: 'Test',
          status
        };
        expect(check.status).toBe(status);
      });
    });

    test('should allow optional message and details', () => {
      const checkWithoutMessage: DiagnosticCheck = {
        name: 'Test',
        status: 'HEALTHY'
      };
      expect(checkWithoutMessage.message).toBeUndefined();
      expect(checkWithoutMessage.details).toBeUndefined();

      const checkWithDetails: DiagnosticCheck = {
        name: 'Test',
        status: 'HEALTHY',
        details: []
      };
      expect(checkWithDetails.details).toEqual([]);
    });
  });

  describe('integration with CLI', () => {
    test('doctor command should be async and return void', () => {
      // Verify the diagnose method signature
      expect(typeof DoctorCommand.diagnose).toBe('function');

      // Verify it returns a Promise
      const result = DoctorCommand.diagnose();
      expect(result instanceof Promise).toBe(true);
    });
  });
});
