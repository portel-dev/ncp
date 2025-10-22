/**
 * Unit Tests for NaturalLanguageParser
 * Tests schedule parsing from natural language to cron expressions
 */

import { describe, it, expect } from '@jest/globals';
import { NaturalLanguageParser } from '../../src/services/scheduler/natural-language-parser';

describe('NaturalLanguageParser', () => {
  describe('parseSchedule', () => {
    describe('every minute patterns', () => {
      it('should parse "every minute"', () => {
        const result = NaturalLanguageParser.parseSchedule('every minute');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('* * * * *');
        expect(result.explanation).toContain('every minute');
      });
    });

    describe('every X minutes patterns', () => {
      it('should parse "every 5 minutes"', () => {
        const result = NaturalLanguageParser.parseSchedule('every 5 minutes');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('*/5 * * * *');
      });

      it('should parse "every 30 minutes"', () => {
        const result = NaturalLanguageParser.parseSchedule('every 30 minutes');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('*/30 * * * *');
      });

      it('should handle singular "minute"', () => {
        const result = NaturalLanguageParser.parseSchedule('every 1 minute');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('*/1 * * * *');
      });
    });

    describe('hourly patterns', () => {
      it('should parse "every hour"', () => {
        const result = NaturalLanguageParser.parseSchedule('every hour');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 * * * *');
      });

      it('should parse "hourly"', () => {
        const result = NaturalLanguageParser.parseSchedule('hourly');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 * * * *');
      });
    });

    describe('daily patterns', () => {
      it('should parse "every day at 9am"', () => {
        const result = NaturalLanguageParser.parseSchedule('every day at 9am');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 9 * * *');
      });

      it('should parse "daily at 2:30pm"', () => {
        const result = NaturalLanguageParser.parseSchedule('daily at 2:30pm');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('30 14 * * *');
      });

      it('should parse "every day at noon"', () => {
        const result = NaturalLanguageParser.parseSchedule('every day at noon');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 12 * * *');
      });

      it('should parse "every day at midnight"', () => {
        const result = NaturalLanguageParser.parseSchedule('every day at midnight');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 0 * * *');
      });

      it('should default to 9am if no time specified', () => {
        const result = NaturalLanguageParser.parseSchedule('every day');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 9 * * *');
      });
    });

    describe('weekday patterns', () => {
      it('should parse "every weekday at 9am"', () => {
        const result = NaturalLanguageParser.parseSchedule('every weekday at 9am');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 9 * * 1-5');
      });

      it('should parse "monday to friday at 2:30pm"', () => {
        const result = NaturalLanguageParser.parseSchedule('monday to friday at 2:30pm');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('30 14 * * 1-5');
      });

      it('should default to 9am for weekdays if no time', () => {
        const result = NaturalLanguageParser.parseSchedule('every weekday');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 9 * * 1-5');
      });
    });

    describe('weekend patterns', () => {
      it('should parse "every weekend at 10am"', () => {
        const result = NaturalLanguageParser.parseSchedule('every weekend at 10am');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 10 * * 0,6');
      });
    });

    describe('specific weekday patterns', () => {
      it('should parse "every monday at 9am"', () => {
        const result = NaturalLanguageParser.parseSchedule('every monday at 9am');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 9 * * 1');
      });

      it('should parse "every friday at 5pm"', () => {
        const result = NaturalLanguageParser.parseSchedule('every friday at 5pm');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 17 * * 5');
      });

      it('should parse "every sunday at noon"', () => {
        const result = NaturalLanguageParser.parseSchedule('every sunday at noon');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 12 * * 0');
      });
    });

    describe('monthly patterns', () => {
      it('should parse "monthly at 9am"', () => {
        const result = NaturalLanguageParser.parseSchedule('monthly at 9am');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 9 1 * *');
      });

      it('should parse "first day of month at 10am"', () => {
        const result = NaturalLanguageParser.parseSchedule('first day of the month at 10am');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('0 10 1 * *');
      });
    });

    describe('relative time patterns', () => {
      it('should parse "in 5 minutes"', () => {
        const result = NaturalLanguageParser.parseSchedule('in 5 minutes');

        expect(result.success).toBe(true);
        expect(result.fireOnce).toBe(true);
        expect(result.explanation).toContain('5 minutes from now');
        // Cron expression will be specific to current time + 5 minutes
        expect(result.cronExpression).toMatch(/^\d+ \d+ \d+ \d+ \*$/);
      });

      it('should parse "in 2 hours"', () => {
        const result = NaturalLanguageParser.parseSchedule('in 2 hours');

        expect(result.success).toBe(true);
        expect(result.fireOnce).toBe(true);
        expect(result.explanation).toContain('2 hours from now');
      });

      it('should parse "in 1 day"', () => {
        const result = NaturalLanguageParser.parseSchedule('in 1 day');

        expect(result.success).toBe(true);
        expect(result.fireOnce).toBe(true);
        expect(result.explanation).toContain('1 day from now');
      });
    });

    describe('time formats', () => {
      it('should handle 12-hour format with minutes', () => {
        const result = NaturalLanguageParser.parseSchedule('every day at 2:30pm');

        expect(result.success).toBe(true);
        expect(result.cronExpression).toBe('30 14 * * *');
      });

      it('should handle AM/PM correctly', () => {
        const resultAM = NaturalLanguageParser.parseSchedule('every day at 9am');
        const resultPM = NaturalLanguageParser.parseSchedule('every day at 9pm');

        expect(resultAM.cronExpression).toBe('0 9 * * *');
        expect(resultPM.cronExpression).toBe('0 21 * * *');
      });

      it('should handle noon correctly', () => {
        const result = NaturalLanguageParser.parseSchedule('every day at noon');

        expect(result.cronExpression).toBe('0 12 * * *');
      });

      it('should handle midnight correctly', () => {
        const result = NaturalLanguageParser.parseSchedule('every day at midnight');

        expect(result.cronExpression).toBe('0 0 * * *');
      });
    });

    describe('error cases', () => {
      it('should return error for invalid pattern', () => {
        const result = NaturalLanguageParser.parseSchedule('something invalid');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should return error for empty string', () => {
        const result = NaturalLanguageParser.parseSchedule('');

        expect(result.success).toBe(false);
      });

      it('should provide helpful error messages with examples', () => {
        const result = NaturalLanguageParser.parseSchedule('invalid schedule');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Supported patterns');
        expect(result.error).toContain('every day at 9am');
      });
    });

    describe('case insensitivity', () => {
      it('should handle different cases', () => {
        const lower = NaturalLanguageParser.parseSchedule('every day at 9am');
        const upper = NaturalLanguageParser.parseSchedule('EVERY DAY AT 9AM');
        const mixed = NaturalLanguageParser.parseSchedule('Every Day At 9AM');

        expect(lower.cronExpression).toBe(upper.cronExpression);
        expect(lower.cronExpression).toBe(mixed.cronExpression);
      });
    });
  });
});
