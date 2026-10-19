/**
 * Skills over MCP adapter for locally installed NCP skills.
 *
 * The Skills extension uses custom methods (`skills/list`, `skills/get`) plus
 * the existing Resources `resources/read` method. This module intentionally
 * does not activate skills or grant permissions; it only describes and serves
 * their files.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';

export const SKILLS_EXTENSION_ID = 'io.modelcontextprotocol/skills';
export const SKILLS_CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_SKILL_FILES = 512;
export const MAX_SKILL_BYTES = 16 * 1024 * 1024;
const LIST_PAGE_SIZE = 100;
const MANIFEST_CACHE_TTL_MS = SKILLS_CACHE_TTL_MS;

export type SkillFrontmatter = Record<string, unknown> & {
  name: string;
  description: string;
};

export interface SkillResourceManifestEntry {
  uri: string;
  digest: string;
  size: number;
}

export interface SkillEntry {
  uri: string;
  frontmatter: SkillFrontmatter;
  resources: SkillResourceManifestEntry[];
}

export interface SkillsListResult {
  resultType: 'complete';
  skills: SkillEntry[];
  nextCursor?: string;
  ttlMs: number;
  cacheScope: 'private';
}

export interface SkillsGetResult {
  resultType: 'complete';
  skill: SkillEntry;
  ttlMs: number;
  cacheScope: 'private';
}

export interface SkillsReadResult {
  resultType: 'complete';
  contents: Array<{ uri: string; mimeType: string; text?: string; blob?: string }>;
  ttlMs: number;
  cacheScope: 'private';
}

export interface SkillsDownstreamSource {
  /** Stable identity of the MCP server that supplied this source. */
  originId: string;
  /** Lists complete extension entries from this downstream server. */
  listSkills(): Promise<SkillsListResult>;
  /** Refreshes an entry by its original downstream URI. */
  getSkill(uri: string): Promise<SkillsGetResult>;
  /** Reads bytes from this same downstream server. */
  readResource(uri: string): Promise<SkillsReadResult>;
}

export interface SkillsMcpGatewayOptions {
  /** Defaults to `getNcpBaseDirectory()/skills`. Primarily useful for isolated tests. */
  skillsDirectory?: string;
  /** Inject downstream clients that already support the official Skills extension. */
  downstream?: () => Promise<SkillsDownstreamSource[]> | SkillsDownstreamSource[];
  /** Stable namespace component used in skill:// URIs for locally installed skills. */
  localNamespace?: string;
}

/** Minimal server surface shared by the SDK's custom-method registration API. */
export interface SkillsCustomMethodServer {
  setRequestHandler(
    method: string,
    schemas: { params: unknown; result?: unknown },
    handler: (params: any, context: any) => Promise<unknown> | unknown,
  ): void;
}

interface IndexedFile {
  relativePath: string;
  uri: string;
  digest: string;
  size: number;
}

interface LocalSkillSnapshot {
  entry: SkillEntry;
  directory: string;
  files: Map<string, IndexedFile>;
  createdAt: number;
}

interface RemoteSkillSnapshot {
  entry: SkillEntry;
  source: SkillsDownstreamSource;
  originalEntry: SkillEntry;
  originalUriByGatewayUri: Map<string, string>;
  createdAt: number;
}

export class SkillsGatewayError extends Error {
  readonly code: number;

  constructor(message: string, code = -32602) {
    super(message);
    this.name = 'SkillsGatewayError';
    this.code = code;
  }
}

/**
 * Installs the two Skills extension methods on the SDK v2 server. The caller
 * owns `resources/read` so it can merge these resources with its other sources.
 */
export class SkillsMcpGateway {
  private readonly skillsDirectory: string;
  private readonly localNamespace: string;
  private readonly downstream?: SkillsMcpGatewayOptions['downstream'];
  private readonly snapshots = new Map<string, LocalSkillSnapshot | RemoteSkillSnapshot>();

  constructor(options: SkillsMcpGatewayOptions = {}) {
    this.skillsDirectory = path.resolve(options.skillsDirectory ?? path.join(getNcpBaseDirectory(), 'skills'));
    this.localNamespace = validateNamespace(options.localNamespace ?? 'local');
    this.downstream = options.downstream;
  }

  register(server: SkillsCustomMethodServer): void {
    server.setRequestHandler('skills/list', {
      params: objectSchema({ cursor: optionalStringSchema() }),
      result: unknownSchema(),
    }, async (params) => this.list(params ?? {}));

    server.setRequestHandler('skills/get', {
      params: objectSchema({ uri: stringSchema() }),
      result: unknownSchema(),
    }, async (params) => this.get(params.uri));
  }

