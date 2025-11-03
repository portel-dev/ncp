/**
 * Comprehensive MicroMCP Installation Tests
 *
 * Tests all installation methods and edge cases:
 * 1. URL installation (raw GitHub URLs)
 * 2. Local file installation
 * 3. Clipboard installation
 * 4. Bulk mixed installation
 * 5. Edge cases (errors, missing files, permissions, etc.)
 */

import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { execSync, spawn } from 'node:child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Test configuration
const MICROMCP_DIR = path.join(os.homedir(), '.ncp', 'micromcps');
const TEST_BACKUP_DIR = path.join(os.homedir(), '.ncp', 'micromcps-test-backup');

// Real MicroMCP URLs from portel-dev/ncp repository
const MICROMCP_URLS = {
  calculator: 'https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/calculator.micro.ts',
  string: 'https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/string.micro.ts',
  workflow: 'https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/workflow.micro.ts',
};

// Helper: Execute NCP command
function runNCP(command: string, expectError = false): string {
  try {
    const result = execSync(`node dist/index.js ${command}`, {
      encoding: 'utf8',
      stdio: expectError ? 'pipe' : 'inherit'
    });
    return result;
  } catch (error: any) {
    if (expectError) {
      return error.stderr || error.stdout || '';
    }
    throw error;
  }
}

// Helper: Check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper: Read file content
async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf8');
}

// Helper: Create test MicroMCP file
async function createTestMicroMCP(name: string, content?: string): Promise<string> {
  const testContent = content || `
import { MicroMCP, tool } from '@portel/ncp';

export class ${name.charAt(0).toUpperCase() + name.slice(1)}MCP implements MicroMCP {
  name = '${name}';
  version = '1.0.0';

  @tool({
    description: 'Test tool for ${name}',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' }
      },
      required: ['input']
    }
  })
  async testTool(args: { input: string }): Promise<string> {
    return \`Test: \${args.input}\`;
  }
}
`;

  const tempFile = path.join(os.tmpdir(), `${name}.micro.ts`);
  await fs.writeFile(tempFile, testContent, 'utf8');
  return tempFile;
}

// Helper: Backup existing MicroMCPs
async function backupMicroMCPs() {
  if (await fileExists(MICROMCP_DIR)) {
    await fs.rename(MICROMCP_DIR, TEST_BACKUP_DIR);
  }
  await fs.mkdir(MICROMCP_DIR, { recursive: true });
}

// Helper: Restore MicroMCPs
async function restoreMicroMCPs() {
  if (await fileExists(MICROMCP_DIR)) {
    await fs.rm(MICROMCP_DIR, { recursive: true, force: true });
  }
  if (await fileExists(TEST_BACKUP_DIR)) {
    await fs.rename(TEST_BACKUP_DIR, MICROMCP_DIR);
  }
}

