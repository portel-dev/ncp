/**
 * Shared utilities for text processing and formatting
 * Consolidates text wrapping and formatting logic
 */

export interface TextWrapOptions {
  maxWidth: number;
  indent?: string;
  cleanupPrefixes?: boolean;
  preserveWhitespace?: boolean;
}

export class TextUtils {
  /**
   * Wrap text to fit within specified width with optional indentation
   */
  static wrapText(text: string, options: TextWrapOptions): string {
    const { maxWidth, indent = '', cleanupPrefixes = false, preserveWhitespace = false } = options;

    if (!text) {
      return text;
    }

    // Clean up text if requested (used by MCP server)
    let processedText = text;
    if (cleanupPrefixes) {
      processedText = text
        .replace(/^[^:]+:\s*/, '') // Remove "desktop-commander: " prefix
        .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
        .trim();
    } else if (!preserveWhitespace) {
      // Basic cleanup for CLI usage
      processedText = text.trim();
    }

    // If text fits within width, return as-is
    if (processedText.length <= maxWidth) {
      return processedText;
    }

    // Split into words and wrap
    const words = processedText.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word longer than maxWidth
          lines.push(word);
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Join lines with proper indentation for continuation
    return lines.map((line, index) =>
      index === 0 ? line : `\n${indent}${line}`
    ).join('');
  }

  /**
   * Wrap text with background color applied to each line (CLI-specific)
   */
  static wrapTextWithBackground(
    text: string,
    maxWidth: number,
    indent: string,
    backgroundFormatter: (text: string) => string
  ): string {
    if (text.length <= maxWidth) {
      return `${indent}${backgroundFormatter(text)}`;
    }

    const wrappedText = this.wrapText(text, { maxWidth, indent: '', preserveWhitespace: true });
    const lines = wrappedText.split('\n');

    return lines.map((line, index) => {
      const formattedLine = backgroundFormatter(line);
      return index === 0 ? `${indent}${formattedLine}` : `${indent}${formattedLine}`;
    }).join('\n');
  }
}