import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDirectSession, createNcpSession, BENCHMARK_QUERY, BENCHMARK_TOOL, benchmarkResult } from '../fixtures/mcp-gateway-benchmark.js';

const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS ?? 15);
const OUTPUT = resolve(process.env.BENCHMARK_OUTPUT ?? 'docs/benchmarks/mcp-gateway.json');
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
};
const stats = (values: number[]) => ({
  medianMs: Number(percentile(values, 0.5).toFixed(3)),
  p95Ms: Number(percentile(values, 0.95).toFixed(3)),
});

async function directWorkflow(session: Awaited<ReturnType<typeof createDirectSession>>) {
  const listed = await session.client.listTools();
  const chosen = listed.tools.find(tool => tool.name === BENCHMARK_TOOL);
  assert.ok(chosen, 'direct catalog should include the target tool');
  const result = await session.client.callTool({
    name: BENCHMARK_TOOL,
    arguments: { customer_id: 'cust_009', amount: 4200, memo: 'October services' },
  });
  return { result, listBytes: bytes(listed), requestBytes: bytes({ name: BENCHMARK_TOOL, arguments: { customer_id: 'cust_009', amount: 4200, memo: 'October services' } }) };
}

async function selectedToolWorkflow(session: Awaited<ReturnType<typeof createDirectSession>>) {
  const listed = await session.client.listTools();
  // Model a host that already knows which single tool it needs and asks the
  // server for only that descriptor. This is a payload lower bound, not a
  // standard MCP operation or a search-quality comparison.
  const selected = { tools: listed.tools.filter(tool => tool.name === BENCHMARK_TOOL) };
  assert.equal(selected.tools.length, 1);
  const result = await session.client.callTool({
    name: BENCHMARK_TOOL,
    arguments: { customer_id: 'cust_009', amount: 4200, memo: 'October services' },
  });
  return { result, listBytes: bytes(selected), requestBytes: bytes({ name: BENCHMARK_TOOL, arguments: { customer_id: 'cust_009', amount: 4200, memo: 'October services' } }) };
}

async function ncpWorkflow(session: Awaited<ReturnType<typeof createNcpSession>>) {
  const listed = await session.client.listTools();
  const findArgs = { description: BENCHMARK_QUERY, limit: 1, depth: 2 };
  const found = await session.client.callTool({ name: 'find', arguments: findArgs });
  const serializedFind = JSON.stringify(found);
  assert.ok(serializedFind.includes(BENCHMARK_TOOL), 'NCP find should discover target tool');
  const runArgs = { tool: BENCHMARK_TOOL, parameters: { customer_id: 'cust_009', amount: 4200, memo: 'October services' } };
  const result = await session.client.callTool({ name: 'run', arguments: runArgs });
  return {
    result,
    listBytes: bytes(listed),
    requestBytes: bytes({ name: 'find', arguments: findArgs }) + bytes({ name: 'run', arguments: runArgs }),
    findResponseBytes: bytes(found),
  };
}

