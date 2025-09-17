/**
 * Dynamic Schema Examples Generator
 * 
 * Generates realistic examples from actual available tools instead of hardcoded dummy examples
 */

export class SchemaExamplesGenerator {
  private tools: Array<{name: string, description: string}> = [];
  
  constructor(availableTools: Array<{name: string, description: string}>) {
    this.tools = availableTools;
  }
  
  /**
   * Get realistic tool execution examples
   */
  getToolExecutionExamples(): string[] {
    const examples: string[] = [];
    
    // Always include Shell if available (most common)
    const shellTool = this.tools.find(t => t.name.startsWith('Shell:'));
    if (shellTool) {
      examples.push(shellTool.name);
    }
    
    // Add file operation example
    const fileTools = this.tools.filter(t => 
      t.description?.toLowerCase().includes('file') || 
      t.name.includes('write') || 
      t.name.includes('read')
    );
    if (fileTools.length > 0) {
      examples.push(fileTools[0].name);
    }
    
    // Add one more diverse example
    const otherTool = this.tools.find(t => 
      !t.name.startsWith('Shell:') && 
      !examples.includes(t.name)
    );
    if (otherTool) {
      examples.push(otherTool.name);
    }
    
    return examples.slice(0, 3); // Max 3 examples
  }
  
  /**
   * Get realistic discovery query examples
   */
  getDiscoveryExamples(): string[] {
    const examples: string[] = [];
    
    // Analyze available tools to suggest realistic queries
    const hasFileOps = this.tools.some(t => t.description?.toLowerCase().includes('file'));
    const hasGit = this.tools.some(t => t.description?.toLowerCase().includes('git'));
    const hasWeb = this.tools.some(t => t.description?.toLowerCase().includes('web') || t.description?.toLowerCase().includes('search'));
    
    if (hasFileOps) examples.push('create a new file');
    if (hasGit) examples.push('check git status');
    if (hasWeb) examples.push('search the web');
    
    // Generic fallbacks
    if (examples.length === 0) {
      examples.push('run a command', 'list files');
    }
    
    return examples.slice(0, 3);
  }
  
  /**
   * Generate complete tool execution schema with dynamic examples
   */
  getToolExecutionSchema() {
    const examples = this.getToolExecutionExamples();
    const exampleText = examples.length > 0 
      ? `(e.g., ${examples.map(e => `"${e}"`).join(', ')})`
      : '(use the discover_tools command to find available tools)';
      
    return {
      type: 'string',
      description: `The specific tool name to execute ${exampleText}`
    };
  }
  
  /**
   * Generate discovery schema with realistic examples
   */
  getDiscoverySchema() {
    const examples = this.getDiscoveryExamples();
    const exampleText = examples.length > 0 
      ? `(e.g., ${examples.map(e => `"${e}"`).join(', ')})`
      : '';
      
    return {
      type: 'string',
      description: `Natural language description of what you want to do ${exampleText}`
    };
  }
  
  /**
   * Get tool categories for better organization
   */
  getToolCategories(): {[category: string]: string[]} {
    const categories: {[category: string]: string[]} = {};
    
    for (const tool of this.tools) {
      const desc = tool.description?.toLowerCase() || '';
      const name = tool.name.toLowerCase();
      
      if (name.includes('shell') || desc.includes('command')) {
        categories['System Commands'] = categories['System Commands'] || [];
        categories['System Commands'].push(tool.name);
      } else if (desc.includes('file') || name.includes('read') || name.includes('write')) {
        categories['File Operations'] = categories['File Operations'] || [];
        categories['File Operations'].push(tool.name);
      } else if (desc.includes('web') || desc.includes('search')) {
        categories['Web & Search'] = categories['Web & Search'] || [];
        categories['Web & Search'].push(tool.name);
      } else if (desc.includes('git')) {
        categories['Git Operations'] = categories['Git Operations'] || [];
        categories['Git Operations'].push(tool.name);
      } else {
        categories['Other Tools'] = categories['Other Tools'] || [];
        categories['Other Tools'].push(tool.name);
      }
    }
    
    return categories;
  }
}

/**
 * Fallback examples when no tools are available yet (startup scenario)
 */
export const FALLBACK_EXAMPLES = {
  toolExecution: [
    '"Shell:run_command"',
    '"desktop-commander:write_file"'
  ],
  discovery: [
    '"run a shell command"',
    '"create a new file"',
    '"search for something"'
  ]
};