# NCP Security Architecture

This document describes the security measures implemented in NCP's Code-Mode execution environment.

## Overview

NCP's Code-Mode allows execution of TypeScript/JavaScript code with access to MCP tools. This creates potential security risks that are mitigated through a defense-in-depth approach:

1. **Static Analysis** - Block dangerous patterns before execution
2. **Semantic Validation** - Detect malicious intent patterns
3. **Runtime Sandboxing** - Isolate code execution with resource limits
4. **Sandboxed File System** - Confine file operations to a workspace directory
5. **Network Policy** - Control and audit network requests

## Execution Sandbox Hierarchy

Code execution uses a tiered approach, selecting the most secure available option:

| Tier | Sandbox Type | Isolation Level | Description |
|------|--------------|-----------------|-------------|
| 1 | IsolatedVM | Highest | Separate V8 isolate (Cloudflare Workers technology) |
| 2 | Subprocess | High | Separate Node.js process |
| 3 | Worker Thread | Medium | Separate V8 context with resource limits |
| 4 | VM Module | Basic | Same-process with context isolation |

### Resource Limits

All execution sandboxes enforce:
- **Memory**: 128MB maximum
- **Execution time**: 30 seconds default, 5 minutes maximum
- **Code size**: 16MB maximum

## Static Analysis (AST-Based)

Before execution, code is parsed using TypeScript's compiler API to detect dangerous patterns:

### Blocked Global Access
- `eval`, `Function` - Arbitrary code execution
- `process`, `global`, `globalThis` - Node.js runtime access
- `require`, `module` - Unrestricted module loading (whitelisted packages allowed)
- `__dirname`, `__filename` - Path disclosure
- `Reflect`, `Proxy`, `Symbol` - Metaprogramming (sandbox escape vectors)
- `WeakRef`, `FinalizationRegistry` - GC probing

### Blocked Property Access
- `__proto__`, `constructor`, `prototype` - Prototype pollution
- `defineProperty`, `setPrototypeOf` - Object manipulation
- `getOwnPropertyDescriptor` - Descriptor access

### Blocked Modules
Direct imports of dangerous Node.js modules are blocked:
- `fs`, `child_process`, `cluster` - System access
- `net`, `dgram`, `dns`, `tls` - Network access
- `vm`, `worker_threads`, `v8` - Runtime manipulation
- `os`, `path`, `crypto` - System information

## Semantic Validation

After static analysis, semantic patterns are checked:

### Malicious Intent Detection
- **Data Exfiltration**: Reading credentials + external network access
- **Credential Harvesting**: Multiple secret/password accesses
- **Reconnaissance**: System enumeration patterns
- **Persistence**: Cron jobs, startup scripts
- **Backdoor**: Reverse shells, remote access
- **Privilege Escalation**: sudo, admin, root access
- **Data Destruction**: Bulk deletion patterns

### Risk Level Classification
- **Low**: Standard operations within allowed scope
- **Medium**: Potentially sensitive operations requiring review
- **High**: Dangerous patterns that are blocked

## Sandboxed File System

All file operations in Code-Mode are confined to a workspace directory.

### Workspace Location
```
~/.ncp/workspace/          # Global installation
.ncp/workspace/            # Local installation (when .ncp exists in project)
```

### Security Features

1. **Path Confinement**: All paths are resolved relative to workspace root
2. **Traversal Prevention**: `../` and absolute paths outside workspace are blocked
3. **Escape Detection**: Paths are normalized and validated before any operation

### Example

```typescript
// ✅ Allowed - within workspace
await fs.writeFile('output/report.pdf', data);
await fs.readFile('data/input.json');

// ❌ Blocked - escape attempt
await fs.readFile('../config.json');     // SandboxEscapeError
await fs.readFile('/etc/passwd');        // SandboxEscapeError
```

### Sandboxed FS API

The following async operations are available:

| Operation | Description |
|-----------|-------------|
| `readFile(path, encoding?)` | Read file contents |
| `writeFile(path, data, encoding?)` | Write file (creates parent dirs) |
| `appendFile(path, data, encoding?)` | Append to file |
| `readdir(path)` | List directory contents |
| `mkdir(path, options?)` | Create directory |
| `stat(path)` | Get file statistics |
| `exists(path)` | Check if path exists |
| `unlink(path)` | Delete file |
| `rmdir(path, options?)` | Remove directory |
| `rm(path, options?)` | Remove file/directory |
| `rename(oldPath, newPath)` | Move/rename file |
| `copyFile(src, dest)` | Copy file |
| `createReadStream(path)` | Create read stream |
| `createWriteStream(path)` | Create write stream |

