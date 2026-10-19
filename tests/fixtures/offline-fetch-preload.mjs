// Force network-dependent RAG model loading to fail immediately in the client simulation.
// rag-engine catches this and uses its keyword-based fallback; the test covers that path,
// not semantic model quality.
globalThis.fetch = async (input) => {
  const url = input instanceof URL ? input.href : String(input);
  throw new Error(`Network disabled by MCP client simulation: ${url}`);
};
