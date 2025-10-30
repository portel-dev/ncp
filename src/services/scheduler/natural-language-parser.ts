/**
 * Natural Language Schedule Parser
 * Converts human-readable schedules to cron expressions
 * Ported from scheduling branch
 */

import { NaturalLanguageParseResult } from '../../types/scheduler.js';

export class NaturalLanguageParser {
  /**
   * Parse natural language schedule to cron expression
   */
  static parseSchedule(description: string): NaturalLanguageParseResult {
    const desc = description.toLowerCase().trim();

    // Check for relative time patterns first ("in 5 minutes", "in 2 hours")
    const relativeResult = this.parseRelativeTime(desc);
    if (relativeResult.success) {
      return relativeResult;
    }

    // Every minute patterns
    if (desc.includes('every minute')) {
      return {
        success: true,
        cronExpression: '* * * * *',
        explanation: 'Runs every minute of every hour'
      };
    }

    // Every X minutes patterns
    const minuteMatch = desc.match(/every (\d+) minutes?/);
    if (minuteMatch) {
      const minutes = parseInt(minuteMatch[1]);
      if (minutes >= 1 && minutes <= 59) {
        return {
          success: true,
          cronExpression: `*/${minutes} * * * *`,
          explanation: `Runs every ${minutes} minute${minutes === 1 ? '' : 's'}`
        };
      }
    }

    // Every hour
    if (desc.includes('every hour') || desc.includes('hourly')) {
      return {
        success: true,
        cronExpression: '0 * * * *',
        explanation: 'Runs at the start of every hour'
      };
    }

    // Daily patterns with specific times
    if (desc.includes('every day') || desc.includes('daily')) {
      const timeMatch = this.extractTime(desc);
      if (timeMatch) {
        return {
          success: true,
          cronExpression: `${timeMatch.minute} ${timeMatch.hour} * * *`,
          explanation: `Runs daily at ${timeMatch.display}`
        };
      }
      // Default to 9am if no time specified
      return {
        success: true,
        cronExpression: '0 9 * * *',
        explanation: 'Runs daily at 9:00 AM (default time)'
      };
    }

    // Weekday patterns
    if (desc.includes('weekday') || desc.includes('monday to friday') || desc.includes('mon-fri')) {
      const timeMatch = this.extractTime(desc);
      if (timeMatch) {
        return {
          success: true,
          cronExpression: `${timeMatch.minute} ${timeMatch.hour} * * 1-5`,
          explanation: `Runs weekdays (Mon-Fri) at ${timeMatch.display}`
        };
      }
      return {
        success: true,
        cronExpression: '0 9 * * 1-5',
        explanation: 'Runs weekdays (Mon-Fri) at 9:00 AM (default)'
      };
    }

    // Weekend patterns
    if (desc.includes('weekend') || desc.includes('saturday and sunday')) {
      const timeMatch = this.extractTime(desc);
      const time = timeMatch || { hour: 10, minute: 0, display: '10:00 AM' };
      return {
        success: true,
        cronExpression: `${time.minute} ${time.hour} * * 0,6`,
        explanation: `Runs on weekends (Sat-Sun) at ${time.display}`
      };
    }

    // Specific weekday patterns
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < weekdays.length; i++) {
      if (desc.includes(weekdays[i])) {
        const timeMatch = this.extractTime(desc);
        const time = timeMatch || { hour: 9, minute: 0, display: '9:00 AM' };
        return {
          success: true,
          cronExpression: `${time.minute} ${time.hour} * * ${i}`,
          explanation: `Runs every ${weekdays[i]} at ${time.display}`
        };
      }
    }

    // Monthly patterns
    if (desc.includes('monthly') || desc.includes('first day of')) {
      const timeMatch = this.extractTime(desc);
      const time = timeMatch || { hour: 9, minute: 0, display: '9:00 AM' };
      return {
        success: true,
        cronExpression: `${time.minute} ${time.hour} 1 * *`,
        explanation: `Runs on the 1st day of every month at ${time.display}`
      };
    }

    // If no pattern matched
    return {
      success: false,
      error: `Supported patterns:\n` +
             `• "in 5 minutes" → one-time execution in 5 minutes\n` +
             `• "in 2 hours" → one-time execution in 2 hours\n` +
             `• "every minute" → * * * * *\n` +
             `• "every 5 minutes" → */5 * * * *\n` +
             `• "every hour" → 0 * * * *\n` +
             `• "every day at 9am" → 0 9 * * *\n` +
             `• "every weekday at 2:30pm" → 30 14 * * 1-5\n` +
             `• "every monday at 10am" → 0 10 * * 1\n` +
             `• "monthly at 9am" → 0 9 1 * *\n\n` +
             `Tip: Include specific times like "9am", "2:30pm", "noon", "midnight"`
    };
  }

  /**
   * Parse relative time expressions ("in 5 minutes", "in 2 hours")
   */
  private static parseRelativeTime(description: string): NaturalLanguageParseResult {
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

      // Calculate target time
      const now = new Date();
      const targetTime = new Date(now.getTime() + milliseconds);

      // Create one-time cron expression in local time (cron runs in system timezone)
      const minute = targetTime.getMinutes();
      const hour = targetTime.getHours();
      const day = targetTime.getDate();
      const month = targetTime.getMonth() + 1;

      return {
        success: true,
        cronExpression: `${minute} ${hour} ${day} ${month} *`,
        explanation: `One-time execution ${amount} ${unitName} from now (${targetTime.toISOString()})`,
        fireOnce: true // Indicate this should be a one-time execution
      };
    }

    return {
      success: false
    };
  }

  /**
   * Extract time from natural language
   */
  private static extractTime(description: string): { hour: number; minute: number; display: string } | null {
    // Common time patterns
    const timePatterns = [
      { regex: /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i, format: '12hour' },
      { regex: /\b(\d{1,2})\s*(am|pm)\b/i, format: '12hour-simple' },
      { regex: /\b(\d{1,2}):(\d{2})\b/, format: '24hour' },
      { regex: /\bnoon\b/i, format: 'special' },
      { regex: /\bmidnight\b/i, format: 'special' },
    ];

    for (const pattern of timePatterns) {
      const match = description.match(pattern.regex);
      if (match) {
        switch (pattern.format) {
          case '12hour':
            let hour = parseInt(match[1]);
            const minute = parseInt(match[2]);
            const ampm = match[3].toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return {
              hour,
              minute,
              display: `${match[1]}:${match[2]} ${ampm.toUpperCase()}`
            };

          case '12hour-simple':
            let simpleHour = parseInt(match[1]);
            const simpleAmpm = match[2].toLowerCase();
            if (simpleAmpm === 'pm' && simpleHour !== 12) simpleHour += 12;
            if (simpleAmpm === 'am' && simpleHour === 12) simpleHour = 0;
            return {
              hour: simpleHour,
              minute: 0,
              display: `${match[1]}:00 ${simpleAmpm.toUpperCase()}`
            };

          case '24hour':
            return {
              hour: parseInt(match[1]),
              minute: parseInt(match[2]),
              display: `${match[1]}:${match[2]} (24h)`
            };

          case 'special':
            if (match[0].toLowerCase() === 'noon') {
              return { hour: 12, minute: 0, display: '12:00 PM (noon)' };
            }
            if (match[0].toLowerCase() === 'midnight') {
              return { hour: 0, minute: 0, display: '12:00 AM (midnight)' };
            }
        }
      }
    }

    return null;
  }
}
