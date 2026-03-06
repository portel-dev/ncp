/**
 * Auto-Resource Detector
 * Identifies tools that could be efficiently exposed as resources for direct access
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  mcpName: string;
}

export interface ResourceCandidate {
  toolName: string;
  mcpName: string;
  confidence: number;
  suggestedUri: string;
  reasoning: string[];
  parameters: ParameterMapping[];
}

export interface ParameterMapping {
  toolParam: string;
  uriPosition: string;
  required: boolean;
  type: string;
}

export class AutoResourceDetector {

  /**
   * Main detection method - identifies tools suitable for resource conversion
   */
  detectResourceCandidates(tools: ToolDefinition[]): ResourceCandidate[] {
    const candidates: ResourceCandidate[] = [];

    for (const tool of tools) {
      const analysis = this.analyzeTool(tool);
      if (analysis.confidence >= 0.6) { // 60% confidence threshold
        candidates.push(analysis);
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze individual tool for resource suitability
   */
  private analyzeTool(tool: ToolDefinition): ResourceCandidate {
    const reasoning: string[] = [];
    let confidence = 0;

    // 1. Naming Pattern Analysis (40% weight)
    const namingScore = this.analyzeNaming(tool.name, reasoning);
    confidence += namingScore * 0.4;

    // 2. Parameter Complexity Analysis (30% weight)
    const parameterScore = this.analyzeParameters(tool.inputSchema, reasoning);
    confidence += parameterScore * 0.3;

    // 3. Description Analysis (20% weight)
    const descriptionScore = this.analyzeDescription(tool.description, reasoning);
    confidence += descriptionScore * 0.2;

    // 4. Operation Type Analysis (10% weight)
    const operationScore = this.analyzeOperation(tool.name, tool.description, reasoning);
    confidence += operationScore * 0.1;

    // Generate URI template
    const parameters = this.extractParameterMappings(tool.inputSchema);
    const suggestedUri = this.generateUriTemplate(tool.mcpName, tool.name, parameters);

    return {
      toolName: tool.name,
      mcpName: tool.mcpName,
      confidence: Math.min(confidence, 1.0),
      suggestedUri,
      reasoning,
      parameters
    };
  }

  /**
   * Analyze tool naming patterns for resource suitability
   */
  private analyzeNaming(toolName: string, reasoning: string[]): number {
    const lowerName = toolName.toLowerCase();

    // High confidence patterns (read-only operations)
    const readPatterns = ['read_', 'get_', 'fetch_', 'retrieve_', 'show_', 'view_'];
    const listPatterns = ['list_', 'find_', 'search_', 'query_', 'browse_'];
    const infoPatterns = ['info_', 'status_', 'stat_', 'check_', 'ping_', 'health_'];

    // Anti-patterns (mutating operations)
    const mutatingPatterns = ['create_', 'write_', 'update_', 'delete_', 'remove_',
                             'modify_', 'edit_', 'set_', 'put_', 'post_', 'patch_',
                             'move_', 'copy_', 'rename_', 'change_'];

    // Check for mutating patterns (immediate disqualification)
    for (const pattern of mutatingPatterns) {
      if (lowerName.startsWith(pattern) || lowerName.includes(pattern)) {
        reasoning.push(`❌ Mutating operation pattern: ${pattern}`);
        return 0;
      }
    }

    // Check for positive patterns
    let score = 0;
    for (const pattern of readPatterns) {
      if (lowerName.startsWith(pattern)) {
        reasoning.push(`✅ Read operation pattern: ${pattern}`);
        score = Math.max(score, 0.9);
      }
    }

    for (const pattern of listPatterns) {
      if (lowerName.startsWith(pattern)) {
        reasoning.push(`✅ List operation pattern: ${pattern}`);
        score = Math.max(score, 0.8);
      }
    }

    for (const pattern of infoPatterns) {
      if (lowerName.startsWith(pattern)) {
        reasoning.push(`✅ Info operation pattern: ${pattern}`);
        score = Math.max(score, 0.7);
      }
    }

    if (score === 0) {
      reasoning.push(`⚠️ No clear data-retrieval pattern identified`);
      score = 0.3; // Neutral score for unclear patterns
    }

    return score;
  }

  /**
   * Analyze parameter complexity - simpler is better for resources
   */
  private analyzeParameters(inputSchema: any, reasoning: string[]): number {
    if (!inputSchema || !inputSchema.properties) {
      reasoning.push(`✅ No parameters - ideal for resource`);
      return 1.0;
    }

    const paramCount = Object.keys(inputSchema.properties).length;

    if (paramCount === 0) {
      reasoning.push(`✅ No parameters required`);
      return 1.0;
    } else if (paramCount <= 2) {
      reasoning.push(`✅ Simple parameter set (${paramCount} params)`);
      return 0.9;
    } else if (paramCount <= 4) {
      reasoning.push(`⚠️ Moderate parameter complexity (${paramCount} params)`);
      return 0.6;
    } else {
      reasoning.push(`❌ Too many parameters (${paramCount} params)`);
      return 0.2;
    }
  }

  /**
   * Analyze description for resource indicators
   */
  private analyzeDescription(description: string, reasoning: string[]): number {
    if (!description) return 0.5;

    const lowerDesc = description.toLowerCase();
    let score = 0.5; // Neutral starting point

    // Positive indicators
    const readIndicators = ['read', 'get', 'retrieve', 'fetch', 'return', 'show', 'display'];
    const dataIndicators = ['content', 'information', 'data', 'details', 'metadata'];

    // Negative indicators
    const writeIndicators = ['create', 'write', 'update', 'delete', 'modify', 'change', 'set'];

    for (const indicator of readIndicators) {
      if (lowerDesc.includes(indicator)) {
        reasoning.push(`✅ Description suggests read operation: "${indicator}"`);
        score = Math.max(score, 0.8);
        break;
      }
    }

    for (const indicator of dataIndicators) {
      if (lowerDesc.includes(indicator)) {
        reasoning.push(`✅ Description mentions data access: "${indicator}"`);
        score = Math.max(score, 0.7);
        break;
      }
    }

    for (const indicator of writeIndicators) {
      if (lowerDesc.includes(indicator)) {
        reasoning.push(`❌ Description suggests write operation: "${indicator}"`);
        return 0.1;
      }
    }

    return score;
  }

  /**
   * Analyze operation type for mutating vs non-mutating
   */
  private analyzeOperation(toolName: string, description: string, reasoning: string[]): number {
    const combined = `${toolName} ${description}`.toLowerCase();

    // Check for idempotent operations (safe to call multiple times)
    const idempotentKeywords = ['read', 'get', 'fetch', 'list', 'search', 'find', 'check', 'ping', 'status'];
    const mutatingKeywords = ['create', 'delete', 'update', 'write', 'modify', 'send', 'execute', 'run'];

    for (const keyword of idempotentKeywords) {
      if (combined.includes(keyword)) {
        reasoning.push(`✅ Idempotent operation detected: ${keyword}`);
        return 0.9;
      }
    }

    for (const keyword of mutatingKeywords) {
      if (combined.includes(keyword)) {
        reasoning.push(`❌ Mutating operation detected: ${keyword}`);
        return 0.1;
      }
    }

    reasoning.push(`⚠️ Operation type unclear`);
    return 0.5;
  }

  /**
   * Extract parameter mappings for URI template generation
   */
  private extractParameterMappings(inputSchema: any): ParameterMapping[] {
    if (!inputSchema || !inputSchema.properties) {
      return [];
    }

    const mappings: ParameterMapping[] = [];
    const properties = inputSchema.properties;
    const required = inputSchema.required || [];

    for (const [paramName, paramDef] of Object.entries(properties)) {
      mappings.push({
        toolParam: paramName,
        uriPosition: `{${paramName}}`,
        required: required.includes(paramName),
        type: (paramDef as any).type || 'string'
      });
    }

    return mappings;
  }

  /**
   * Generate URI template for resource access
   */
  private generateUriTemplate(mcpName: string, toolName: string, parameters: ParameterMapping[]): string {
    // Remove common prefixes to create cleaner URIs
    const cleanToolName = toolName
      .replace(/^(get_|read_|fetch_|list_|search_|find_)/, '')
      .replace(/_/g, '/');

    let template = `${mcpName}://${cleanToolName}`;

    // Add required parameters to URI path
    const requiredParams = parameters.filter(p => p.required);
    if (requiredParams.length > 0) {
      const paramPath = requiredParams.map(p => p.uriPosition).join('/');
      template += `/${paramPath}`;
    }

    return template;
  }

  /**
   * Get efficiency gain estimate for tool-to-resource conversion
   */
  getEfficiencyGain(candidate: ResourceCandidate): {
    tokenSavings: number;
    latencyReduction: number;
    reasoning: string[];
  } {
    const reasoning: string[] = [];
    let tokenSavings = 0;
    let latencyReduction = 0;

    // Estimate token savings based on parameter complexity
    const paramCount = candidate.parameters.length;
    if (paramCount <= 2) {
      tokenSavings = 0.6; // 60% token reduction for simple resources
      reasoning.push(`High token savings expected: simple parameter set`);
    } else {
      tokenSavings = 0.3; // 30% token reduction for complex resources
      reasoning.push(`Moderate token savings expected: complex parameter set`);
    }

    // Estimate latency reduction based on operation type
    if (candidate.toolName.startsWith('read_') || candidate.toolName.startsWith('get_')) {
      latencyReduction = 0.5; // 50% latency reduction for direct data access
      reasoning.push(`High latency reduction: direct data access`);
    } else {
      latencyReduction = 0.2; // 20% latency reduction for other operations
      reasoning.push(`Moderate latency reduction: processed data access`);
    }

    return { tokenSavings, latencyReduction, reasoning };
  }
}