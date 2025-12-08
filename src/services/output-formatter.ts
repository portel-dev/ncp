/**
 * Shared service for consistent output formatting and UX
 * Consolidates chalk usage and provides consistent styling patterns
 */

import chalk from 'chalk';

export interface OutputOptions {
  noColor?: boolean;
  emoji?: boolean;
  compact?: boolean;
}

export class OutputFormatter {
  private static noColor = false;
  private static supportsEmoji = true;

  static configure(options: OutputOptions): void {
    this.noColor = options.noColor || false;
    this.supportsEmoji = options.emoji !== false;

    if (this.noColor) {
      chalk.level = 0;
    }
  }

  // === STATUS MESSAGES ===
  static success(message: string): string {
    const emoji = this.supportsEmoji ? '✅ ' : '';
    return this.noColor ? `${emoji}Success! ${message}` : chalk.green(`${emoji}Success! ${message}`);
  }

  static error(message: string): string {
    const emoji = this.supportsEmoji ? '❌ ' : '';
    return this.noColor ? `${emoji}Error: ${message}` : chalk.red(`${emoji}Error: ${message}`);
  }

  static warning(message: string): string {
    const emoji = this.supportsEmoji ? '⚠️ ' : '';
    return this.noColor ? `${emoji}Warning: ${message}` : chalk.yellow(`${emoji}Warning: ${message}`);
  }

  static info(message: string): string {
    const emoji = this.supportsEmoji ? 'ℹ️ ' : '';
    return this.noColor ? `${emoji}${message}` : chalk.blue(`${emoji}${message}`);
  }

  static running(action: string): string {
    const emoji = this.supportsEmoji ? '🚀 ' : '';
    return this.noColor ? `${emoji}Running ${action}...` : chalk.cyan(`${emoji}Running ${action}...`);
  }

  // === TOOL & COMMAND FORMATTING ===
  static toolName(name: string): string {
    return this.noColor ? name : chalk.bold.cyan(name);
  }

  static command(cmd: string): string {
    return this.noColor ? `\`${cmd}\`` : chalk.gray(`\`${cmd}\``);
  }

  static parameter(param: string): string {
    return this.noColor ? param : chalk.yellow(param);
  }

  static value(value: string): string {
    return this.noColor ? `"${value}"` : chalk.green(`"${value}"`);
  }

  // === STRUCTURAL FORMATTING ===
  static header(text: string, level: 1 | 2 | 3 = 1): string {
    if (this.noColor) {
      const prefix = '#'.repeat(level);
      return `${prefix} ${text}`;
    }

    switch (level) {
      case 1: return chalk.bold.magenta(text);
      case 2: return chalk.bold.blue(text);
      case 3: return chalk.bold.cyan(text);
      default: return text;
    }
  }

  static section(title: string): string {
    const emoji = this.supportsEmoji ? '📦 ' : '';
    return this.noColor ? `${emoji}${title}` : chalk.bold.blue(`${emoji}${title}`);
  }

  static bullet(text: string): string {
    const bullet = this.supportsEmoji ? '  • ' : '  - ';
    return `${bullet}${text}`;
  }

  static separator(char: string = '─', length: number = 50): string {
    return char.repeat(length);
  }

  // === HIGHLIGHTING & EMPHASIS ===
  static highlight(text: string): string {
    return this.noColor ? `**${text}**` : chalk.bold(text);
  }

  static muted(text: string): string {
    return this.noColor ? text : chalk.dim(text);
  }

  static code(text: string): string {
    return this.noColor ? `\`${text}\`` : chalk.bgGray.black(` ${text} `);
  }

  static quote(text: string): string {
    return this.noColor ? `"${text}"` : chalk.italic(`"${text}"`);
  }

  // === SEARCH & DISCOVERY UX ===
  static searchResult(query: string, count: number, page?: number, totalPages?: number): string {
    const emoji = this.supportsEmoji ? '🔍 ' : '';
    const pageInfo = page && totalPages ? ` | Page ${page} of ${totalPages}` : '';
    const resultsText = count === 1 ? 'result' : 'results';

    if (count === 0) {
      return this.error(`No tools found for ${this.quote(query)}`);
    }

    const message = `${emoji}Found ${count} ${resultsText} for ${this.quote(query)}${pageInfo}`;
    return this.noColor ? message : chalk.blue(message);
  }

  static noResultsSuggestion(suggestions: string[]): string {
    const emoji = this.supportsEmoji ? '📝 ' : '';
    const title = this.noColor ? `${emoji}Available MCPs to explore:` : chalk.bold(`${emoji}Available MCPs to explore:`);
    const suggestionList = suggestions.map(s => this.bullet(s)).join('\n');
    return `${title}\n${suggestionList}`;
  }

  static tip(message: string): string {
    const emoji = this.supportsEmoji ? '💡 ' : '';
    return this.noColor ? `${emoji}${message}` : chalk.blue(`${emoji}${message}`);
  }