## Package Whitelist

The `require()` function is available for whitelisted packages only:

| Package | Purpose |
|---------|---------|
| `pdf-lib` | PDF creation and manipulation |
| `docx` | Word document generation |
| `pptxgenjs` | PowerPoint generation |
| `xlsx` | Excel spreadsheet handling |
| `papaparse` | CSV parsing |
| `cheerio` | HTML/XML parsing |
| `axios` | HTTP requests (via network policy) |
| `lodash` | Utility functions |
| `date-fns` | Date manipulation |
| `uuid` | UUID generation |
| `crypto-js` | Cryptographic functions |
| `canvas` | Image manipulation |
| `sharp` | High-performance image processing |
| `jimp` | Image processing |
| `path` | Path utilities (safe) |

### Runtime Package Approval

When code requires a package not in the built-in whitelist:

1. **Pre-execution scan**: Code is analyzed for `require()` calls before execution
2. **Blocked packages rejected**: Node.js built-ins (fs, child_process, etc.) cannot be approved
3. **User elicitation**: User is prompted to approve with scoped options:
   - "This operation only" - Approved for single execution
   - "This session" - Approved until server restarts
   - "1 hour" - Approved with 1-hour TTL
   - "24 hours" - Approved with 24-hour TTL
4. **Temporary approval**: Approvals are stored in-memory only (no persistent security holes)
5. **Execution proceeds**: If approved, the package is added to the effective whitelist for this run

This approach ensures:
- No permanent expansion of security permissions
- Case-by-case user control
- If a package is constantly needed, it signals a candidate for the built-in whitelist

### Adding Packages

Users must install packages in their project:
```bash
npm install xlsx pdf-lib  # etc.
```

## Network Policy

Network requests from Code-Mode are controlled:

1. **Policy Enforcement**: Requests checked against allowed domains/patterns
2. **Request Auditing**: All network calls are logged
3. **Rate Limiting**: Prevent abuse through excessive requests
4. **Elicitation**: User can be prompted for permission for new domains

## Runtime Hardening

### Package Pre-Loading

To ensure compatibility with whitelisted packages, the sandbox uses a pre-loading strategy:

1. **Scan code** for `require()` calls before execution
2. **Pre-load packages** that are in the whitelist BEFORE prototype freezing
3. **Freeze prototypes** after packages have initialized their classes
4. **Execute code** with pre-loaded packages available

This solves compatibility issues with packages like `pdf-lib` that need to define class methods during initialization.

### Prototype Freezing

Built-in prototypes are frozen to prevent pollution:
- `Object.prototype`
- `Array.prototype`
- `Function.prototype`
- `String.prototype`, `Number.prototype`, `Boolean.prototype`
- `RegExp.prototype`, `Error.prototype`, `Promise.prototype`

### Global Cleanup
Dangerous globals are removed from the execution context:
- `Reflect`, `Proxy`
- `WeakRef`, `FinalizationRegistry`

## Audit Logging

All code execution is logged for security monitoring:
- Execution start/end times
- Code fingerprint (hash)
- Detected patterns and intents
- Success/failure status
- Resource usage

## Known Limitations

1. **Static Requires Only**: Only static `require('package-name')` is allowed (dynamic strings blocked)
2. **Import Statements**: ES6 `import` is blocked (use `require()`)
3. **Symlinks**: Symlinks within workspace are not specially handled
4. **Non-Whitelisted Packages**: Packages not in the whitelist cannot be used even if installed

## Security Best Practices

1. **Minimal Permissions**: Only enable Code-Mode when needed
2. **Workspace Isolation**: Keep sensitive files outside `.ncp/workspace/`
3. **Package Auditing**: Review whitelisted packages for vulnerabilities
4. **Network Monitoring**: Review network policy for overly permissive rules
5. **Log Review**: Periodically review audit logs for suspicious activity

## Reporting Security Issues

If you discover a security vulnerability, please report it via:
- GitHub Security Advisory: https://github.com/anthropics/ncp/security/advisories

Do not disclose security issues publicly until they have been addressed.
