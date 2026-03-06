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
  logging?: Record<string, unknown>;
  completions?: Record<string, unknown>;
  progressNotifications?: boolean;
  structuredContent?: boolean;
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

    // Check for experimental capabilities (sampling, roots, etc.)
    const experimental = clientCapabilities.experimental || {};

    if (experimental.sampling) {
      this.capabilities.sampling = experimental.sampling;
      this.supported.add('sampling');
    }

    if (experimental.roots) {
      this.capabilities.roots = experimental.roots;
      this.supported.add('roots');
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
