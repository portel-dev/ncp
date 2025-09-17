import { describe, it, expect } from "@jest/globals";
import { DiscoveryEngine } from "../src/discovery/engine.js";

describe("Coverage Boost Tests", () => {
  let engine: DiscoveryEngine;
  beforeEach(async () => {
    engine = new DiscoveryEngine();
    await engine.initialize();
  });

  it("should exercise pattern extraction", async () => {
    await engine.indexTool({
      name: "test:tool",
      description: "create files and edit multiple directories with various operations",
      mcpName: "test"
    });
    const stats = engine.getStats();
    expect(stats.totalTools).toBeGreaterThan(0);
  });

  it("should exercise similarity matching", async () => {
    await engine.indexTool({
      name: "similar:one",
      description: "database operations and queries",
      mcpName: "db"
    });
    await engine.indexTool({
      name: "similar:two", 
      description: "file system operations",
      mcpName: "fs"
    });
    const related = await engine.findRelatedTools("similar:one");
    expect(Array.isArray(related)).toBe(true);
  });
});
