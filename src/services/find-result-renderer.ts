/**
 * Renders structured FindResult to markdown text
 * Used for MCP and CLI text responses
 */

import chalk from 'chalk';
import { FindResultStructured, MultiQueryResult, ToolResult } from '../types/find-result.js';
import { ParameterPredictor } from '../utils/parameter-predictor.js';

export class FindResultRenderer {
  /**
   * Render structured find result to markdown
   */
  static render(result: FindResultStructured): string {
    const { tools, pagination, health, indexing, mcpFilter, query, isListing } = result;

    const filterText = mcpFilter ? ` (filtered to ${mcpFilter})` : '';

    // Enhanced pagination display
    const paginationInfo = pagination.totalPages > 1 ?
      ` | Page ${pagination.page} of ${pagination.totalPages} (showing ${pagination.resultsInPage} of ${pagination.totalResults} results)` :
      ` (${pagination.totalResults} results)`;

    let output: string;
    if (query) {
      const highlightedQuery = chalk.inverse(` ${query} `);
      output = `\n🔍 Found tools for ${highlightedQuery}${filterText}${paginationInfo}:\n\n`;
    } else {
      output = `\n🔍 Available tools${filterText}${paginationInfo}:\n\n`;
    }

    // Add MCP health status summary
    if (health.total > 0) {
      const healthIcon = health.unhealthy > 0 ? '⚠️' : '✅';
      output += `${healthIcon} **MCPs**: ${health.healthy}/${health.total} healthy`;

      if (health.unhealthy > 0) {
        const unhealthyNames = health.mcps
          .filter(mcp => !mcp.healthy)
          .map(mcp => mcp.name)
          .join(', ');
        output += ` (${unhealthyNames} unavailable)`;
      }
      output += '\n\n';
    }

    // Add indexing progress if still indexing
    if (indexing && indexing.total > 0) {
      const percentComplete = Math.round((indexing.current / indexing.total) * 100);
      const remainingTime = indexing.estimatedTimeRemaining ?
        ` (~${Math.ceil(indexing.estimatedTimeRemaining / 1000)}s remaining)` : '';

      output += `⏳ **Indexing in progress**: ${indexing.current}/${indexing.total} MCPs (${percentComplete}%)${remainingTime}\n`;
      output += `   Currently indexing: ${indexing.currentMCP || 'initializing...'}\n\n`;

      if (tools.length > 0) {
        output += `📋 **Showing partial results** - more tools will become available as indexing completes.\n\n`;
      } else {
        output += `📋 **No tools available yet** - please try again in a moment as indexing progresses.\n\n`;
      }
    }

    // Handle no results case
    if (tools.length === 0) {
      output += `❌ No tools found${query ? ` for "${query}"` : ''}\n`;
      return output;
    }

    // Render tools based on depth (inferred from parameter availability)
    const depth = this.inferDepth(tools);

    if (depth === 0) {
      // Depth 0: Tool names only, with Code-Mode compatibility
      tools.forEach((tool) => {
        const confidence = Math.round(tool.confidence * 100);
        const matchText = isListing ? '' : ` (${confidence}% match)`;

        output += `// ${tool.description || tool.name}${matchText}\n`;
        output += `await ${tool.mcp}.${tool.tool}();\n\n`;
      });
    } else if (depth === 1) {
      // Depth 1: Tool name + description + Code-Mode example
      tools.forEach((tool, toolIndex) => {
        if (toolIndex > 0) output += '// ---\n';

        const confidence = Math.round(tool.confidence * 100);
        const matchText = isListing ? '' : ` (${confidence}% match)`;
        output += `// Tool: ${tool.name}${matchText}\n`;

        if (tool.description) {
          const cleanDescription = tool.description.replace(/^[^:]+:\s*/, '').replace(/\s+/g, ' ').trim();
          output += `// Description: ${cleanDescription}\n`;
        }

        // Add Code-Mode example
        const exampleParams = this.generateCodeModeParams(tool);
        output += `\n\`\`\`typescript\n`;
        if (exampleParams) {
          output += `const result = await ${tool.mcp}.${tool.tool}(${exampleParams});\n`;
        } else {
          output += `const result = await ${tool.mcp}.${tool.tool}();\n`;
        }
        output += `console.log(result);\n`;
        output += `\`\`\`\n`;
      });
    } else {
      // Depth 2: Full details with parameters and Code-Mode example
      tools.forEach((tool, toolIndex) => {
        if (toolIndex > 0) output += '// ---\n';

        const confidence = Math.round(tool.confidence * 100);
        const matchText = isListing ? '' : ` (${confidence}% match)`;
        output += `// Tool: ${tool.name}${matchText}\n`;

        if (tool.description) {
          const cleanDescription = tool.description.replace(/^[^:]+:\s*/, '').replace(/\s+/g, ' ').trim();
          output += `// Description: ${cleanDescription}\n`;
        }

        // Parameters with descriptions
        if (tool.parameters && tool.parameters.length > 0) {
          output += `// Parameters:\n`;
          tool.parameters.forEach(param => {
            const optionalText = param.required ? '' : ' *(optional)*';
            const descText = param.description ? ` - ${param.description}` : '';
            output += `// * ${param.name}: \`${param.type}\`${optionalText}${descText}\n`;
          });
        } else {
          output += `// *No parameters*\n`;
        }

        // Add Code-Mode example
        const exampleParams = this.generateCodeModeParams(tool);
        output += `\n**Code-Mode Example:**\n`;
        output += `\`\`\`typescript\n`;
        if (exampleParams) {
          output += `const result = await ${tool.mcp}.${tool.tool}(${exampleParams});\n`;
        } else {
          output += `const result = await ${tool.mcp}.${tool.tool}();\n`;
        }
        output += `console.log(result);\n`;
        output += `\`\`\`\n`;
      });
    }

    return output;
  }

