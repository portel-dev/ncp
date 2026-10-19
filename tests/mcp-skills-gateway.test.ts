import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, Server } from '@modelcontextprotocol/server';
import {
  getSkillsExtensionCapabilities,
  SkillsGatewayError,
  SkillsMcpGateway,
  type SkillsCustomMethodServer,
} from '../src/server/mcp-skills-gateway.js';

const ACCEPT_ANY = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
};

describe('SkillsMcpGateway', () => {
  let tempDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ncp-skills-gateway-'));
    skillsDir = path.join(tempDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('serves a complete manifest with raw byte digests and preserves all frontmatter fields', async () => {
    const skillDir = path.join(skillsDir, 'code-review');
    await mkdir(path.join(skillDir, 'references'), { recursive: true });
    await mkdir(path.join(skillDir, 'assets'), { recursive: true });
    const skillMarkdown = '---\nname: code-review\ndescription: Review code.\nlicense: MIT\nmetadata:\n  team: platform\n---\n\nRead references/checklist.md.\n';
    const reference = '# Checklist\n\nCheck correctness.\n';
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await writeFile(path.join(skillDir, 'SKILL.md'), skillMarkdown);
    await writeFile(path.join(skillDir, 'references', 'checklist.md'), reference);
    await writeFile(path.join(skillDir, 'assets', 'diagram.png'), image);

    const gateway = new SkillsMcpGateway({ skillsDirectory: skillsDir });
    const listing = await gateway.list();

    expect(listing.resultType).toBe('complete');
    expect(listing.cacheScope).toBe('private');
    expect(listing.skills).toHaveLength(1);
    const skill = listing.skills[0];
    expect(skill.uri).toBe('skill://local/code-review/SKILL.md');
    expect(skill.frontmatter).toEqual({
      name: 'code-review',
      description: 'Review code.',
      license: 'MIT',
      metadata: { team: 'platform' },
    });
    expect(skill.resources).toEqual(expect.arrayContaining([
      { uri: 'skill://local/code-review/SKILL.md', digest: `sha256:${sha256(skillMarkdown)}`, size: Buffer.byteLength(skillMarkdown) },
      { uri: 'skill://local/code-review/references/checklist.md', digest: `sha256:${sha256(reference)}`, size: Buffer.byteLength(reference) },
      { uri: 'skill://local/code-review/assets/diagram.png', digest: `sha256:${createHash('sha256').update(image).digest('hex')}`, size: image.byteLength },
    ]));

    const fetched = await gateway.get(skill.uri);
    expect(fetched.skill).toEqual(skill);
    const read = await gateway.read('skill://local/code-review/references/checklist.md');
    expect(read.contents[0]).toMatchObject({
      uri: 'skill://local/code-review/references/checklist.md',
      mimeType: 'text/markdown',
      text: reference,
    });
    const imageRead = await gateway.read('skill://local/code-review/assets/diagram.png');
    expect(imageRead.contents[0]).toMatchObject({ mimeType: 'image/png', blob: image.toString('base64') });
  });

  it('rejects bytes changed after a manifest was issued', async () => {
    const skillDir = path.join(skillsDir, 'changed-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: changed-skill\ndescription: Before.\n---\n\nBefore.\n');
    const gateway = new SkillsMcpGateway({ skillsDirectory: skillsDir });
    const listing = await gateway.list();
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: changed-skill\ndescription: After.\n---\n\nAfter.\n');

    await expect(gateway.read(listing.skills[0].uri)).rejects.toMatchObject({
      name: 'SkillsGatewayError',
      code: -32603,
    });
  });

  it('keeps downstream origin namespaces and rejects remote bytes that do not match their manifest', async () => {
    const remoteText = '---\nname: remote-skill\ndescription: From another server.\n---\n\nTrusted snapshot.\n';
    const changedText = '---\nname: remote-skill\ndescription: From another server.\n---\n\nChanged bytes.\n';
    const originalUri = 'skill://remote-skill/SKILL.md';
    const source = {
      originId: 'server:github-mcp',
      listSkills: async () => ({
        resultType: 'complete' as const,
        skills: [{
          uri: originalUri,
          frontmatter: { name: 'remote-skill', description: 'From another server.' },
          resources: [{ uri: originalUri, digest: `sha256:${sha256(remoteText)}`, size: Buffer.byteLength(remoteText) }],
        }],
        ttlMs: 300_000,
        cacheScope: 'private' as const,
      }),
      getSkill: async () => ({ resultType: 'complete' as const, skill: {
        uri: originalUri,
        frontmatter: { name: 'remote-skill', description: 'From another server.' },
        resources: [{ uri: originalUri, digest: `sha256:${sha256(remoteText)}`, size: Buffer.byteLength(remoteText) }],
      }, ttlMs: 300_000, cacheScope: 'private' as const }),
      readResource: async (uri: string) => ({
        resultType: 'complete' as const,
        contents: [{ uri, mimeType: 'text/markdown', text: changedText }],
        ttlMs: 300_000,
        cacheScope: 'private' as const,
      }),
    };
    const gateway = new SkillsMcpGateway({ skillsDirectory: skillsDir, downstream: () => [source] });
    const listing = await gateway.list();
    const proxied = listing.skills[0];
    expect(proxied.uri).toMatch(/^skill:\/\/remote-[a-f0-9]{16}\/remote-skill\/SKILL\.md$/);
    expect(proxied.resources[0].uri).toBe(proxied.uri);
    await expect(gateway.read(proxied.uri)).rejects.toMatchObject({ code: -32603 });
  });

  it('rejects traversal URIs and skips symlinks that escape the skill root', async () => {
    const skillDir = path.join(skillsDir, 'safe-skill');
    const outside = path.join(tempDir, 'outside.md');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: safe-skill\ndescription: Safe.\n---\n\nSafe.\n');
    await writeFile(outside, 'secret');
    await symlink(outside, path.join(skillDir, 'leak.md'));
    const gateway = new SkillsMcpGateway({ skillsDirectory: skillsDir });

    const listing = await gateway.list();
    expect(listing.skills[0].resources.map((resource) => resource.uri)).toEqual(['skill://local/safe-skill/SKILL.md']);
    await expect(gateway.read('skill://local/safe-skill/%2e%2e/outside.md')).rejects.toBeInstanceOf(SkillsGatewayError);
  });

  it('returns deterministic complete entries across cursor pages', async () => {
    for (let index = 0; index < 101; index += 1) {
      const name = `skill-${String(index).padStart(3, '0')}`;
      const skillDir = path.join(skillsDir, name);
      await mkdir(skillDir);
      await writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: Skill ${index}.\n---\n\nBody.\n`);
    }
    const gateway = new SkillsMcpGateway({ skillsDirectory: skillsDir });
    const first = await gateway.list();
    const again = await gateway.list();
    expect(first.nextCursor).toBe('100');
    expect(first.skills).toHaveLength(100);
    expect(first.skills.map((skill) => skill.uri)).toEqual(again.skills.map((skill) => skill.uri));
    expect(first.skills[0].uri).toBe('skill://local/skill-000/SKILL.md');
    const second = await gateway.list({ cursor: first.nextCursor });
    expect(second.skills).toHaveLength(1);
    expect(second.skills[0].uri).toBe('skill://local/skill-100/SKILL.md');
    expect(second.nextCursor).toBeUndefined();
  });

  it('supports direct get and paginated listing through the actual SDK custom-method wire path', async () => {
    const skillDir = path.join(skillsDir, 'wire-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: wire-skill\ndescription: Via MCP.\n---\n\nHello.\n');
    const gateway = new SkillsMcpGateway({ skillsDirectory: skillsDir });
    const server = new Server({ name: 'ncp-test', version: '1.0.0' }, { capabilities: getSkillsExtensionCapabilities() });
    const client = new Client({ name: 'skills-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    gateway.register(server as unknown as SkillsCustomMethodServer);

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const fetched = await client.request(
        { method: 'skills/get', params: { uri: 'skill://local/wire-skill/SKILL.md' } } as any,
        ACCEPT_ANY as any,
      ) as any;
      expect(fetched.skill.uri).toBe('skill://local/wire-skill/SKILL.md');

      const listing = await client.request(
        { method: 'skills/list', params: {} } as any,
        ACCEPT_ANY as any,
      ) as any;
      expect(listing.skills).toHaveLength(1);
      expect(fetched.skill).toEqual(listing.skills[0]);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });
});

function sha256(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}
