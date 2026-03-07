#!/usr/bin/env node
/**
 * Test Script for Auth Prompt & Notification System
 *
 * Demonstrates the on-demand authentication flow:
 * 1. Try to use MCP without credentials
 * 2. Show auth prompt with dual timeline
 * 3. Handle late user responses with notifications
 * 4. Show session-aware notification delivery
 */

import { notificationAPI } from './src/services/NotificationIntegration.js';
import { NotificationType } from './src/types/notifications.js';

console.log('🧪 Testing Auth Prompt & Notification System\n');

async function demonstrateAuthFlow() {
  console.log('='.repeat(60));
  console.log('🔬 DEMO: On-Demand Authentication Flow');
  console.log('='.repeat(60));

  // Enable debug logging to see what's happening
  notificationAPI.debug();

  console.log('\n1️⃣ First, let\'s try to use Supabase without credentials...\n');

  try {
    const result1 = await notificationAPI.execute('supabase:create_table', {
      name: 'users',
      schema: { id: 'serial', email: 'text' }
    });

    console.log('📤 AI Response:');
    console.log(result1);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }

  // Simulate some time passing
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n2️⃣ Now let\'s try another operation (user might have entered credentials)...\n');

  try {
    const result2 = await notificationAPI.execute('supabase:list_tables');

    console.log('📤 AI Response:');
    console.log(result2);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }

  console.log('\n3️⃣ Let\'s try a different MCP (should not get Supabase notifications)...\n');

  try {
    const result3 = await notificationAPI.execute('filesystem:read_file', {
      path: './package.json'
    });

    console.log('📤 AI Response:');
    console.log(result3.substring(0, 200) + '...');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }

  console.log('\n4️⃣ Now let\'s add some system notifications...\n');

  // Simulate various system events
  notificationAPI.notify('✅ GitHub MCP connection restored', 'info', 'github');
  notificationAPI.notify('⚠️ OpenAI rate limit approaching', 'warning', 'openai');

  try {
    const result4 = await notificationAPI.execute('filesystem:list_directory', {
      path: './src'
    });

    console.log('📤 AI Response:');
    console.log(result4.substring(0, 300) + '...');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }

  console.log('\n📊 System Status:');
  const status = notificationAPI.status();
  console.log(JSON.stringify(status, null, 2));
}

async function demonstrateSessionIsolation() {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 DEMO: Session Isolation');
  console.log('='.repeat(60));

  console.log('\n🎯 This demonstrates how notifications are only delivered to relevant sessions\n');

  // Add a notification for an MCP we haven't used
  notificationAPI.notify('🔑 Slack is now authenticated', 'info', 'slack');

  // Try to get notifications - should be empty since we haven't used Slack
  const result = await notificationAPI.execute('filesystem:read_file', {
    path: './README.md'
  });

  console.log('📤 AI Response (should not include Slack notification):');
  console.log(result.substring(0, 200) + '...');

  // Now use Slack and then get notifications
  console.log('\n🔄 Now let\'s "use" Slack and see if we get the notification...\n');

  try {
    await notificationAPI.execute('slack:send_message', {
      channel: '#general',
      message: 'Hello world'
    });
  } catch (error) {
    // Expected to fail, but records usage
  }

  // Add Slack notification again
  notificationAPI.notify('🔑 Slack is now authenticated', 'info', 'slack');

  const result2 = await notificationAPI.execute('filesystem:read_file', {
    path: './package.json'
  });

  console.log('📤 AI Response (should now include Slack notification):');
  console.log(result2.substring(0, 300) + '...');
}

async function main() {
  try {
    await demonstrateAuthFlow();
    await demonstrateSessionIsolation();

    console.log('\n🎉 Demo completed! Key takeaways:');
    console.log('• Auth prompts don\'t block AI workflow');
    console.log('• Late responses trigger notifications');
    console.log('• Notifications are delivered to relevant sessions only');
    console.log('• System handles multiple auth flows gracefully\n');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Demo interrupted by user');
  process.exit(0);
});

// Run demo
main().catch(console.error);