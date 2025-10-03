# NCP Registry Command Architecture

## Overview

The `ncp registry` command would integrate MCP Registry functionality directly into the NCP CLI, enabling users to:
- Search and discover MCP servers from the registry
- Auto-configure servers from registry metadata
- Export configurations to different platforms
- Validate local configurations against registry schemas

## Architecture

### Command Structure

```
ncp registry [subcommand] [options]

Subcommands:
  search <query>        Search for MCP servers in the registry
  info <server-name>    Show detailed info about a server
  add <server-name>     Add server from registry to local profile
  export <format>       Export NCP config to Claude/Cline/Continue format
  validate              Validate local server.json against registry
  sync                  Sync all registry-sourced servers to latest versions
```

### How It Works

#### 1. **Registry API Integration**

```typescript
// src/services/registry-client.ts
export class RegistryClient {
  private baseURL = 'https://registry.modelcontextprotocol.io/v0';

  async search(query: string): Promise<ServerSearchResult[]> {
    // Search registry by name/description
    const response = await fetch(`${this.baseURL}/servers?limit=50`);
    const data = await response.json();

    // Filter results by query
    return data.servers.filter(s =>
      s.server.name.includes(query) ||
      s.server.description.includes(query)
    );
  }

  async getServer(serverName: string): Promise<RegistryServer> {
    const encoded = encodeURIComponent(serverName);
    const response = await fetch(`${this.baseURL}/servers/${encoded}`);
    return response.json();
  }

  async getVersions(serverName: string): Promise<ServerVersion[]> {
    const encoded = encodeURIComponent(serverName);
    const response = await fetch(`${this.baseURL}/servers/${encoded}/versions`);
    return response.json();
  }
}
```

#### 2. **CLI Command Implementation**

