# SimpleMCP Configuration Management

## Overview

SimpleMCP integrates with NCP's robust configuration system to handle credentials, API keys, and persistent settings. This guide explains how to configure your SimpleMCPs properly.

## Core Concepts

### Configuration Types

SimpleMCP supports three types of configuration:

1. **Environment Variables** - Persistent credentials and settings stored in NCP profiles
2. **Parameters** - Runtime values passed when calling tools
3. **Elicitation** - Interactive prompts for sensitive or dynamic values

## Decision Framework: Config vs. Parameter vs. Elicitation

### When to Use Configuration (Environment Variables)

Use environment variables in NCP profiles for:

✅ **Persistent credentials** - API keys, tokens, passwords
✅ **Service endpoints** - URLs, hostnames, ports
✅ **User identity** - Account IDs, usernames, regions
✅ **Shared settings** - Used across multiple tool calls

**Mental model**: Configuration answers "**Who am I?**" and "**How do I authenticate?**"

**Examples**:
- `OPENAI_API_KEY` - Your OpenAI account
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - Your AWS credentials
- `GITHUB_TOKEN` - Your GitHub authentication
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - Your email server
- `DATABASE_URL` - Your database connection

### When to Use Parameters

Use tool parameters for:

✅ **Operation-specific values** - Different each invocation
✅ **User input** - What the user wants to do
✅ **Data to process** - Files, queries, prompts
✅ **Destination/target** - Where to send, what to modify

**Mental model**: Parameters answer "**What do I want to do?**"

**Examples**:
- Webhook URLs (different Slack channels)
- S3 bucket/key names (different files)
- Database queries
- AI prompts
- Email recipients and content
- Search terms, file paths

### When to Use Elicitation

Use elicitation for:

✅ **Sensitive values** - Shouldn't appear in chat logs
✅ **Missing configuration** - Prompt if not pre-configured
✅ **Interactive choices** - User selects from options
✅ **Confirmations** - Approve destructive operations

**Mental model**: Elicitation answers "**What do I need to ask the user right now?**"

**Examples**:
- API key during first-time setup
- Choosing between multiple accounts
- Confirming "delete all data"
- Entering one-time passwords

## Configuration vs. Parameter Examples

### ❌ Bad: Webhook URL as Config

```typescript
// DON'T DO THIS - too rigid
export class Notify {
  async slack(params: { text: string }) {
    // Hardcoded from config - can only send to one channel!
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    await sendToSlack(webhookUrl, params.text);
  }
}

// Usage: Can only send to pre-configured channel
ncp run notify:slack text="Deploy complete"
```

**Problem**: User can't send to different Slack channels without changing config.

### ✅ Good: Webhook URL as Parameter

```typescript
// DO THIS - flexible
export class Notify {
  async slack(params: { webhookUrl: string; text: string }) {
    // User provides webhook URL per invocation
    await sendToSlack(params.webhookUrl, params.text);
  }
}

// Usage: Flexible - can send to any channel
ncp run notify:slack webhookUrl="https://hooks.slack.com/services/T00/B00/XXX" text="Deploy complete"
ncp run notify:slack webhookUrl="https://hooks.slack.com/services/T00/B00/YYY" text="Build failed"
```

**Benefit**: User can send to different channels without reconfiguring.

### ✅ Good: SMTP as Config, Recipients as Parameters

```typescript
// DO THIS - config for persistent, params for variable
export class Notify {
  async email(params: { to: string; subject: string; text: string }) {
    // SMTP settings from config (persistent identity)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Recipients and content from parameters (per-operation)
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
  }
}

// Usage: SMTP configured once, recipients vary per call
ncp run notify:email to="alice@example.com" subject="Alert" text="CPU high"
ncp run notify:email to="bob@example.com" subject="Report" text="Daily summary"
```

## How to Configure SimpleMCPs

### Step 1: Understand Required Environment Variables

Check the MCP's JSDoc comments for `@env` tags:

```typescript
/**
 * AI MCP - Multi-provider AI operations
 *
 * @dependencies openai@^4.0.0, @anthropic-ai/sdk@^0.9.0
 *
 * @env OPENAI_API_KEY - OpenAI API key (required for OpenAI provider)
 * @env ANTHROPIC_API_KEY - Anthropic API key (required for Anthropic provider)
 */
export class AI {
  // ...
}
```

### Step 2: Add SimpleMCP to NCP Profile

SimpleMCPs are internal MCPs loaded automatically, but you need to configure their environment variables.