async function main() {
  assert.ok(Number.isInteger(ITERATIONS) && ITERATIONS >= 1, 'BENCHMARK_ITERATIONS must be a positive integer');
  const directCold: number[] = [];
  const ncpCold: number[] = [];
  let direct = await createDirectSession();
  let ncp = await createNcpSession();
  let directWarm: number[] = [];
  let ncpWarm: number[] = [];
  let payloads: any;
  try {
    for (let i = 0; i < ITERATIONS; i += 1) {
      let directStart = process.hrtime.bigint();
      const coldDirect = await createDirectSession();
      const directRun = await directWorkflow(coldDirect);
      directCold.push(ms(directStart));
      await coldDirect.close();

      const ncpStart = process.hrtime.bigint();
      const coldNcp = await createNcpSession();
      const ncpRun = await ncpWorkflow(coldNcp);
      ncpCold.push(ms(ncpStart));
      await coldNcp.close();

      const coldNative = await createDirectSession();
      const nativeRun = await selectedToolWorkflow(coldNative);
      await coldNative.close();

      assert.deepEqual(directRun.result, benchmarkResult);
      assert.deepEqual(nativeRun.result, benchmarkResult);
      assert.deepEqual(ncpRun.result, benchmarkResult);
      payloads = { direct: directRun, selected: nativeRun, ncp: ncpRun };
    }

    // Warm runs reuse connected client/server sessions and exercise identical
    // one-tool execution inputs.
    for (let i = 0; i < ITERATIONS; i += 1) {
      let start = process.hrtime.bigint();
      assert.deepEqual((await directWorkflow(direct)).result, benchmarkResult);
      directWarm.push(ms(start));
      assert.deepEqual((await selectedToolWorkflow(direct)).result, benchmarkResult);
      start = process.hrtime.bigint();
      const run = await ncpWorkflow(ncp);
      ncpWarm.push(ms(start));
      assert.deepEqual(run.result, benchmarkResult);
    }
  } finally {
    await Promise.all([direct.close(), ncp.close()]);
  }

  const directCatalogBytes = payloads.direct.listBytes;
  const selectedCatalogBytes = payloads.selected.listBytes;
  const ncpCatalogBytes = payloads.ncp.listBytes;
  const directWorkflowBytes = directCatalogBytes + payloads.direct.requestBytes + bytes(payloads.direct.result);
  const nativeWorkflowBytes = selectedCatalogBytes + payloads.selected.requestBytes + bytes(payloads.selected.result);
  const ncpWorkflowBytes = ncpCatalogBytes + payloads.ncp.requestBytes + payloads.ncp.findResponseBytes + bytes(payloads.ncp.result);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    workload: {
      downstreamToolCount: 192,
      selectedTool: BENCHMARK_TOOL,
      query: BENCHMARK_QUERY,
      iterations: ITERATIONS,
      profile: 'deterministic in-process MCP fixture; no network or model calls',
    },
    methods: {
      directFullCatalog: {
        catalogBytes: directCatalogBytes,
        workflowRequestBytes: payloads.direct.requestBytes,
        workflowPayloadBytes: directWorkflowBytes,
        cold: stats(directCold),
        warm: stats(directWarm),
      },
      selectedToolPayloadLowerBound: {
        catalogBytes: selectedCatalogBytes,
        workflowRequestBytes: payloads.selected.requestBytes,
        workflowPayloadBytes: nativeWorkflowBytes,
        note: 'Hypothetical host-side one-tool catalog selection; MCP tools/list has no standard per-tool filter, so this is a payload lower bound.',
      },
      ncpDeferredFindRun: {
        advertisedCoreCatalogBytes: ncpCatalogBytes,
        workflowRequestBytes: payloads.ncp.requestBytes,
        findResponseBytes: payloads.ncp.findResponseBytes,
        workflowPayloadBytes: ncpWorkflowBytes,
        cold: stats(ncpCold),
        warm: stats(ncpWarm),
      },
    },
    success: {
      direct: { passed: ITERATIONS * 2, failed: 0 },
      selectedToolPayloadLowerBound: { passed: ITERATIONS * 2, failed: 0 },
      ncpDeferredFindRun: { passed: ITERATIONS * 2, failed: 0 },
    },
    resultFidelity: {
      directToFixtureExact: true,
      selectedToFixtureExact: true,
      ncpToFixtureExact: true,
      comparedFields: ['content including image block', 'structuredContent', '_meta'],
    },
    tokenProxy: {
      method: 'serialized JSON bytes divided by four, rounded up',
      values: {
        directCatalog: Math.ceil(directCatalogBytes / 4),
        selectedCatalog: Math.ceil(selectedCatalogBytes / 4),
        ncpCoreCatalog: Math.ceil(ncpCatalogBytes / 4),
        directWorkflow: Math.ceil(directWorkflowBytes / 4),
        selectedToolWorkflow: Math.ceil(nativeWorkflowBytes / 4),
        ncpWorkflow: Math.ceil(ncpWorkflowBytes / 4),
      },
      limitation: 'Byte-based rough proxy only; excludes transport framing and model tokenization, and does not estimate all prompt/context reuse behavior.',
    },
    limitations: [
      'Cold latency includes server/client fixture construction, in-memory connection, and the first workflow call; warm latency reuses connected sessions. Both exclude host model planning, real MCP processes, network latency, and embedding model initialization.',
      'The discovery engine is seeded to return the correct fixture result; search relevance and misses are not benchmarked.',
      'NCP uses its real MCPServer tools/list/tools/call handlers and NCPOrchestrator find/run methods, with a controlled downstream connection result.',
      'The selected-tool row is an explicitly hypothetical selective catalog payload, not an MCP protocol feature.',
      'The result is deterministic correctness evidence and a reproducibility harness, not a claim about production host performance.',
    ],
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
