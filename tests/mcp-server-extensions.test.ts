import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('MCPServer protocol extensions', () => {
  it('filters Apps tools by host capability and preserves UI resource metadata and callback routing', () => {
    expect(runFixture('apps')).toBe('ok');
  }, 45_000);

  it('serves local and downstream Skills methods and Resources through the outer server', () => {
    expect(runFixture('skills')).toBe('ok');
  }, 45_000);

  it('returns raw modern Tasks handles and resumes deep input through tasks/update', () => {
    expect(runFixture('tasks')).toBe('ok');
  }, 45_000);
});

function runFixture(mode: string): string {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('tests/fixtures/ncp-extensions-runner.ts'), mode], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Extension fixture '${mode}' failed (status ${result.status}):\n${result.stderr}\n${result.stdout}`);
  }
  return result.stdout.trim();
}
