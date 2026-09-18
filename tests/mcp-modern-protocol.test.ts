import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';

function runFixture(path: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', path], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('MCP multi-round-trip compatibility', () => {
  it('negotiates MCP 2026 and resumes input_required without a server-to-client request', () => {
    const result = runFixture('tests/fixtures/mcp-modern-input-required-runner.ts');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
  }, 45_000);

  it('serves the same interaction through the legacy input_required shim', () => {
    const result = runFixture('tests/fixtures/mcp-legacy-input-required-runner.ts');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
  }, 45_000);

  it('fails closed when the client did not negotiate elicitation support', () => {
    const result = runFixture('tests/fixtures/mcp-no-elicitation-runner.ts');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
  }, 45_000);
});
