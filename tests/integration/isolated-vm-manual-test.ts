/**
 * Manual Integration Test for IsolatedVMSandbox
 *
 * This test runs outside of Jest to properly test the isolated-vm native module.
 * Run with: npx tsx tests/integration/isolated-vm-manual-test.ts
 *
 * Requirements:
 * - isolated-vm package must be installed
 * - Must be run with Node.js (not Jest)
 */

import { IsolatedVMSandbox, createIsolatedVMSandbox } from '../../src/code-mode/sandbox/isolated-vm-sandbox.js';

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string) {
  console.log(msg);
}

function pass(testName: string) {
  log(`${GREEN}✓${RESET} ${testName}`);
}

function fail(testName: string, error: string) {
  log(`${RED}✗${RESET} ${testName}`);
  log(`  ${RED}Error: ${error}${RESET}`);
}

function skip(testName: string, reason: string) {
  log(`${YELLOW}○${RESET} ${testName} (skipped: ${reason})`);
}

async function runTests() {
  log(`\n${BOLD}IsolatedVMSandbox Manual Integration Tests${RESET}\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Test 1: Check availability
  const isAvailable = IsolatedVMSandbox.isAvailable();
  if (isAvailable) {
    pass('isolated-vm is available');
    passed++;
  } else {
    skip('isolated-vm is available', 'native module not installed or not working');
    skipped++;
    log(`\n${YELLOW}Skipping execution tests - isolated-vm not available${RESET}`);
    log(`Install with: npm install isolated-vm`);
    printSummary(passed, failed, skipped);
    return;
  }

  // Test 2: Simple code execution
  try {
    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox.execute(
      'return 1 + 1;',
      [],
      async () => null
    );

    if (result.error) {
      fail('Simple code execution', result.error);
      failed++;
    } else if (result.result === 2) {
      pass('Simple code execution');
      passed++;
    } else {
      fail('Simple code execution', `Expected 2, got ${result.result}`);
      failed++;
    }
  } catch (e: any) {
    fail('Simple code execution', e.message);
    failed++;
  }

  // Test 3: Console.log capture
  try {
    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox.execute(
      `
      console.log("Hello");
      console.log("World");
      return "done";
      `,
      [],
      async () => null
    );

    if (result.error) {
      fail('Console.log capture', result.error);
      failed++;
    } else if (result.logs.includes('Hello') && result.logs.includes('World')) {
      pass('Console.log capture');
      passed++;
    } else {
      fail('Console.log capture', `Expected logs ["Hello", "World"], got ${JSON.stringify(result.logs)}`);
      failed++;
    }
  } catch (e: any) {
    fail('Console.log capture', e.message);
    failed++;
  }

  // Test 4: Async code execution
  try {
    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox.execute(
      `
      const promise = new Promise(resolve => {
        setTimeout(() => resolve(42), 10);
      });
      return await promise;
      `,
      [],
      async () => null
    );

    if (result.error) {
      fail('Async code execution', result.error);
      failed++;
    } else if (result.result === 42) {
      pass('Async code execution');
      passed++;
    } else {
      fail('Async code execution', `Expected 42, got ${result.result}`);
      failed++;
    }
  } catch (e: any) {
    fail('Async code execution', e.message);
    failed++;
  }

  // Test 5: Tool callback
  try {
    const mockToolExecutor = async (toolName: string, params: unknown) => {
      return { echoed: params, tool: toolName };
    };

    const tools = [{ name: 'test:echo', description: 'Echo tool' }];
    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });

    const result = await sandbox.execute(
      `
      const response = await test.echo({ message: "hello" });
      return response;
      `,
      tools,
      mockToolExecutor
    );

    if (result.error) {
      fail('Tool callback', result.error);
      failed++;
    } else {
      const r = result.result as { echoed: { message: string }; tool: string };
      if (r.echoed?.message === 'hello' && r.tool === 'test:echo') {
        pass('Tool callback');
        passed++;
      } else {
        fail('Tool callback', `Unexpected result: ${JSON.stringify(result.result)}`);
        failed++;
      }
    }
  } catch (e: any) {
    fail('Tool callback', e.message);
    failed++;
  }

  // Test 6: Timeout enforcement
  try {
    const sandbox = createIsolatedVMSandbox({ timeout: 100, memoryLimit: 64 });
    const result = await sandbox.execute(
      `
      // Infinite loop
      while (true) {}
      `,
      [],
      async () => null
    );

    if (result.error && result.error.toLowerCase().includes('timeout')) {
      pass('Timeout enforcement');
      passed++;
    } else if (result.error) {
      pass('Timeout enforcement (terminated with different error)');
      passed++;
    } else {
      fail('Timeout enforcement', 'Code should have timed out');
      failed++;
    }
  } catch (e: any) {
    // Timeout might throw
    if (e.message.toLowerCase().includes('timeout')) {
      pass('Timeout enforcement');
      passed++;
    } else {
      fail('Timeout enforcement', e.message);
      failed++;
    }
  }

  // Test 7: No require access
  try {
    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox.execute(
      `
      const fs = require('fs');
      return "should not reach";
      `,
      [],
      async () => null
    );

    if (result.error) {
      pass('No require access (blocked)');
      passed++;
    } else {
      fail('No require access', 'require should not be accessible');
      failed++;
    }
  } catch (e: any) {
    pass('No require access (blocked)');
    passed++;
  }

  // Test 8: No process access
  try {
    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox.execute(
      `
      return typeof process === 'undefined' ? "isolated" : process.env.PATH;
      `,
      [],
      async () => null
    );

    if (result.error) {
      pass('No process access (error thrown)');
      passed++;
    } else if (result.result === 'isolated') {
      pass('No process access (undefined)');
      passed++;
    } else {
      fail('No process access', `process.env.PATH should not be accessible, got: ${result.result}`);
      failed++;
    }
  } catch (e: any) {
    pass('No process access (blocked)');
    passed++;
  }

  // Test 9: Multiple tool namespaces
  try {
    const mockToolExecutor = async (name: string, _params: unknown) => {
      if (name === 'github:list_repos') return ['repo1', 'repo2'];
      if (name === 'slack:send_message') return { ok: true };
      return null;
    };

    const tools = [
      { name: 'github:list_repos', description: 'List repos' },
      { name: 'slack:send_message', description: 'Send message' },
    ];

    const sandbox = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox.execute(
      `
      const repos = await github.list_repos({});
      const sent = await slack.send_message({ text: "Found " + repos.length + " repos" });
      return { repos, sent };
      `,
      tools,
      mockToolExecutor
    );

    if (result.error) {
      fail('Multiple tool namespaces', result.error);
      failed++;
    } else {
      const r = result.result as { repos: string[]; sent: { ok: boolean } };
      if (r.repos?.length === 2 && r.sent?.ok === true) {
        pass('Multiple tool namespaces');
        passed++;
      } else {
        fail('Multiple tool namespaces', `Unexpected result: ${JSON.stringify(result.result)}`);
        failed++;
      }
    }
  } catch (e: any) {
    fail('Multiple tool namespaces', e.message);
    failed++;
  }

  // Test 10: Isolation between executions
  try {
    const sandbox1 = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    await sandbox1.execute(
      `global.secret = "sensitive data"; return true;`,
      [],
      async () => null
    );

    const sandbox2 = createIsolatedVMSandbox({ timeout: 5000, memoryLimit: 64 });
    const result = await sandbox2.execute(
      `return typeof global.secret === 'undefined' ? "isolated" : global.secret;`,
      [],
      async () => null
    );

    if (result.error) {
      fail('Isolation between executions', result.error);
      failed++;
    } else if (result.result === 'isolated') {
      pass('Isolation between executions');
      passed++;
    } else {
      fail('Isolation between executions', `Global leaked between sandboxes: ${result.result}`);
      failed++;
    }
  } catch (e: any) {
    fail('Isolation between executions', e.message);
    failed++;
  }

  printSummary(passed, failed, skipped);
}

function printSummary(passed: number, failed: number, skipped: number) {
  log(`\n${BOLD}Summary${RESET}`);
  log(`  ${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) {
    log(`  ${RED}Failed: ${failed}${RESET}`);
  }
  if (skipped > 0) {
    log(`  ${YELLOW}Skipped: ${skipped}${RESET}`);
  }
  log('');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test runner failed:', e);
  process.exit(1);
});
