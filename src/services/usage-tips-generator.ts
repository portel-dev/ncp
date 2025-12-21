/**
 * Shared service for generating usage tips and guidance
 * Provides contextual help for tool discovery and execution
 */

import { ParameterPredictor } from '../utils/parameter-predictor.js';
import { ToolSchemaParser } from './tool-schema-parser.js';
import { ToolContextResolver } from './tool-context-resolver.js';
import { updater } from '../utils/updater.js';

export interface UsageTipsOptions {
  depth: number;
  page: number;
  totalPages: number;
  limit: number;
  totalResults: number;
  description: string;
  mcpFilter: string | null;
  results?: any[];
  includeUpdateTip?: boolean;
}

export class UsageTipsGenerator {
  /**
   * Generate comprehensive usage tips based on context
   */
  static async generate(options: UsageTipsOptions): Promise<string> {
    const {
      depth,
      page,
      totalPages,
      limit,
      totalResults,
      description,
      mcpFilter,
      results = [],
      includeUpdateTip = true
    } = options;

    let tips = '\n💡 **Usage Tips**:\n';

    // Depth guidance
    tips += this.generateDepthTips(depth);

    // Pagination guidance
    tips += this.generatePaginationTips(page, totalPages, limit, totalResults);

    // Search guidance
    tips += this.generateSearchTips(description, mcpFilter);

    // Tool execution guidance
    tips += this.generateExecutionTips(results, depth);

    // Update tip (non-blocking)
    if (includeUpdateTip) {
      try {
        const updateTip = await updater.getUpdateTip();
        if (updateTip) {
          tips += `• ${updateTip}\n`;
        }
      } catch {
        // Fail silently - don't let update checks break the command
      }
    }

    return tips;
  }

  /**
   * Generate depth-related tips
   */
  private static generateDepthTips(depth: number): string {
    if (depth === 0) {
      return `• **See descriptions**: Use \`--depth 1\` for descriptions, \`--depth 2\` for parameters\n`;
    } else if (depth === 1) {
      return `• **See parameters**: Use \`--depth 2\` for parameter details (recommended for AI)\n` +
             `• **Quick scan**: Use \`--depth 0\` for just tool names\n`;
    } else {
      return `• **Less detail**: Use \`--depth 1\` for descriptions only or \`--depth 0\` for names only\n`;
    }
  }

  /**
   * Generate pagination-related tips
   */
  private static generatePaginationTips(page: number, totalPages: number, limit: number, totalResults: number): string {
    let tips = '';

    if (totalPages > 1) {
      tips += `• **Navigation**: `;
      if (page < totalPages) {
        tips += `\`--page ${page + 1}\` for next page, `;
      }
      if (page > 1) {
        tips += `\`--page ${page - 1}\` for previous, `;
      }
      tips += `\`--limit ${Math.min(limit * 2, 50)}\` for more per page\n`;
    } else if (totalResults > limit) {
      tips += `• **See more**: Use \`--limit ${Math.min(totalResults, 50)}\` to see all ${totalResults} results\n`;
    } else if (limit > 10 && totalResults < limit) {
      tips += `• **Smaller pages**: Use \`--limit 5\` for easier browsing\n`;
    }

    return tips;
  }

  /**
   * Generate search-related tips
   */
  private static generateSearchTips(description: string, mcpFilter: string | null): string {
    let tips = '';

    if (!description) {
      tips = `• **Search examples**: \`ncp find "filesystem"\` (MCP filter) or \`ncp find "write file"\` (cross-MCP search)\n`;
    } else if (mcpFilter) {
      tips = `• **Broader search**: Remove MCP name from query for cross-MCP results\n`;
    } else {
      tips = `• **Filter to MCP**: Use MCP name like \`ncp find "filesystem"\` to see only that MCP's tools\n`;
    }

    // Add confidence threshold guidance for search queries
    if (description) {
      tips += `• **Precision control**: \`--confidence-threshold 0.1\` (show all), \`0.5\` (strict), \`0.7\` (very precise)\n`;
    }

    return tips;
  }

