import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ProfileManager,
  SECURE_STORAGE_REFERENCE,
} from '../src/profiles/profile-manager.js';

describe('ProfileManager secret storage', () => {
  let profilesDir: string;
  let manager: ProfileManager;
  let storedEnvironment: Record<string, string>;
  let setCredential: any;
  let getCredential: any;

  beforeEach(async () => {
    profilesDir = await mkdtemp(join(tmpdir(), 'ncp-secret-storage-'));
    storedEnvironment = {};
    setCredential = jest.fn(async (_mcpName: string, type: string, value: unknown) => {
      if (type === 'custom') storedEnvironment = value as Record<string, string>;
      return true;
    });
    getCredential = jest.fn(async (_mcpName: string, type: string) =>
      type === 'custom' ? storedEnvironment : null
    );

    manager = new ProfileManager();
    (manager as any).profilesDir = profilesDir;
    (manager as any).credentialStore = { setCredential, getCredential };
    (manager as any).profiles.set('all', {
      name: 'all',
      description: 'test',
      mcpServers: {},
      metadata: { created: 'now', modified: 'now' },
    });
  });

  afterEach(async () => {
    await rm(profilesDir, { recursive: true, force: true });
  });

  it('stores collected environment credentials securely and materializes them only at runtime', async () => {
    await manager.addMCPToProfile('all', 'github', {
      command: 'github-mcp',
      env: {
        GITHUB_TOKEN: 'top-secret-token',
        GITHUB_TEAM_ID: 'team-123',
        LOG_LEVEL: 'info',
      },
    }, {
      sensitiveEnvKeys: ['GITHUB_TOKEN', 'GITHUB_TEAM_ID'],
    });

    const profileText = await readFile(join(profilesDir, 'all.json'), 'utf8');
    expect(profileText).not.toContain('top-secret-token');
    expect(profileText).not.toContain('team-123');
    expect(JSON.parse(profileText).mcpServers.github.env).toEqual({
      GITHUB_TOKEN: SECURE_STORAGE_REFERENCE,
      GITHUB_TEAM_ID: SECURE_STORAGE_REFERENCE,
      LOG_LEVEL: 'info',
    });
    expect(storedEnvironment).toEqual({
      GITHUB_TOKEN: 'top-secret-token',
      GITHUB_TEAM_ID: 'team-123',
    });

    const runtimeConfig = await manager.getProfileMCPs('all');
    expect(runtimeConfig?.github.env).toEqual({
      GITHUB_TOKEN: 'top-secret-token',
      GITHUB_TEAM_ID: 'team-123',
      LOG_LEVEL: 'info',
    });
  });

  it('fails closed without persisting a profile when secure storage rejects a secret', async () => {
    setCredential.mockResolvedValue(false);

    await expect(manager.addMCPToProfile('all', 'github', {
      command: 'github-mcp',
      env: { GITHUB_TOKEN: 'must-not-leak' },
    })).rejects.toThrow('Secure storage rejected environment credentials');

    expect((manager as any).profiles.get('all').mcpServers.github).toBeUndefined();
    await expect(readFile(join(profilesDir, 'all.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not pass unresolved secure references to child processes', async () => {
    (manager as any).profiles.get('all').mcpServers.github = {
      command: 'github-mcp',
      env: { GITHUB_TOKEN: SECURE_STORAGE_REFERENCE },
    };
    getCredential.mockResolvedValue(null);

    const runtimeConfig = await manager.getProfileMCPs('all');
    expect(runtimeConfig?.github.env).toEqual({});
  });

  it('migrates existing plaintext environment secrets out of profile files', async () => {
    (manager as any).profiles.get('all').mcpServers.github = {
      command: 'github-mcp',
      env: {
        GITHUB_TOKEN: 'legacy-plaintext-secret',
        LOG_LEVEL: 'debug',
      },
    };

    await expect(manager.migrateProfileCredentials('all')).resolves.toEqual({
      migrated: 1,
      errors: 0,
    });

    const profileText = await readFile(join(profilesDir, 'all.json'), 'utf8');
    expect(profileText).not.toContain('legacy-plaintext-secret');
    expect(JSON.parse(profileText).mcpServers.github.env).toEqual({
      GITHUB_TOKEN: SECURE_STORAGE_REFERENCE,
      LOG_LEVEL: 'debug',
    });
    expect(storedEnvironment).toEqual({ GITHUB_TOKEN: 'legacy-plaintext-secret' });
  });

  it('stores OAuth client secrets outside the profile', async () => {
    await manager.addMCPToProfile('all', 'oauth-server', {
      url: 'https://mcp.example.test',
      auth: {
        type: 'oauth',
        oauth21: {
          clientId: 'public-client-id',
          clientSecret: 'private-client-secret',
        },
      },
    });

    const profileText = await readFile(join(profilesDir, 'all.json'), 'utf8');
    expect(profileText).not.toContain('private-client-secret');
    expect(JSON.parse(profileText).mcpServers['oauth-server'].auth.oauth21).toEqual({
      clientId: 'public-client-id',
      clientSecret: SECURE_STORAGE_REFERENCE,
    });
    expect(setCredential).toHaveBeenCalledWith(
      'oauth-server',
      'oauth_client_secret',
      'private-client-secret',
      expect.any(String),
    );
  });
});