#### Option A: Edit Profile JSON Directly

Edit `~/.ncp/all.json` (or `.ncp/all.json` for project-local):

```json
{
  "name": "all",
  "mcpServers": {
    "ai": {
      "type": "internal",
      "env": {
        "OPENAI_API_KEY": "_USE_SECURE_STORAGE_",
        "ANTHROPIC_API_KEY": "_USE_SECURE_STORAGE_"
      }
    },
    "cloud": {
      "type": "internal",
      "env": {
        "AWS_ACCESS_KEY_ID": "_USE_SECURE_STORAGE_",
        "AWS_SECRET_ACCESS_KEY": "_USE_SECURE_STORAGE_",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

**Important**: Use `"_USE_SECURE_STORAGE_"` for sensitive values. NCP will:
1. Detect this placeholder
2. Prompt you to enter the actual value
3. Store it securely in OS keychain
4. Load it at runtime

#### Option B: Use Environment Variables Directly

SimpleMCPs can also read from your shell environment:

```bash
# Add to ~/.bashrc or ~/.zshrc
export OPENAI_API_KEY="sk-..."
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
```

Then run NCP:
```bash
ncp run ai:complete prompt="Hello" provider=openai
```

### Step 3: Store Credentials Securely

NCP automatically uses the **SecureCredentialStore** which:

- **macOS**: Stores in Keychain
- **Windows**: Stores in Credential Manager
- **Linux**: Stores in Secret Service (or encrypted file)

When you use `"_USE_SECURE_STORAGE_"`:
1. First run prompts for the actual value
2. Value is stored in OS keychain
3. Profile JSON never contains plain-text credentials
4. NCP loads credentials at runtime

### Step 4: Verify Configuration

Check that your MCP can access credentials:

```bash
# This will fail with clear error if credentials missing
ncp run ai:complete prompt="Hello" provider=openai

# Error message should guide you:
# "OPENAI_API_KEY not configured. Set it in your NCP profile..."
```

## Configuration Patterns by MCP Type

### Credentials-Heavy MCPs (AI, Cloud, GitHub)

**Configure**:
- API keys
- Access tokens
- Service credentials

**Pass as parameters**:
- Prompts
- File paths
- Resource names

**Example: AI MCP**

```json
// Profile config
{
  "ai": {
    "type": "internal",
    "env": {
      "OPENAI_API_KEY": "_USE_SECURE_STORAGE_",
      "ANTHROPIC_API_KEY": "_USE_SECURE_STORAGE_"
    }
  }
}
```

```bash
# Usage - credentials from config, prompt as parameter
ncp run ai:complete prompt="Explain quantum computing" provider=openai
ncp run ai:vision imageUrl="https://..." question="What's this?" provider=anthropic
```

### Service-Heavy MCPs (Notify)

**Configure**:
- SMTP server settings
- Default email sender

**Pass as parameters**:
- Webhook URLs (different channels)
- Recipients
- Message content

**Example: Notify MCP**

```json
// Profile config - persistent SMTP settings
{
  "notify": {
    "type": "internal",
    "env": {
      "SMTP_HOST": "smtp.gmail.com",
      "SMTP_PORT": "587",
      "SMTP_USER": "bot@company.com",
      "SMTP_PASS": "_USE_SECURE_STORAGE_",
      "SMTP_FROM": "noreply@company.com"
    }
  }
}
```

```bash
# Email uses SMTP config
ncp run notify:email to="user@example.com" subject="Alert" text="CPU high"

# Slack webhook as parameter (flexible per call)
ncp run notify:slack webhookUrl="https://hooks.slack.com/..." text="Deploy done"
```

### Minimal Configuration MCPs (Database, Scraper)

**Configure**: Optional default connection strings

**Pass as parameters**: Everything else

**Example: Database MCP**

```typescript
// No required config! Everything passed as parameters
ncp run database:query dbPath="./data.db" query="SELECT * FROM users"
ncp run database:postgres connectionString="postgresql://..." query="SELECT 1"
```

**Why no config?** Database MCP supports multiple databases, so connection info is operation-specific.

### Zero Configuration MCPs (Utilities)

**Configure**: Nothing

**Pass as parameters**: All inputs

**Example: String, Math, Encode MCPs**

```bash
# No config needed - pure functions
ncp run string:slugify text="Hello World"
ncp run math:random min=1 max=100
ncp run encode:base64 text="Hello" action=encode
```

## Security Best Practices

### 1. Never Hardcode Secrets

```typescript
// ❌ DON'T DO THIS
const API_KEY = "sk-1234567890abcdef";  // Exposed in source code!

