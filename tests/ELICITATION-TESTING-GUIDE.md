# MCP Input Required Testing Guide

NCP authors interactive tool workflows with the MCP 2026 `input_required` result. It does not send application initiated `elicitation/create` requests.

The SDK legacy shim remains enabled for older negotiated protocol revisions. For those clients, the SDK may translate an `input_required` result into a legacy server request and feed the response back into the suspended workflow.

## Automated coverage

Run the protocol and coordinator tests:

```bash
npm run build
npm test -- --runInBand \
  tests/input-required-coordinator.test.ts \
  tests/mcp-modern-protocol.test.ts \
  tests/elicitation-helper.test.ts \
  tests/photon-secret-input.test.ts \
  tests/ncp-secret-boundary.test.ts \
  tests/ncp-optimize-client.test.ts \
  tests/code-mode/package-approval.test.ts
```

These tests verify:

- MCP 2026 returns `resultType: "input_required"` and resumes after a retried `tools/call`.
- The modern path emits no server initiated JSON-RPC elicitation request.
- A legacy client completes the same workflow through the SDK shim.
- Clients without elicitation capability fail closed.
- Signed request state rejects tampering, expiry, replay, missing state, and cross-session use.
- Multi-round workflows execute once and preserve live async state.
- Credential prompts send only a readiness acknowledgement through MCP. Secret values are read from the local clipboard, cleared after capture, and do not appear in input responses or signed request state.
- Photon passwords and sensitive Photon settings use the same clipboard boundary.
- Model-visible and file exports contain secure-storage references rather than materialized credentials; clipboard export fails closed when the clipboard is unavailable.
- Add, remove, package access, and client config optimization perform no protected action after cancellation.

## Manual client checks

Use a client that advertises form elicitation support.

1. Invoke a protected `run` operation and approve it once.
2. Repeat and choose permanent approval; verify the whitelist is updated.
3. Cancel a protected operation; verify no side effect occurs.
4. Add or remove an MCP; verify no profile file changes before approval.
5. Add an MCP that needs several credentials. Copy one JSON object with the requested keys to the local clipboard, then confirm readiness. Verify the MCP input response contains only `ready: true`.
6. Verify NCP clears the clipboard after successful capture, replaces secrets with `_USE_SECURE_STORAGE_` in the profile, lists only credential metadata, and materializes values only when the MCP starts.
7. Trigger a Photon with sequential asks; verify each prompt resumes the same execution and password asks use the clipboard path.
8. Import MCPs from a supported client, then run `mcp:optimize_client` with its `client_name`; verify cancellation leaves the config unchanged and approval creates a backup before replacement.

A client that does not advertise elicitation support must receive an error for protected interactive operations. NCP does not open a native dialog as an MCP fallback.

Clipboard isolation requires NCP to run on the same machine and user session as the clipboard. A remote NCP process cannot read the user's local clipboard; remote deployments need a client-side secret broker before they can provide the same guarantee.

## Restart and expiry behavior

Pending workflows live only in the NCP process and expire after 15 minutes. Restarting NCP invalidates their signed state. Retrying an expired or pre-restart interaction returns an expired interaction error; NCP does not replay the operation.