```typescript
// src/cli/commands/registry.ts
import { Command } from 'commander';
import { RegistryClient } from '../../services/registry-client.js';

export function createRegistryCommand(): Command {
  const registry = new Command('registry')
    .description('Interact with the MCP Registry');

  // Search command
  registry
    .command('search <query>')
    .description('Search for MCP servers')
    .option('-l, --limit <number>', 'Max results', '10')
    .action(async (query, options) => {
      const client = new RegistryClient();
      const results = await client.search(query);

      console.log(`\n🔍 Found ${results.length} servers:\n`);
      results.slice(0, parseInt(options.limit)).forEach(r => {
        console.log(`📦 ${r.server.name}`);
        console.log(`   ${r.server.description}`);
        console.log(`   Version: ${r.server.version}`);
        console.log(`   Status: ${r._meta['io.modelcontextprotocol.registry/official'].status}\n`);
      });
    });

  // Info command
  registry
    .command('info <server-name>')
    .description('Show detailed server information')
    .action(async (serverName) => {
      const client = new RegistryClient();
      const server = await client.getServer(serverName);

      console.log(`\n📦 ${server.server.name}\n`);
      console.log(`Description: ${server.server.description}`);
      console.log(`Version: ${server.server.version}`);
      console.log(`Repository: ${server.server.repository?.url || 'N/A'}`);

      if (server.server.packages?.[0]) {
        const pkg = server.server.packages[0];
        console.log(`\nPackage: ${pkg.identifier}@${pkg.version}`);
        console.log(`Install: ${pkg.runtimeHint || 'npx'} ${pkg.identifier}`);

        if (pkg.environmentVariables?.length) {
          console.log(`\nEnvironment Variables:`);
          pkg.environmentVariables.forEach(env => {
            console.log(`  - ${env.name}${env.isRequired ? ' (required)' : ''}`);
            console.log(`    ${env.description}`);
            if (env.default) console.log(`    Default: ${env.default}`);
          });
        }
      }
    });

  // Add command
  registry
    .command('add <server-name>')
    .description('Add server from registry to local profile')
    .option('--profile <name>', 'Profile to add to', 'default')
    .action(async (serverName, options) => {
      const client = new RegistryClient();
      const registryServer = await client.getServer(serverName);
      const pkg = registryServer.server.packages?.[0];

      if (!pkg) {
        console.error('❌ No package information in registry');
        return;
      }

      // Build command from registry metadata
      const command = pkg.runtimeHint || 'npx';
      const args = [pkg.identifier];

      // Add to local profile using existing add logic
      const profileManager = new ProfileManager();
      const profile = profileManager.loadProfile(options.profile);

      const shortName = extractShortName(serverName);
      profile.mcpServers[shortName] = {
        command,
        args,
        env: buildEnvFromRegistry(pkg)
      };

      profileManager.saveProfile(options.profile, profile);
      console.log(`✅ Added ${shortName} to profile '${options.profile}'`);
      console.log(`\nConfiguration:`);
      console.log(JSON.stringify(profile.mcpServers[shortName], null, 2));
    });

  // Export command
  registry
    .command('export <format>')
    .description('Export NCP config to other formats')
    .option('--profile <name>', 'Profile to export', 'default')
    .action(async (format, options) => {
      const profileManager = new ProfileManager();
      const profile = profileManager.loadProfile(options.profile);

      switch (format.toLowerCase()) {
        case 'claude':
          console.log(JSON.stringify({ mcpServers: profile.mcpServers }, null, 2));
          break;
        case 'cline':
          console.log(JSON.stringify({ mcpServers: profile.mcpServers }, null, 2));
          break;
        case 'continue':
          const continueFormat = {
            mcpServers: Object.entries(profile.mcpServers).map(([name, config]) => ({
              name,
              ...config
            }))
          };
          console.log(JSON.stringify(continueFormat, null, 2));
          break;
        default:
          console.error(`❌ Unknown format: ${format}`);
          console.log('Supported formats: claude, cline, continue');
      }
    });

  // Validate command
  registry
    .command('validate')
    .description('Validate local server.json against registry schema')
    .action(async () => {
      const serverJson = JSON.parse(fs.readFileSync('server.json', 'utf-8'));

      // Fetch schema from registry
      const schemaURL = serverJson.$schema;
      const response = await fetch(schemaURL);
      const schema = await response.json();

      // Validate using ajv or similar
      console.log('✅ Validating server.json...');
      // ... validation logic
    });

  // Sync command
  registry
    .command('sync')
    .description('Update registry-sourced servers to latest versions')
    .option('--profile <name>', 'Profile to sync', 'default')
    .option('--dry-run', 'Show changes without applying')
    .action(async (options) => {
      const client = new RegistryClient();
      const profileManager = new ProfileManager();
      const profile = profileManager.loadProfile(options.profile);

      console.log(`🔄 Syncing profile '${options.profile}' with registry...\n`);

      for (const [name, config] of Object.entries(profile.mcpServers)) {
        try {
          // Try to find matching server in registry
          const searchResults = await client.search(name);
          const match = searchResults.find(r =>
            r.server.name.endsWith(`/${name}`)
          );

          if (match) {
            const latestVersion = match.server.version;
            const currentArgs = config.args?.join(' ') || '';

            if (!currentArgs.includes(latestVersion)) {
              console.log(`📦 ${name}: ${currentArgs} → ${latestVersion}`);

              if (!options.dryRun) {
                // Update to latest version
                const pkg = match.server.packages[0];
                config.args = [pkg.identifier];
                console.log(`   ✅ Updated`);
              } else {
                console.log(`   (dry run - not applied)`);
              }
            } else {
              console.log(`✓ ${name}: already at ${latestVersion}`);
            }
          }
        } catch (err) {
          console.log(`⚠ ${name}: not found in registry`);
        }
      }

      if (!options.dryRun) {
        profileManager.saveProfile(options.profile, profile);
        console.log(`\n✅ Profile synced`);
      } else {
        console.log(`\n💡 Run without --dry-run to apply changes`);
      }
    });

  return registry;
}
```

#### 3. **Integration with Existing CLI**

```typescript
// src/cli/index.ts
import { createRegistryCommand } from './commands/registry.js';

// Add to main program
program.addCommand(createRegistryCommand());
```

## User Workflows

### Workflow 1: Discover and Add from Registry