  /**
   * Render multi-query result to markdown
   */
  static renderMultiQuery(result: MultiQueryResult): string {
    const { queries, totalTools, health, indexing } = result;

    let output = `\n🔍 Found tools for ${queries.length} queries:\n\n`;

    // Add MCP health status summary
    if (health.total > 0) {
      const healthIcon = health.unhealthy > 0 ? '⚠️' : '✅';
      output += `${healthIcon} **MCPs**: ${health.healthy}/${health.total} healthy`;

      if (health.unhealthy > 0) {
        const unhealthyNames = health.mcps
          .filter(mcp => !mcp.healthy)
          .map(mcp => mcp.name)
          .join(', ');
        output += ` (${unhealthyNames} unavailable)`;
      }
      output += '\n\n';
    }

    // Add indexing progress if still indexing
    if (indexing && indexing.total > 0) {
      const percentComplete = Math.round((indexing.current / indexing.total) * 100);
      const remainingTime = indexing.estimatedTimeRemaining ?
        ` (~${Math.ceil(indexing.estimatedTimeRemaining / 1000)}s remaining)` : '';

      output += `⏳ **Indexing in progress**: ${indexing.current}/${indexing.total} MCPs (${percentComplete}%)${remainingTime}\n`;
      output += `   Currently indexing: ${indexing.currentMCP || 'initializing...'}\n\n`;
    }

    // Display results for each query
    queries.forEach((queryResult, index) => {
      const { query, tools } = queryResult;

      output += `**Query ${index + 1}:** ${chalk.inverse(` ${query} `)}\n`;

      if (tools.length === 0) {
        output += `   ❌ No tools found\n\n`;
      } else {
        output += `   Found ${tools.length} tool${tools.length > 1 ? 's' : ''}:\n`;
        tools.forEach((tool: ToolResult) => {
          const healthIcon = tool.healthy ? '✅' : '❌';
          output += `   ${healthIcon} ${chalk.bold(tool.name)}`;
          if (tool.description) {
            output += ` - ${tool.description}`;
          }
          output += '\n';
        });
        output += '\n';
      }
    });

    // Add total tools found summary
    output += `\n📊 **Total**: ${totalTools} tool${totalTools !== 1 ? 's' : ''} found across ${queries.length} queries\n`;

    // Add Code-Mode workflow example for multi-query orchestration
    if (totalTools > 0) {
      output += `\n💡 **Code-Mode Workflow** (orchestrate all tools in one execution):\n\`\`\`typescript\n`;

      // Generate example for each query's top result
      queries.forEach((queryResult) => {
        const { query, tools } = queryResult;
        if (tools.length > 0) {
          const tool = tools[0];

          // Generate smart variable name from query
          const varName = query.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 20);

          // Generate example params
          const exampleParams = this.generateCodeModeParams(tool);

          output += `// ${query}\n`;
          if (exampleParams) {
            output += `const ${varName} = await ${tool.mcp}.${tool.tool}(${exampleParams});\n`;
          } else {
            output += `const ${varName} = await ${tool.mcp}.${tool.tool}();\n`;
          }
          output += `console.log("${query}:", ${varName});\n\n`;
        }
      });

      output += `\`\`\`\n`;
      output += `🚀 One execution, ${queries.length} capabilities - 88% fewer API calls!\n`;
    }

    return output;
  }

  /**
   * Infer depth from tool data
   */
  private static inferDepth(tools: ToolResult[]): number {
    if (tools.length === 0) return 2;

    const firstTool = tools[0];
    if (!firstTool.parameters || firstTool.parameters.length === 0) {
      // No parameters might mean depth 0 or 1
      return firstTool.description ? 1 : 0;
    }

    return 2; // Has parameters, assume full depth
  }

  /**
   * Generate example parameters for Code-Mode from tool schema
   */
  private static generateCodeModeParams(tool: ToolResult): string {
    if (!tool.parameters || tool.parameters.length === 0) return '';

    const requiredParams = tool.parameters.filter(p => p.required);

    // Only show required params, max 2 for brevity
    const paramsToShow = requiredParams.length > 0
      ? requiredParams.slice(0, 2)
      : tool.parameters.slice(0, 2);

    if (paramsToShow.length === 0) return '';

    const predictor = new ParameterPredictor();
    const paramPairs = paramsToShow.map(param => {
      const value = predictor.predictValue(param.name, param.type, param.description || '');
      return `${param.name}: ${JSON.stringify(value)}`;
    });

    return `{ ${paramPairs.join(', ')} }`;
  }
}
