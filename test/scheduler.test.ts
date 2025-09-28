/**
 * Unit Tests - Scheduler Utility Functions
 * Tests the scheduler utility functions for UTC handling,
 * relative time parsing, and cron generation
 */

import { describe, it, expect, jest } from '@jest/globals';

// Utility functions extracted for testing
class SchedulerUtils {
  /**
   * Parse relative time expressions ("in 5 minutes", "in 2 hours")
   */
  static parseRelativeTime(description: string, currentTime: Date): {
    success: boolean;
    targetTime?: Date;
    explanation?: string;
    error?: string;
  } {
    const desc = description.toLowerCase().trim();

    // Pattern: "in X minutes/hours/days"
    const relativePattern = /^in\s+(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days)$/;
    const match = desc.match(relativePattern);

    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      let milliseconds = 0;
      let unitName = '';

      switch (unit) {
        case 'minute':
        case 'minutes':
        case 'min':
          milliseconds = amount * 60 * 1000;
          unitName = amount === 1 ? 'minute' : 'minutes';
          break;
        case 'hour':
        case 'hours':
        case 'hr':
          milliseconds = amount * 60 * 60 * 1000;
          unitName = amount === 1 ? 'hour' : 'hours';
          break;
        case 'day':
        case 'days':
          milliseconds = amount * 24 * 60 * 60 * 1000;
          unitName = amount === 1 ? 'day' : 'days';
          break;
      }

      const targetTime = new Date(currentTime.getTime() + milliseconds);
      return {
        success: true,
        targetTime,
        explanation: `${amount} ${unitName} from now`
      };
    }

    return {
      success: false,
      error: `Could not parse relative time: "${description}"`
    };
  }

  /**
   * Create a one-time cron expression for a specific timestamp
   */
  static createOneTimeCron(targetTime: Date): string {
    // Use UTC components since cron scheduler runs in UTC
    const minute = targetTime.getUTCMinutes();
    const hour = targetTime.getUTCHours();
    const day = targetTime.getUTCDate();
    const month = targetTime.getUTCMonth() + 1; // getUTCMonth() is 0-indexed

    // Create cron for specific date and time in UTC
    return `${minute} ${hour} ${day} ${month} *`;
  }
}