  async list(params: { cursor?: string } = {}): Promise<SkillsListResult> {
    const local = await this.indexLocalSkills();
    const remote = await this.indexRemoteSkills();
    const all = [...local, ...remote].sort((a, b) => a.uri.localeCompare(b.uri));
    const offset = decodeCursor(params.cursor);
    const page = all.slice(offset, offset + LIST_PAGE_SIZE);
    const nextOffset = offset + page.length;

    return {
      resultType: 'complete',
      skills: page,
      ...(nextOffset < all.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
      ttlMs: SKILLS_CACHE_TTL_MS,
      cacheScope: 'private',
    };
  }

  async get(uri: string): Promise<SkillsGetResult> {
    const parsed = parseSkillResourceUri(uri);
    let snapshot = await this.refreshForUri(uri, parsed);
    if (!snapshot) throw new SkillsGatewayError(`Unknown skill URI: ${uri}`);
    this.snapshots.set(uri, snapshot);
    return {
      resultType: 'complete',
      skill: snapshot.entry,
      ttlMs: SKILLS_CACHE_TTL_MS,
      cacheScope: 'private',
    };
  }

  async read(uri: string): Promise<SkillsReadResult> {
    const parsed = parseResourceUri(uri);
    let snapshot = this.snapshots.get(uri);
    if (!snapshot || Date.now() - snapshot.createdAt > MANIFEST_CACHE_TTL_MS) {
      snapshot = await this.refreshForUri(uri, parsed);
      if (!snapshot) throw new SkillsGatewayError(`Unknown skill resource URI: ${uri}`);
      this.snapshots.set(uri, snapshot);
    }

    if ('source' in snapshot) return this.readRemote(uri, snapshot);
    return this.readLocal(uri, snapshot);
  }

  private async indexLocalSkills(): Promise<SkillEntry[]> {
    let rootRealPath: string;
    try {
      rootRealPath = await fs.realpath(this.skillsDirectory);
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw new SkillsGatewayError(`Unable to access skills directory: ${error.message}`, -32603);
    }

    const dirs = await fs.readdir(rootRealPath, { withFileTypes: true });
    const entries: SkillEntry[] = [];
    for (const dirent of dirs) {
      if (!dirent.isDirectory() || dirent.isSymbolicLink() || !isSafeSkillName(dirent.name)) continue;
      try {
        const snapshot = await this.buildLocalSnapshot(rootRealPath, dirent.name);
        if (!snapshot) continue;
        this.snapshots.set(snapshot.entry.uri, snapshot);
        entries.push(snapshot.entry);
      } catch (error: any) {
        // Invalid or unsafe skills are omitted from the complete listing.
        if (error instanceof SkillsGatewayError && error.code === -32603) throw error;
      }
    }
    return entries;
  }

  private async buildLocalSnapshot(rootRealPath: string, dirname: string): Promise<LocalSkillSnapshot | null> {
    const skillDirectory = path.join(rootRealPath, dirname);
    const skillDirectoryRealPath = await fs.realpath(skillDirectory);
    assertInside(rootRealPath, skillDirectoryRealPath);

    const files = new Map<string, IndexedFile>();
    let aggregateBytes = 0;
    await this.walkFiles(rootRealPath, skillDirectoryRealPath, '', files, (size) => {
      aggregateBytes += size;
      if (files.size > MAX_SKILL_FILES || aggregateBytes > MAX_SKILL_BYTES) {
        throw new SkillsGatewayError(`Skill ${dirname} exceeds the supported file or size limit`);
      }
    });

    const manifest = [...files.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const skillFile = files.get('SKILL.md');
    if (!skillFile || manifest.length === 0) return null;

    const skillBytes = await readContainedFile(rootRealPath, skillDirectoryRealPath, skillFile.relativePath);
    if (skillBytes.byteLength !== skillFile.size || sha256(skillBytes) !== skillFile.digest) {
      throw new SkillsGatewayError(`Skill changed while its manifest was being built: ${skillFile.relativePath}`, -32603);
    }
    const skillText = decodeUtf8(skillBytes, skillFile.uri);
    const frontmatter = parseFrontmatter(skillText, dirname);
    if (!frontmatter || frontmatter.name !== dirname) return null;

    const skillUri = makeSkillUri(this.localNamespace, dirname, 'SKILL.md');
    const uriManifest = manifest.map((item) => ({
      uri: makeSkillUri(this.localNamespace, dirname, item.relativePath),
      digest: item.digest,
      size: item.size,
    }));
    const remappedFiles = new Map<string, IndexedFile>();
    for (const item of manifest) {
      const uri = makeSkillUri(this.localNamespace, dirname, item.relativePath);
      remappedFiles.set(uri, { ...item, uri });
    }
    return {
      entry: { uri: skillUri, frontmatter, resources: uriManifest },
      directory: skillDirectoryRealPath,
      files: remappedFiles,
      createdAt: Date.now(),
    };
  }

  private async walkFiles(
    rootRealPath: string,
    directory: string,
    relativeDirectory: string,
    files: Map<string, IndexedFile>,
    accountSize: (size: number) => void,
  ): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..' || entry.name.includes('/') || entry.name.includes('\\')) continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      const realPath = await fs.realpath(absolutePath);
      assertInside(rootRealPath, realPath);
      const stat = await fs.stat(realPath);
      if (stat.isDirectory()) {
        await this.walkFiles(rootRealPath, realPath, relativePath, files, accountSize);
      } else if (stat.isFile()) {
        if (files.size >= MAX_SKILL_FILES) throw new SkillsGatewayError('Skill exceeds the supported file count limit');
        const info = await hashFileBounded(realPath, MAX_SKILL_BYTES);
        accountSize(info.size);
        const normalized = normalizeRelativePath(relativePath);
        files.set(normalized, {
          relativePath: normalized,
          uri: '',
          digest: info.digest,
          size: info.size,
        });
      }
    }
  }