// ✅ DO THIS
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  throw new Error('OPENAI_API_KEY not configured');
}
```

### 2. Use Secure Credential Storage

```json
// ❌ DON'T DO THIS - plain text in profile
{
  "env": {
    "OPENAI_API_KEY": "sk-1234567890abcdef"
  }
}

// ✅ DO THIS - secure storage reference
{
  "env": {
    "OPENAI_API_KEY": "_USE_SECURE_STORAGE_"
  }
}
```

### 3. Mark Sensitive Parameters

If you must accept sensitive values as parameters, document it:

```typescript
/**
 * Upload with temporary credentials
 * @param accessKeyId Temporary AWS access key (SENSITIVE - do not log)
 * @param secretAccessKey Temporary AWS secret key (SENSITIVE - do not log)
 */
async uploadTemp(params: { accessKeyId: string; secretAccessKey: string; ... }) {
  // Use params.accessKeyId, params.secretAccessKey
}
```

### 4. Provide Clear Error Messages

```typescript
// ✅ Good - guides user to solution
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY not configured.\n' +
    'Add it to your NCP profile:\n' +
    '  ~/.ncp/all.json\n' +
    '  "env": { "OPENAI_API_KEY": "_USE_SECURE_STORAGE_" }'
  );
}

// ❌ Bad - cryptic error
if (!process.env.OPENAI_API_KEY) {
  throw new Error('API key missing');
}
```

## Environment Variable Naming Conventions

### Follow Standard Patterns

- **API Keys**: `{SERVICE}_API_KEY` (e.g., `OPENAI_API_KEY`, `GITHUB_API_KEY`)
- **Tokens**: `{SERVICE}_TOKEN` (e.g., `GITHUB_TOKEN`, `SLACK_TOKEN`)
- **Credentials**: `{SERVICE}_{CREDENTIAL_TYPE}` (e.g., `AWS_ACCESS_KEY_ID`, `SMTP_USER`)
- **URLs**: `{SERVICE}_URL` (e.g., `DATABASE_URL`, `REDIS_URL`)
- **Connection Strings**: `{SERVICE}_CONNECTION_STRING` (e.g., `AZURE_STORAGE_CONNECTION_STRING`)

### Use Descriptive Names

```typescript
// ✅ Good - clear what it's for
OPENAI_API_KEY
AWS_ACCESS_KEY_ID
SMTP_HOST

// ❌ Bad - ambiguous
API_KEY        // Which API?
KEY_ID         // What kind of key?
HOST           // Which service?
```

## Global vs. Project-Local Configuration

### Global Configuration (`~/.ncp/`)

Use for:
- Personal credentials (your GitHub token, OpenAI key)
- MCPs used across all projects
- User-level settings

```bash
# Location
~/.ncp/all.json

# Available to all projects
ncp run ai:complete prompt="Hello" provider=openai
```

### Project-Local Configuration (`.ncp/`)

Use for:
- Project-specific credentials (test accounts, staging keys)
- Project-specific MCPs
- Team shared settings (checked into git with placeholders)

```bash
# Location
.ncp/all.json

# Only available in this project directory
cd /path/to/project
ncp run ai:complete prompt="Hello" provider=openai
```

### Configuration Priority

NCP merges configurations in this order (last wins):
1. Global config (`~/.ncp/all.json`)
2. Project-local config (`.ncp/all.json`)
3. Shell environment variables (`export VAR=value`)

## Validation and Error Handling

### Validate Configuration at Runtime

```typescript
export class AI {
  private validateConfig(provider: 'openai' | 'anthropic'): string {
    const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    const apiKey = process.env[envVar];

    if (!apiKey) {
      throw new Error(
        `${envVar} not configured.\n\n` +
        `To configure:\n` +
        `1. Edit ~/.ncp/all.json\n` +
        `2. Add to env section:\n` +
        `   "env": {\n` +
        `     "${envVar}": "_USE_SECURE_STORAGE_"\n` +
        `   }\n` +
        `3. Run any AI tool - you'll be prompted for the key\n` +
        `4. Key will be stored securely in OS keychain`
      );
    }

    return apiKey;
  }

  async complete(params: { prompt: string; provider: 'openai' | 'anthropic' }) {
    const apiKey = this.validateConfig(params.provider);
    // Use apiKey...
  }
}
```

### Use Config Helpers

```typescript
import { requireEnv, optionalEnv } from './config-helpers.js';

