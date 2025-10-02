# Configuration Schema Integration in NCP

## Overview

NCP now reads and uses `configurationSchema` from MCP servers to provide interactive, guided configuration during `ncp add` and `ncp repair` commands.

## Architecture (Consumer Side)

### What NCP Does
✅ **READS** configuration schemas from MCP servers
✅ **CACHES** schemas for reuse
✅ **PROMPTS** users interactively based on schema
✅ **VALIDATES** user input against schema requirements

### What NCP Does NOT Do
❌ Generate schemas for other MCP repos (that's ecosystem work)
❌ Marketing/PR campaign tools
❌ Schema generators for external use

## Core Services

### 1. ConfigSchemaReader (`src/services/config-schema-reader.ts`)

**Purpose**: Extract and parse `configurationSchema` from MCP `InitializeResult`

**Usage**:
```typescript
import { ConfigSchemaReader } from './services/config-schema-reader.js';

const reader = new ConfigSchemaReader();

// Extract schema from InitializeResult
const schema = reader.readSchema(initResult);

// Check if configuration is required
if (reader.hasRequiredConfig(schema)) {
  const required = reader.getRequiredParameters(schema);
  console.log(`Needs: ${required.map(p => p.name).join(', ')}`);
}

// Format for display
console.log(reader.formatSchema(schema));
```

### 2. ConfigPrompter (`src/services/config-prompter.ts`)

**Purpose**: Interactively prompt users for configuration values

**Usage**:
```typescript
import { ConfigPrompter } from './services/config-prompter.js';

const prompter = new ConfigPrompter();

// Prompt for all required configuration
const config = await prompter.promptForConfig(schema, 'github');

// Result:
// {
//   environmentVariables: { GITHUB_TOKEN: 'ghp_xxx' },
//   arguments: [],
//   other: {}
// }

// Display summary before saving
prompter.displaySummary(config, 'github');
```

## Integration Points

### During `ncp add` (with Fallback Strategy)

**Two-Tier Detection Flow**:
```typescript
// 1. User runs: ncp add github npx @modelcontextprotocol/server-github

let config: ConfigValues | null = null;

try {
  // 2. Try to connect to MCP
  await client.initialize();

  // 3. STRATEGY 1: Check for configurationSchema (PREFERRED)
  const schema = reader.readSchema(initResult);

  if (schema && reader.hasRequiredConfig(schema)) {
    console.log('✓ Configuration schema detected!');

    // 4. Use schema-based prompting
    config = await prompter.promptForConfig(schema, mcpName);

    // 5. Cache schema for future use
    schemaCache.save(mcpName, schema);

    console.log('✓ Configuration validated using schema');
  } else {
    // No required config, proceed normally
    console.log('✓ No configuration required');
  }

} catch (error) {
  // 6. STRATEGY 2: Fallback to error parsing (LEGACY)
  console.log('⚠️  Connection failed, analyzing error...');

  const needs = errorParser.parseError(mcpName, error.stderr, error.exitCode);

  if (needs.length > 0) {
    console.log(`⚠️  Detected ${needs.length} configuration need(s) from error`);

    // Use error-based prompting (existing MCPErrorParser flow)
    config = await promptForErrorBasedConfig(needs);

    console.log('✓ Configuration detected from error patterns');
  } else {
    throw new Error(`Failed to connect: ${error.message}`);
  }
}

// 7. Save to profile
if (config) {
  profileManager.addMCP(mcpName, {
    command,
    args: config.arguments,
    env: config.environmentVariables
  });
}
```

### During `ncp repair`

**Enhanced Flow**:
```typescript
// 1. Load failed MCP
const failedMCP = healthMonitor.getUnhealthyMCPs()[0];

// 2. Check if we have cached schema
const cachedSchema = schemaCache.get(failedMCP.name);

if (cachedSchema) {
  console.log('✓ Using cached configuration schema');
  const config = await prompter.promptForConfig(cachedSchema, failedMCP.name);
  // ... update profile
} else {
  // Fallback to error parsing
  const needs = errorParser.parseError(failedMCP.name, failedMCP.errorMessage, 1);
  // ... existing repair flow
}
```

## Schema Cache Integration

**File**: `src/cache/schema-cache.ts` (to be created)

```typescript
export class SchemaCache {
  private cacheDir: string;

  /**
   * Save schema to cache
   */
  save(mcpName: string, schema: ConfigurationSchema): void {
    const filepath = path.join(this.cacheDir, `${mcpName}.schema.json`);
    fs.writeFileSync(filepath, JSON.stringify(schema, null, 2));
  }

  /**
   * Load schema from cache
   */
  get(mcpName: string): ConfigurationSchema | null {
    const filepath = path.join(this.cacheDir, `${mcpName}.schema.json`);
    if (!fs.existsSync(filepath)) return null;

    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Check if schema is cached
   */
  has(mcpName: string): boolean {
    const filepath = path.join(this.cacheDir, `${mcpName}.schema.json`);
    return fs.existsSync(filepath);
  }
}
```

## User Experience

### Before (Without Schema)
```bash
$ ncp add github npx @modelcontextprotocol/server-github
❌ Connection failed: Error -32000
⚠️  Detected from error: needs GITHUB_TOKEN
Enter GITHUB_TOKEN: [user has to figure out what this is]
```

### After (With Schema)
```bash
$ ncp add github npx @modelcontextprotocol/server-github
✓ Configuration schema detected!

📋 Configuration needed for github:

Environment Variables:
  GITHUB_TOKEN: (required) [sensitive]
    GitHub personal access token with repo permissions
    Pattern: ^ghp_[a-zA-Z0-9]{36}$

Enter GITHUB_TOKEN: ********

✓ Configuration for github:
  Environment Variables:
    GITHUB_TOKEN=********

✓ Saved to profile
✓ Schema cached for future use
```

## Benefits

### For NCP
1. **Better UX**: Clear, guided configuration
2. **Fewer failures**: Validation before connection
3. **Smarter repair**: Use cached schemas
4. **Protocol compliant**: Follows MCP spec

### For Users
1. **Know what's needed upfront**
2. **Validated input** (pattern matching, type checking)
3. **Examples and descriptions** inline
4. **Sensitive data handled** (masked input)

## Separation of Concerns

### Main NCP Repository
- ✅ Read and use configuration schemas
- ✅ Interactive prompting
- ✅ Schema caching
- ✅ Integration with add/repair commands

### Separate Tooling (contrib/)
- PR campaign strategy
- Schema generation for other repos
- Target identification
- Marketing materials

**Moved to**: `contrib/` directory (not part of core product)

## Next Steps

1. ✅ Create ConfigSchemaReader
2. ✅ Create ConfigPrompter
3. ⏳ Create SchemaCache
4. ⏳ Integrate into `ncp add` command
5. ⏳ Integrate into `ncp repair` command
6. ⏳ Add tests for schema handling
7. ⏳ Update documentation

## Related

- **MCP Spec PR**: https://github.com/modelcontextprotocol/specification/pull/1583
- **Session ID Transparency**: docs/session-id-transparency.md
- **MCP Error Parser**: src/utils/mcp-error-parser.ts