  private async indexRemoteSkills(): Promise<SkillEntry[]> {
    if (!this.downstream) return [];
    const sources = await this.downstream();
    const entries: SkillEntry[] = [];
    for (const source of [...sources].sort((a, b) => a.originId.localeCompare(b.originId))) {
      const namespace = remoteNamespace(source.originId);
      const listing = await source.listSkills();
      for (const entry of listing.skills) {
        const name = entry.frontmatter.name;
        if (typeof name !== 'string' || !isSafeSkillName(name) || parseDownstreamResourceUri(entry.uri, name).relativePath !== 'SKILL.md') continue;
        const remapped = this.remapRemoteEntry(namespace, name, source, entry);
        this.snapshots.set(remapped.entry.uri, remapped);
        entries.push(remapped.entry);
      }
    }
    return entries;
  }

  private remapRemoteEntry(namespace: string, name: string, source: SkillsDownstreamSource, originalEntry: SkillEntry): RemoteSkillSnapshot {
    validateRemoteManifest(originalEntry, source.originId);
    const originalUriByGatewayUri = new Map<string, string>();
    const entryUri = makeSkillUri(namespace, name, 'SKILL.md');
    for (const resource of originalEntry.resources) {
      const original = parseDownstreamResourceUri(resource.uri, name);
      if (original.name !== name) throw new SkillsGatewayError(`Downstream skill manifest crosses skill boundary (${source.originId})`);
      const gatewayUri = makeSkillUri(namespace, name, original.relativePath);
      originalUriByGatewayUri.set(gatewayUri, resource.uri);
    }
    if (!originalUriByGatewayUri.has(entryUri)) throw new SkillsGatewayError(`Downstream skill manifest is missing SKILL.md (${source.originId})`);
    const entry: SkillEntry = {
      uri: entryUri,
      frontmatter: originalEntry.frontmatter,
      resources: originalEntry.resources.map((resource) => {
        const original = parseDownstreamResourceUri(resource.uri, name);
        return { ...resource, uri: makeSkillUri(namespace, name, original.relativePath) };
      }).sort((a, b) => a.uri.localeCompare(b.uri)),
    };
    return { entry, source, originalEntry, originalUriByGatewayUri, createdAt: Date.now() };
  }

