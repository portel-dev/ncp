/**
 * Smart Response Formatter
 * Intelligently formats tool responses based on content type
 */

import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configure marked with terminal renderer
const terminalRenderer = new TerminalRenderer({
  // Customize terminal rendering options
  code: chalk.yellowBright,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.bold.cyan,
  firstHeading: chalk.bold.cyan.underline,
  hr: chalk.gray,
  listitem: chalk.gray,
  paragraph: chalk.white,
  table: chalk.gray,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.yellow,
  del: chalk.strikethrough,
  link: chalk.blue.underline,
  text: chalk.white,
  unescape: true,
  emoji: true,
  width: 80,
  showSectionPrefix: false,
  reflowText: true,
  tab: 2
});

marked.setOptions({
  renderer: terminalRenderer as any,
  breaks: true,
  gfm: true
});

export class ResponseFormatter {
  private static autoOpenMode = false;

  /**
   * Format response intelligently based on content type
   */
  static format(content: any, renderMarkdown: boolean = true, autoOpen: boolean = false): string {
    this.autoOpenMode = autoOpen;
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
      return this.formatText(block.text || '', true);
    }

    // Image block - show detailed info and optionally open
    if (block.type === 'image') {
      const mimeType = block.mimeType || 'unknown';
      const size = block.data ? `${Math.round(block.data.length * 0.75 / 1024)}KB` : 'unknown size';
      const output = chalk.cyan(`🖼️  Image (${mimeType}, ${size})`);

      // Handle media opening if data is present
      if (block.data) {
        this.handleMediaFile(block.data, mimeType, 'image');
      }

      return output;
    }

    // Audio block - show detailed info and optionally open
    if (block.type === 'audio') {
      const mimeType = block.mimeType || 'unknown';
      const size = block.data ? `${Math.round(block.data.length * 0.75 / 1024)}KB` : 'unknown size';
      const output = chalk.magenta(`🔊 Audio (${mimeType}, ${size})`);

      // Handle media opening if data is present
      if (block.data) {
        this.handleMediaFile(block.data, mimeType, 'audio');
      }

      return output;
    }

    // Resource link - show formatted link
    if (block.type === 'resource_link') {
      const name = block.name || 'Unnamed resource';
      const uri = block.uri || 'No URI';
      const description = block.description ? `\n   ${chalk.gray(block.description)}` : '';
      return chalk.blue(`🔗 ${name}`) + chalk.dim(` → ${uri}`) + description;
    }

    // Embedded resource - format based on content
    if (block.type === 'resource') {
      const resource = block.resource;
      if (!resource) return chalk.gray('[Invalid resource]');

      const title = resource.title || 'Resource';
      const mimeType = resource.mimeType || 'unknown';

      // Format resource content based on MIME type
      if (resource.text) {
        const content = this.formatResourceContent(resource.text, mimeType);
        return chalk.green(`📄 ${title} (${mimeType})\n`) + content;
      }

      return chalk.green(`📄 ${title} (${mimeType})`) + chalk.dim(` → ${resource.uri || 'No URI'}`);
    }

