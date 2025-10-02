# SEP: Server Configuration Requirements Declaration

## Status
**Proposed**

## Summary
Extend the MCP specification to allow servers to declare their configuration requirements (environment variables, command-line arguments, API keys, etc.) during initialization, enabling clients to detect and assist with missing configuration before attempting tool execution.

## Relationship to Existing Discussions

This proposal builds on and complements existing community discussions:

- **[Discussion #863](https://github.com/modelcontextprotocol/specification/discussions/863)**: Proposed adding `requiredConfigurations` to InitializeResult. This proposal provides a more comprehensive schema with real-world validation data, detailed type definitions, and implementation examples based on analyzing 1,215 MCPs.

- **[Discussion #1510](https://github.com/modelcontextprotocol/specification/discussions/1510)**: Focuses on standardizing how clients *send* configuration. This proposal focuses on how servers *declare* what they need. These are complementary and should work together.

**Key Differences from #863**:
1. Provides real-world data: 12% failure rate from 1,215 MCPs
2. Includes complete TypeScript type definitions with all parameter metadata
3. Offers multiple concrete examples (filesystem, API-based, multi-parameter)
4. Proposes structured parameter types (string, number, boolean, path, url)
5. Includes implementation roadmap with 4 phases
6. Demonstrates working prototype with error parser

## Problem Statement

### Current State
Today, MCP servers have no standardized way to communicate their configuration requirements to clients. This creates several critical issues:

1. **Chicken-and-egg Problem**: Clients must successfully connect to a server to discover its tools, but servers often fail to start without proper configuration
2. **Poor User Experience**: Users only discover missing configuration after connection failures with cryptic error messages
3. **Fragmented Documentation**: Configuration requirements are scattered across READMEs, error messages, and documentation in various formats
4. **No Programmatic Discovery**: Clients cannot automatically detect or assist with configuration setup

### Real-World Impact

When building NCP (Natural Context Provider), a tool that orchestrates 1000+ MCP servers, we encountered this problem at scale:

```bash
# User adds filesystem MCP
ncp add filesystem npx @modelcontextprotocol/server-filesystem

# Connection fails during indexing
❌ MCP error -32000: Connection closed

# User must:
# 1. Check logs to find: "Usage: mcp-server-filesystem [allowed-directory]..."
# 2. Manually edit configuration
# 3. Retry connection
```

**Result**: ~141 out of 1215 MCPs (12%) failed due to missing configuration that could have been detected upfront.

### Use Cases Affected

1. **MCP Orchestrators**: Tools like NCP, Claude Desktop, Cline that manage multiple MCP servers
2. **Setup Wizards**: Applications that guide users through MCP configuration
3. **Validation Tools**: CI/CD pipelines that verify MCP configurations
4. **Development Tools**: IDEs and editors with MCP integration
5. **Registry Services**: MCP registries that validate server configurations

## Proposed Solution

### Overview
Add an optional `configurationSchema` field to the `InitializeResult` that servers can use to declare their configuration requirements.

### Design Principles
- **Optional**: Servers can adopt incrementally; existing servers continue to work
- **Simple**: Reuse JSON Schema patterns familiar to developers
- **Declarative**: Configuration schema is separate from tool schemas
- **Client-agnostic**: Works for environment variables, CLI args, and other config methods

### Specification Changes

#### 1. Extend `InitializeResult` Type

```typescript
interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;

  // NEW: Optional configuration schema
  configurationSchema?: ConfigurationSchema;
}
```

#### 2. Define `ConfigurationSchema` Type

```typescript
interface ConfigurationSchema {
  // Environment variables required by the server
  environmentVariables?: ConfigurationParameter[];

  // Command-line arguments required by the server
  arguments?: ConfigurationParameter[];

  // Other configuration (files, URLs, etc.)
  other?: ConfigurationParameter[];
}

interface ConfigurationParameter {
  // Unique identifier for this parameter
  name: string;

  // Human-readable description
  description: string;

  // Type of the parameter
  type: "string" | "number" | "boolean" | "path" | "url";

  // Whether this parameter is required
  required: boolean;

  // Whether this contains sensitive data (passwords, API keys)
  sensitive?: boolean;

  // Default value if not provided
  default?: string | number | boolean;

  // For arrays: whether multiple values are allowed
  multiple?: boolean;

  // Validation pattern (regex for strings)
  pattern?: string;

  // Examples of valid values
  examples?: string[];
}
```

### Example Implementations

#### Example 1: Filesystem Server

```typescript
// Server returns during initialization
{
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "filesystem",
    "version": "1.0.0"
  },
  "capabilities": { ... },
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

#### Example 2: API-based Server (e.g., GitHub)

```typescript
{
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "github",
    "version": "1.0.0"
  },
  "capabilities": { ... },
  "configurationSchema": {
    "environmentVariables": [
      {
        "name": "GITHUB_TOKEN",
        "description": "GitHub personal access token with repo permissions",
        "type": "string",
        "required": true,
        "sensitive": true,
        "pattern": "^ghp_[a-zA-Z0-9]{36}$"
      }
    ]
  }
}
```

#### Example 3: Complex Server (Clone/Copy Operations)

```typescript
{
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "file-clone",
    "version": "1.0.0"
  },
  "capabilities": { ... },
  "configurationSchema": {
    "arguments": [
      {
        "name": "source-directory",
        "description": "Source directory to clone from",
        "type": "path",
        "required": true
      },
      {
        "name": "destination-directory",
        "description": "Destination directory to clone to",
        "type": "path",
        "required": true
      }
    ],
    "environmentVariables": [
      {
        "name": "CLONE_PRESERVE_PERMISSIONS",
        "description": "Whether to preserve file permissions during cloning",
        "type": "boolean",
        "required": false,
        "default": true
      }
    ]
  }
}
```

## Benefits

### For Server Developers
1. **Self-documenting**: Configuration becomes part of the protocol contract
2. **Better errors**: Clients can provide helpful error messages before connection
3. **Validation**: Clients can validate configuration before startup
4. **Discoverability**: Configuration is programmatically accessible

### For Client Developers
1. **Proactive validation**: Detect missing configuration before connection attempts
2. **Better UX**: Guide users through setup with clear prompts
3. **Automated setup**: Build configuration wizards and setup tools
4. **Error prevention**: Catch configuration issues early

### For End Users
1. **Clear guidance**: Know exactly what configuration is needed upfront
2. **Interactive setup**: Clients can prompt for missing values
3. **Fewer failures**: Catch configuration errors before runtime
4. **Better error messages**: Clear explanations instead of cryptic connection failures

## Implementation Strategy

### Phase 1: Specification (Weeks 1-2)
- [ ] Finalize schema design based on community feedback
- [ ] Add to MCP specification documentation
- [ ] Update JSON Schema definitions
- [ ] Create migration guide for server developers

### Phase 2: SDK Support (Weeks 3-4)
- [ ] Add types to TypeScript SDK
- [ ] Add types to Python SDK
- [ ] Add helper functions for schema generation
- [ ] Update examples and templates

### Phase 3: Reference Implementations (Weeks 5-6)
- [ ] Update official servers (filesystem, github, etc.)
- [ ] Create "before/after" migration examples
- [ ] Document best practices

### Phase 4: Ecosystem Adoption (Ongoing)
- [ ] Update Claude Desktop to use configurationSchema
- [ ] Update MCP registry to display configuration requirements
- [ ] Community outreach and migration support

## Backward Compatibility

✅ **Fully backward compatible**

- **Optional field**: Servers that don't provide `configurationSchema` continue to work
- **Client flexibility**: Clients that don't understand `configurationSchema` ignore it
- **No breaking changes**: Existing protocol behavior unchanged
- **Incremental adoption**: Servers can add configuration schema without affecting clients

## Alternative Approaches Considered

### 1. ❌ Pre-connection Configuration Endpoint
**Approach**: Add a separate HTTP endpoint for configuration discovery
**Rejected**: Adds complexity; not suitable for stdio-based servers

### 2. ❌ Registry-based Configuration
**Approach**: Central registry maintains configuration schemas
**Rejected**: Requires external service; doesn't scale; out of date quickly

### 3. ❌ Error Message Parsing
**Approach**: Parse stderr for configuration hints (current workaround)
**Rejected**: Fragile; non-deterministic; doesn't work for all error formats; what we're trying to fix!

### 4. ❌ Separate Configuration Protocol
**Approach**: New protocol extension for configuration
**Rejected**: Overcomplicated; adds maintenance burden

## Open Questions

1. **Should configuration schema be queryable before full initialization?**
   - Current proposal: Returned during initialize
   - Alternative: Separate lightweight endpoint
   - Trade-off: Simplicity vs. pre-validation

2. **Should we support configuration templates/presets?**
   - Example: "development" vs. "production" configurations
   - Future extension possibility

3. **Should we support configuration validation rules?**
   - Example: "source and destination must be different"
   - Could add `constraints` field in future

4. **Should we standardize configuration storage formats?**
   - Example: Where clients should store API keys
   - Outside scope of protocol specification

## Success Metrics

1. **Adoption rate**: % of official MCP servers implementing configurationSchema within 6 months
2. **Error reduction**: Reduction in configuration-related connection failures
3. **Developer satisfaction**: Survey feedback from server and client developers
4. **Ecosystem growth**: Increase in tools leveraging configuration schema

## References

### Related Discussions
- [#863 - Extend initialize Response to Communicate Server Configuration Requirements](https://github.com/modelcontextprotocol/specification/discussions/863) - Similar proposal focusing on HTTP header-based configuration
- [#1510 - Standardize MCP server initialization parameters](https://github.com/modelcontextprotocol/specification/discussions/1510) - Client-side configuration passing standardization

### Related Issues
- [#279 - Request tool parameters from human](https://github.com/modelcontextprotocol/specification/issues/279) - Runtime parameter input from users
- [#1228 - Pass extra fixed parameters](https://github.com/modelcontextprotocol/specification/discussions/1228) - Passing metadata via `_meta` field
- [#1284 - Static metadata input](https://github.com/modelcontextprotocol/specification/issues/1284) - Enterprise configuration requirements

### Implementation
- NCP implementation: https://github.com/PortelU/ncp

## Prototype Implementation

A working prototype is available in the NCP project demonstrating:
1. Error message parsing (current workaround)
2. Interactive configuration repair flow
3. What could be simplified with this proposal

See: https://github.com/PortelU/ncp/blob/main/src/utils/mcp-error-parser.ts

## Authors

- Arul (NCP maintainer)
- [Open for co-authors from community]

## Feedback Requested

1. Is the schema structure clear and sufficient?
2. Should we support additional parameter types?
3. Any missing use cases?
4. Concerns about implementation complexity?
5. Better alternatives to consider?

---

**Ready to discuss and refine based on community feedback!**