  private async refreshForUri(uri: string, parsed: ParsedResourceUri): Promise<LocalSkillSnapshot | RemoteSkillSnapshot | undefined> {
    if (parsed.namespace === this.localNamespace) {
      const rootRealPath = await fs.realpath(this.skillsDirectory).catch((error: any) => {
        if (error?.code === 'ENOENT') throw new SkillsGatewayError(`Unknown skill URI: ${uri}`);
        throw error;
      });
      const snapshot = await this.buildLocalSnapshot(rootRealPath, parsed.name);
      if (!snapshot || !snapshot.files.has(uri)) return undefined;
      return snapshot;
    }

    if (!this.downstream) return undefined;
    const sources = await this.downstream();
    const source = sources.find((candidate) => remoteNamespace(candidate.originId) === parsed.namespace);
    if (!source) return undefined;

    // The caller can request a URI without first listing. Query this source's
    // complete entries to resolve the stable gateway URI to its original URI.
    const listing = await source.listSkills();
    for (const entry of listing.skills) {
      if (entry.frontmatter.name !== parsed.name) continue;
      if (parseDownstreamResourceUri(entry.uri, parsed.name).relativePath !== 'SKILL.md') continue;
      const listed = this.remapRemoteEntry(parsed.namespace, parsed.name, source, entry);
      if (listed.entry.uri !== uri && !listed.originalUriByGatewayUri.has(uri)) continue;
      if (parsed.relativePath === 'SKILL.md') {
        const refreshed = await source.getSkill(entry.uri);
        if (refreshed.skill.uri !== entry.uri) throw new SkillsGatewayError(`Downstream get returned a different skill URI (${source.originId})`, -32603);
        return this.remapRemoteEntry(parsed.namespace, parsed.name, source, refreshed.skill);
      }
      return listed;
    }
    return undefined;
  }

  private async readLocal(uri: string, snapshot: LocalSkillSnapshot): Promise<SkillsReadResult> {
    const file = snapshot.files.get(uri);
    if (!file) throw new SkillsGatewayError(`Unknown skill resource URI: ${uri}`);
    const bytes = await readContainedFile(path.dirname(snapshot.directory), snapshot.directory, file.relativePath);
    if (bytes.byteLength !== file.size || sha256(bytes) !== file.digest) {
      throw new SkillsGatewayError(`Skill resource changed after its manifest was issued: ${uri}`, -32603);
    }
    return {
      resultType: 'complete',
      contents: [resourceContent(uri, mimeType(file.relativePath), bytes)],
      ttlMs: SKILLS_CACHE_TTL_MS,
      cacheScope: 'private',
    };
  }

  private async readRemote(uri: string, snapshot: RemoteSkillSnapshot): Promise<SkillsReadResult> {
    const originalUri = snapshot.originalUriByGatewayUri.get(uri);
    const expected = snapshot.entry.resources.find((resource) => resource.uri === uri);
    if (!originalUri || !expected) throw new SkillsGatewayError(`Unknown skill resource URI: ${uri}`);
    const result = await snapshot.source.readResource(originalUri);
    const content = result.contents.find((item) => item.uri === originalUri);
    if (!content || (typeof content.text !== 'string' && typeof content.blob !== 'string')) throw new SkillsGatewayError(`Downstream resource missing: ${originalUri}`, -32603);
    const bytes = typeof content.blob === 'string' ? Buffer.from(content.blob, 'base64') : Buffer.from(content.text!, 'utf8');
    if (bytes.byteLength !== expected.size || sha256(bytes) !== expected.digest) {
      throw new SkillsGatewayError(`Downstream skill resource failed manifest integrity verification: ${uri}`, -32603);
    }
    if (uri.endsWith('/SKILL.md')) {
      const parsed = parseSkillResourceUri(uri);
      const frontmatter = typeof content.text === 'string' ? parseFrontmatter(content.text, parsed.name) : null;
      if (!frontmatter || !deepEqual(frontmatter, snapshot.entry.frontmatter)) {
        throw new SkillsGatewayError(`Downstream skill frontmatter failed manifest verification: ${uri}`, -32603);
      }
    }
    return {
      resultType: 'complete',
      contents: [{
        uri,
        mimeType: content.mimeType || mimeType(uri),
        ...(typeof content.text === 'string' ? { text: content.text } : { blob: content.blob }),
      }],
      ttlMs: SKILLS_CACHE_TTL_MS,
      cacheScope: 'private',
    };
  }
}

export function getSkillsExtensionCapabilities(): {
  resources: Record<string, never>;
  extensions: Record<string, { directoryRead?: boolean }>;
} {
  return { resources: {}, extensions: { [SKILLS_EXTENSION_ID]: {} } };
}

interface ParsedResourceUri {
  namespace: string;
  name: string;
  relativePath: string;
}

function parseSkillResourceUri(uri: string): ParsedResourceUri {
  const parsed = parseResourceUri(uri);
  if (parsed.relativePath !== 'SKILL.md') throw new SkillsGatewayError(`URI does not identify a SKILL.md file: ${uri}`);
  return parsed;
}

