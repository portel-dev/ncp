/**
 * Smart Response Formatter
 * Intelligently formats tool responses based on content type
 */

import chalk from 'chalk';

export class ResponseFormatter {
  /**
   * Format response intelligently based on content type
   */
  static format(content: any): string {
    // Handle null/undefined
    if (!content) {
      return chalk.gray('(No output)');
    }

    // Handle array of content blocks (MCP response format)
    if (Array.isArray(content)) {
      return this.formatContentArray(content);
    }

    // Handle single content block
    if (typeof content === 'object' && content.type) {
      return this.formatContentBlock(content);
    }

    // Default to JSON for unknown structures
    return JSON.stringify(content, null, 2);
  }

  /**
   * Format array of content blocks
   */
  private static formatContentArray(blocks: any[]): string {
    const formatted = blocks.map(block => this.formatContentBlock(block));

    // If all blocks are text, join with double newlines
    if (blocks.every(b => b.type === 'text')) {
      return formatted.join('\n\n');
    }

    // Mixed content - keep structured
    return formatted.join('\n---\n');
  }

  /**
   * Format a single content block
   */
  private static formatContentBlock(block: any): string {
    if (!block || typeof block !== 'object') {
      return String(block);
    }

    // Text block - extract and format text
    if (block.type === 'text') {
      return this.formatText(block.text || '');
    }

    // Image block - show placeholder
    if (block.type === 'image') {
      return chalk.gray(`[Image: ${block.alt || 'No description'}]`);
    }

    // Resource block - show formatted reference
    if (block.type === 'resource') {
      return chalk.gray(`[Resource: ${block.uri || 'Unknown'}]`);
    }

    // Unknown type - show as JSON
    return JSON.stringify(block, null, 2);
  }

  /**
   * Format text content with proper newlines and spacing
   */
  private static formatText(text: string): string {
    // Handle empty text
    if (!text || text.trim() === '') {
      return chalk.gray('(Empty response)');
    }

    // Preserve formatting: convert \n to actual newlines
    let formatted = text
      .replace(/\\n/g, '\n')  // Convert escaped newlines
      .replace(/\\t/g, '  ')  // Convert tabs to spaces
      .replace(/\\r/g, '');   // Remove carriage returns

    // Detect and handle special formats
    if (this.looksLikeJson(formatted)) {
      // If it's JSON, pretty print it
      try {
        const parsed = JSON.parse(formatted);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON, return as-is
      }
    }

    // Handle common patterns
    if (this.looksLikeTable(formatted)) {
      // Table-like content - ensure alignment is preserved
      return this.preserveTableFormatting(formatted);
    }

    if (this.looksLikeList(formatted)) {
      // List-like content - ensure proper indentation
      return this.preserveListFormatting(formatted);
    }

    return formatted;
  }

  /**
   * Check if text looks like JSON
   */
  private static looksLikeJson(text: string): boolean {
    const trimmed = text.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  }

  /**
   * Check if text looks like a table
   */
  private static looksLikeTable(text: string): boolean {
    const lines = text.split('\n');
    // Check for separator lines with dashes or equals
    return lines.some(line => /^[\s\-=+|]+$/.test(line) && line.length > 10);
  }

  /**
   * Check if text looks like a list
   */
  private static looksLikeList(text: string): boolean {
    const lines = text.split('\n');
    // Check for bullet points or numbered lists
    return lines.filter(line =>
      /^\s*[-*•]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)
    ).length >= 2;
  }

  /**
   * Preserve table formatting with monospace font hint
   */
  private static preserveTableFormatting(text: string): string {
    // Tables need consistent spacing - already preserved by monospace terminal
    return text;
  }

  /**
   * Preserve list formatting with proper indentation
   */
  private static preserveListFormatting(text: string): string {
    // Lists are already well-formatted, just ensure consistency
    return text;
  }

  /**
   * Detect if content is pure data vs text
   */
  static isPureData(content: any): boolean {
    // If it's not an array, check if it's a data object
    if (!Array.isArray(content)) {
      return typeof content === 'object' &&
             !content.type &&
             !content.text;
    }

    // Check if all items are text blocks
    if (content.every((item: any) => item?.type === 'text')) {
      return false; // Text content, not pure data
    }

    // Mixed or non-text content might be data
    return true;
  }
}