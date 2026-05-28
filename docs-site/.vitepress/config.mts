import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { defineConfig } from 'vitepress';

const root = join(__dirname, '..');
const siteUrl = (process.env.DOCS_HOSTNAME ?? 'https://portel-dev.github.io/ncp').replace(/\/$/, '');
const gaMeasurementId = process.env.VITE_GA_MEASUREMENT_ID?.trim();

function titleFor(file: string) {
  const markdown = readFileSync(file, 'utf8');
  const frontmatterTitle = markdown.match(/^---\n[\s\S]*?^title:\s*['"]?(.+?)['"]?\s*$/m)?.[1]?.trim();
  return frontmatterTitle ?? markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(file, '.md');
}

function pageLink(file: string) {
  return `/${relative(root, file).replace(/\\/g, '/').replace(/\.md$/, '')}`;
}

function markdownPages(dir: string) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return markdownPages(fullPath);
      if (entry.isFile() && entry.name.endsWith('.md')) return [fullPath];
      return [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function itemsFor(dir: string) {
  return markdownPages(join(root, dir)).map((file) => ({
    text: titleFor(file),
    link: pageLink(file),
  }));
}

export default defineConfig({
  title: 'NCP',
  description:
    'Natural Context Provider docs for MCP tool discovery, code mode, scheduling, skills, Photon loading, and AI client setup.',
  base: process.env.DOCS_BASE ?? '/ncp/',
  cleanUrls: true,
  ignoreDeadLinks: true,
  lastUpdated: true,
  sitemap: {
    hostname: siteUrl,
  },
  head: [
    ['link', { rel: 'canonical', href: siteUrl }],
    ['link', { rel: 'llms.txt', type: 'text/plain', href: `${siteUrl}/llms.txt` }],
    ['link', { rel: 'alternate', type: 'application/json', title: 'NCP docs index', href: `${siteUrl}/ncp-docs-index.json` }],
    ['link', { rel: 'ai-plugin', type: 'application/json', href: `${siteUrl}/.well-known/ai-plugin.json` }],
    ['link', { rel: 'mcp', type: 'application/json', href: `${siteUrl}/.well-known/mcp.json` }],
    ['link', { rel: 'webmcp', type: 'application/json', href: `${siteUrl}/.well-known/webmcp.json` }],
    ['link', { rel: 'agent-card', type: 'application/json', href: `${siteUrl}/.well-known/agent-card.json` }],
    ['meta', { name: 'theme-color', content: '#111827' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'NCP, Natural Context Provider, MCP, Model Context Protocol, MCP tool discovery, MCP router, code mode, MCP scheduling, Claude Desktop MCP, Cursor MCP, VS Code MCP, AI tools',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'NCP Documentation' }],
    ['meta', { property: 'og:title', content: 'NCP Documentation' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Docs for Natural Context Provider: one MCP that discovers, routes, executes, schedules, and manages AI tools across clients.',
      },
    ],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { property: 'og:image', content: 'https://raw.githubusercontent.com/portel-dev/ncp/main/assets/icons/ncp.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'NCP Documentation' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'Natural Context Provider docs for MCP discovery, routing, code mode, scheduling, skills, Photons, and client setup.',
      },
    ],
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'NCP',
        alternateName: 'Natural Context Provider',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'macOS, Linux, Windows',
        programmingLanguage: 'TypeScript',
        license: 'https://github.com/portel-dev/ncp/blob/main/LICENSE',
        codeRepository: 'https://github.com/portel-dev/ncp',
        url: siteUrl,
        description:
          'Natural Context Provider is an MCP server and CLI that gives AI clients one context-efficient interface for tool discovery, execution, scheduling, skills, and Photon runtime extensions.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      }),
    ],
    ...(gaMeasurementId
      ? [
          ['script', { async: '', src: `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}` }],
          [
            'script',
            {},
            `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaMeasurementId}',{send_page_view:false});`,
          ],
        ]
      : []),
  ],
  vite: {
    define: {
      __NCP_GA_MEASUREMENT_ID__: JSON.stringify(gaMeasurementId ?? ''),
    },
  },
  markdown: {
    config(md) {
      const fence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const rendered = fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
        return rendered.replace('<div class="language-', '<div v-pre class="language-');
      };
    },
  },
  themeConfig: {
    logo: '/assets/icons/ncp.png',
    search: {
      provider: 'local',
    },
    nav: [
      { text: 'Getting Started', link: '/readme' },
      { text: 'Clients', link: '/docs/clients/claude-desktop' },
      { text: 'Code Mode', link: '/docs/ADVANCED_USAGE_GUIDE' },
      { text: 'GitHub', link: 'https://github.com/portel-dev/ncp' },
      { text: 'npm', link: 'https://www.npmjs.com/package/@portel/ncp' },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Home', link: '/' },
          { text: 'README', link: '/readme' },
          { text: 'LLM Reference', link: '/llms' },
          { text: 'Search Measurement', link: '/search-measurement' },
        ],
      },
      {
        text: 'Core Guides',
        items: [
          { text: 'Advanced Usage', link: '/docs/ADVANCED_USAGE_GUIDE' },
          { text: 'CLI Tools Guide', link: '/docs/cli-tools-guide' },
          { text: 'Scheduler User Guide', link: '/docs/SCHEDULER_USER_GUIDE' },
          { text: 'Authentication', link: '/docs/authentication' },
          { text: 'Security Architecture', link: '/docs/SECURITY_ARCHITECTURE' },
          { text: 'Runtime Permissions', link: '/docs/runtime-network-permissions' },
        ],
      },
      {
        text: 'Client Setup',
        collapsed: false,
        items: itemsFor('docs/clients'),
      },
      {
        text: 'Features',
        collapsed: false,
        items: itemsFor('docs/features'),
      },
      {
        text: 'Guides',
        collapsed: true,
        items: itemsFor('docs/guides'),
      },
      {
        text: 'All Docs',
        collapsed: true,
        items: itemsFor('docs'),
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/portel-dev/ncp' }],
    footer: {
      message: 'Released under the Elastic License 2.0.',
      copyright: 'Copyright Portel',
    },
  },
});