```bash
# Search for file-related servers
$ ncp registry search "file"

🔍 Found 15 servers:

📦 io.github.modelcontextprotocol/server-filesystem
   Access and manipulate local files and directories
   Version: 0.5.1
   Status: active

📦 io.github.portel-dev/ncp
   N-to-1 MCP Orchestration. Unified gateway for multiple MCP servers
   Version: 1.4.3
   Status: active

# Get detailed info
$ ncp registry info io.github.modelcontextprotocol/server-filesystem

📦 io.github.modelcontextprotocol/server-filesystem

Description: Access and manipulate local files and directories
Version: 0.5.1
Repository: https://github.com/modelcontextprotocol/servers

Package: @modelcontextprotocol/server-filesystem@0.5.1
Install: npx @modelcontextprotocol/server-filesystem

# Add to local profile
$ ncp registry add io.github.modelcontextprotocol/server-filesystem --profile work

✅ Added server-filesystem to profile 'work'

Configuration:
{
  "command": "npx",
  "args": ["@modelcontextprotocol/server-filesystem"],
  "env": {}
}
```

### Workflow 2: Export to Different Platforms

```bash
# Export current profile to Claude Desktop format
$ ncp registry export claude --profile work

{
  "mcpServers": {
    "ncp": {
      "command": "npx",
      "args": ["@portel/ncp@1.4.3"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"]
    }
  }
}

# Copy to clipboard (macOS)
$ ncp registry export claude | pbcopy
```

### Workflow 3: Keep Servers Updated

```bash
# Check for updates (dry run)
$ ncp registry sync --dry-run

🔄 Syncing profile 'default' with registry...

📦 ncp: @portel/ncp@1.4.2 → 1.4.3
   (dry run - not applied)
✓ filesystem: already at 0.5.1

💡 Run without --dry-run to apply changes

# Apply updates
$ ncp registry sync

🔄 Syncing profile 'default' with registry...

📦 ncp: @portel/ncp@1.4.2 → 1.4.3
   ✅ Updated

✅ Profile synced
```

## Implementation Phases

### Phase 1: Read-Only Registry Access
- `ncp registry search`
- `ncp registry info`
- Basic API integration

### Phase 2: Local Profile Integration
- `ncp registry add`
- `ncp registry export`
- Enhance existing `ncp add` to support registry shortcuts

### Phase 3: Sync and Validation
- `ncp registry sync`
- `ncp registry validate`
- Auto-update notifications

### Phase 4: Advanced Features
- `ncp registry publish` (for developers)
- `ncp registry stats` (usage analytics)
- Integration with `ncp analytics`

## Benefits

### For Users
1. **Discovery**: Find servers without leaving the terminal
2. **Simplicity**: One-command installation from registry
3. **Confidence**: Always install verified, active servers
4. **Updates**: Easy sync to latest versions

### For Developers
1. **Distribution**: Users can find your server easily
2. **Metadata**: Rich installation instructions auto-generated
3. **Analytics**: Track adoption (if added to Phase 4)

### For NCP
1. **Ecosystem Growth**: Drive adoption of both NCP and registry
2. **Quality**: Encourage registry listing (verified servers)
3. **User Experience**: Seamless workflow from discovery to usage
4. **Differentiation**: Unique feature that competitors don't have

## Example End-to-End Workflow

```bash
# User wants to add database capabilities
$ ncp registry search database

# Finds server, checks details
$ ncp registry info io.github.example/database-mcp

# Likes it, adds to NCP
$ ncp registry add io.github.example/database-mcp

# Exports entire config for Claude Desktop
$ ncp registry export claude > ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Later, updates all servers
$ ncp registry sync

# Everything is up to date and working!
```

## Technical Considerations

### Caching
- Cache registry responses for 5 minutes to reduce API calls
- Store in `~/.ncp/cache/registry/`
- Clear with `ncp config clear-cache`

### Error Handling
- Graceful degradation if registry is down
- Clear error messages for missing servers
- Suggest alternatives if search finds nothing

### Versioning
- Support `@latest`, `@1.x`, `@1.4.x` version pinning
- Warn if using outdated versions
- Allow explicit version in `ncp registry add <server>@version`

### Security
- Verify registry HTTPS certificates
- Warn about unsigned/unverified packages
- Add `--trust` flag for first-time installations

## Future Enhancements

1. **Interactive Mode**: TUI for browsing registry
2. **Recommendations**: Suggest servers based on profile
3. **Collections**: Curated server bundles (e.g., "web dev essentials")
4. **Ratings**: Community feedback integration
5. **Local Registry**: Run private registry for enterprise
