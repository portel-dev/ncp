# MCP Curation Agents

Two-phase automation for capturing and submitting MCPs to registries with Portel branding.

## Available Agents

### 1. mcp-capture-agent
Scrapes awesome-mcp lists and builds CSV with automatic deduplication.

**Usage:**
```
"Capture MCPs from https://github.com/punkpeye/awesome-mcp-servers"
```

**What it does:**
- Fetches README from awesome list
- Parses all MCP entries
- Deduplicates against existing CSV
- Appends only new entries
- Reports: new vs duplicates

### 2. mcp-submission-agent
Generates server.json files with Portel branding for registry submission.

**Usage:**
```
"Submit the captured MCPs from captured-mcps.csv"
```

**What it does:**
- Reads CSV
- Generates server.json for each MCP
- Adds `dev.portel/curation` metadata
- Saves to `./output/server-jsons/`
- Shows submission instructions

## Complete Workflow

### Step 1: Capture from Multiple Lists

Run capture agent multiple times - deduplication is automatic:

```
"Capture MCPs from https://github.com/punkpeye/awesome-mcp-servers"
"Capture MCPs from https://github.com/wong2/awesome-mcp-servers"
"Capture MCPs from https://github.com/appcypher/awesome-mcp-servers"
```

Each run will:
- ✅ Add new MCPs
- ✅ Skip duplicates (by repository URL)
- ✅ Report counts

### Step 2: Review CSV (Optional)

Edit `captured-mcps.csv` to:
- Fix descriptions
- Adjust categories
- Add missing metadata
- Remove unwanted entries

### Step 3: Generate Submissions

```
"Submit the captured MCPs from captured-mcps.csv"
```

This generates:
- `./output/server-jsons/*.json` files
- Each with Portel branding
- Ready for registry submission

## Deduplication Strategy

**Unique Key:** Repository URL (normalized)

Normalization:
- Convert to lowercase
- Remove trailing slash
- Remove `.git` extension
- Example: `https://GitHub.com/owner/repo/` → `https://github.com/owner/repo`

**Result:**
- Capture from 3 awesome lists with overlap
- Get only unique MCPs in CSV
- No manual deduplication needed

## Portel Branding

Every submission includes:

```json
"_meta": {
  "dev.portel/curation": {
    "version": "1.0",
    "submittedBy": "Portel Registry Team",
    "submittedAt": "2025-10-19T12:00:00Z",
    "source": "https://mcps.portel.dev",
    "apiEndpoint": "https://api.mcps.portel.dev",
    "category": "Developer Tools",
    "tags": ["git", "cli"],
    "verificationStatus": "unverified"
  }
}
```

## Output Files

```
captured-mcps.csv              # Phase 1 output
output/
└── server-jsons/              # Phase 2 output
    ├── io.github.owner_repo1.json
    ├── io.github.owner_repo2.json
    └── ...
```

## Cost

**Both agents use Haiku** - extremely cheap:
- Capture agent: ~$0.01 per awesome list
- Submission agent: ~$0.005 per CSV

Processing 200 MCPs from 3 lists: **~$0.04 total**

## Tips

1. **Capture incrementally**: Run capture agent on new awesome lists as you discover them
2. **Manual review**: Edit CSV before submission to ensure quality
3. **Dry run**: Check generated server.json files before actual submission
4. **Track sources**: CSV includes sourceUrl to track where each MCP came from