  /**
   * Generate tool execution tips with examples
   */
  private static generateExecutionTips(results: any[], depth: number): string {
    if (results.length === 0) {
      return `• **Run tools**: Use \`ncp run <mcp> <tool>\` to execute (interactive prompts for parameters)\n`;
    }

    if (depth >= 2) {
      // Only show parameter examples when depth >= 2 (when schemas are available)
      const exampleTool = this.findToolWithParameters(results);
      const exampleParams = this.generateExampleParams(exampleTool);

      // Generate Code-Mode example
      const codeModeExample = this.generateCodeModeExample(results.slice(0, 3));

      // Use space-separated syntax for CLI examples
      const cmdName = exampleTool.toolName.replace(':', ' ');

      if (exampleParams === '{}') {
        return `• **Run tools**: Use \`ncp run ${cmdName}\` to execute (no parameters needed)\n` +
               `• **Code-Mode** (fastest): ${codeModeExample}\n`;
      } else {
        return `• **Run tools**: Use \`ncp run ${cmdName}\` (interactive prompts) or add arguments like \`--arg value\`\n` +
               `• **Code-Mode** (fastest): ${codeModeExample}\n`;
      }
    } else {
      // At depth 0-1, use interactive prompting
      return `• **Run tools**: Use \`ncp run ${results[0].toolName}\` to execute (interactive prompts for parameters)\n`;
    }
  }

  /**
   * Generate Code-Mode usage example from discovered tools
   */
  private static generateCodeModeExample(tools: any[]): string {
    if (tools.length === 0) return '';

    // Pick the first tool with parameters as example
    const exampleTool = this.findToolWithParameters(tools);
    const [mcpName, toolName] = exampleTool.toolName.split(':');

    // Generate example parameters based on schema
    const exampleParams = this.generateExampleParamsForCode(exampleTool);

    if (exampleParams) {
      return `\`const result = await ${mcpName}.${toolName}(${exampleParams})\``;
    } else {
      return `\`const result = await ${mcpName}.${toolName}()\``;
    }
  }

  /**
   * Generate example parameters formatted for Code-Mode (inline object)
   */
  private static generateExampleParamsForCode(tool: any): string {
    if (!tool.schema || !tool.schema.properties) return '';

    const params = ToolSchemaParser.parseParameters(tool.schema);
    const requiredParams = params.filter(p => p.required);

    // Only show required params in example, max 2 for brevity
    const paramsToShow = requiredParams.length > 0
      ? requiredParams.slice(0, 2)
      : params.slice(0, 2);

    if (paramsToShow.length === 0) return '';

    const predictor = new ParameterPredictor();
    const paramPairs = paramsToShow.map(param => {
      const value = predictor.predictValue(param.name, param.type, param.description || '');
      return `${param.name}: ${JSON.stringify(value)}`;
    });

    return `{ ${paramPairs.join(', ')} }`;
  }

  /**
   * Find a tool with parameters for better examples, fallback to first tool
   */
  private static findToolWithParameters(results: any[]): any {
    if (results.length === 0) return null;

    let exampleTool = results[0];
    let exampleParams = this.generateExampleParams(exampleTool);

    // If first tool has no parameters, try to find one that does
    if (exampleParams === '{}' && results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        const candidateParams = this.generateExampleParams(results[i]);
        if (candidateParams !== '{}') {
          exampleTool = results[i];
          break;
        }
      }
    }

    return exampleTool;
  }

  /**
   * Generate example parameters for a tool
   */
  private static generateExampleParams(tool: any): string {
    if (!tool?.schema) {
      return '{}';
    }

    const params = ToolSchemaParser.parseParameters(tool.schema);
    const requiredParams = params.filter(p => p.required);
    const optionalParams = params.filter(p => !p.required);

    const predictor = new ParameterPredictor();
    const toolContext = ToolContextResolver.getContext(tool.toolName);
    const exampleObj: any = {};

    // Always include required parameters
    for (const param of requiredParams) {
      exampleObj[param.name] = predictor.predictValue(
        param.name,
        param.type,
        toolContext,
        param.description,
        tool.toolName
      );
    }

    // If no required parameters, show 1-2 optional parameters as examples
    if (requiredParams.length === 0 && optionalParams.length > 0) {
      const exampleOptionals = optionalParams.slice(0, 2); // Show up to 2 optional params
      for (const param of exampleOptionals) {
        exampleObj[param.name] = predictor.predictValue(
          param.name,
          param.type,
          toolContext,
          param.description,
          tool.toolName
        );
      }
    }

    return Object.keys(exampleObj).length > 0 ? JSON.stringify(exampleObj) : '{}';
  }
}