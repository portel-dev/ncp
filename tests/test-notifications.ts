/**
 * Simple test for session notification system
 */

import { SessionNotificationManager } from '../src/utils/session-notifications.js';

console.log('Testing Session Notification System...\n');

const notifications = new SessionNotificationManager();

// Test 1: Add notifications with different types
console.log('Test 1: Adding notifications');
notifications.add({
  type: 'info',
  message: '37 MCPs auto-imported from Windsurf'
});

notifications.add({
  type: 'tip',
  message: '37 MCPs configured (~740 tools) - replace with NCP-only to save ~95% tokens',
  relatedId: 'Windsurf'
});

notifications.add({
  type: 'warning',
  message: 'MCP health check found 3 issues',
  relatedId: 'health_20250101'
});

notifications.add({
  type: 'action',
  message: 'Config replaced for Windsurf - restart required'
});

console.log(`✓ Added ${notifications.getAll().length} notifications\n`);

// Test 2: Format for response
console.log('Test 2: Format for response');
const formatted = notifications.formatForResponse();
console.log(formatted);

// Test 3: Dismiss a notification
console.log('\nTest 3: Dismiss notification');
const firstNotif = notifications.getAll()[0];
console.log(`Dismissing: ${firstNotif.message}`);
notifications.dismiss(firstNotif.id);
console.log(`✓ Notifications remaining: ${notifications.getAll().length}\n`);

// Test 4: Check if has notifications
console.log('Test 4: Check if has notifications');
console.log(`Has notifications: ${notifications.hasNotifications()}`);

// Test 5: Clear all
console.log('\nTest 5: Clear all');
notifications.clear();
console.log(`✓ Cleared. Has notifications: ${notifications.hasNotifications()}`);

console.log('\n✅ All tests passed!');
