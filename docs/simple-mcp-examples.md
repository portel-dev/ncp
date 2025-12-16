# SimpleMCP Complex Examples

This document showcases advanced SimpleMCP examples that demonstrate the true power of the system. All examples follow the **convention-over-configuration** philosophy - no base classes, no decorators, just plain TypeScript classes with async methods.

## Overview

SimpleMCP allows you to create powerful MCPs using:
- **Plain TypeScript classes** - No framework coupling
- **Automatic dependency installation** - Declare in `@dependencies` JSDoc tag
- **Dynamic imports** - Use `await import()` for dependencies
- **Convention-based routing** - Method names → tool names

## Complex Examples

### 1. AI MCP - Multi-Provider AI Operations

**File**: `src/internal-mcps/examples/ai.mcp.ts`

**Features**:
- Multiple AI providers (OpenAI, Anthropic)
- Text completion with configurable models
- Vision/image analysis
- Embeddings generation
- Semantic similarity calculation

**Dependencies**: `openai@^4.0.0, @anthropic-ai/sdk@^0.9.0`

**Example Usage**:
```bash
# Generate text completion
ncp run ai complete --prompt "Explain quantum computing" --provider openai

# Analyze image
ncp run ai vision --imageUrl "https://example.com/image.jpg" --question "What's in this image?" --provider anthropic

# Calculate semantic similarity
ncp run ai similarity --text1 "cat" --text2 "kitten"
```

**Key Methods**:
- `complete()` - Text generation from OpenAI or Anthropic
- `vision()` - Image analysis with GPT-4 Vision or Claude
- `embed()` - Generate embeddings for semantic search
- `similarity()` - Calculate cosine similarity between texts

### 2. Database MCP - SQL Operations

**File**: `src/internal-mcps/examples/database.mcp.ts`

**Features**:
- SQLite for local data
- PostgreSQL for production databases
- Query builder for complex queries
- Transaction support
- Backup/restore functionality

**Dependencies**: `better-sqlite3@^9.0.0, pg@^8.11.0, knex@^3.0.0`

**Example Usage**:
```bash
# Create table
ncp run database create-table --dbPath "./data.db" --tableName "users" --columns '{"id":"INTEGER PRIMARY KEY","name":"TEXT","email":"TEXT"}'

# Insert data
ncp run database insert --dbPath "./data.db" --tableName "users" --data '{"name":"Alice","email":"alice@example.com"}'

# Query with conditions
ncp run database find --dbPath "./data.db" --table "users" --where '{"name":"Alice"}' --limit 10

# Backup database to JSON
ncp run database backup --dbPath "./data.db"
```

**Key Methods**:
- `query()` - Execute raw SQL queries
- `createTable()` - Create tables dynamically
- `insert()` - Batch insert with transactions
- `find()` - Query builder with WHERE/ORDER/LIMIT
- `postgres()` - PostgreSQL operations
- `backup()` / `restore()` - Database backup to JSON

### 3. Notify MCP - Multi-Platform Notifications

**File**: `src/internal-mcps/examples/notify.mcp.ts`

**Features**:
- Slack webhooks with rich formatting
- Discord embeds
- Email via SMTP
- Microsoft Teams cards
- Broadcast to multiple platforms

**Dependencies**: `@slack/webhook@^7.0.0, discord.js@^14.14.0, nodemailer@^6.9.0, axios@^1.6.0`

**Example Usage**:
```bash
# Send Slack message
ncp run notify slack --webhookUrl "https://hooks.slack.com/..." --text "Deployment complete!"

# Rich Discord embed
ncp run notify discord-rich --webhookUrl "https://discord.com/api/webhooks/..." --title "Build Status" --description "Build #42 succeeded" --color "#00ff00"

# Send email
ncp run notify email --to "user@example.com" --subject "Alert" --text "Server CPU usage high"

# Broadcast to all platforms
ncp run notify broadcast --message "System update at 3pm" --platforms '{"slack":{"webhookUrl":"..."},"discord":{"webhookUrl":"..."}}'
```

**Key Methods**:
- `slack()` - Simple Slack messages
- `slackRich()` - Formatted Slack messages with blocks
- `discord()` / `discordRich()` - Discord webhooks
- `email()` - SMTP email
- `teams()` - Microsoft Teams webhooks
- `broadcast()` - Send to multiple platforms, collect results

### 4. Scraper MCP - Web Scraping & Browser Automation

**File**: `src/internal-mcps/examples/scraper.mcp.ts`

**Features**:
- Headless browser control (Puppeteer)
- Screenshot capture
- Form automation
- Dynamic content extraction
- PDF generation from pages
- Page monitoring for changes

