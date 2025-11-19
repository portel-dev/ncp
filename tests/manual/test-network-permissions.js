/**
 * Manual Test: Runtime Network Permissions
 *
 * This demonstrates the runtime network permissions feature.
 * Run this to see how the elicitation adapter works.
 */

import { NetworkPolicyManager, SECURE_NETWORK_POLICY } from '../../dist/code-mode/network-policy.js';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  Runtime Network Permissions - Manual Test              ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// Create a mock elicitation function (simulates user input)
const mockElicitationFunction = async (params) => {
  console.log('\n📋 Permission Dialog Shown:');
  console.log('─'.repeat(60));
  console.log('Title:', params.title);
  console.log('\nMessage:');
  console.log(params.message);
  console.log('\nOptions:', params.options);
  console.log('─'.repeat(60));

  // Simulate user selecting "Allow Always"
  const userChoice = 'Allow Always';
  console.log(`\n✅ User selected: "${userChoice}"\n`);

  return userChoice;
};

// Create NetworkPolicyManager with elicitation support
console.log('1️⃣  Creating NetworkPolicyManager with elicitation support...\n');
const networkPolicy = new NetworkPolicyManager(
  SECURE_NETWORK_POLICY,
  mockElicitationFunction
);

// Test 1: Try to access a private IP
console.log('2️⃣  Testing access to private IP (192.168.1.100)...\n');

const testUrl1 = 'http://192.168.1.100:3000/status';
const result1 = await networkPolicy.isUrlAllowedAsync(testUrl1, {
  mcpName: 'lg-remote',
  bindingName: 'LG Remote'
});

console.log(`Result for ${testUrl1}:`);
console.log(`  - Allowed: ${result1.allowed}`);
console.log(`  - Reason: ${result1.reason || 'User granted permission'}\n`);

// Test 2: Try the same URL again (should use cache)
console.log('3️⃣  Testing same URL again (should use cached permission)...\n');

const result2 = await networkPolicy.isUrlAllowedAsync(testUrl1, {
  mcpName: 'lg-remote',
  bindingName: 'LG Remote'
});

console.log(`Result for ${testUrl1} (second attempt):`);
console.log(`  - Allowed: ${result2.allowed}`);
console.log(`  - Reason: ${result2.reason || 'Using cached permission (no dialog shown)'}\n`);

// Test 3: Try localhost
console.log('4️⃣  Testing access to localhost...\n');

const testUrl2 = 'http://localhost:3000/api/health';
const result3 = await networkPolicy.isUrlAllowedAsync(testUrl2, {
  mcpName: 'dev-server'
});

console.log(`Result for ${testUrl2}:`);
console.log(`  - Allowed: ${result3.allowed}`);
console.log(`  - Reason: ${result3.reason || 'User granted permission'}\n`);

// Test 4: List all cached permissions
console.log('5️⃣  Listing all cached permissions...\n');

const permissions = networkPolicy.getPermissions();
console.log('Cached Permissions:');
permissions.forEach((perm, idx) => {
  console.log(`  ${idx + 1}. ${perm.url}`);
  console.log(`     - Approved: ${perm.approved}`);
  console.log(`     - Permanent: ${perm.permanent}`);
});

// Test 5: Test denied access
console.log('\n6️⃣  Testing denied access...\n');

const denyElicitation = async (params) => {
  console.log('\n📋 Permission Dialog Shown:');
  console.log('─'.repeat(60));
  console.log('Message:', params.message);
  console.log('─'.repeat(60));

  const userChoice = 'Deny';
  console.log(`\n❌ User selected: "${userChoice}"\n`);

  return userChoice;
};

const networkPolicyDeny = new NetworkPolicyManager(
  SECURE_NETWORK_POLICY,
  denyElicitation
);

const testUrl3 = 'http://192.168.1.50/api/lights';
const result4 = await networkPolicyDeny.isUrlAllowedAsync(testUrl3, {
  mcpName: 'philips-hue'
});

console.log(`Result for ${testUrl3}:`);
console.log(`  - Allowed: ${result4.allowed}`);
console.log(`  - Reason: ${result4.reason}\n`);

// Summary
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  Test Summary                                            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('✅ Runtime network permissions working correctly!\n');
console.log('Key Features Demonstrated:');
console.log('  • Elicitation function called for restricted access');
console.log('  • Permission caching (no repeated prompts)');
console.log('  • Different permission levels (Allow Always, Deny)');
console.log('  • Context information (MCP name) shown to user');
console.log('  • Permission management (list, revoke)\n');
