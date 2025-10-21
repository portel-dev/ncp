# MCP Curation Automation

Two-phase automation for populating MCP registries from awesome lists.

## Overview

**Phase 1: Capture Agent** - Scrapes awesome-mcp pages and extracts metadata to CSV using Claude Haiku
**Phase 2: Submission Agent** - Reads CSV and submits to registries with Portel branding

## Prerequisites

```bash
# Set Anthropic API key (for Haiku in capture agent)
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional: Set admin key for custom registry API
export PORTEL_ADMIN_KEY="your-admin-key"

# Build the project
npm run build
```

## Phase 1: Capture Agent

Scrapes an awesome-mcp page and populates CSV with all metadata.

### Usage

```bash
node dist/curation/capture-agent.js <awesome-page-url> [output.csv]
```

### Examples

```bash
# Capture from punkpeye's awesome list
node dist/curation/capture-agent.js https://github.com/punkpeye/awesome-mcp-servers

# Capture to custom filename
node dist/curation/capture-agent.js https://github.com/wong2/awesome-mcp-servers my-mcps.csv
```

### How It Works

1. Fetches the README from the awesome-mcp GitHub page
2. Uses **Claude Haiku** to parse and extract:
   - MCP name (in registry format: `io.github.owner/repo`)
   - Display name
   - Description
   - Repository URL
   - Category
   - Tags
   - Install command
   - Transport type (stdio/sse/http)
   - NPM package name
3. Outputs to CSV: `captured-mcps.csv`

### CSV Format

```csv
name,displayName,description,repository,category,tags,installCommand,transport,npmPackage,verified,sourceUrl
"io.github.owner/repo","Display Name","Description","https://github.com/owner/repo","Developer Tools","git,cli","npx package","stdio","package-name","false","https://github.com/..."
```

## Phase 2: Submission Agent

Reads CSV and submits to registries with Portel branding.

### Usage

```bash
node dist/curation/submission-agent.js <input.csv> [options]
```

### Options

- `--dry-run` - Preview without actually submitting
- `--custom-only` - Only submit to custom registry (api.mcps.portel.dev)
- `--official-only` - Only generate server.json files (manual official submission)

### Examples

```bash
# Dry run (preview only)
node dist/curation/submission-agent.js captured-mcps.csv --dry-run

# Submit to custom registry only
node dist/curation/submission-agent.js captured-mcps.csv --custom-only

# Generate files for official registry
node dist/curation/submission-agent.js captured-mcps.csv --official-only
```

### How It Works

1. Reads CSV file
2. Generates `server.json` for each MCP with **Portel branding**:
   ```json
   {
     "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json",
     "name": "io.github.owner/repo",
     "description": "...",
     "_meta": {
       "dev.portel/curation": {
         "version": "1.0",
         "submittedBy": "Portel Registry Team",
         "submittedAt": "2025-10-19T...",
         "source": "https://mcps.portel.dev",
         "apiEndpoint": "https://api.mcps.portel.dev",
         "category": "Developer Tools",
         "tags": ["git", "cli"],
         "verificationStatus": "unverified"
       }
     }
   }
   ```
3. Saves to `./output/server-jsons/`
4. Submits to custom registry API (if `--custom-only` or no flags)
5. Shows instructions for official registry submission (if `--official-only` or no flags)

## Complete Workflow Example

```bash
# 1. Capture from awesome list
node dist/curation/capture-agent.js \
  https://github.com/punkpeye/awesome-mcp-servers \
  awesome-mcps.csv

# 2. Review and edit CSV if needed
# (You can manually edit the CSV to fix any issues)

# 3. Test submission (dry run)
node dist/curation/submission-agent.js awesome-mcps.csv --dry-run

# 4. Submit to custom registry
node dist/curation/submission-agent.js awesome-mcps.csv --custom-only

# 5. Generate files for official registry
node dist/curation/submission-agent.js awesome-mcps.csv --official-only
```

## Portel Branding Strategy

Every submission includes `_meta.dev.portel/curation` with:

- ✅ **submittedBy**: "Portel Registry Team"
- ✅ **source**: Links to mcps.portel.dev
- ✅ **apiEndpoint**: Links to api.mcps.portel.dev
- ✅ **category** & **tags**: Enhanced metadata

This metadata is:
- Visible via registry API
- Shown by NCP and other tools
- Establishes Portel as the curator
- Creates ecosystem-wide branding

## Multiple Awesome Lists

To process multiple awesome lists:

```bash
# Capture from multiple sources
node dist/curation/capture-agent.js https://github.com/punkpeye/awesome-mcp-servers list1.csv
node dist/curation/capture-agent.js https://github.com/wong2/awesome-mcp-servers list2.csv
node dist/curation/capture-agent.js https://github.com/appcypher/awesome-mcp-servers list3.csv

# Merge CSVs (keep header from first file)
cat list1.csv > all-mcps.csv
tail -n +2 list2.csv >> all-mcps.csv
tail -n +2 list3.csv >> all-mcps.csv

# Remove duplicates (requires csvkit: pip install csvkit)
csvcut -c name all-mcps.csv | sort | uniq -d  # Check for dupes
csvsort -c name all-mcps.csv | csvuniq -c name > deduplicated-mcps.csv

# Submit deduplicated list
node dist/curation/submission-agent.js deduplicated-mcps.csv
```

## Cost Estimation

**Capture Agent (Haiku):**
- ~1000 tokens input per awesome page
- ~500 tokens output per MCP entry
- Cost: ~$0.25 per 1000 MCPs (Haiku is very cheap)

**Submission Agent:**
- Free API calls
- Official registry requires manual publisher CLI (free)

## Troubleshooting

**Capture fails:**
- Check `ANTHROPIC_API_KEY` is set
- Verify awesome page URL is accessible
- Check GitHub rate limits

**Submission fails:**
- Verify `PORTEL_ADMIN_KEY` for custom registry
- Check CSV format is correct
- Use `--dry-run` to preview first

**Official registry:**
- Requires domain verification for `dev.portel` namespace
- Or use GitHub OAuth for `io.github.*` namespace
- See official docs: https://github.com/modelcontextprotocol/registry

## Directory Structure

```
src/curation/
├── capture-agent.ts       # Phase 1: Scrape → CSV
├── submission-agent.ts    # Phase 2: CSV → Registries
├── README.md              # This file
├── scrapers/              # (Future: additional scrapers)
├── parsers/               # (Future: specialized parsers)
├── generators/            # (Future: custom generators)
└── publishers/            # (Future: additional publishers)

output/
└── server-jsons/          # Generated server.json files
```

## Future Enhancements

- [ ] Scrape Cline marketplace via GitHub Issues API
- [ ] Scrape npm for packages with "mcp" keyword
- [ ] Fetch GitHub stars, last commit, README for each MCP
- [ ] Auto-verify npm packages exist
- [ ] Batch update custom registry from CSV
- [ ] Auto-sync both registries daily
