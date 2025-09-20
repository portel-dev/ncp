/**
 * Shared service for MCP descriptions
 * Provides user-friendly descriptions for MCP servers
 */

export class MCPDescriptions {
  private static readonly descriptions: Record<string, string> = {
    'filesystem': 'File and directory operations',
    'memory': 'Persistent memory and note-taking',
    'sequential-thinking': 'Step-by-step reasoning and analysis',
    'shell': 'System shell command execution',
    'portel': 'Portel integration and tools',
    'tavily': 'Web search and research',
    'desktop-commander': 'Desktop automation and control',
    'stripe': 'Payment processing and Stripe API',
    'context7-mcp': 'Context7 documentation and library access',
    'github': 'GitHub repository operations',
    'git': 'Git version control operations',
    'gitlab': 'GitLab integration',
    'slack': 'Slack messaging',
    'database': 'Database operations and queries',
    'web-search': 'Web search and information retrieval',
    'demo-fs': 'Demo filesystem operations',
    'demo-web': 'Demo web search functionality',
    'test-mcp2': 'Test MCP server'
  };

  /**
   * Get user-friendly description for an MCP
   */
  static getDescription(mcpName: string): string {
    const normalizedName = mcpName.toLowerCase();
    return this.descriptions[normalizedName] || 'MCP tools';
  }

  /**
   * Get all known MCP names
   */
  static getKnownMCPs(): string[] {
    return Object.keys(this.descriptions).sort();
  }

  /**
   * Add or update an MCP description (for runtime configuration)
   */
  static addDescription(mcpName: string, description: string): void {
    this.descriptions[mcpName.toLowerCase()] = description;
  }

  /**
   * Check if an MCP has a known description
   */
  static hasDescription(mcpName: string): boolean {
    return mcpName.toLowerCase() in this.descriptions;
  }
}