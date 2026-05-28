import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

const root = process.cwd();
const siteDir = join(root, 'docs-site');
const siteDocsDir = join(siteDir, 'docs');
const publicDir = join(siteDir, 'public');

const readme = readFileSync(join(root, 'README.md'), 'utf8');

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function copyMarkdownTree(from, to) {
  resetDir(to);
  cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      const extension = extname(source);
      const name = source.replace(/\\/g, '/');
      if (name.endsWith('.notes.md') || name.endsWith('.draft.md')) return false;
      return statSync(source).isDirectory() || ['.md', '.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(extension);
    },
  });
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function firstHeading(markdown) {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1];
  const frontmatterTitle = frontmatter?.match(/^title:\s*['"]?(.+?)['"]?$/m)?.[1]?.trim();
  if (frontmatterTitle) return frontmatterTitle.replace(/^['"]|['"]$/g, '');

  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

const htmlTags = new Set([
  'a',
  'article',
  'b',
  'body',
  'br',
  'button',
  'code',
  'details',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'head',
  'html',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'script',
  'section',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'table',
  'tbody',
  'td',
  'textarea',
  'th',
  'thead',
  'tr',
  'ul',
]);

function escapePlaceholders(markdown) {
  return markdown
    .replace(/^```tsx$/gm, '```txt')
    .split(/(```[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith('```')) return part;

      return part
        .replaceAll('{{', '{ {')
        .replaceAll('}}', '} }')
        .replace(/<([A-Za-z][A-Za-z0-9_-]*)>/g, (match, tag) => {
          return htmlTags.has(tag.toLowerCase()) ? match : `&lt;${tag}&gt;`;
        });
    })
    .join('');
}

function sanitizeMissingImages(file, markdown) {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, target) => {
    if (/^(https?:|data:|\/)/.test(target)) return match;

    const normalizedTarget = target.split('#')[0].split('?')[0];
    if (existsSync(join(dirname(file), normalizedTarget))) return match;

    return alt ? `_[Image unavailable in docs build: ${alt}]_` : '';
  });
}

function excerpt(markdown) {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !line.startsWith('#') &&
        !line.startsWith('<') &&
        !line.startsWith('|') &&
        !line.startsWith('![') &&
        !line.startsWith('[![') &&
        line !== '---',
    )
    ?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith('.md')) return [fullPath];
    return [];
  });
}

copyMarkdownTree(join(root, 'docs'), siteDocsDir);

write(join(siteDir, 'readme.md'), `---\ntitle: README\n---\n\n${readme}`);

for (const file of [join(siteDir, 'readme.md'), ...listMarkdownFiles(siteDocsDir)]) {
  const escaped = escapePlaceholders(readFileSync(file, 'utf8'));
  writeFileSync(file, sanitizeMissingImages(file, escaped));
}

resetDir(join(publicDir, 'assets'));
cpSync(join(root, 'assets'), join(publicDir, 'assets'), { recursive: true });
resetDir(join(siteDir, 'assets'));
cpSync(join(root, 'assets'), join(siteDir, 'assets'), { recursive: true });

const docs = [
  join(siteDir, 'index.md'),
  join(siteDir, 'readme.md'),
  join(siteDir, 'search-measurement.md'),
  ...listMarkdownFiles(siteDocsDir),
]
  .filter((file) => existsSync(file))
  .map((file) => {
    const markdown = readFileSync(file, 'utf8');
    const route = `/${relative(siteDir, file)
      .replace(/\\/g, '/')
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '')}`;
    return {
      route: route === '/' ? '/' : route,
      title: firstHeading(markdown) ?? relative(siteDir, file),
      excerpt: excerpt(markdown) ?? '',
    };
  });

const docsIndex = docs.map((doc) => ({
  title: doc.title,
  route: doc.route,
  excerpt: doc.excerpt,
  section: (() => {
    const parts = doc.route.split('/').filter(Boolean);
    if (parts[0] !== 'docs') return 'start';
    if (parts.length === 2) return 'docs';
    return parts[1];
  })(),
}));

const llmsSummary = `# NCP

> Natural Context Provider is an MCP server and CLI that gives AI clients one context-efficient interface for MCP tool discovery, execution, TypeScript code mode workflows, scheduled jobs, skills, and Photon runtime extensions.

## Start Here

- [Home](/): Product overview for Natural Context Provider.
- [README](/readme): Installation, quick start, client setup, examples, and feature overview.
- [Claude Desktop setup](/docs/clients/claude-desktop): Configure NCP for Claude Desktop and desktop extension usage.
- [CLI tools guide](/docs/cli-tools-guide): Find, list, add, remove, and run MCP tools through NCP.
- [Advanced usage](/docs/ADVANCED_USAGE_GUIDE): Code mode, multi-MCP orchestration, project configuration, and advanced workflows.
- [Scheduler user guide](/docs/SCHEDULER_USER_GUIDE): Scheduled MCP jobs and recurring automation.
- [Search measurement](/search-measurement): Keyword tracking, Search Console, and GA4 measurement guidance.

## Core Claims

- NCP reduces MCP tool overload by exposing a small discovery and execution surface instead of every tool schema.
- NCP can route across MCP servers, skills, resources, and Photons from Claude Desktop, Cursor, VS Code, Windsurf, Cline, Continue, and other MCP-compatible clients.
- Code mode executes TypeScript workflows with MCP namespace access for multi-tool orchestration.
- Scheduling turns MCP tools and code mode workflows into repeatable jobs.

## Product Keywords

NCP, Natural Context Provider, MCP, Model Context Protocol, MCP tool discovery, MCP router, MCP tool search, AI tool orchestration, code mode, MCP scheduler, scheduled MCP jobs, MCP skills, Photon runtime, Claude Desktop MCP, Cursor MCP, VS Code MCP.

## Package

- npm: @portel/ncp
- GitHub: https://github.com/portel-dev/ncp
- Docs: https://portel-dev.github.io/ncp/
- License: Elastic License 2.0
`;

const llmsFull = `${llmsSummary}

## Documentation Index

${docs.map((doc) => `- [${doc.title}](${doc.route})${doc.excerpt ? `: ${doc.excerpt}` : ''}`).join('\n')}
`;

write(join(publicDir, 'llms.txt'), llmsSummary);
write(join(publicDir, 'llms-full.txt'), llmsFull);
write(join(publicDir, 'ncp-docs-index.json'), `${JSON.stringify(docsIndex, null, 2)}\n`);
write(join(siteDir, 'llms.md'), `# LLM Reference\n\n\`/llms.txt\` and \`/llms-full.txt\` are generated during the docs build.\n\n${llmsFull}`);

console.log(`Synced ${docs.length} documentation pages into docs-site.`);
