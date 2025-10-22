/**
 * Unit Tests for CronManager
 * Tests crontab manipulation (requires mocking on most systems)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CronManager } from '../../src/services/scheduler/cron-manager';

describe('CronManager', () => {
  describe('validateCronExpression', () => {
    it('should validate correct cron expressions', () => {
      const validExpressions = [
        '* * * * *',           // Every minute
        '0 9 * * *',           // Daily at 9am
        '*/5 * * * *',         // Every 5 minutes
        '0 9 * * 1-5',         // Weekdays at 9am
        '30 14 * * 0',         // Sundays at 2:30pm
        '0 0 1 * *',           // First of month at midnight
        '15 10 * * 1,3,5',     // Mon/Wed/Fri at 10:15am
      ];

      for (const expr of validExpressions) {
        const result = CronManager.validateCronExpression(expr);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid cron expressions', () => {
      const invalidExpressions = [
        '',                    // Empty
        '* * * *',             // Too few fields
        '* * * * * *',         // Too many fields
        '60 * * * *',          // Invalid minute
        '* 24 * * *',          // Invalid hour
        '* * 0 * *',           // Invalid day (0)
        '* * 32 * *',          // Invalid day (32)
        '* * * 13 *',          // Invalid month (13)
        '* * * * 8',           // Invalid weekday (8)
      ];

      for (const expr of invalidExpressions) {
        const result = CronManager.validateCronExpression(expr);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should provide clear error messages', () => {
      const result = CronManager.validateCronExpression('60 * * * *');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('minute');
      expect(result.error).toContain('0-59');
    });

    it('should handle cron with step values', () => {
      const result = CronManager.validateCronExpression('*/10 * * * *');

      expect(result.valid).toBe(true);
    });

    it('should handle cron with ranges', () => {
      const result = CronManager.validateCronExpression('0 9-17 * * *');

      expect(result.valid).toBe(true);
    });

    it('should handle cron with lists', () => {
      const result = CronManager.validateCronExpression('0 9,12,15 * * *');

      expect(result.valid).toBe(true);
    });
  });

  describe('CronManager operations (Windows check)', () => {
    it('should throw on Windows platform', () => {
      // Only run this test on Windows
      if (process.platform === 'win32') {
        expect(() => new CronManager()).toThrow('does not support Windows');
      }
    });

    // Note: Actual crontab manipulation tests should be run in isolated CI environment
    // or with proper mocking since they modify system crontab
  });
});