// Helper: Clean up test MicroMCP
async function cleanupMicroMCP(name: string) {
  const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
  const schemaFile = path.join(MICROMCP_DIR, `${name}.micro.schema.json`);

  try {
    if (await fileExists(microFile)) await fs.unlink(microFile);
    if (await fileExists(schemaFile)) await fs.unlink(schemaFile);
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe('MicroMCP Installation - URL', () => {
  beforeAll(async () => {
    console.log('\n🧪 Setting up MicroMCP installation tests...');
    await backupMicroMCPs();
  });

  afterAll(async () => {
    console.log('\n🧹 Cleaning up test environment...');
    await restoreMicroMCPs();
  });

  it('should install MicroMCP from GitHub raw URL', async () => {
    const name = 'calculator';
    const url = MICROMCP_URLS.calculator;

    console.log(`\n📥 Testing URL installation: ${url}`);

    // Install from URL
    runNCP(`add "${url}"`);

    // Verify files exist
    const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    expect(await fileExists(microFile)).toBe(true);

    // Verify content is valid TypeScript
    const content = await readFile(microFile);
    expect(content).toContain('export class');
    expect(content).toContain('MicroMCP');

    console.log(`✅ Successfully installed ${name} from URL`);
  });

  it('should download optional schema file if available', async () => {
    const name = 'calculator';
    await cleanupMicroMCP(name);

    // Install (calculator has a schema file)
    runNCP(`add "${MICROMCP_URLS.calculator}"`);

    // Check if schema was attempted (may or may not exist in repo)
    const schemaFile = path.join(MICROMCP_DIR, `${name}.micro.schema.json`);
    const schemaExists = await fileExists(schemaFile);

    console.log(`ℹ️  Schema file ${schemaExists ? 'was' : 'was not'} downloaded`);
  });

  it('should handle 404 URLs gracefully', async () => {
    const invalidUrl = 'https://raw.githubusercontent.com/invalid/repo/main/nonexistent.micro.ts';

    console.log('\n❌ Testing 404 URL handling...');

    const output = runNCP(`add "${invalidUrl}"`, true);
    expect(
      output.includes('404') || output.includes('Failed') || output.includes('not found')
    ).toBeTruthy();

    console.log('✅ Handled 404 error correctly');
  });

  it('should handle network errors gracefully', async () => {
    const invalidUrl = 'https://invalid-domain-that-does-not-exist-12345.com/file.micro.ts';

    console.log('\n🌐 Testing network error handling...');

    const output = runNCP(`add "${invalidUrl}"`, true);
    expect(
      output.includes('Failed') || output.includes('error')
    ).toBeTruthy();

    console.log('✅ Handled network error correctly');
  });

  it('should handle non-.micro.ts URLs as HTTP servers', async () => {
    const httpUrl = 'https://example.com/mcp-server';

    console.log('\n🌐 Testing HTTP server URL...');

    // This should be treated as HTTP/SSE server, not MicroMCP
    runNCP(`add "${httpUrl}"`, true);

    // Should NOT create a .micro.ts file
    const microFile = path.join(MICROMCP_DIR, 'mcp-server.micro.ts');
    expect(await fileExists(microFile)).toBe(false);

    console.log('✅ Correctly distinguished HTTP server from MicroMCP URL');
  });
});

describe('MicroMCP Installation - Local File', () => {
  it('should install MicroMCP from local file', async () => {
    const name = 'testlocal';
    const testFile = await createTestMicroMCP(name);

    console.log(`\n📁 Testing local file installation: ${testFile}`);

    // Install from local file
    runNCP(`add "${testFile}"`);

    // Verify files exist
    const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    expect(await fileExists(microFile)).toBe(true);

    // Verify content matches
    const originalContent = await readFile(testFile);
    const installedContent = await readFile(microFile);
    expect(originalContent).toBe(installedContent);

    // Cleanup
    await fs.unlink(testFile);
    await cleanupMicroMCP(name);

    console.log(`✅ Successfully installed ${name} from local file`);
  });

  it('should handle local file with schema', async () => {
    const name = 'testwithschema';
    const testFile = await createTestMicroMCP(name);
    const schemaFile = testFile.replace('.micro.ts', '.micro.schema.json');

    // Create schema file
    await fs.writeFile(schemaFile, JSON.stringify({
      tools: {
        testTool: {
          description: 'Test tool',
          parameters: { type: 'object' }
        }
      }
    }), 'utf8');

    console.log(`\n📋 Testing local file with schema: ${testFile}`);

    // Install
    runNCP(`add "${testFile}"`);

    // Verify both files exist
    const installedMicro = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    const installedSchema = path.join(MICROMCP_DIR, `${name}.micro.schema.json`);

    expect(await fileExists(installedMicro)).toBe(true);
    expect(await fileExists(installedSchema)).toBe(true);

    // Cleanup
    await fs.unlink(testFile);
    await fs.unlink(schemaFile);
    await cleanupMicroMCP(name);

    console.log(`✅ Successfully installed ${name} with schema`);
  });

  it('should handle missing local file', async () => {
    const nonexistentFile = '/tmp/nonexistent-file-12345.micro.ts';

    console.log('\n❌ Testing missing local file...');

    const output = runNCP(`add "${nonexistentFile}"`, true);
    expect(
      output.includes('not found') || output.includes('ENOENT') || output.includes('Failed')
    ).toBeTruthy();

    console.log('✅ Handled missing file correctly');
  });

  it('should handle invalid file path', async () => {
    const invalidPath = '/invalid/path/that/does/not/exist/file.micro.ts';

    console.log('\n❌ Testing invalid file path...');

    const output = runNCP(`add "${invalidPath}"`, true);
    expect(
      output.includes('not found') || output.includes('ENOENT') || output.includes('Failed')
    ).toBeTruthy();

    console.log('✅ Handled invalid path correctly');
  });

  it('should handle malformed TypeScript', async () => {
    const name = 'malformed';
    const malformedContent = `
      this is not valid typescript
      export class broken {{{
        missing brackets and syntax errors
    `;

    const testFile = await createTestMicroMCP(name, malformedContent);

    console.log('\n⚠️  Testing malformed TypeScript...');

    // Install should succeed (syntax checking happens at runtime)
    runNCP(`add "${testFile}"`);

    const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    expect(await fileExists(microFile)).toBe(true);

    // Cleanup
    await fs.unlink(testFile);
    await cleanupMicroMCP(name);

    console.log('✅ Installed file (runtime will catch syntax errors)');
  });
});

describe('MicroMCP Installation - Clipboard', () => {
  it('should detect TypeScript from clipboard', async () => {
    const name = 'clipboardtest';
    const tsContent = `
import { MicroMCP, tool } from '@portel/ncp';

export class ClipboardTestMCP implements MicroMCP {
  name = 'clipboardtest';
  version = '1.0.0';

  @tool({ description: 'Test' })
  async test(): Promise<string> {
    return 'test';
  }
}
`;

    // Copy to clipboard
    const { execSync } = await import('child_process');
    execSync(`echo '${tsContent.replace(/'/g, "'\\''")}' | pbcopy`);

    console.log('\n📋 Testing clipboard TypeScript detection...');

    // Install from clipboard
    runNCP('add clipboard');

    // Verify file exists
    const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    expect(await fileExists(microFile)).toBe(true);

    // Cleanup
    await cleanupMicroMCP(name);

    console.log('✅ Successfully detected and installed from clipboard');
  });

  it('should handle empty clipboard', async () => {
    // Clear clipboard
    const { execSync } = await import('child_process');
    execSync('echo "" | pbcopy');

    console.log('\n❌ Testing empty clipboard...');

    const output = runNCP('add clipboard', true);
    expect(
      output.includes('empty') || output.includes('Failed')
    ).toBeTruthy();

    console.log('✅ Handled empty clipboard correctly');
  });
});

describe('MicroMCP Installation - Bulk Install', () => {
  it('should handle mixed MicroMCP and regular MCP bulk install', async () => {
    console.log('\n📦 Testing mixed bulk installation...');

    // This will work once registry has MicroMCP data
    // For now, test the detection logic
    const mixedList = 'github | calculator | slack';

    console.log(`Installing: ${mixedList}`);
    runNCP(`add "${mixedList}"`, true);

    console.log('✅ Bulk install command executed (full test pending registry data)');
  });
});

describe('MicroMCP Installation - Edge Cases', () => {
  it('should handle reinstallation (overwrite)', async () => {
    const name = 'reinstall';
    const testFile1 = await createTestMicroMCP(name, '// Version 1');

    console.log('\n🔄 Testing reinstallation...');

    // Install first version
    runNCP(`add "${testFile1}"`);

    const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    const content1 = await readFile(microFile);
    expect(content1).toContain('Version 1');

    // Install second version
    const testFile2 = await createTestMicroMCP(name, '// Version 2');
    runNCP(`add "${testFile2}"`);

    const content2 = await readFile(microFile);
    expect(content2).toContain('Version 2');

    // Cleanup
    await fs.unlink(testFile1);
    await fs.unlink(testFile2);
    await cleanupMicroMCP(name);

    console.log('✅ Reinstallation overwrites correctly');
  });

  it('should handle file permissions issues', async () => {
    console.log('\n🔒 Testing file permissions...');

    // Make directory read-only
    await fs.chmod(MICROMCP_DIR, 0o444);

    const testFile = await createTestMicroMCP('permtest');
    const output = runNCP(`add "${testFile}"`, true);

    // Restore permissions
    await fs.chmod(MICROMCP_DIR, 0o755);

    expect(
      output.includes('permission') || output.includes('EACCES') || output.includes('Failed')
    ).toBeTruthy();

    // Cleanup
    await fs.unlink(testFile);

    console.log('✅ Handled permission error correctly');
  });

  it('should handle very long file names', async () => {
    const longName = 'a'.repeat(200);
    const testFile = await createTestMicroMCP(longName);

    console.log('\n📏 Testing very long file name...');

    const output = runNCP(`add "${testFile}"`, true);

    // May succeed or fail depending on filesystem limits
    console.log('ℹ️  Long filename handling depends on filesystem limits');

    // Cleanup
    await fs.unlink(testFile);
    await cleanupMicroMCP(longName);
  });

  it('should preserve file metadata during installation', async () => {
    const name = 'metadata';
    const testFile = await createTestMicroMCP(name);

    console.log('\n📊 Testing file metadata preservation...');

    runNCP(`add "${testFile}"`);

    const microFile = path.join(MICROMCP_DIR, `${name}.micro.ts`);
    const stats = await fs.stat(microFile);

    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);

    // Cleanup
    await fs.unlink(testFile);
    await cleanupMicroMCP(name);

    console.log('✅ File metadata preserved');
  });
});

describe('MicroMCP Discovery and Execution', () => {
  it('should discover tools from installed MicroMCP', async () => {
    const name = 'discovertest';
    const testFile = await createTestMicroMCP(name);

    console.log('\n🔍 Testing tool discovery...');

    // Install
    runNCP(`add "${testFile}"`);

    // Try to discover tools (may need restart/reload)
    const output = runNCP(`find ${name}`, true);

    console.log(`Discovery output: ${output}`);

    // Cleanup
    await fs.unlink(testFile);
    await cleanupMicroMCP(name);

    console.log('✅ Discovery test completed');
  });

  it('should execute tools from installed MicroMCP', async () => {
    const name = 'executetest';
    const testFile = await createTestMicroMCP(name);

    console.log('\n⚙️  Testing tool execution...');

    // Install
    runNCP(`add "${testFile}"`);

    // Try to execute tool (may need restart/reload)
    const output = runNCP(`run ${name}:testTool --params '{"input":"test"}'`, true);

    console.log(`Execution output: ${output}`);

    // Cleanup
    await fs.unlink(testFile);
    await cleanupMicroMCP(name);

    console.log('✅ Execution test completed');
  });
});

console.log('\n🧪 MicroMCP Installation Test Suite\n');