export class Cloud {
  async s3Upload(params: { bucket: string; key: string; content: string }) {
    // Throws clear error if not configured
    const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID', 'AWS credentials required for S3 operations');
    const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');

    // Optional with default
    const region = optionalEnv('AWS_REGION', 'us-east-1');

    // Use credentials...
  }
}
```

## Configuration Examples

### Example 1: AI MCP

```json
{
  "mcpServers": {
    "ai": {
      "type": "internal",
      "env": {
        "OPENAI_API_KEY": "_USE_SECURE_STORAGE_",
        "ANTHROPIC_API_KEY": "_USE_SECURE_STORAGE_"
      }
    }
  }
}
```

```bash
# Both providers configured
ncp run ai:complete prompt="Hello" provider=openai
ncp run ai:complete prompt="Hello" provider=anthropic
ncp run ai:similarity text1="cat" text2="kitten"
```

### Example 2: Cloud MCP (Multi-provider)

```json
{
  "mcpServers": {
    "cloud": {
      "type": "internal",
      "env": {
        "AWS_ACCESS_KEY_ID": "_USE_SECURE_STORAGE_",
        "AWS_SECRET_ACCESS_KEY": "_USE_SECURE_STORAGE_",
        "AWS_REGION": "us-east-1",
        "GCP_PROJECT_ID": "my-project",
        "GCP_CREDENTIALS": "_USE_SECURE_STORAGE_",
        "AZURE_STORAGE_CONNECTION_STRING": "_USE_SECURE_STORAGE_"
      }
    }
  }
}
```

```bash
# All cloud providers configured
ncp run cloud:s3-upload bucket="my-bucket" key="file.txt" content="..."
ncp run cloud:gcs-upload bucket="my-bucket" filename="file.txt" content="..."
ncp run cloud:azure-upload container="my-container" blobName="file.txt" content="..."
```

### Example 3: Notify MCP

```json
{
  "mcpServers": {
    "notify": {
      "type": "internal",
      "env": {
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "bot@company.com",
        "SMTP_PASS": "_USE_SECURE_STORAGE_",
        "SMTP_FROM": "noreply@company.com"
      }
    }
  }
}
```

```bash
# SMTP configured, webhooks as parameters
ncp run notify:email to="user@example.com" subject="Alert" text="Server down"
ncp run notify:slack webhookUrl="https://..." text="Deploy complete"
ncp run notify:discord webhookUrl="https://..." content="Build #42 succeeded"
```

## Troubleshooting

### "Environment variable not set" error

**Problem**: MCP can't find required environment variable

**Solution**:
1. Check your profile JSON has the env var defined
2. Verify you're using the correct profile (`ncp profile list`, `ncp profile use <name>`)
3. If using `_USE_SECURE_STORAGE_`, make sure you entered the value when prompted

### Credentials not loading

**Problem**: `_USE_SECURE_STORAGE_` not working

**Solution**:
1. Check secure credential store is accessible
2. Try setting plain-text value temporarily (then NCP auto-migrates to secure storage)
3. Check NCP logs for credential loading errors

### Wrong profile being used

**Problem**: Config defined but not being used

**Solution**:
```bash
# Check active profile
ncp profile list

# Switch to correct profile
ncp profile use all

# Verify config
cat ~/.ncp/all.json  # or .ncp/all.json
```

### Parameter vs. config confusion

**Problem**: Not sure whether to use config or parameter

**Ask yourself**:
- Does this value change every invocation? → **Parameter**
- Is this a credential or persistent setting? → **Config**
- Could the user want to use different values without reconfiguring? → **Parameter**

## Summary

### Configuration Checklist

- [ ] Identify required environment variables (check JSDoc `@env` tags)
- [ ] Add env vars to NCP profile (`~/.ncp/all.json` or `.ncp/all.json`)
- [ ] Use `_USE_SECURE_STORAGE_` for sensitive values
- [ ] Test MCP - verify clear error messages if config missing
- [ ] Document configuration in MCP's JSDoc comments

### Quick Reference

| Concern | Use Config | Use Parameter | Use Elicitation |
|---------|------------|---------------|-----------------|
| **What** | Credentials, persistent settings | Operation inputs | Interactive/sensitive |
| **When** | Set once, use many times | Different each call | When needed |
| **Where** | NCP profile JSON + OS keychain | Tool call parameters | Runtime dialog |
| **Example** | API keys, SMTP server | Prompts, file paths | Missing API key |

Happy configuring! 🔒
