/**
 * Network Policy Manager tests
 * Covers static policy decisions, runtime permission elicitation,
 * permission caching, and the elicitation timeout default-deny.
 */

import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NetworkPolicyManager, ElicitationFunction } from '../../src/code-mode/network-policy.js';
import { setOverrideWorkingDirectory, resetPathsCache } from '../../src/utils/ncp-paths.js';

let tempDir: string;

beforeAll(() => {
  // Keep audit logs out of the real ~/.ncp directory
  tempDir = mkdtempSync(join(tmpdir(), 'ncp-network-policy-test-'));
  setOverrideWorkingDirectory(tempDir);
});

afterAll(() => {
  setOverrideWorkingDirectory(null);
  resetPathsCache();
  rmSync(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('NetworkPolicyManager static policy', () => {
  it('blocks all external requests when no allowlist is configured', () => {
    const manager = new NetworkPolicyManager();
    const result = manager.isUrlAllowed('https://api.github.com/repos');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No allowed domains');
  });

  it('allows exact allowlisted domains', () => {
    const manager = new NetworkPolicyManager({ allowedDomains: ['api.github.com'] });
    expect(manager.isUrlAllowed('https://api.github.com/repos').allowed).toBe(true);
    expect(manager.isUrlAllowed('https://evil.example.com').allowed).toBe(false);
  });

  it('supports wildcard domain patterns', () => {
    const manager = new NetworkPolicyManager({ allowedDomains: ['*.anthropic.com'] });
    expect(manager.isUrlAllowed('https://api.anthropic.com/v1').allowed).toBe(true);
    expect(manager.isUrlAllowed('https://anthropic.com').allowed).toBe(true);
    expect(manager.isUrlAllowed('https://anthropic.com.evil.net').allowed).toBe(false);
  });

  it('blocked domains take precedence over allowed domains', () => {
    const manager = new NetworkPolicyManager({
      allowedDomains: ['*.example.com'],
      blockedDomains: ['evil.example.com']
    });
    expect(manager.isUrlAllowed('https://good.example.com').allowed).toBe(true);
    expect(manager.isUrlAllowed('https://evil.example.com').allowed).toBe(false);
  });

  it('denies localhost unless allowAllLocalhost is set', () => {
    const denying = new NetworkPolicyManager();
    expect(denying.isUrlAllowed('http://localhost:3000').allowed).toBe(false);
    expect(denying.isUrlAllowed('http://127.0.0.1:8080').allowed).toBe(false);

    const allowing = new NetworkPolicyManager({ allowAllLocalhost: true });
    expect(allowing.isUrlAllowed('http://localhost:3000').allowed).toBe(true);
  });

  it('denies private IPs unless allowPrivateIPs is set', () => {
    const denying = new NetworkPolicyManager();
    expect(denying.isUrlAllowed('http://192.168.1.10/admin').allowed).toBe(false);
    expect(denying.isUrlAllowed('http://10.0.0.5').allowed).toBe(false);

    const allowing = new NetworkPolicyManager({ allowPrivateIPs: true });
    expect(allowing.isUrlAllowed('http://192.168.1.10/admin').allowed).toBe(true);
  });

  it('denies invalid URLs', () => {
    const manager = new NetworkPolicyManager({ allowedDomains: ['api.github.com'] });
    const result = manager.isUrlAllowed('not a url');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Invalid URL');
  });
});

describe('NetworkPolicyManager runtime permissions', () => {
  it('falls back to static decision when no elicitation function is provided', async () => {
    const manager = new NetworkPolicyManager();
    const result = await manager.isUrlAllowedAsync('https://api.github.com');
    expect(result.allowed).toBe(false);
  });

  it('does not elicit for explicitly blocked domains', async () => {
    const elicit = jest.fn() as jest.MockedFunction<ElicitationFunction>;
    const manager = new NetworkPolicyManager({ blockedDomains: ['evil.com'] }, elicit);
    const result = await manager.isUrlAllowedAsync('https://evil.com/payload');
    expect(result.allowed).toBe(false);
    expect(elicit).not.toHaveBeenCalled();
  });

  it('allows access when the user approves and caches the decision', async () => {
    const elicit = jest.fn() as jest.MockedFunction<ElicitationFunction>;
    elicit.mockResolvedValue('Allow Once');
    const manager = new NetworkPolicyManager({}, elicit);

    const first = await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(first.allowed).toBe(true);
    expect(elicit).toHaveBeenCalledTimes(1);

    // Second request for the same URL is served from the permission cache
    const second = await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(second.allowed).toBe(true);
    expect(elicit).toHaveBeenCalledTimes(1);
  });

  it('denies access when the user denies and caches the denial', async () => {
    const elicit = jest.fn() as jest.MockedFunction<ElicitationFunction>;
    elicit.mockResolvedValue('Deny');
    const manager = new NetworkPolicyManager({}, elicit);

    const first = await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(first.allowed).toBe(false);

    const second = await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(second.allowed).toBe(false);
    expect(elicit).toHaveBeenCalledTimes(1);
  });

  it('denies access when the elicitation function rejects', async () => {
    const elicit = jest.fn() as jest.MockedFunction<ElicitationFunction>;
    elicit.mockRejectedValue(new Error('prompt failed'));
    const manager = new NetworkPolicyManager({}, elicit);

    const result = await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Permission request failed');
  });

  it('denies access when the elicitation prompt hangs (timeout default-deny)', async () => {
    jest.useFakeTimers();
    const elicit = jest.fn(() => new Promise<string>(() => {})) as unknown as ElicitationFunction;
    const manager = new NetworkPolicyManager({}, elicit);

    const pending = manager.isUrlAllowedAsync('https://api.github.com/repos');
    await jest.advanceTimersByTimeAsync(120001);
    const result = await pending;

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Permission request failed');
  });

  it('hung prompts do not poison the cache - a later prompt can still approve', async () => {
    jest.useFakeTimers();
    let hang = true;
    const elicit = jest.fn(() =>
      hang ? new Promise<string>(() => {}) : Promise.resolve('Allow Once')
    ) as unknown as ElicitationFunction;
    const manager = new NetworkPolicyManager({}, elicit);

    const pending = manager.isUrlAllowedAsync('https://api.github.com/repos');
    await jest.advanceTimersByTimeAsync(120001);
    expect((await pending).allowed).toBe(false);

    jest.useRealTimers();
    hang = false;
    const retry = await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(retry.allowed).toBe(true);
  });
});

describe('NetworkPolicyManager permission management', () => {
  it('revokes cached permissions', async () => {
    const elicit = jest.fn() as jest.MockedFunction<ElicitationFunction>;
    elicit.mockResolvedValue('Allow Always');
    const manager = new NetworkPolicyManager({}, elicit);

    await manager.isUrlAllowedAsync('https://api.github.com/repos');
    expect(manager.getPermissions()).toHaveLength(1);
    expect(manager.getPermissions()[0].permanent).toBe(true);

    expect(manager.revokePermission('https://api.github.com/repos')).toBe(true);
    expect(manager.getPermissions()).toHaveLength(0);
  });

  it('updates policy at runtime', () => {
    const manager = new NetworkPolicyManager();
    expect(manager.isUrlAllowed('https://api.github.com').allowed).toBe(false);

    manager.allowDomain('api.github.com');
    expect(manager.isUrlAllowed('https://api.github.com').allowed).toBe(true);

    manager.blockDomain('api.github.com');
    expect(manager.isUrlAllowed('https://api.github.com').allowed).toBe(false);
  });
});