  // === PROGRESS & FEEDBACK ===
  static progress(current: number, total: number, item?: string): string {
    const percentage = Math.round((current / total) * 100);
    const bar = this.createProgressBar(current, total);
    const itemText = item ? ` ${item}` : '';

    return this.noColor
      ? `[${current}/${total}] ${percentage}%${itemText}`
      : chalk.blue(`${bar} ${percentage}%${itemText}`);
  }

  private static createProgressBar(current: number, total: number, width: number = 20): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  // === TABLE FORMATTING ===
  static table(headers: string[], rows: string[][]): string {
    if (this.noColor) {
      const headerRow = headers.join(' | ');
      const separator = headers.map(() => '---').join(' | ');
      const dataRows = rows.map(row => row.join(' | ')).join('\n');
      return `${headerRow}\n${separator}\n${dataRows}`;
    }

    const headerRow = chalk.bold(headers.join(' │ '));
    const separator = '─'.repeat(headerRow.length);
    const dataRows = rows.map(row => row.join(' │ ')).join('\n');
    return `${headerRow}\n${separator}\n${dataRows}`;
  }

  // === ERROR IMPROVEMENT ===
  static betterError(error: string, suggestion?: string): string {
    const errorMsg = this.error(error);
    if (!suggestion) return errorMsg;

    const suggestionMsg = this.tip(suggestion);
    return `${errorMsg}\n\n${suggestionMsg}`;
  }

  static validationError(field: string, expected: string, received: string): string {
    return this.betterError(
      `Invalid ${field}: expected ${expected}, received ${received}`,
      `Check your input and try again`
    );
  }

  // === STATUS INDICATORS ===
  // Consistent visual language for status across all commands
  static readonly STATUS = {
    HEALTHY: this.noColor ? '✓ HEALTHY' : chalk.green('✓ HEALTHY'),
    UNHEALTHY: this.noColor ? '✗ UNHEALTHY' : chalk.red('✗ UNHEALTHY'),
    DEGRADED: this.noColor ? '⚠ DEGRADED' : chalk.yellow('⚠ DEGRADED'),
    UNKNOWN: this.noColor ? '? UNKNOWN' : chalk.gray('? UNKNOWN'),
    DISABLED: this.noColor ? '○ DISABLED' : chalk.gray('○ DISABLED'),
    RUNNING: this.noColor ? '▶ RUNNING' : chalk.blue('▶ RUNNING'),
    PAUSED: this.noColor ? '⏸ PAUSED' : chalk.yellow('⏸ PAUSED'),
    FAILED: this.noColor ? '✗ FAILED' : chalk.red('✗ FAILED'),
    PENDING: this.noColor ? '◐ PENDING' : chalk.cyan('◐ PENDING'),
    COMPLETED: this.noColor ? '✓ COMPLETED' : chalk.green('✓ COMPLETED'),
    ACTIVE: this.noColor ? '● ACTIVE' : chalk.green('● ACTIVE'),
    INACTIVE: this.noColor ? '○ INACTIVE' : chalk.gray('○ INACTIVE'),
  };

  /**
   * Format a status badge with icon and color
   */
  static statusBadge(status: keyof typeof OutputFormatter.STATUS, label?: string): string {
    const badge = this.STATUS[status];
    return label ? `${badge} ${label}` : badge;
  }

  /**
   * Create a status row for tables
   */
  static statusRow(name: string, status: keyof typeof OutputFormatter.STATUS, details?: string): string {
    const statusBadge = this.STATUS[status];
    if (details) {
      return `${name.padEnd(20)} ${statusBadge.padEnd(20)} ${details}`;
    }
    return `${name.padEnd(20)} ${statusBadge}`;
  }

  // === INTELLIGENT OUTPUT FORMATTING ===
  // Auto-detect and format data for optimal presentation

  static readonly FORMAT_TYPES = {
    PRIMITIVE: 'primitive',
    TABLE: 'table',
    TREE: 'tree',
    LIST: 'list',
    NONE: 'none'
  } as const;

  /**
   * Auto-detect the best format for displaying data
   */
  static detectFormat(data: any): string {
    // Handle null/undefined/empty
    if (data === null || data === undefined || data === '') {
      return this.FORMAT_TYPES.NONE;
    }

    // Handle primitives
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
      return this.FORMAT_TYPES.PRIMITIVE;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      // Array of primitives -> LIST
      if (data.every(item => typeof item !== 'object' || item === null)) {
        return this.FORMAT_TYPES.LIST;
      }
      // Array of objects with same keys -> TABLE
      if (data.length > 0 && typeof data[0] === 'object') {
        return this.FORMAT_TYPES.TABLE;
      }
      return this.FORMAT_TYPES.LIST;
    }

