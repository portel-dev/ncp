/**
 * CLI Result Formatter
 *
 * Converts raw MCP orchestrator results/errors into CLI-friendly format.
 * This layer interprets MCP responses for terminal display.
 *
 * MCP Server uses orchestrator directly (transparent).
 * CLI uses orchestrator + this formatter (human-readable).
 */

import chalk from 'chalk';

export interface MCPResult {
  success: boolean;
  content?: any;
  error?: string;
}

export class CLIResultFormatter {
  /**
   * Format orchestrator result for CLI display
   */
  static format(result: MCPResult): string {
    if (!result.success) {
      return this.formatError(result.error || 'Unknown error');
    }

    return this.formatContent(result.content);
  }

  /**
   * Format successful result content
   */
  private static formatContent(content: any): string {
    // If content is already a string, return as-is
    if (typeof content === 'string') {
      return content;
    }

    // If content is an array (structured MCP response)
    if (Array.isArray(content)) {
      return this.formatStructuredContent(content);
    }

    // If content is an object, format as JSON
    if (typeof content === 'object' && content !== null) {
      return this.formatJSON(content);
    }

    // Fallback
    return String(content);
  }

  /**
   * Format structured MCP content array
   * Handles: text, images, audio, resources, MCP-UI components
   */
  private static formatStructuredContent(content: any[]): string {
    const parts: string[] = [];

    for (const item of content) {
      if (item.type === 'text' && item.text) {
        parts.push(item.text);
      } else if (item.type === 'image' && item.data) {
        // Image: show metadata
        parts.push(`🖼️  Image: ${item.mimeType || 'unknown type'}`);
      } else if (item.type === 'audio' && item.data) {
        // Audio: show metadata
        parts.push(`🔊 Audio: ${item.mimeType || 'unknown type'}`);
      } else if (item.type === 'resource' && item.uri) {
        // Resource link: show URI
        parts.push(`📎 Resource: ${item.uri}`);
      } else if (item.type?.startsWith('application/vnd.mcp-ui')) {
        // MCP-UI component: show component type
        const componentType = item.type.split('/').pop() || 'component';
        parts.push(`🎨 Interactive Component: ${componentType}`);
        if (item.uri) parts.push(`   URI: ${item.uri}`);
      } else {
        // Unknown structured type: show as JSON
        parts.push(this.formatJSON(item));
      }
    }

    return parts.join('\n');
  }

  /**
   * Format error message for CLI
   */
  private static formatError(error: string): string {
    return chalk.red(`❌ Error: ${error}`);
  }

  /**
   * Format object as readable JSON
   */
  private static formatJSON(obj: any): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  /**
   * Format with pretty tables (for array of objects)
   */
  static formatTable(data: any[]): string {
    if (!Array.isArray(data) || data.length === 0) {
      return this.formatJSON(data);
    }

    // Check if all items are objects with same keys
    const first = data[0];
    if (typeof first !== 'object' || first === null) {
      return this.formatJSON(data);
    }

    const keys = Object.keys(first);

    // Simple table formatting
    let output = '';

    // Header
    output += keys.map(k => chalk.bold(k)).join(' | ') + '\n';
    output += '-'.repeat(80) + '\n';

    // Rows
    for (const item of data) {
      output += keys.map(k => {
        const val = item[k];
        if (val === null || val === undefined) return '';
        return String(val).substring(0, 20);
      }).join(' | ') + '\n';
    }

    return output;
  }
}
