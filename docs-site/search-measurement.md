# Keyword and Search Measurement

Use this guide to measure whether NCP documentation is discoverable by human search engines and AI answer engines.

## Primary Queries

Track these queries in Google Search Console, GitHub traffic, npm referrals, and GA4 landing-page reports:

- NCP MCP
- Natural Context Provider
- MCP tool discovery
- MCP router
- MCP tool search
- one MCP for all tools
- Model Context Protocol tool discovery
- Claude Desktop MCP tool discovery
- Cursor MCP tool discovery
- VS Code MCP tool discovery
- MCP code mode
- scheduled MCP jobs
- MCP scheduler
- MCP skills
- Photon runtime MCP
- context efficient MCP tools
- reduce MCP tool overload

## Landing Pages

Map search intent to these canonical pages:

| Intent | Page |
|---|---|
| Product overview | `/` |
| Installation and quick start | `/readme` |
| Claude Desktop setup | `/docs/clients/claude-desktop` |
| Cursor setup | `/docs/clients/cursor` |
| VS Code setup | `/docs/clients/vscode` |
| CLI discovery commands | `/docs/cli-tools-guide` |
| Code mode and multi-MCP workflows | `/docs/ADVANCED_USAGE_GUIDE` |
| Scheduling and automation | `/docs/SCHEDULER_USER_GUIDE` |
| Security and permissions | `/docs/SECURITY_ARCHITECTURE` |
| AI-readable docs index | `/llms` and `/llms.txt` |

## GA4 Events and Reports

The GitHub Pages workflow reads `DOCS_GA_MEASUREMENT_ID` from repository secrets and exposes it as `VITE_GA_MEASUREMENT_ID` only during deployed docs builds.

Recommended GA4 checks:

- Landing page report filtered to `/ncp/`.
- Traffic acquisition grouped by organic search, referral, and direct.
- Page path report for `/`, `/readme`, `/llms.txt`, `/docs/clients/*`, and `/docs/ADVANCED_USAGE_GUIDE`.
- Search Console integration for query and landing-page pairs.

## Search Console Submission

After GitHub Pages deploys, add the docs property in Google Search Console:

1. Use URL-prefix property: `https://portel-dev.github.io/ncp/`.
2. Submit sitemap: `https://portel-dev.github.io/ncp/sitemap.xml`.
3. Inspect these URLs after deployment: `/`, `/robots.txt`, `/llms.txt`, `/docs/clients/claude-desktop`.
4. Watch coverage, indexing, and query reports for the primary queries above.

If the docs later move to a custom domain, update `DOCS_HOSTNAME`, `robots.txt`, `llms.txt`, and Search Console to the canonical domain.
