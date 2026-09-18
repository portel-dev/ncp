/**
 * Capability Detector
 *
 * Detects and tracks client capabilities from MCP protocol initialization.
 * Enables feature negotiation for sampling, progress, roots, logging, etc.
 */

export interface ClientCapabilities {
  sampling?: Record<string, unknown>;
  roots?: {
    listChanged?: boolean;
  };
  elicitation?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  completions?: Record<string, unknown>;
  progressNotifications?: boolean;
  structuredContent?: boolean;
  mcpApps?: Record<string, unknown>;
}

export class CapabilityDetector {
  private capabilities: ClientCapabilities = {};
  private supported: Set<string> = new Set();

  /**
   * Update capabilities from client initialize response
   */
  updateFromClientCapabilities(clientCapabilities: any): void {
    if (!clientCapabilities) {
      return;
    }

    // Check for logging capability
    if (clientCapabilities.logging) {
      this.capabilities.logging = clientCapabilities.logging;
      this.supported.add('logging');
    }

    // Check for completions capability
    if (clientCapabilities.completions) {
      this.capabilities.completions = clientCapabilities.completions;
      this.supported.add('completions');
    }

    // Current MCP revisions advertise server-request capabilities at the
    // client top level. Keep the experimental lookup for older clients.
    const experimental = clientCapabilities.experimental || {};

    const sampling = clientCapabilities.sampling || experimental.sampling;
    if (sampling) {
      this.capabilities.sampling = sampling;
      this.supported.add('sampling');
    }

    const roots = clientCapabilities.roots || experimental.roots;
    if (roots) {
      this.capabilities.roots = roots;
      this.supported.add('roots');
    }

    const elicitation = clientCapabilities.elicitation || experimental.elicitation;
    if (elicitation) {
      this.capabilities.elicitation = elicitation;
      this.supported.add('elicitation');
    }

    if (experimental.mcpApps) {
      this.capabilities.mcpApps = experimental.mcpApps;
      this.supported.add('mcpApps');
    }

    // Note: Progress and structured content are always supported by modern SDK
    // but we track them explicitly
    this.capabilities.progressNotifications = true;
    this.capabilities.structuredContent = true;
    this.supported.add('progressNotifications');
    this.supported.add('structuredContent');
  }

  /**
   * Check if a capability is supported by the client
   */
  supports(capability: keyof ClientCapabilities): boolean {
    return this.supported.has(capability);
  }

  /**
   * Get all supported capabilities
   */
  getSupportedCapabilities(): string[] {
    return Array.from(this.supported);
  }

  /**
   * Get capability details
   */
  getCapability(capability: keyof ClientCapabilities): any {
    return this.capabilities[capability];
  }

  /**
   * Get all detected capabilities
   */
  getAllCapabilities(): ClientCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Reset capabilities
   */
  reset(): void {
    this.capabilities = {};
    this.supported.clear();
  }
}
