# MCP gateway benchmark

Run the reproducible local workload with:

```sh
npm run benchmark:mcp
```

The command writes machine-readable results to [mcp-gateway.json](./mcp-gateway.json). Set `BENCHMARK_ITERATIONS` to change the sample count or `BENCHMARK_OUTPUT` to write elsewhere.

The workload contains 192 deterministic tool descriptors and repeatedly completes one lookup workflow. It compares (1) a direct MCP catalog containing all tools, (2) a hypothetical selected-tool catalog containing only the chosen descriptor, and (3) NCP's real `MCPServer` list/call handlers backed by `NCPOrchestrator.find` and `run`. NCP discovery is seeded to return the intended tool, and execution uses a controlled downstream result. No model calls, external MCP processes, or network requests occur.

Cold latency includes constructing the fixture server and client, connecting them in memory, and completing the first workflow. Warm latency reuses connected sessions. The direct workflow lists its catalog and calls the target tool. The selected-tool control filters that catalog locally, so its report includes payload size only; its transport timings would still include the full catalog. The NCP workflow lists its small core catalog, calls `find`, and calls `run` with the same arguments. The benchmark requires exact equality with the fixture result, including text and image content blocks, structured content, and metadata; all three modes must complete every cold and warm iteration successfully.

Payload sizes are JSON serialization byte counts for catalog and workflow messages. The token proxy divides those bytes by four and rounds up. It is not a tokenizer measurement and omits framing, model-specific tokenization, host planning, and prompt caching. MCP `tools/list` does not define a per-tool filter, so the selected-tool row is a hypothetical payload lower bound. It shows the cost when a host has already chosen one descriptor; it does not measure native search quality or claim standard protocol support.

The recorded 192-tool fixture produced these payload sizes (JSON bytes, excluding transport framing):

| Mode | Advertised catalog | Complete workflow |
|---|---:|---:|
| Direct full catalog | 78,424 | 78,816 |
| Selected-tool payload lower bound | 413 | 805 |
| NCP find/run | 2,615 | 4,884 |

All 30 cold and warm executions per mode completed with exact fixture results. See the JSON for measured median and p95 timings and runtime details. The hypothetical selected-tool row has no latency result because a native host's search and dispatch path is not measured.

The recorded latency is local Node and SDK overhead. It does not predict real host-model latency, remote server performance, embedding startup, or discovery precision. Use the harness to reproduce catalog-size and result-fidelity comparisons; do not interpret its timings as production performance claims.