**Dependencies**: `puppeteer@^21.0.0, cheerio@^1.0.0, axios@^1.6.0`

**Example Usage**:
```bash
# Extract content from webpage
ncp run scraper extract --url "https://news.ycombinator.com" --selector ".titleline"

# Take screenshot
ncp run scraper screenshot --url "https://example.com" --fullPage true

# Fill and submit form
ncp run scraper fill-form --url "https://example.com/login" --formData '{"#username":"user","#password":"pass"}' --submitSelector "#login-btn"

# Generate PDF from webpage
ncp run scraper to-pdf --url "https://example.com" --landscape true

# Monitor page for changes
ncp run scraper monitor --url "https://example.com/status" --selector ".status" --interval 60 --maxChecks 10
```

**Key Methods**:
- `extract()` - Extract text from pages with CSS selectors
- `screenshot()` - Capture screenshots (viewport or full page)
- `fillForm()` - Automate form submissions
- `execute()` - Run JavaScript on pages
- `monitor()` - Watch pages for changes over time
- `toPdf()` - Generate PDFs from webpages
- `extractLinks()` - Extract all links with filtering

### 5. Cloud MCP - Multi-Cloud Storage

**File**: `src/internal-mcps/examples/cloud.mcp.ts`

**Features**:
- AWS S3 operations
- Google Cloud Storage
- Azure Blob Storage
- Unified interface across providers
- Multi-cloud upload (upload to all at once)

**Dependencies**: `@aws-sdk/client-s3@^3.0.0, @google-cloud/storage@^7.0.0, @azure/storage-blob@^12.0.0`

**Example Usage**:
```bash
# Upload to S3
ncp run cloud s3-upload --bucket "my-bucket" --key "files/data.txt" --content "SGVsbG8gV29ybGQ=" --contentType "text/plain"

# Download from S3
ncp run cloud s3-download --bucket "my-bucket" --key "files/data.txt"

# List S3 files
ncp run cloud s3-list --bucket "my-bucket" --prefix "files/"

# Upload to Google Cloud Storage
ncp run cloud gcs-upload --bucket "my-bucket" --filename "data.txt" --content "SGVsbG8gV29ybGQ="

# Upload to Azure
ncp run cloud azure-upload --container "my-container" --blobName "data.txt" --content "SGVsbG8gV29ybGQ="

# Multi-cloud upload (all providers)
ncp run cloud multi-upload --filename "backup.zip" --content "..." --providers '{"s3":{"bucket":"...","key":"..."},"gcs":{"bucket":"...","filename":"..."}}'
```

**Key Methods**:
- `s3Upload()` / `s3Download()` / `s3List()` - AWS S3 operations
- `gcsUpload()` / `gcsDownload()` - Google Cloud Storage
- `azureUpload()` / `azureDownload()` - Azure Blob Storage
- `multiUpload()` - Upload to all providers simultaneously

### 6. Document MCP - Document Generation

**File**: `src/internal-mcps/examples/document.mcp.ts`

**Features**:
- PDF generation
- Excel/CSV processing
- Word document creation
- Template rendering (Mustache)
- Invoice generation
- Report generation

**Dependencies**: `pdfkit@^0.13.0, exceljs@^4.3.0, docx@^8.0.0, mustache@^4.2.0, csv-parse@^5.5.0`

**Example Usage**:
```bash
# Create PDF
ncp run document create-pdf --content "Hello World" --title "My Document" --orientation portrait

# Create Excel spreadsheet
ncp run document create-excel --sheets '{"Sheet1":[{"name":"Alice","age":30},{"name":"Bob","age":25}]}' --filename "data.xlsx"

# Parse CSV
ncp run document parse-csv --content "name,age\nAlice,30\nBob,25"

# Convert to CSV
ncp run document to-csv --data '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'

# Create Word document
ncp run document create-word --title "Report" --sections '[{"heading":"Introduction","content":"This is..."}]'

# Render Mustache template
ncp run document render-template --template "Hello {{name}}!" --data '{"name":"World"}'

# Generate invoice
ncp run document create-invoice --invoiceNumber "INV-001" --date "2024-01-15" --from '{"name":"..."}' --to '{"name":"..."}' --items '[{"description":"...","quantity":1,"price":100}]'
```

**Key Methods**:
- `createPdf()` - Generate PDF from text
- `createExcel()` - Generate Excel spreadsheets
- `parseExcel()` - Parse Excel files
- `parseCsv()` / `toCsv()` - CSV operations
- `createWord()` - Generate Word documents
- `renderTemplate()` - Mustache template rendering
- `createInvoice()` - Professional invoice PDFs
- `createReport()` - Data report PDFs with tables

