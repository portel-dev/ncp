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
}