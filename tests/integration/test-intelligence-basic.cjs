/**
 * Basic Integration Test for Intelligence MicroMCP
 *
 * Tests that Intelligence MCP loads and basic operations work
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runNcpCommand(command, params = {}) {
  return new Promise((resolve, reject) => {
    const ncpPath = path.join(__dirname, '../../dist/index.js');
    let args;

    // Handle CLI commands (find, list) vs tool execution (run)
    if (command === 'find') {
      args = ['find', params.description || ''];
    } else if (command === 'list') {
      args = ['list'];
    } else {
      // Tool execution
      args = ['run', command];
      if (Object.keys(params).length > 0) {
        args.push('--params', JSON.stringify(params));
      }
    }

    const proc = spawn('node', [ncpPath, ...args], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout, error: stderr });
      } else {
        reject({ success: false, output: stdout, error: stderr, code });
      }
    });

    proc.on('error', (err) => {
      reject({ success: false, error: err.message });
    });
  });
}

async function checkStorageFiles() {
  const intelligenceDir = path.join(os.homedir(), '.ncp', 'intelligence');
  const intentsPath = path.join(intelligenceDir, 'intents.json');
  const historyPath = path.join(intelligenceDir, 'history.json');

  try {
    await fs.access(intentsPath);
    await fs.access(historyPath);
    return true;
  } catch {
    return false;
  }
}

async function readIntents() {
  const intentsPath = path.join(os.homedir(), '.ncp', 'intelligence', 'intents.json');
  try {
    const data = await fs.readFile(intentsPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function cleanup() {
  const intelligenceDir = path.join(os.homedir(), '.ncp', 'intelligence');
  try {
    await fs.rm(intelligenceDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

async function runTests() {
  log('\n🧪 Intelligence MicroMCP Integration Test\n', 'blue');

  let passedTests = 0;
  let failedTests = 0;
  let intentId = null;

  // Test 1: Check if Intelligence MCP tools are available
  log('Test 1: Discovery - Intelligence MCP tools available', 'yellow');
  try {
    const result = await runNcpCommand('find', { description: 'intelligence intent' });

    if (result.output.includes('intelligence:createIntent') &&
        result.output.includes('intelligence:execute')) {
      log('✅ PASS: Intelligence MCP tools found in discovery\n', 'green');
      passedTests++;
    } else {
      log('❌ FAIL: Intelligence MCP tools not found in discovery\n', 'red');
      failedTests++;
    }
  } catch (error) {
    log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
    failedTests++;
  }

  // Test 2: Create an intent
  log('Test 2: Create Intent', 'yellow');
  try {
    const result = await runNcpCommand('intelligence:createIntent', {
      name: 'Test Intent',
      goal: 'This is a test intent for integration testing',
      allow_adaptation: true
    });

    if (result.output.includes('Created intent') && result.output.includes('Test Intent')) {
      log('✅ PASS: Intent created successfully', 'green');

      // Extract intent ID from output
      const idMatch = result.output.match(/ID: ([a-z0-9\-]+)/);
      if (idMatch) {
        intentId = idMatch[1];
        log(`   Intent ID: ${intentId}\n`, 'blue');
      }
      passedTests++;
    } else {
      log('❌ FAIL: Intent creation failed\n', 'red');
      failedTests++;
    }
  } catch (error) {
    log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
    failedTests++;
  }

  // Test 3: List intents
  log('Test 3: List Intents', 'yellow');
  try {
    const result = await runNcpCommand('intelligence:list');

    if (result.output.includes('Test Intent')) {
      log('✅ PASS: Intent listed successfully\n', 'green');
      passedTests++;
    } else {
      log('❌ FAIL: Intent not found in list\n', 'red');
      failedTests++;
    }
  } catch (error) {
    log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
    failedTests++;
  }

  // Test 4: Get execution plan
  if (intentId) {
    log('Test 4: Get Execution Plan', 'yellow');
    try {
      const result = await runNcpCommand('intelligence:getPlan', { intent_id: intentId });

      if (result.output.includes('Execution Plan') && result.output.includes('Test Intent')) {
        log('✅ PASS: Execution plan retrieved\n', 'green');
        passedTests++;
      } else {
        log('❌ FAIL: Execution plan not retrieved\n', 'red');
        failedTests++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
      failedTests++;
    }
  } else {
    log('⏭️  SKIP: Test 4 (no intent ID)\n', 'yellow');
  }

  // Test 5: Execute intent (dry run)
  if (intentId) {
    log('Test 5: Execute Intent (Dry Run)', 'yellow');
    try {
      const result = await runNcpCommand('intelligence:execute', {
        intent_id: intentId,
        dry_run: true
      });

      if (result.output.includes('DRY RUN') && result.output.includes('Preview')) {
        log('✅ PASS: Dry run executed successfully\n', 'green');
        passedTests++;
      } else {
        log('❌ FAIL: Dry run failed\n', 'red');
        failedTests++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
      failedTests++;
    }
  } else {
    log('⏭️  SKIP: Test 5 (no intent ID)\n', 'yellow');
  }

  // Test 6: Teach intent
  if (intentId) {
    log('Test 6: Teach Intent', 'yellow');
    try {
      const result = await runNcpCommand('intelligence:teach', {
        intent_id: intentId,
        feedback: 'Make the output more concise'
      });

      if (result.output.includes('Learned from feedback')) {
        log('✅ PASS: Feedback recorded\n', 'green');
        passedTests++;
      } else {
        log('❌ FAIL: Feedback not recorded\n', 'red');
        failedTests++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
      failedTests++;
    }
  } else {
    log('⏭️  SKIP: Test 6 (no intent ID)\n', 'yellow');
  }

  // Test 7: Get history
  if (intentId) {
    log('Test 7: Get History', 'yellow');
    try {
      const result = await runNcpCommand('intelligence:history', {
        intent_id: intentId,
        limit: 10
      });

      if (result.output.includes('Execution History')) {
        log('✅ PASS: History retrieved\n', 'green');
        passedTests++;
      } else {
        log('❌ FAIL: History not retrieved\n', 'red');
        failedTests++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
      failedTests++;
    }
  } else {
    log('⏭️  SKIP: Test 7 (no intent ID)\n', 'yellow');
  }

  // Test 8: Suggest intents
  log('Test 8: Suggest Intents', 'yellow');
  try {
    const result = await runNcpCommand('intelligence:suggest', {
      context: 'user_mcps',
      limit: 3
    });

    if (result.output.includes('Suggested Intents')) {
      log('✅ PASS: Suggestions generated\n', 'green');
      passedTests++;
    } else {
      log('❌ FAIL: Suggestions not generated\n', 'red');
      failedTests++;
    }
  } catch (error) {
    log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
    failedTests++;
  }

  // Test 9: Check storage files
  log('Test 9: Storage Files', 'yellow');
  const storageExists = await checkStorageFiles();
  if (storageExists) {
    log('✅ PASS: Storage files created\n', 'green');
    passedTests++;

    const intents = await readIntents();
    log(`   Found ${Object.keys(intents).length} intent(s) in storage`, 'blue');
  } else {
    log('❌ FAIL: Storage files not found\n', 'red');
    failedTests++;
  }

  // Test 10: Delete intent (cleanup)
  if (intentId) {
    log('Test 10: Delete Intent', 'yellow');
    try {
      const result = await runNcpCommand('intelligence:deleteIntent', { intent_id: intentId });

      if (result.output.includes('Deleted intent')) {
        log('✅ PASS: Intent deleted successfully\n', 'green');
        passedTests++;
      } else {
        log('❌ FAIL: Intent deletion failed\n', 'red');
        failedTests++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.error || error.message}\n`, 'red');
      failedTests++;
    }
  } else {
    log('⏭️  SKIP: Test 10 (no intent ID)\n', 'yellow');
  }

  // Summary
  log('\n📊 Test Summary', 'blue');
  log(`✅ Passed: ${passedTests}`, 'green');
  log(`❌ Failed: ${failedTests}`, 'red');
  log(`📈 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%\n`);

  // Cleanup
  log('🧹 Cleaning up test data...', 'yellow');
  await cleanup();
  log('✅ Cleanup complete\n', 'green');

  // Exit code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n💥 Fatal error: ${error.message}\n`, 'red');
  process.exit(1);
});