    // Handle objects
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      // Check if nested object (has object values) -> TREE
      const hasNestedObjects = keys.some(
        key => typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])
      );

      if (hasNestedObjects) {
        return this.FORMAT_TYPES.TREE;
      }

      // Flat object -> TABLE (single row)
      return this.FORMAT_TYPES.TABLE;
    }

    return this.FORMAT_TYPES.PRIMITIVE;
  }

  /**
   * Format data based on detected type
   */
  static formatAuto(data: any): string {
    const format = this.detectFormat(data);

    switch (format) {
      case this.FORMAT_TYPES.PRIMITIVE:
        return this.formatPrimitive(data);
      case this.FORMAT_TYPES.TABLE:
        return this.formatAsTable(data);
      case this.FORMAT_TYPES.TREE:
        return this.formatAsTree(data);
      case this.FORMAT_TYPES.LIST:
        return this.formatAsList(data);
      case this.FORMAT_TYPES.NONE:
        return '(empty)';
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  private static formatPrimitive(data: any): string {
    if (typeof data === 'string') {
      return data;
    }
    return String(data);
  }

  private static formatAsList(data: any[]): string {
    const items = data.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `  • ${JSON.stringify(item)}`;
      }
      return this.bullet(String(item));
    });

    return items.join('\n');
  }

  private static formatAsTable(data: any): string {
    if (Array.isArray(data)) {
      if (data.length === 0) return '(empty table)';

      const firstRow = data[0];
      if (typeof firstRow !== 'object' || firstRow === null) {
        return this.formatAsList(data);
      }

      const headers = Object.keys(firstRow);
      const rows = data.map(item =>
        headers.map(header => {
          const value = (item as any)[header];
          return value === null || value === undefined ? '' : String(value);
        })
      );

      return this.table(headers, rows);
    } else {
      // Single object -> single row table
      const headers = Object.keys(data);
      const values = headers.map(h => String((data as any)[h]));
      return this.table(headers, [values]);
    }
  }

  private static formatAsTree(data: any, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    const lines: string[] = [];

    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        lines.push(`${prefix}[${index}]:`);
        lines.push(this.formatAsTree(item, indent + 1));
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          lines.push(`${prefix}${key}:`);
          lines.push(this.formatAsTree(value, indent + 1));
        } else {
          const displayValue = value === null ? 'null' : value === undefined ? 'undefined' : String(value);
          lines.push(`${prefix}${key}: ${displayValue}`);
        }
      });
    } else {
      lines.push(`${prefix}${String(data)}`);
    }

    return lines.join('\n');
  }

  // === MARKDOWN RENDERING ===
  // Basic markdown support for formatted text output

  /**
   * Detect if content is markdown
   */
  static isMarkdown(content: string): boolean {
    if (typeof content !== 'string') return false;

    // Check for common markdown patterns
    const markdownPatterns = [
      /^#+\s/m,           // Headings
      /\*\*.*?\*\*/,       // Bold
      /\*.*?\*/,           // Italic
      /`[^`]+`/,           // Code
      /```[\s\S]*?```/,    // Code blocks
      /\[.*?\]\(.*?\)/,    // Links
      /^\s*[-*+]\s/m,      // Lists
      /^\s*\d+\.\s/m,      // Numbered lists
      /^>+ /m              // Blockquotes
    ];

    return markdownPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Render markdown with basic formatting
   * Note: For full markdown rendering with syntax highlighting,
   * consider using marked library (optional dependency)
   */
  static renderMarkdown(content: string): string {
    if (!this.noColor) {
      let formatted = content;

      // Process headings
      formatted = formatted.replace(/^### (.*?)$/gm, (_, text) => chalk.cyan(`  ${text}`));
      formatted = formatted.replace(/^## (.*?)$/gm, (_, text) => chalk.blue.bold(`${text}`));
      formatted = formatted.replace(/^# (.*?)$/gm, (_, text) => chalk.magenta.bold(`${text}`));

      // Process bold and italic
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, (_, text) => chalk.bold(text));
      formatted = formatted.replace(/\*(.*?)\*/g, (_, text) => chalk.italic(text));

      // Process inline code
      formatted = formatted.replace(/`([^`]+)`/g, (_, code) => chalk.bgGray.black(` ${code} `));

      // Process code blocks
      formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const border = chalk.gray('┌─────────────────────────────┐');
        const codeLines = code.trim().split('\n').map((line: string) => chalk.gray('│ ') + line);
        const closeBar = chalk.gray('└─────────────────────────────┘');
        return `${border}\n${codeLines.join('\n')}\n${closeBar}`;
      });

      // Process blockquotes
      formatted = formatted.replace(/^> (.*?)$/gm, (_, text) => chalk.dim(`  │ ${text}`));

      // Process links
      formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, (_, text, url) =>
        `${chalk.blue.underline(text)} ${chalk.dim(`(${url}`)}`
      );

      // Process lists
      formatted = formatted.replace(/^[\s]*[-*+]\s(.*?)$/gm, (_, item) => `  ${chalk.cyan('•')} ${item}`);
      formatted = formatted.replace(/^[\s]*(\d+)\.\s(.*?)$/gm, (_, num, item) => `  ${chalk.cyan(num)}.${item}`);

      return formatted;
    }

    return content;
  }

  /**
   * Format string content intelligently
   * Detects markdown and renders accordingly
   */
  static formatString(content: string): string {
    if (this.isMarkdown(content)) {
      return this.renderMarkdown(content);
    }
    return content;
  }
}