function parseResourceUri(uri: string): ParsedResourceUri {
  if (typeof uri !== 'string' || uri.length > 4096) throw new SkillsGatewayError('Invalid skill resource URI');
  let url: URL;
  try { url = new URL(uri); } catch { throw new SkillsGatewayError('Invalid skill resource URI'); }
  if (url.protocol !== 'skill:' || !url.hostname || url.search || url.hash || url.username || url.password || url.port) {
    throw new SkillsGatewayError(`Invalid skill resource URI: ${uri}`);
  }
  const components = url.pathname.split('/').filter(Boolean).map(decodeUriPathComponent);
  if (components.length < 2) throw new SkillsGatewayError(`Invalid skill resource URI: ${uri}`);
  const [name, ...relative] = components;
  if (!isSafeSkillName(name) || relative.length === 0) throw new SkillsGatewayError(`Invalid skill resource URI: ${uri}`);
  const relativePath = normalizeRelativePath(relative.join('/'));
  if (!relativePath || relativePath.startsWith('../')) throw new SkillsGatewayError(`Invalid skill resource URI: ${uri}`);
  return { namespace: validateNamespace(url.hostname), name, relativePath };
}

/** Accepts both the common `skill://name/SKILL.md` layout and namespaced paths. */
function parseDownstreamResourceUri(uri: string, expectedName: string): ParsedResourceUri {
  if (typeof uri !== 'string' || uri.length > 4096) throw new SkillsGatewayError('Invalid downstream skill resource URI');
  let url: URL;
  try { url = new URL(uri); } catch { throw new SkillsGatewayError('Invalid downstream skill resource URI'); }
  if (url.protocol !== 'skill:' || !url.hostname || url.search || url.hash || url.username || url.password || url.port) {
    throw new SkillsGatewayError(`Invalid downstream skill resource URI: ${uri}`);
  }
  const components = url.pathname.split('/').filter(Boolean).map(decodeUriPathComponent);
  if (!components.length) throw new SkillsGatewayError(`Invalid downstream skill resource URI: ${uri}`);
  let relativePath: string;
  if (url.hostname === expectedName) {
    relativePath = normalizeRelativePath(components.join('/'));
  } else {
    if (components[0] !== expectedName || components.length < 2) throw new SkillsGatewayError(`Invalid downstream skill resource URI: ${uri}`);
    relativePath = normalizeRelativePath(components.slice(1).join('/'));
  }
  return { namespace: validateNamespace(url.hostname), name: expectedName, relativePath };
}

function decodeUriPathComponent(value: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { throw new SkillsGatewayError('Invalid percent encoding in skill URI'); }
  if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
    throw new SkillsGatewayError('Invalid path component in skill URI');
  }
  return decoded;
}

function makeSkillUri(namespace: string, name: string, relativePath: string): string {
  const parts = normalizeRelativePath(relativePath).split('/').map(encodeURIComponent);
  return `skill://${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${parts.join('/')}`;
}

function normalizeRelativePath(value: string): string {
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/')) throw new SkillsGatewayError('Invalid skill file path');
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new SkillsGatewayError('Invalid skill file path');
  return parts.join('/');
}

function isSafeSkillName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{0,62})$/.test(name) && name !== '.' && name !== '..';
}

function validateNamespace(namespace: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(namespace)) throw new SkillsGatewayError('Invalid skill URI namespace');
  return namespace;
}

function remoteNamespace(originId: string): string {
  return `remote-${createHash('sha256').update(originId).digest('hex').slice(0, 16)}`;
}

function parseFrontmatter(text: string, directoryName: string): SkillFrontmatter | null {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  let value: unknown;
  try { value = yaml.load(match[1]); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const frontmatter = value as Record<string, unknown>;
  if (frontmatter.name !== directoryName || typeof frontmatter.description !== 'string') return null;
  return frontmatter as SkillFrontmatter;
}

function validateRemoteManifest(entry: SkillEntry, originId: string): void {
  if (!entry || typeof entry.uri !== 'string' || !entry.frontmatter || !Array.isArray(entry.resources)) {
    throw new SkillsGatewayError(`Invalid Skills entry from downstream origin ${originId}`, -32603);
  }
  if (entry.resources.length === 0 || entry.resources.length > MAX_SKILL_FILES) {
    throw new SkillsGatewayError(`Downstream manifest exceeds supported file count (${originId})`);
  }
  let total = 0;
  for (const resource of entry.resources) {
    if (!resource || typeof resource.uri !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(resource.digest) || !Number.isSafeInteger(resource.size) || resource.size < 0) {
      throw new SkillsGatewayError(`Invalid resource manifest from downstream origin ${originId}`, -32603);
    }
    total += resource.size;
    if (total > MAX_SKILL_BYTES) throw new SkillsGatewayError(`Downstream skill exceeds supported byte limit (${originId})`);
  }
}

function decodeCursor(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^(0|[1-9][0-9]*)$/.test(cursor)) throw new SkillsGatewayError('Invalid skills list cursor');
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) throw new SkillsGatewayError('Invalid skills list cursor');
  return offset;
}

