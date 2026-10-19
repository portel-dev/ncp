# MCP compatibility release

This release connects NCP's active orchestrator to the shared transport factory,
preserves downstream tool descriptors and results, and bridges downstream user
input through NCP's request coordinator. Existing clients can continue to use
legacy protocol revisions while modern clients use MCP 2026 multi-round requests.

## Remote transport configuration

Set `transport` explicitly for URL-based servers. Existing profiles with no
transport field retain their legacy HTTP plus SSE behavior. Modern registry
imports record Streamable HTTP explicitly:

```json
{
  "mcpServers": {
    "modern": {
      "url": "https://example.com/mcp",
      "transport": "streamableHttp"
    },
    "legacy": {
      "url": "https://legacy.example.com/sse",
      "transport": "sse"
    }
  }
}
```

Protocol version negotiation and HTTP transport selection are separate: automatic
protocol negotiation does not discover an alternative SSE endpoint. Local servers
continue to use `command`, `args`, and `env` over stdio.

## Tool results and discovery

`run` forwards the original MCP tool result, including `structuredContent`,
`isError`, `_meta`, and native text, image, audio, embedded resource, and resource
link blocks. Callers that previously parsed JSON text containing an array of MCP
blocks should consume the native result instead. Internal tools using NCP's older
value-only response remain supported.

Tool output schemas, annotations, extension metadata, and other descriptor fields
survive discovery and metadata-cache round trips. NCP rendering hints use the
`_meta.ncp.uiHints` namespace so they do not replace a server's `_meta.ui` fields.
Apps routing builds on these preserved descriptors; see the extension behavior below.

## Registry discovery

The official registry client uses `/v0.1`, follows opaque pagination cursors, and
refreshes cached catalogs with incremental updates. Deleted versions are removed,
and deprecated entries retain their lifecycle status. A failed refresh leaves the
last complete snapshot and its synchronization checkpoint intact. Clearing the
cache also resets the catalog and checkpoint.

## Validation

Run with a supported Node.js runtime:

```sh
npm run build
npm run test:compatibility
npm run test:conformance
```

The conformance script pins the official `@modelcontextprotocol/conformance`
runner to version 0.1.16 and exercises its `initialize` and `tools_call` client
scenarios through the actual NCP orchestrator's discovery and execution paths.
It uses isolated temporary state and does not import a user's configured clients.
This published runner covers legacy revisions for those scenarios; passing these
smoke checks is not a claim of full MCP conformance. Modern protocol and user-input
behavior are covered by NCP's integration tests.

The CI pipeline runs the compatibility suite and the official conformance smoke
checks after building the project.

## Extension behavior

NCP advertises the Apps, Skills, and Tasks extensions alongside the core gateway.
The extension tests run with `npm run test:extensions` and are included in the
pre-publish and CI checks.

### MCP Apps

App launch tools retain their original names and `_meta.ui` declarations so
embedded applications can call their existing callbacks. NCP proxies `ui://`
resources, preserving HTML, CSP, permissions, and resource metadata. Hosts that
advertise Apps also receive app-only callbacks; other hosts see model-visible
launch tools. The host enforces model/app visibility because a core tool call
does not carry a trusted UI provenance signal.

Tool names or UI URIs that collide across downstream servers, or with NCP's own
`find`, `run`, and `code`, cause the affected app groups to be omitted. Those
servers remain usable through `find` and `run`; NCP does not rewrite application
HTML or guess which server a hardcoded callback intended.

### Skills over MCP

`skills/list` and `skills/get` expose local skills from NCP's `skills` directory
and extension-capable downstream servers. The `resources/read` route serves the
manifest files on demand. Entries retain frontmatter, byte sizes, and SHA-256
digests. Remote namespaces bind a skill to its source; reads verify manifest
bytes and reject traversal and symlink escapes. Listing a skill does not execute
it or grant its requested permissions.

### Tasks

Modern hosts advertising `io.modelcontextprotocol/tasks` receive durable task
handles for `run` and `code`. They poll `tasks/get`, answer suspended input with
`tasks/update`, and request cancellation with `tasks/cancel`. Older hosts retain
the synchronous and multi-round input paths. SDK clients should use the Tasks
extension adapter with its V2 raw-dispatch framing; the core SDK client alone
does not decode task handles or dispatch the modern task control methods. NCP
uses a stdio adapter for those three extension methods because this SDK revision
rejects them in its modern core-method dispatcher. The adapter validates the
modern envelope and official Tasks request/result schemas; ordinary MCP traffic
continues through the SDK.

Task records and terminal results live under the NCP state directory, scoped by
profile. Handles are persisted before being returned. Restart recovery reports
interrupted work as failed instead of replaying arbitrary side effects. It does
not resume a suspended JavaScript stack. Cancellation records intent; NCP only
reports cancellation when a worker can guarantee it has stopped. Stdio has one
local trust domain: random task IDs are bearer references inside the profile,
and self-declared MCP client names are not an authentication boundary.

The store flushes each temporary task file before atomic replacement. On POSIX
systems it also enforces owner-only directory modes and flushes the directory
after rename. Windows uses inherited filesystem ACLs; Node does not provide the
same directory flush operation there, so power-loss durability of the rename
depends on the filesystem.

### Catalog freshness

Bounded SDK response caches survive downstream reconnects and partition private
entries by server configuration and credential identity. Server-declared cache
lifetimes and tool-list change notifications drive catalog refresh. Refreshes
replace tool definitions and discovery entries, removing deleted tools. Persisted
metadata is revalidated before detailed discovery or schema-backed execution.

References: [MCP July 2026 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
[TypeScript migration guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28),
[official registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md),
[conformance framework](https://github.com/modelcontextprotocol/conformance),
[stable Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx),
[Skills extension](https://github.com/modelcontextprotocol/ext-skills),
and [Tasks extension](https://github.com/modelcontextprotocol/ext-tasks).
