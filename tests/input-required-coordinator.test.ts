import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';

describe('InputRequiredCoordinator', () => {
  it('supports secure multi-round workflows, cancellation, and state validation', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'tests/fixtures/input-required-multiround-runner.ts'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
  });
});