function encodeCursor(offset: number): string { return String(offset); }

function sha256(bytes: Uint8Array): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }

function deepEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function decodeUtf8(bytes: Uint8Array, uri: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new SkillsGatewayError(`Skill resource is not valid UTF-8: ${uri}`, -32603); }
}

function assertInside(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new SkillsGatewayError('Skill path resolves outside the configured skills directory');
  }
}

async function readContainedFile(rootRealPath: string, skillDirectory: string, relativePath: string): Promise<Buffer> {
  const normalized = normalizeRelativePath(relativePath);
  const candidate = path.join(skillDirectory, ...normalized.split('/'));
  const realPath = await fs.realpath(candidate);
  assertInside(rootRealPath, realPath);
  assertInside(skillDirectory, realPath);
  const stat = await fs.stat(realPath);
  if (!stat.isFile()) throw new SkillsGatewayError('Skill resource is not a regular file');
  return fs.readFile(realPath);
}

async function hashFileBounded(filePath: string, maxBytes: number): Promise<{ digest: string; size: number }> {
  const handle = await fs.open(filePath, 'r');
  const hash = createHash('sha256');
  let size = 0;
  const chunkSize = 64 * 1024;
  const chunk = Buffer.allocUnsafe(chunkSize);
  try {
    while (true) {
      const remainingBeforeLimit = maxBytes - size;
      const readLength = Math.min(chunkSize, Math.max(1, remainingBeforeLimit + 1));
      const { bytesRead } = await handle.read(chunk, 0, readLength, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maxBytes) throw new SkillsGatewayError(`Skill exceeds the supported ${MAX_SKILL_BYTES} byte limit`);
      hash.update(chunk.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return { digest: `sha256:${hash.digest('hex')}`, size };
}

function mimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.md' || extension === '.markdown') return 'text/markdown';
  if (extension === '.txt') return 'text/plain';
  if (extension === '.json') return 'application/json';
  if (extension === '.yaml' || extension === '.yml') return 'text/yaml';
  if (extension === '.xml') return 'application/xml';
  if (extension === '.html' || extension === '.htm') return 'text/html';
  if (extension === '.css') return 'text/css';
  if (extension === '.js' || extension === '.mjs' || extension === '.ts') return 'text/plain';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.pdf') return 'application/pdf';
  return 'text/plain';
}

function resourceContent(uri: string, type: string, bytes: Buffer): { uri: string; mimeType: string; text?: string; blob?: string } {
  try {
    return { uri, mimeType: type, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { uri, mimeType: type, blob: bytes.toString('base64') };
  }
}

// Minimal Standard Schema v1 values keep this adapter independent of another
// package dependency while allowing SDK v2's custom-method validation path.
type StandardSchema = { '~standard': { version: 1; vendor: string; validate: (value: unknown) => { value: unknown } | { issues: Array<{ message: string }> } } };

function schema(validate: (value: unknown) => boolean, message: string): StandardSchema {
  return {
    '~standard': {
      version: 1,
      vendor: 'ncp-skills-gateway',
      validate(value) { return validate(value) ? { value } : { issues: [{ message }] }; },
    },
  };
}

function objectSchema(properties: Record<string, StandardSchema>): StandardSchema {
  return schema((value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(properties).every(([key, property]) => {
    const candidate = (value as Record<string, unknown>)[key];
    if (candidate === undefined && key === 'cursor') return true;
    return !('issues' in property['~standard'].validate(candidate));
  }), 'Invalid Skills request parameters');
}

function stringSchema(): StandardSchema { return schema((value) => typeof value === 'string', 'Expected a string'); }
function optionalStringSchema(): StandardSchema { return schema((value) => value === undefined || typeof value === 'string', 'Expected an optional string'); }
function unknownSchema(): StandardSchema { return schema(() => true, ''); }
