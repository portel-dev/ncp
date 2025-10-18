#!/usr/bin/env node

/**
 * HTTP Authentication Test Suite
 * Tests HTTP credential detection and collection features
 */

import { detectHTTPCredentials } from '../dist/utils/elicitation-helper.js';
import assert from 'assert';

console.log('========================================');
console.log('HTTP Authentication Test Suite');
console.log('========================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
  }
}

// Test 1: Detect GitHub credentials
test('Should detect GitHub credentials from MCP name', () => {
  const creds = detectHTTPCredentials('github', undefined);

  assert(creds.length > 0, 'Should detect GitHub credentials');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
  assert(creds[0].displayName.includes('GitHub'), 'Display name should mention GitHub');
  assert(creds[0].example, 'Should have example token format');
  assert(creds[0].example.includes('ghp_'), 'Example should show GitHub token format');
});

// Test 2: Detect GitHub credentials from URL
test('Should detect GitHub credentials from URL pattern', () => {
  const creds = detectHTTPCredentials('custom-mcp', 'https://api.github.com/mcp');

  assert(creds.length > 0, 'Should detect GitHub credentials from URL');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
});

// Test 3: Detect GitLab credentials
test('Should detect GitLab credentials from MCP name', () => {
  const creds = detectHTTPCredentials('gitlab', undefined);

  assert(creds.length > 0, 'Should detect GitLab credentials');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
  assert(creds[0].displayName.includes('GitLab'), 'Display name should mention GitLab');
  assert(creds[0].example.includes('glpat-'), 'Example should show GitLab token format');
});

// Test 4: Detect Stripe credentials
test('Should detect Stripe credentials from MCP name', () => {
  const creds = detectHTTPCredentials('stripe', undefined);

  assert(creds.length > 0, 'Should detect Stripe credentials');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
  assert(creds[0].displayName.includes('Stripe'), 'Display name should mention Stripe');
  assert(creds[0].example.includes('sk_test_'), 'Example should show Stripe key format');
});

// Test 5: Detect OpenAI credentials
test('Should detect OpenAI credentials from MCP name', () => {
  const creds = detectHTTPCredentials('openai', undefined);

  assert(creds.length > 0, 'Should detect OpenAI credentials');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
  assert(creds[0].displayName.includes('OpenAI'), 'Display name should mention OpenAI');
  assert(creds[0].example.includes('sk-'), 'Example should show OpenAI key format');
});

// Test 6: Detect Anthropic credentials
test('Should detect Anthropic credentials from MCP name', () => {
  const creds = detectHTTPCredentials('anthropic', undefined);

  assert(creds.length > 0, 'Should detect Anthropic credentials');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
  assert(creds[0].displayName.includes('Anthropic'), 'Display name should mention Anthropic');
  assert(creds[0].example.includes('sk-ant-'), 'Example should show Anthropic key format');
});

// Test 7: Detect Slack credentials
test('Should detect Slack credentials from MCP name', () => {
  const creds = detectHTTPCredentials('slack', undefined);

  assert(creds.length > 0, 'Should detect Slack credentials');
  assert.strictEqual(creds[0].credentialType, 'bearer', 'Should be bearer token');
  assert(creds[0].displayName.includes('Slack'), 'Display name should mention Slack');
  assert(creds[0].example.includes('xoxb-'), 'Example should show Slack bot token format');
});

// Test 8: No credentials for unknown service
test('Should return empty array for unknown services', () => {
  const creds = detectHTTPCredentials('unknown-service', 'https://example.com');

  assert.strictEqual(creds.length, 0, 'Should return empty array for unknown service');
});

// Test 9: URL pattern matching works
test('Should detect credentials from URL pattern even with different MCP name', () => {
  // GitLab URL but MCP name is different
  const creds = detectHTTPCredentials('my-custom-server', 'https://gitlab.com/api/v4/mcp');

  assert(creds.length > 0, 'Should detect GitLab from URL');
  assert(creds[0].displayName.includes('GitLab'), 'Should identify as GitLab');
});

// Test 10: Case insensitive matching
test('Should detect credentials with case-insensitive matching', () => {
  const creds1 = detectHTTPCredentials('GitHub', undefined);
  const creds2 = detectHTTPCredentials('GITHUB', undefined);
  const creds3 = detectHTTPCredentials('github', undefined);

  assert(creds1.length > 0, 'Should detect with capital G');
  assert(creds2.length > 0, 'Should detect with all caps');
  assert(creds3.length > 0, 'Should detect with lowercase');
});

// Test 11: Multiple patterns can match same service
test('Should match both MCP name and URL patterns', () => {
  // Both name and URL point to GitHub
  const credsByName = detectHTTPCredentials('github', undefined);
  const credsByURL = detectHTTPCredentials('custom', 'https://api.github.com/v1/mcp');

  assert(credsByName.length > 0, 'Should detect by name');
  assert(credsByURL.length > 0, 'Should detect by URL');
  assert.strictEqual(credsByName[0].credentialType, credsByURL[0].credentialType);
});

// Test 12: Credential structure validation
test('All detected credentials should have required fields', () => {
  const services = ['github', 'gitlab', 'stripe', 'openai', 'anthropic', 'slack'];

  services.forEach(service => {
    const creds = detectHTTPCredentials(service, undefined);
    assert(creds.length > 0, `Should detect ${service} credentials`);

    const cred = creds[0];
    assert(cred.credentialType, `${service}: credentialType missing`);
    assert(cred.displayName, `${service}: displayName missing`);
    assert(['bearer', 'apiKey', 'oauth', 'basic'].includes(cred.credentialType),
           `${service}: credentialType should be valid type`);
  });
});

// Summary
console.log('\n========================================');
console.log('Test Summary');
console.log('========================================');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}

console.log('✅ All HTTP Authentication Tests Passed!\n');
