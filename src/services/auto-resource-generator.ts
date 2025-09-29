/**
 * Auto-Resource Generator
 * Creates efficient resource endpoints from existing tools for direct AI access
 *
 * Core Innovation: Pre-formatted resources eliminate AI processing overhead
 * by providing human-readable data instead of raw tool responses
 */

import { ResourceCandidate, ParameterMapping } from './auto-resource-detector.js';
import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';
import { logger } from '../utils/logger.js';

export interface GeneratedResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  sourceToolName: string;
  sourceMcpName: string;
  parameterMappings: ParameterMapping[];
  accessPattern: 'direct' | 'templated';
}

export interface ResourceExecutionResult {
  success: boolean;
  content: string;
  error?: string;
  sourceData?: any;
  processingTime?: number;
}

export class AutoResourceGenerator {
  private generatedResources: Map<string, GeneratedResource> = new Map();
  private orchestrator: NCPOrchestrator;

  constructor(orchestrator: NCPOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Generate resource endpoints from detected candidates
   */
  async generateResources(candidates: ResourceCandidate[]): Promise<GeneratedResource[]> {
    const resources: GeneratedResource[] = [];

    for (const candidate of candidates) {
      if (candidate.confidence >= 0.7) { // Only generate high-confidence resources
        const resource = this.createResourceFromCandidate(candidate);
        resources.push(resource);
        this.generatedResources.set(resource.uri, resource);

        logger.info(`Generated auto-resource: ${resource.uri} (from ${candidate.mcpName}:${candidate.toolName})`);
      }
    }

    return resources;
  }

  /**
   * Create resource definition from candidate
   */
  private createResourceFromCandidate(candidate: ResourceCandidate): GeneratedResource {
    const hasParameters = candidate.parameters.length > 0;

    return {
      uri: candidate.suggestedUri,
      name: `Auto-Generated: ${candidate.toolName}`,
      description: `Efficient resource access for ${candidate.toolName}. ${this.generateUsageHint(candidate)}`,
      mimeType: this.determineMimeType(candidate),
      sourceToolName: candidate.toolName,
      sourceMcpName: candidate.mcpName,
      parameterMappings: candidate.parameters,
      accessPattern: hasParameters ? 'templated' : 'direct'
    };
  }

  /**
   * Execute resource access by calling underlying tool and formatting response
   */
  async executeResource(uri: string, parameters: Record<string, string> = {}): Promise<ResourceExecutionResult> {
    const startTime = Date.now();

    try {
      const resource = this.generatedResources.get(this.getResourceTemplate(uri));
      if (!resource) {
        return {
          success: false,
          content: '',
          error: `Resource not found: ${uri}`
        };
      }

      // Map URI parameters to tool parameters
      const toolParameters = this.mapUriParametersToTool(uri, parameters, resource);

      // Execute underlying tool
      const toolIdentifier = `${resource.sourceMcpName}:${resource.sourceToolName}`;
      const toolResult = await this.orchestrator.run(toolIdentifier, toolParameters);

      if (!toolResult.success) {
        return {
          success: false,
          content: '',
          error: toolResult.error || 'Tool execution failed'
        };
      }

      // Format response for efficient consumption
      const formattedContent = this.formatResourceContent(
        toolResult.content,
        resource,
        toolParameters
      );

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        content: formattedContent,
        sourceData: toolResult.content,
        processingTime
      };

    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Resource execution failed'
      };
    }
  }

  /**
   * Format tool response for optimal resource consumption
   */
  private formatResourceContent(
    toolResponse: any,
    resource: GeneratedResource,
    parameters: Record<string, any>
  ): string {
    // Custom formatting based on resource type and tool pattern
    const toolName = resource.sourceToolName.toLowerCase();

    // File operations
    if (toolName.includes('read_file')) {
      return this.formatFileContent(toolResponse, parameters);
    }

    // Directory listings
    if (toolName.includes('list_directory') || toolName.includes('list_files')) {
      return this.formatDirectoryListing(toolResponse, parameters);
    }

    // Database queries
    if (toolName.includes('query') || toolName.includes('read_query')) {
      return this.formatDatabaseResult(toolResponse, parameters);
    }

    // Status/info operations
    if (toolName.includes('status') || toolName.includes('info') || toolName.includes('health')) {
      return this.formatStatusInfo(toolResponse, parameters);
    }

    // Search results
    if (toolName.includes('search') || toolName.includes('find')) {
      return this.formatSearchResults(toolResponse, parameters);
    }

    // Generic formatting for other types
    return this.formatGenericResponse(toolResponse, resource, parameters);
  }

  /**
   * Format file content for direct consumption
   */
  private formatFileContent(response: any, parameters: Record<string, any>): string {
    const path = parameters.path || 'unknown';
    const content = typeof response === 'string' ? response : JSON.stringify(response, null, 2);

    return `# File: ${path}\n\n${content}`;
  }

  /**
   * Format directory listing for readability
   */
  private formatDirectoryListing(response: any, parameters: Record<string, any>): string {
    const path = parameters.path || 'unknown';
    let output = `# Directory Listing: ${path}\n\n`;

    if (Array.isArray(response)) {
      response.forEach((item, index) => {
        const name = item.name || item.filename || item;
        const type = item.type || (item.isDirectory ? 'directory' : 'file');
        const size = item.size ? ` (${this.formatFileSize(item.size)})` : '';

        output += `${index + 1}. ${type === 'directory' ? '📁' : '📄'} ${name}${size}\n`;
      });
    } else if (typeof response === 'object') {
      output += JSON.stringify(response, null, 2);
    } else {
      output += response.toString();
    }

    return output;
  }

  /**
   * Format database query results
   */
  private formatDatabaseResult(response: any, parameters: Record<string, any>): string {
    const query = parameters.query || 'Database Query';
    let output = `# Query Result: ${query}\n\n`;

    if (Array.isArray(response)) {
      if (response.length === 0) {
        output += 'No results found.\n';
      } else {
        // Format as table
        const headers = Object.keys(response[0] || {});
        if (headers.length > 0) {
          output += `| ${headers.join(' | ')} |\n`;
          output += `|${headers.map(() => '---').join('|')}|\n`;

          response.forEach(row => {
            const values = headers.map(header => row[header] || '');
            output += `| ${values.join(' | ')} |\n`;
          });
        }
      }
    } else {
      output += JSON.stringify(response, null, 2);
    }

    return output;
  }

  /**
   * Format status/health information
   */
  private formatStatusInfo(response: any, parameters: Record<string, any>): string {
    let output = `# Status Information\n\n`;

    if (typeof response === 'object') {
      for (const [key, value] of Object.entries(response)) {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        output += `**${formattedKey}**: ${value}\n`;
      }
    } else {
      output += response.toString();
    }

    return output;
  }

  /**
   * Format search results for easy scanning
   */
  private formatSearchResults(response: any, parameters: Record<string, any>): string {
    const query = parameters.pattern || parameters.query || parameters.search || 'Search';
    let output = `# Search Results: ${query}\n\n`;

    if (Array.isArray(response)) {
      if (response.length === 0) {
        output += 'No matches found.\n';
      } else {
        response.forEach((result, index) => {
          const name = result.name || result.path || result.title || result;
          const location = result.path || result.location || result.url || '';
          const snippet = result.snippet || result.description || '';

          output += `## ${index + 1}. ${name}\n`;
          if (location) output += `**Location**: ${location}\n`;
          if (snippet) output += `**Description**: ${snippet}\n`;
          output += '\n';
        });
      }
    } else {
      output += JSON.stringify(response, null, 2);
    }

    return output;
  }

  /**
   * Generic response formatting
   */
  private formatGenericResponse(response: any, resource: GeneratedResource, parameters: Record<string, any>): string {
    let output = `# ${resource.sourceToolName} Result\n\n`;

    if (typeof response === 'string') {
      output += response;
    } else if (typeof response === 'object') {
      output += JSON.stringify(response, null, 2);
    } else {
      output += response?.toString() || 'No content available';
    }

    return output;
  }

  /**
   * Map URI parameters back to tool parameters
   */
  private mapUriParametersToTool(
    uri: string,
    queryParams: Record<string, string>,
    resource: GeneratedResource
  ): Record<string, any> {
    const toolParams: Record<string, any> = {};

    // Extract path parameters from URI
    const template = resource.uri;
    const pathParams = this.extractPathParameters(uri, template);

    // Map path parameters
    for (const mapping of resource.parameterMappings) {
      const paramName = mapping.toolParam;
      const uriParam = mapping.uriPosition.replace(/[{}]/g, ''); // Remove {braces}

      if (pathParams[uriParam] !== undefined) {
        toolParams[paramName] = this.convertParameterType(pathParams[uriParam], mapping.type);
      } else if (queryParams[paramName] !== undefined) {
        toolParams[paramName] = this.convertParameterType(queryParams[paramName], mapping.type);
      }
    }

    return toolParams;
  }

  /**
   * Extract parameters from URI path
   */
  private extractPathParameters(uri: string, template: string): Record<string, string> {
    const params: Record<string, string> = {};

    // Simple parameter extraction - could be enhanced with proper URI template parsing
    const uriParts = uri.split('/');
    const templateParts = template.split('/');

    for (let i = 0; i < Math.min(uriParts.length, templateParts.length); i++) {
      const templatePart = templateParts[i];
      const uriPart = uriParts[i];

      if (templatePart.startsWith('{') && templatePart.endsWith('}')) {
        const paramName = templatePart.slice(1, -1);
        params[paramName] = decodeURIComponent(uriPart);
      }
    }

    return params;
  }

  /**
   * Convert parameter to appropriate type
   */
  private convertParameterType(value: string, type: string): any {
    switch (type) {
      case 'number':
      case 'integer':
        return Number(value);
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'array':
        return value.split(',').map(v => v.trim());
      default:
        return value;
    }
  }

  /**
   * Get resource template from specific URI
   */
  private getResourceTemplate(uri: string): string {
    // Find matching template by replacing parameters with placeholders
    for (const template of this.generatedResources.keys()) {
      if (this.uriMatchesTemplate(uri, template)) {
        return template;
      }
    }
    return uri;
  }

  /**
   * Check if URI matches template pattern
   */
  private uriMatchesTemplate(uri: string, template: string): boolean {
    const uriParts = uri.split('/');
    const templateParts = template.split('/');

    if (uriParts.length !== templateParts.length) {
      return false;
    }

    for (let i = 0; i < uriParts.length; i++) {
      const templatePart = templateParts[i];
      const uriPart = uriParts[i];

      // If template part is a parameter, skip validation
      if (templatePart.startsWith('{') && templatePart.endsWith('}')) {
        continue;
      }

      // Exact match required for non-parameter parts
      if (templatePart !== uriPart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Determine appropriate MIME type for resource
   */
  private determineMimeType(candidate: ResourceCandidate): string {
    const toolName = candidate.toolName.toLowerCase();

    if (toolName.includes('read_file')) {
      return 'text/plain';
    }
    if (toolName.includes('query') || toolName.includes('search')) {
      return 'text/markdown';
    }
    if (toolName.includes('status') || toolName.includes('info')) {
      return 'text/markdown';
    }
    if (toolName.includes('list')) {
      return 'text/markdown';
    }

    return 'text/markdown'; // Default to markdown for rich formatting
  }

  /**
   * Generate usage hint for resource
   */
  private generateUsageHint(candidate: ResourceCandidate): string {
    if (candidate.parameters.length === 0) {
      return `Access directly via: ${candidate.suggestedUri}`;
    }

    const paramHints = candidate.parameters
      .filter(p => p.required)
      .map(p => `{${p.toolParam}}`)
      .join(', ');

    return `Requires parameters: ${paramHints}`;
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get all generated resources for listing
   */
  getGeneratedResources(): GeneratedResource[] {
    return Array.from(this.generatedResources.values());
  }

  /**
   * Get efficiency statistics
   */
  getEfficiencyStats(): {
    totalGenerated: number;
    directAccess: number;
    templatedAccess: number;
    coverageByMcp: Record<string, number>;
  } {
    const resources = this.getGeneratedResources();
    const coverageByMcp: Record<string, number> = {};

    let directAccess = 0;
    let templatedAccess = 0;

    for (const resource of resources) {
      if (resource.accessPattern === 'direct') {
        directAccess++;
      } else {
        templatedAccess++;
      }

      coverageByMcp[resource.sourceMcpName] = (coverageByMcp[resource.sourceMcpName] || 0) + 1;
    }

    return {
      totalGenerated: resources.length,
      directAccess,
      templatedAccess,
      coverageByMcp
    };
  }
}