describe('NCP Scheduler Utilities', () => {

  describe('UTC Timezone Handling', () => {
    it('should create cron expressions in UTC timezone', () => {
      const fixedTime = new Date('2025-09-28T10:30:00.000Z'); // Fixed UTC time
      const relativeResult = SchedulerUtils.parseRelativeTime('in 5 minutes', fixedTime);

      expect(relativeResult.success).toBe(true);
      expect(relativeResult.targetTime).toEqual(new Date('2025-09-28T10:35:00.000Z'));

      const cronExpression = SchedulerUtils.createOneTimeCron(relativeResult.targetTime!);
      expect(cronExpression).toBe('35 10 28 9 *'); // minute=35, hour=10, day=28, month=9
    });

    it('should handle UTC components correctly across month boundaries', () => {
      // Test end of month: January 31 -> February 1
      const currentTime = new Date('2025-01-31T23:55:00.000Z');
      const relativeResult = SchedulerUtils.parseRelativeTime('in 10 minutes', currentTime);

      expect(relativeResult.success).toBe(true);
      expect(relativeResult.targetTime).toEqual(new Date('2025-02-01T00:05:00.000Z'));

      const cronExpression = SchedulerUtils.createOneTimeCron(relativeResult.targetTime!);
      expect(cronExpression).toBe('5 0 1 2 *'); // minute=5, hour=0, day=1, month=2 (February)
    });
  });

  describe('Relative Time Parsing', () => {
    it('should correctly parse "in 5 minutes"', () => {
      const fixedTime = new Date('2025-09-28T15:45:30.000Z');
      const result = SchedulerUtils.parseRelativeTime('in 5 minutes', fixedTime);

      expect(result.success).toBe(true);
      expect(result.targetTime).toEqual(new Date('2025-09-28T15:50:30.000Z'));
      expect(result.explanation).toBe('5 minutes from now');
    });

    it('should correctly parse "in 2 hours"', () => {
      const fixedTime = new Date('2025-09-28T08:15:00.000Z');
      const result = SchedulerUtils.parseRelativeTime('in 2 hours', fixedTime);

      expect(result.success).toBe(true);
      expect(result.targetTime).toEqual(new Date('2025-09-28T10:15:00.000Z'));
      expect(result.explanation).toBe('2 hours from now');
    });

    it('should handle edge case "in 1 minute" (singular)', () => {
      const fixedTime = new Date('2025-09-28T12:00:00.000Z');
      const result = SchedulerUtils.parseRelativeTime('in 1 minute', fixedTime);

      expect(result.success).toBe(true);
      expect(result.targetTime).toEqual(new Date('2025-09-28T12:01:00.000Z'));
      expect(result.explanation).toBe('1 minute from now');
    });

    it('should handle various time units', () => {
      const fixedTime = new Date('2025-09-28T10:00:00.000Z');

      // Test minutes variations
      expect(SchedulerUtils.parseRelativeTime('in 30 minutes', fixedTime).success).toBe(true);
      expect(SchedulerUtils.parseRelativeTime('in 1 min', fixedTime).success).toBe(true);

      // Test hours variations
      expect(SchedulerUtils.parseRelativeTime('in 3 hours', fixedTime).success).toBe(true);
      expect(SchedulerUtils.parseRelativeTime('in 1 hr', fixedTime).success).toBe(true);

      // Test days variations
      expect(SchedulerUtils.parseRelativeTime('in 2 days', fixedTime).success).toBe(true);
      expect(SchedulerUtils.parseRelativeTime('in 1 day', fixedTime).success).toBe(true);
    });

    it('should reject invalid relative time formats', () => {
      const fixedTime = new Date('2025-09-28T10:00:00.000Z');

      expect(SchedulerUtils.parseRelativeTime('in xyz minutes', fixedTime).success).toBe(false);
      expect(SchedulerUtils.parseRelativeTime('5 minutes', fixedTime).success).toBe(false);
      expect(SchedulerUtils.parseRelativeTime('in minutes', fixedTime).success).toBe(false);
      expect(SchedulerUtils.parseRelativeTime('', fixedTime).success).toBe(false);
    });
  });

  describe('Cron Expression Generation', () => {
    it('should generate correct cron for one-time execution', () => {
      // Test specific date/time: September 28, 2025 at 14:30:45 UTC
      const targetTime = new Date('2025-09-28T14:30:45.000Z');
      const cronExpression = SchedulerUtils.createOneTimeCron(targetTime);

      // Should generate cron: minute=30, hour=14, day=28, month=9
      expect(cronExpression).toBe('30 14 28 9 *');
    });

    it('should handle different UTC times correctly', () => {
      // Test various times and dates
      const testCases = [
        { time: '2025-01-01T00:00:00.000Z', expected: '0 0 1 1 *' },
        { time: '2025-12-31T23:59:00.000Z', expected: '59 23 31 12 *' },
        { time: '2025-06-15T12:30:00.000Z', expected: '30 12 15 6 *' },
        { time: '2025-02-28T09:45:00.000Z', expected: '45 9 28 2 *' }
      ];

      testCases.forEach(({ time, expected }) => {
        const targetTime = new Date(time);
        const cronExpression = SchedulerUtils.createOneTimeCron(targetTime);
        expect(cronExpression).toBe(expected);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should correctly handle full "in 5 minutes" workflow', () => {
      // Simulate the exact scenario that was failing
      const currentTime = new Date('2025-09-28T04:37:10.552Z');

      // Parse "in 5 minutes"
      const parseResult = SchedulerUtils.parseRelativeTime('in 5 minutes', currentTime);
      expect(parseResult.success).toBe(true);
      expect(parseResult.explanation).toBe('5 minutes from now');

      // Should calculate target time as 5 minutes later
      const expectedTargetTime = new Date('2025-09-28T04:42:10.552Z');
      expect(parseResult.targetTime).toEqual(expectedTargetTime);

      // Generate cron expression for the target time
      const cronExpression = SchedulerUtils.createOneTimeCron(parseResult.targetTime!);

      // Should be minute=42, hour=4, day=28, month=9
      expect(cronExpression).toBe('42 4 28 9 *');

      // Verify this would execute at the correct time (not 4 hours later)
      expect(parseResult.targetTime!.getUTCHours()).toBe(4); // Not 8!
      expect(parseResult.targetTime!.getUTCMinutes()).toBe(42);
    });

    it('should handle year boundaries correctly', () => {
      // Test transition from December to January
      const currentTime = new Date('2024-12-31T23:55:00.000Z');
      const parseResult = SchedulerUtils.parseRelativeTime('in 10 minutes', currentTime);

      expect(parseResult.success).toBe(true);
      expect(parseResult.targetTime).toEqual(new Date('2025-01-01T00:05:00.000Z'));

      const cronExpression = SchedulerUtils.createOneTimeCron(parseResult.targetTime!);
      expect(cronExpression).toBe('5 0 1 1 *'); // January 1st, 00:05
    });

    it('should validate the original bug scenario', () => {
      // The original issue: "in 5 minutes" at 04:37:10 UTC was scheduling for 08:42:00 UTC
      const currentTime = new Date('2025-09-28T04:37:10.000Z');
      const parseResult = SchedulerUtils.parseRelativeTime('in 5 minutes', currentTime);

      expect(parseResult.success).toBe(true);

      // Should be 04:42:10 UTC, NOT 08:42:00 UTC
      const targetTime = parseResult.targetTime!;
      expect(targetTime.getUTCHours()).toBe(4); // Should be 4, not 8
      expect(targetTime.getUTCMinutes()).toBe(42);
      expect(targetTime.toISOString()).toBe('2025-09-28T04:42:10.000Z');

      // Cron should reflect UTC time correctly
      const cronExpression = SchedulerUtils.createOneTimeCron(targetTime);
      expect(cronExpression).toBe('42 4 28 9 *');
    });
  });
});