    // Unknown type - show as JSON
    return JSON.stringify(block, null, 2);
  }

  /**
   * Format text content with proper newlines and spacing
   */
  private static formatText(text: string, renderMarkdown: boolean = true): string {
    // Handle empty text
    if (!text || text.trim() === '') {
      return chalk.gray('(Empty response)');
    }

    // Preserve formatting: convert \n to actual newlines
    let formatted = text
      .replace(/\\n/g, '\n')  // Convert escaped newlines
      .replace(/\\t/g, '  ')  // Convert tabs to spaces
      .replace(/\\r/g, '');   // Remove carriage returns

    // Try markdown rendering if enabled and content looks like markdown
    if (renderMarkdown && this.looksLikeMarkdown(formatted)) {
      try {
        const rendered = marked(formatted);
        return rendered.toString().trim();
      } catch (error) {
        // Markdown parsing failed, fall back to plain text
        console.error('Markdown rendering failed:', error);
      }
    }

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
   * Check if text looks like markdown
   */
  private static looksLikeMarkdown(text: string): boolean {
    const lines = text.split('\n');

    // Count markdown indicators
    let indicators = 0;

    // Check for headers
    if (lines.some(line => /^#{1,6}\s/.test(line))) indicators++;

    // Check for bold/italic
    if (/\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_/.test(text)) indicators++;

    // Check for code blocks or inline code
    if (/```[\s\S]*?```|`[^`]+`/.test(text)) indicators++;

    // Check for links
    if (/\[([^\]]+)\]\(([^)]+)\)/.test(text)) indicators++;

    // Check for lists (but not simple ones like directory listings)
    const listPattern = /^[\s]*[-*+]\s+[^[\]()]+$/gm;
    const listMatches = text.match(listPattern);
    if (listMatches && listMatches.length >= 2) {
      // Additional check: if it looks like file listings, don't treat as markdown
      if (!listMatches.some(item => item.includes('[FILE]') || item.includes('[DIR]'))) {
        indicators++;
      }
    }

    // Check for blockquotes
    if (lines.some(line => /^>\s/.test(line))) indicators++;

    // Check for horizontal rules
    if (lines.some(line => /^[\s]*[-*_]{3,}[\s]*$/.test(line))) indicators++;

    // If we have 2 or more markdown indicators, treat as markdown
    return indicators >= 2;
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
   * Format resource content based on MIME type
   */
  private static formatResourceContent(text: string, mimeType: string): string {
    // Code files - apply syntax highlighting concepts
    if (mimeType.includes('javascript') || mimeType.includes('typescript')) {
      return chalk.yellow(text);
    }
    if (mimeType.includes('python')) {
      return chalk.blue(text);
    }
    if (mimeType.includes('rust') || mimeType.includes('x-rust')) {
      return chalk.red(text);
    }
    if (mimeType.includes('json')) {
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return text;
      }
    }
    if (mimeType.includes('yaml') || mimeType.includes('yml')) {
      return chalk.green(text);
    }
    if (mimeType.includes('xml') || mimeType.includes('html')) {
      return chalk.magenta(text);
    }
    if (mimeType.includes('markdown')) {
      return this.formatText(text, true);
    }

    // Plain text or unknown - return as-is
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

  /**
   * Handle media file opening
   */
  private static async handleMediaFile(base64Data: string, mimeType: string, mediaType: 'image' | 'audio'): Promise<void> {
    try {
      // Get file extension from MIME type
      const extension = this.getExtensionFromMimeType(mimeType, mediaType);

      // Create temp file
      const tempDir = os.tmpdir();
      const fileName = `ncp-${mediaType}-${Date.now()}.${extension}`;
      const filePath = path.join(tempDir, fileName);

      // Write base64 data to file
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);

      // Handle opening based on mode
      if (this.autoOpenMode) {
        // Auto-open without asking
        await this.openFile(filePath);
        console.log(chalk.dim(`   → Opened in default application`));
      } else {
        // Ask user first
        const { createInterface } = await import('readline');
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const question = (query: string): Promise<string> => {
          return new Promise(resolve => rl.question(query, resolve));
        };

        const answer = await question(chalk.blue(`   Open ${mediaType} in default application? (y/N): `));
        rl.close();

        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await this.openFile(filePath);
          console.log(chalk.dim(`   → Opened in default application`));
        }
      }

      // Schedule cleanup after 5 minutes
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }, 5 * 60 * 1000); // 5 minutes

    } catch (error) {
      console.log(chalk.red(`   ⚠️  Failed to handle ${mediaType} file: ${error}`));
    }
  }

  /**
   * Get file extension from MIME type
   */
  private static getExtensionFromMimeType(mimeType: string, mediaType: 'image' | 'audio'): string {
    const mimeToExt: Record<string, string> = {
      // Images
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',

      // Audio
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      'audio/m4a': 'm4a',
      'audio/flac': 'flac'
    };

    return mimeToExt[mimeType.toLowerCase()] || (mediaType === 'image' ? 'png' : 'mp3');
  }

  /**
   * Open file with default application
   */
  private static async openFile(filePath: string): Promise<void> {
    const platform = process.platform;
    let command: string;

    switch (platform) {
      case 'darwin': // macOS
        command = `open "${filePath}"`;
        break;
      case 'win32': // Windows
        command = `start "" "${filePath}"`;
        break;
      default: // Linux and others
        command = `xdg-open "${filePath}"`;
        break;
    }

    await execAsync(command);
  }
}