# Documentation Additions for lifecycle.mdx

This content should be added to `docs/specification/draft/basic/lifecycle.mdx` in a new section after the "Initialization" section.

---

## Configuration Schema Declaration

### Overview

Servers can optionally declare their configuration requirements during initialization by including a `configurationSchema` field in the `InitializeResult`. This enables clients to detect and assist with missing configuration before attempting tool execution.

### Purpose

Configuration schema declaration solves several critical usability issues:

1. **Chicken-and-egg Problem**: Clients must successfully connect to discover tools, but servers often fail to start without proper configuration
2. **Poor User Experience**: Users only discover missing configuration after connection failures with cryptic error messages
3. **Fragmented Documentation**: Configuration requirements are scattered across READMEs and error messages
4. **No Programmatic Discovery**: Clients cannot automatically detect or assist with configuration setup

### Schema Structure

The `configurationSchema` field contains three optional arrays:

- `environmentVariables`: Environment variables needed by the server
- `arguments`: Command-line arguments required for stdio servers
- `other`: Other configuration (files, URLs, etc.)

Each parameter declaration includes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Unique identifier (e.g., "GITHUB_TOKEN", "allowed-directory") |
| `description` | string | ✓ | Human-readable explanation of the parameter |
| `type` | string | ✓ | One of: "string", "number", "boolean", "path", "url" |
| `required` | boolean | ✓ | Whether this parameter is required |
| `sensitive` | boolean |  | Whether this contains sensitive data (passwords, API keys) |
| `default` | string\|number\|boolean |  | Default value if not provided |
| `multiple` | boolean |  | Whether multiple values are allowed |
| `pattern` | string |  | Validation regex for string parameters |
| `examples` | string[] |  | Example values to guide users |

### Examples

#### Example 1: Filesystem Server (Path Arguments)

A filesystem server that requires directory paths as command-line arguments:

```json
{
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "filesystem",
    "version": "1.0.0"
  },
  "capabilities": {},
  "configurationSchema": {
    "arguments": [
      {
        "name": "allowed-directory",
        "description": "Directory path that the server is allowed to access",
        "type": "path",
        "required": true,
        "multiple": true,
        "examples": ["/home/user/projects", "/tmp"]
      }
    ]
  }
}
```

**Client Behavior**: The client can prompt the user for directory paths before launching the server:

```bash
$ mcp-client add filesystem
✓ Enter allowed-directory: /home/user/projects
✓ Add another directory? /tmp
✓ Configuration saved
```

#### Example 2: GitHub Server (API Token)

An API-based server that requires an authentication token:

```json
{
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "github",
    "version": "1.0.0"
  },
  "capabilities": {},
  "configurationSchema": {
    "environmentVariables": [
      {
        "name": "GITHUB_TOKEN",
        "description": "GitHub personal access token with repo permissions",
        "type": "string",
        "required": true,
        "sensitive": true,
        "pattern": "^ghp_[a-zA-Z0-9]{36}$",
        "examples": ["ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
      }
    ]
  }
}
```

**Client Behavior**: The client can detect the missing token and prompt securely:

```bash
$ mcp-client add github
⚠ Missing required configuration
✓ Enter GITHUB_TOKEN: ********************************
✓ Configuration validated
```

#### Example 3: Multi-Parameter Server

A server with multiple configuration requirements:

```json
{
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "file-sync",
    "version": "1.0.0"
  },
  "capabilities": {},
  "configurationSchema": {
    "arguments": [
      {
        "name": "source-directory",
        "description": "Source directory to sync from",
        "type": "path",
        "required": true
      },
      {
        "name": "destination-directory",
        "description": "Destination directory to sync to",
        "type": "path",
        "required": true
      }
    ],
    "environmentVariables": [
      {
        "name": "SYNC_INTERVAL",
        "description": "Sync interval in seconds",
        "type": "number",
        "required": false,
        "default": 60
      }
    ]
  }
}
```

### Implementation Guidelines

#### For Server Developers

**When to Include Configuration Schema:**

- Server requires environment variables to function
- Server requires command-line arguments (especially for stdio transport)
- Server needs API keys or authentication credentials
- Server requires file paths or URLs

**What to Include:**

- All **required** configuration that prevents server startup
- **Optional** configuration that significantly affects behavior
- Clear descriptions and examples to guide users

**What NOT to Include:**

- Runtime-only parameters (use tool schemas instead)
- Parameters that can be inferred automatically
- Internal implementation details

**Example Implementation (TypeScript SDK):**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server(
  {
    name: "example-server",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

server.setConfigurationSchema({
  environmentVariables: [
    {
      name: "API_KEY",
      description: "API key for authentication",
      type: "string",
      required: true,
      sensitive: true,
    },
  ],
});
```

#### For Client Developers

**Handling Configuration Schema:**

1. **Validate Before Connection**: Check if required configuration is present before attempting to start the server

2. **Interactive Prompting**: If configuration is missing, prompt the user interactively:
   ```typescript
   if (initResult.configurationSchema) {
     for (const param of initResult.configurationSchema.environmentVariables || []) {
       if (param.required && !process.env[param.name]) {
         const value = await prompt(param.description, {
           type: param.sensitive ? "password" : "text",
           validate: param.pattern ? new RegExp(param.pattern) : undefined
         });
         // Save configuration
       }
     }
   }
   ```

3. **Clear Error Messages**: When configuration is invalid, explain exactly what's missing and why

4. **Configuration Storage**: Store configuration securely (especially sensitive values)

5. **Backward Compatibility**: Gracefully handle servers that don't provide configuration schema

### Benefits

#### For Server Developers
- **Self-documenting**: Configuration becomes part of the protocol contract
- **Better errors**: Clients can provide helpful error messages before connection
- **Validation**: Clients can validate configuration before startup

#### For Client Developers
- **Proactive validation**: Detect missing configuration before connection attempts
- **Better UX**: Guide users through setup with clear prompts
- **Automated setup**: Build configuration wizards and setup tools

#### For End Users
- **Clear guidance**: Know exactly what configuration is needed upfront
- **Interactive setup**: Clients can prompt for missing values
- **Fewer failures**: Catch configuration errors before runtime

### Backward Compatibility

The `configurationSchema` field is **optional** and **fully backward compatible**:

- Servers that don't provide it continue to work as before
- Clients that don't understand it simply ignore it
- No changes to existing protocol behavior
- Incremental adoption by the ecosystem

### Security Considerations

When implementing configuration schema:

1. **Sensitive Data Marking**: Always mark passwords, API keys, and credentials as `sensitive: true`
2. **Client Responsibility**: Clients must mask input for sensitive parameters
3. **Storage Security**: Clients should use secure storage (keychains, secret managers) for sensitive configuration
4. **Pattern Validation**: Use `pattern` field to help prevent obviously invalid credentials
5. **No Defaults for Secrets**: Never provide default values for sensitive parameters

### Related Discussions

This feature builds on community discussions:
- [#863 - Extend initialize Response](https://github.com/modelcontextprotocol/specification/discussions/863)
- [#1510 - Standardize initialization parameters](https://github.com/modelcontextprotocol/specification/discussions/1510)
- [#279 - Request tool parameters from human](https://github.com/modelcontextprotocol/specification/issues/279)
- [#1284 - Static metadata input](https://github.com/modelcontextprotocol/specification/issues/1284)