## Architecture Highlights

### No Base Class Required

All examples are **plain TypeScript classes**:

```typescript
/**
 * @dependencies axios@^1.0.0
 */
export class MyMCP {  // No extends SimpleMCP!
  async doSomething(params: { input: string }) {
    const axios = (await import('axios')).default;
    // ...
  }
}
```

### Automatic Dependency Installation

Dependencies declared in JSDoc are **automatically installed**:

```typescript
/**
 * @dependencies package1@^1.0.0, package2@^2.0.0
 */
```

SimpleMCP:
1. Extracts dependency declarations
2. Creates MCP-specific cache: `~/.ncp/mcp-cache/{mcp-name}/`
3. Runs `npm install` in cache directory
4. Dynamic imports work seamlessly

### Dynamic Imports

Use `await import()` to load auto-installed dependencies:

```typescript
// ✅ Good - dynamic import
const axios = (await import('axios')).default;
const { format } = await import('date-fns');

// ❌ Bad - top-level imports won't find dependencies
import axios from 'axios';
```

### Convention-Based Routing

- Class name → MCP name: `class GitHub` → `github` MCP
- Method name → Tool name: `async createIssue()` → `github:create-issue`
- JSDoc comments → Tool descriptions
- TypeScript types → Parameter schemas

## Use Cases by Category

### Integration & Automation
- **AI MCP**: Integrate multiple AI providers
- **Notify MCP**: Multi-platform notifications
- **Cloud MCP**: Multi-cloud file storage

### Data Processing
- **Database MCP**: SQL operations and backups
- **Document MCP**: Generate/process PDFs, Excel, Word
- **Scraper MCP**: Extract data from websites

### DevOps & Monitoring
- **Scraper MCP**: Monitor website changes
- **Cloud MCP**: Backup to multiple clouds
- **Notify MCP**: Alert on events

### Document Workflows
- **Document MCP**: Invoices, reports, spreadsheets
- **AI MCP**: Generate content
- **Cloud MCP**: Store documents

## Development Workflow

### 1. Create MCP File

```bash
# Global (available everywhere)
nano ~/.ncp/internal/my-mcp.mcp.ts

# Project-local (only this project)
nano .ncp/internal/my-mcp.mcp.ts
```

### 2. Write Plain TypeScript Class

```typescript
/**
 * My MCP - Description
 *
 * @dependencies axios@^1.6.0
 */
export class MyMCP {
  async myTool(params: { input: string }) {
    const axios = (await import('axios')).default;
    // Implementation
    return { result: 'success' };
  }
}
```

### 3. Test It

```bash
# Auto-discovers and loads
ncp find "my tool"

# Run it (dependencies auto-install on first run)
ncp run my-mcp:my-tool input="test"
```

### 4. Iterate

- Edit the file
- Run `ncp run` again (auto-reloads)
- No build step needed!

## Best Practices

### 1. Use Descriptive Names

```typescript
// ✅ Good
async convertCurrency(params: { amount: number; from: string; to: string })

// ❌ Bad
async convert(params: { a: number; f: string; t: string })
```

### 2. Add JSDoc Comments

```typescript
/**
 * Convert currency using live exchange rates
 * @param amount Amount to convert
 * @param from Source currency code (USD, EUR, etc.)
 * @param to Target currency code
 */
async convertCurrency(params: { amount: number; from: string; to: string })
```

### 3. Handle Errors Gracefully

```typescript
async getData(params: { url: string }) {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(params.url);
    return response.data;
  } catch (error: any) {
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}
```

### 4. Return Structured Data

```typescript
// ✅ Good - structured
return {
  success: true,
  data: [...],
  count: 5,
  metadata: { ... }
};

// ❌ Bad - just raw data
return [...];
```

### 5. Use Environment Variables for Credentials

```typescript
async upload(params: { file: string }) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY environment variable not set');
  }
  // ...
}
```

## Summary

SimpleMCP enables building powerful, production-ready MCPs with:

- **Zero configuration** - No setup, no build tools
- **Automatic dependencies** - Just declare and use
- **Pure TypeScript** - No framework lock-in
- **Instant reload** - Edit and test immediately
- **Type safety** - Full TypeScript type checking
- **Convention-based** - Minimal boilerplate

These 6 complex examples demonstrate real-world integrations that would traditionally require significant infrastructure and configuration. With SimpleMCP, they're just TypeScript classes with auto-installed dependencies.

**Total Lines of Code**: ~2,500 lines
**Unique npm Packages**: 20+
**Capabilities**: AI, Databases, Notifications, Web Scraping, Cloud Storage, Document Processing

All accessible through a simple convention: `ncp run mcp-name tool-name`
