import { describe, it, expect } from "@jest/globals";
import { MCPHealthMonitor } from "../src/utils/health-monitor.js";

describe("Quick Coverage Boost", () => {
  it("should trigger auto-disable warning", () => {
    const monitor = new MCPHealthMonitor();
    // Trigger 3+ errors to hit line 352
    monitor.markUnhealthy("autodisable", "Error 1");
    monitor.markUnhealthy("autodisable", "Error 2");
    monitor.markUnhealthy("autodisable", "Error 3");
    const health = monitor.getMCPHealth("autodisable");
    expect(health?.status).toBe("disabled");
  });
});
