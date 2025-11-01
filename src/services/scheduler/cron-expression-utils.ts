/**
 * Cron Expression Utilities
 * Convert cron expressions to descriptive IDs and human-readable names
 */

/**
 * Convert a cron expression to a descriptive timing ID
 * Examples:
 *   "0 9 * * *" → "daily-9am"
 *   "30 14 * * *" → "daily-2-30pm"
 *   "0 0 * * *" → "daily-midnight"
 *   "0 12 * * 1" → "weekly-mon-noon"
 *   "0 0 1 * *" → "monthly-1st-midnight"
 *   "STAR/5 * * * *" → "every-5min"
 */
export function cronToTimingId(cronExpression: string): string {
  const normalized = normalizeCronExpression(cronExpression);
  const parts = normalized.split(' ');

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes pattern: */N * * * *
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const interval = minute.substring(2);
    return `every-${interval}min`;
  }

  // Every N hours pattern: 0 */N * * *
  if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const interval = hour.substring(2);
    return `every-${interval}hr`;
  }

  // Weekly pattern: M H * * D
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && !dayOfWeek.includes(',') && !dayOfWeek.includes('-')) {
    const dayName = getDayName(parseInt(dayOfWeek));
    const timeStr = formatTimeId(parseInt(hour), parseInt(minute));
    return `weekly-${dayName}-${timeStr}`;
  }

  // Weekday pattern: M H * * 1-5
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
    const timeStr = formatTimeId(parseInt(hour), parseInt(minute));
    return `weekdays-${timeStr}`;
  }

  // Monthly pattern: M H D * *
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    const day = parseInt(dayOfMonth);
    const daySuffix = getDayOrdinal(day);
    const timeStr = formatTimeId(parseInt(hour), parseInt(minute));
    return `monthly-${day}${daySuffix}-${timeStr}`;
  }

  // Daily pattern: M H * * *
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const timeStr = formatTimeId(parseInt(hour), parseInt(minute));
    return `daily-${timeStr}`;
  }

  // Complex pattern: use hash
  return `custom-${hashCronExpression(normalized)}`;
}

/**
 * Convert a cron expression to a human-readable name
 * Examples:
 *   "0 9 * * *" → "Daily at 9:00 AM"
 *   "STAR/15 * * * *" → "Every 15 minutes"
 *   "0 12 * * 1" → "Weekly on Monday at 12:00 PM"
 */
export function cronToTimingName(cronExpression: string): string {
  const normalized = normalizeCronExpression(cronExpression);
  const parts = normalized.split(' ');

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes pattern
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const interval = minute.substring(2);
    return `Every ${interval} minute${interval === '1' ? '' : 's'}`;
  }

  // Every N hours pattern
  if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const interval = hour.substring(2);
    return `Every ${interval} hour${interval === '1' ? '' : 's'}`;
  }

  // Weekly pattern
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && !dayOfWeek.includes(',') && !dayOfWeek.includes('-')) {
    const dayName = getDayFullName(parseInt(dayOfWeek));
    const timeStr = formatTime12Hour(parseInt(hour), parseInt(minute));
    return `Weekly on ${dayName} at ${timeStr}`;
  }

  // Weekday pattern
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
    const timeStr = formatTime12Hour(parseInt(hour), parseInt(minute));
    return `Weekdays at ${timeStr}`;
  }

  // Monthly pattern
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    const day = parseInt(dayOfMonth);
    const daySuffix = getDayOrdinal(day);
    const timeStr = formatTime12Hour(parseInt(hour), parseInt(minute));
    return `Monthly on the ${day}${daySuffix} at ${timeStr}`;
  }

  // Daily pattern
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const timeStr = formatTime12Hour(parseInt(hour), parseInt(minute));
    return `Daily at ${timeStr}`;
  }

  // Complex pattern: return cron expression
  return `Custom schedule: ${normalized}`;
}

/**
 * Normalize cron expression for consistent comparison
 * - Trims whitespace
 * - Converts multiple spaces to single space
 * - Validates format
 */
export function normalizeCronExpression(cronExpression: string): string {
  return cronExpression.trim().replace(/\s+/g, ' ');
}

/**
 * Format time as ID string (e.g., "9am", "2-30pm", "midnight", "noon")
 */
function formatTimeId(hour: number, minute: number): string {
  if (hour === 0 && minute === 0) return 'midnight';
  if (hour === 12 && minute === 0) return 'noon';

  const isPM = hour >= 12;
  const hour12 = hour % 12 || 12;
  const period = isPM ? 'pm' : 'am';

  if (minute === 0) {
    return `${hour12}${period}`;
  }

  return `${hour12}-${minute.toString().padStart(2, '0')}${period}`;
}

/**
 * Format time as 12-hour string (e.g., "9:00 AM", "2:30 PM")
 */
function formatTime12Hour(hour: number, minute: number): string {
  const isPM = hour >= 12;
  const hour12 = hour % 12 || 12;
  const period = isPM ? 'PM' : 'AM';
  const minuteStr = minute.toString().padStart(2, '0');

  return `${hour12}:${minuteStr} ${period}`;
}

/**
 * Get abbreviated day name from day number (0 = Sunday, 1 = Monday, etc.)
 */
function getDayName(dayNumber: number): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[dayNumber] || `day${dayNumber}`;
}

/**
 * Get full day name from day number
 */
function getDayFullName(dayNumber: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNumber] || `Day ${dayNumber}`;
}

/**
 * Get ordinal suffix for day of month (1st, 2nd, 3rd, etc.)
 */
function getDayOrdinal(day: number): string {
  if (day >= 11 && day <= 13) return 'th';

  const lastDigit = day % 10;
  switch (lastDigit) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Generate a short hash from cron expression for custom schedules
 */
function hashCronExpression(cronExpression: string): string {
  let hash = 0;
  for (let i = 0; i < cronExpression.length; i++) {
    const char = cronExpression.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}
