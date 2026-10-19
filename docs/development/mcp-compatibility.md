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
Preserving app metadata is groundwork for MCP Apps; this release does not implement
UI resource proxying or app tool exposure.

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

## Follow-on work

The remaining roadmap includes protocol cache freshness and subscriptions,
interactive MCP Apps resource routing, Skills over MCP, and durable Tasks. The
current input coordinator keeps suspended workflows in memory; process restart
recovery requires the durable workflow work. These features are outside this
compatibility release.

References: [MCP July 2026 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
[TypeScript migration guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28),
[official registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md),
and [conformance framework](https://github.com/modelcontextprotocol/conformance).
