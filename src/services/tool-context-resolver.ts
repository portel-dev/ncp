/**
 * Shared service for resolving tool contexts
 * Maps MCP names to their context types for parameter prediction
 */

export class ToolContextResolver {
  private static readonly contextMap: Record<string, string> = {
    'filesystem': 'filesystem',
    'memory': 'database',
    'shell': 'system',
    'sequential-thinking': 'ai',
    'portel': 'development',
    'tavily': 'web',
    'desktop-commander': 'system',
    'stripe': 'payment',
    'context7-mcp': 'documentation',
    'search': 'search',
    'weather': 'weather',
    'http': 'web',
    'github': 'development',
    'gitlab': 'development',
    'slack': 'communication',
    'discord': 'communication',
    'email': 'communication',
    'database': 'database',
    'redis': 'database',
    'mongodb': 'database',
    'postgresql': 'database',
    'mysql': 'database',
    'elasticsearch': 'search',
    'docker': 'system',
    'kubernetes': 'system',
    'aws': 'cloud',
    'azure': 'cloud',
    'gcp': 'cloud'
  };

  /**
   * Get context for a tool based on its full name (mcp:tool format)
   */
  static getContext(toolIdentifier: string): string {
    const [mcpName] = toolIdentifier.split(':');
    return this.getContextByMCP(mcpName);
  }

  /**
   * Get context for a specific MCP
   */
  static getContextByMCP(mcpName: string): string {
    if (!mcpName) return 'general';

    const normalizedName = mcpName.toLowerCase();

    // Direct match
    if (this.contextMap[normalizedName]) {
      return this.contextMap[normalizedName];
    }

    // Partial match for common patterns
    if (normalizedName.includes('file') || normalizedName.includes('fs')) {
      return 'filesystem';
    }
    if (normalizedName.includes('db') || normalizedName.includes('data')) {
      return 'database';
    }
    if (normalizedName.includes('web') || normalizedName.includes('http')) {
      return 'web';
    }
    if (normalizedName.includes('api')) {
      return 'web';
    }
    if (normalizedName.includes('cloud') || normalizedName.includes('aws') ||
        normalizedName.includes('azure') || normalizedName.includes('gcp')) {
      return 'cloud';
    }
    if (normalizedName.includes('docker') || normalizedName.includes('container')) {
      return 'system';
    }
    if (normalizedName.includes('git')) {
      return 'development';
    }

    return 'general';
  }

  /**
   * Get all known contexts
   */
  static getAllContexts(): string[] {
    const contexts = new Set(Object.values(this.contextMap));
    contexts.add('general');
    return Array.from(contexts).sort();
  }

  /**
   * Check if a context is known
   */
  static isKnownContext(context: string): boolean {
    return this.getAllContexts().includes(context);
  }

  /**
   * Add or update a context mapping (for runtime configuration)
   */
  static addMapping(mcpName: string, context: string): void {
    this.contextMap[mcpName.toLowerCase()] = context;
  }

  /**
   * Get all MCP names for a specific context
   */
  static getMCPsForContext(context: string): string[] {
    return Object.entries(this.contextMap)
      .filter(([_, ctx]) => ctx === context)
      .map(([mcp, _]) => mcp)
      .sort();
  }
}