# Pull Request Summary

## Title
Add Configuration Schema to Server Initialization

## Description

This PR extends the MCP specification to allow servers to declare their configuration requirements during initialization, solving a critical usability issue where users must attempt connection failures before discovering missing configuration.

### Problem
- 12% of MCP servers (141 out of 1,215 analyzed) fail due to missing configuration
- No standardized way for servers to declare configuration needs
- Users discover requirements only after cryptic connection failures
- Fragile workarounds required (parsing stderr, documentation hunting)

### Solution
Add optional `configurationSchema` field to `InitializeResult` that allows servers to declare:
- Environment variables needed
- Command-line arguments required
- Other configuration (files, URLs, etc.)

### Key Features
- ✅ **Fully backward compatible** - optional field, existing servers unaffected
- ✅ **Simple** - reuses familiar JSON Schema patterns
- ✅ **Declarative** - clear separation from tool schemas
- ✅ **Client-agnostic** - works for env vars, CLI args, and other methods

## Changes Included

### 1. Schema Changes (`schema/draft/schema.ts`)
- Add `ConfigurationSchema` interface
- Add `ConfigurationParameter` interface
- Extend `InitializeResult` with optional `configurationSchema` field

### 2. Documentation (`docs/specification/draft/basic/lifecycle.mdx`)
- Document configuration schema in initialization phase
- Provide examples for common use cases
- Explain benefits for server and client developers

## Examples

### Filesystem Server (Path Arguments)
```typescript
{
  "configurationSchema": {
    "arguments": [{
      "name": "allowed-directory",
      "description": "Directory path that the server is allowed to access",
      "type": "path",
      "required": true,
      "multiple": true
    }]
  }
}
```

### GitHub Server (API Token)
```typescript
{
  "configurationSchema": {
    "environmentVariables": [{
      "name": "GITHUB_TOKEN",
      "description": "GitHub personal access token with repo permissions",
      "type": "string",
      "required": true,
      "sensitive": true
    }]
  }
}
```

## Related Work

This PR builds on and complements:
- [Discussion #863](https://github.com/modelcontextprotocol/specification/discussions/863) - Similar proposal, this adds comprehensive types and real-world data
- [Discussion #1510](https://github.com/modelcontextprotocol/specification/discussions/1510) - Complementary (client sending vs server declaring)
- [Issue #279](https://github.com/modelcontextprotocol/specification/issues/279) - Runtime parameter input
- [Issue #1284](https://github.com/modelcontextprotocol/specification/issues/1284) - Enterprise static metadata

## Implementation Status

Working prototype available in [NCP project](https://github.com/PortelU/ncp):
- Error parser that demonstrates the current fragile workaround
- Interactive repair command that shows desired user experience
- Validates the need with real-world data from 1,215+ MCPs

## Backward Compatibility

✅ No breaking changes
- Optional field - servers can omit it
- Clients that don't understand it simply ignore it
- Existing protocol behavior unchanged

## Benefits

### For Server Developers
- Self-documenting configuration
- Better error messages
- Programmatic validation

### For Client Developers
- Proactive configuration detection
- Build setup wizards
- Better user experience

### For End Users
- Clear guidance upfront
- Interactive setup assistance
- Fewer connection failures

## Checklist

- [ ] Schema changes in `schema/draft/schema.ts`
- [ ] Documentation in `docs/specification/draft/basic/lifecycle.mdx`
- [ ] Examples for common use cases
- [ ] Backward compatibility confirmed
- [ ] References to related discussions/issues
