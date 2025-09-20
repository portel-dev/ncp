import chalk from 'chalk';
import { highlight as cliHighlight } from 'cli-highlight';
import prettyjson from 'prettyjson';
import colorizer from 'json-colorizer';

/**
 * Comprehensive color highlighting utilities for NCP
 * Handles JSON-RPC, CLI output, tool responses, and interactive elements
 */
export class HighlightingUtils {
  /**
   * Highlight JSON with beautiful syntax colors
   * Uses multiple highlighting engines with fallbacks
   */
  static formatJson(json: any, style: 'cli-highlight' | 'prettyjson' | 'colorizer' | 'auto' = 'auto'): string {
    const jsonString = JSON.stringify(json, null, 2);

    try {
      if (style === 'prettyjson') {
        return prettyjson.render(json, {
          keysColor: 'blue',
          dashColor: 'grey',
          stringColor: 'green',
          numberColor: 'yellow'
        });
      }

      if (style === 'colorizer') {
        return (colorizer as any)(jsonString, {
          pretty: true,
          colors: {
            BRACE: 'gray',
            BRACKET: 'gray',
            COLON: 'gray',
            COMMA: 'gray',
            STRING_KEY: 'blue',
            STRING_LITERAL: 'green',
            NUMBER_LITERAL: 'yellow',
            BOOLEAN_LITERAL: 'cyan',
            NULL_LITERAL: 'red'
          }
        });
      }

      if (style === 'cli-highlight' || style === 'auto') {
        return cliHighlight(jsonString, {
          language: 'json',
          theme: {
            keyword: chalk.blue,
            string: chalk.green,
            number: chalk.yellow,
            literal: chalk.cyan
          }
        });
      }

    } catch (error) {
      // Try fallback methods
      if (style !== 'colorizer') {
        try {
          return (colorizer as any)(jsonString, { pretty: true });
        } catch {}
      }

      if (style !== 'prettyjson') {
        try {
          return prettyjson.render(json);
        } catch {}
      }

      // Final fallback - basic JSON with manual coloring
      return HighlightingUtils.manualJsonHighlight(jsonString);
    }

    return jsonString;
  }

  /**
   * Manual JSON highlighting as final fallback
   */
  private static manualJsonHighlight(jsonString: string): string {
    return jsonString
      .replace(/"([^"]+)":/g, chalk.blue('"$1"') + chalk.gray(':'))
      .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"'))
      .replace(/: (\d+)/g, ': ' + chalk.yellow('$1'))
      .replace(/: (true|false|null)/g, ': ' + chalk.cyan('$1'))
      .replace(/[{}]/g, chalk.gray('$&'))
      .replace(/[\[\]]/g, chalk.gray('$&'))
      .replace(/,/g, chalk.gray(','));
  }

  /**
   * Create a bordered JSON display with syntax highlighting
   */
  static createJsonBox(json: any, title?: string): string {
    const highlighted = this.formatJson(json);
    const lines = highlighted.split('\n');

    const maxLength = Math.max(...lines.map(line => this.stripAnsi(line).length));
    const boxWidth = Math.max(maxLength + 4, 45);

    let output = '';

    if (title) {
      output += chalk.blue(`📋 ${title}:\n`);
    }

    output += chalk.gray('┌' + '─'.repeat(boxWidth - 2) + '┐\n');

    lines.forEach(line => {
      const stripped = this.stripAnsi(line);
      const padding = ' '.repeat(boxWidth - stripped.length - 4);
      output += chalk.gray(`│ `) + line + padding + chalk.gray(` │\n`);
    });

    output += chalk.gray('└' + '─'.repeat(boxWidth - 2) + '┘');

    return output;
  }

  /**
   * Highlight JSON-RPC responses with beautiful formatting
   */
  static formatJsonRpc(response: any): string {
    if (response.error) {
      return this.createJsonBox(response, chalk.red('JSON-RPC Error'));
    }

    if (response.result) {
      return this.createJsonBox(response, chalk.green('JSON-RPC Response'));
    }

    return this.createJsonBox(response, 'JSON-RPC');
  }

  /**
   * Format tool discovery results with confidence-based colors
   */
  static formatToolResult(tool: any, index: number): string {
    const confidence = parseFloat(tool.confidence || '0');
    let confidenceColor = chalk.red;

    if (confidence >= 70) confidenceColor = chalk.green;
    else if (confidence >= 50) confidenceColor = chalk.yellow;
    else if (confidence >= 30) confidenceColor = chalk.hex('#FFA500');

    let result = chalk.cyan(`${index}. `) +
                  chalk.bold(tool.name) +
                  chalk.gray(` (${tool.source || 'unknown'})\n`) +
                  `   Confidence: ` + confidenceColor(`${confidence}%\n`) +
                  `   Command: ` + chalk.dim(tool.command || 'unknown');

    if (tool.description) {
      result += `\n   ` + chalk.gray(tool.description.substring(0, 100) + '...');
    }

    return result;
  }

  /**
   * Format profile tree with beautiful colors
   */
  static formatProfileTree(profileName: string, mcps: any[]): string {
    let output = chalk.blue(`📦 ${profileName}\n`);

    if (mcps.length === 0) {
      output += chalk.gray('  └── (empty)');
      return output;
    }

    mcps.forEach((mcp, index) => {
      const isLast = index === mcps.length - 1;
      const connector = isLast ? '└──' : '├──';

      output += chalk.gray(`  ${connector} `) + chalk.cyan(mcp.name) + '\n';

      if (mcp.command) {
        const subConnector = isLast ? '    ' : '  │ ';
        output += chalk.gray(subConnector + '└── ') + chalk.dim(mcp.command);
        if (mcp.args && mcp.args.length > 0) {
          output += chalk.dim(' ' + mcp.args.join(' '));
        }
        if (index < mcps.length - 1) output += '\n';
      }
    });

    return output;
  }

  /**
   * Format status messages with appropriate colors
   */
  static formatStatus(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const colors = {
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.blue
    };

    return colors[type](`${icons[type]} ${message}`);
  }

  /**
   * Create animated progress indicator
   */
  static createProgressBar(current: number, total: number, width: number = 30): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));

    return `[${bar}] ${chalk.cyan(percentage + '%')} (${current}/${total})`;
  }

  /**
   * Format code blocks with syntax highlighting
   */
  static formatCode(code: string, language?: string): string {
    try {
      return cliHighlight(code, { language: language || 'javascript', theme: 'default' });
    } catch (error) {
      return code;
    }
  }

  /**
   * Format markdown with basic styling
   */
  static formatMarkdown(markdown: string): string {
    return markdown
      .replace(/^# (.*)/gm, chalk.bold.blue('# $1'))
      .replace(/^## (.*)/gm, chalk.bold.cyan('## $1'))
      .replace(/^### (.*)/gm, chalk.bold.yellow('### $1'))
      .replace(/\*\*(.*?)\*\*/g, chalk.bold('$1'))
      .replace(/\*(.*?)\*/g, chalk.italic('$1'))
      .replace(/`(.*?)`/g, chalk.gray.bgBlack(' $1 '));
  }

  /**
   * Highlight configuration values
   */
  static formatConfigValue(key: string, value: any): string {
    let formattedValue = '';

    if (typeof value === 'string') {
      formattedValue = chalk.green(`"${value}"`);
    } else if (typeof value === 'number') {
      formattedValue = chalk.yellow(value.toString());
    } else if (typeof value === 'boolean') {
      formattedValue = value ? chalk.green('true') : chalk.red('false');
    } else if (Array.isArray(value)) {
      formattedValue = chalk.magenta(`[${value.length} items]`);
    } else if (typeof value === 'object' && value !== null) {
      formattedValue = chalk.magenta(`{object}`);
    } else {
      formattedValue = chalk.gray('null');
    }

    return chalk.cyan(key) + chalk.white(': ') + formattedValue;
  }

  /**
   * Create a separator line
   */
  static createSeparator(char: string = '─', length: number = 50): string {
    return chalk.gray(char.repeat(length));
  }

  /**
   * Format table-like data
   */
  static formatTable(headers: string[], rows: string[][]): string {
    const columnWidths = headers.map((header, i) =>
      Math.max(header.length, ...rows.map(row => (row[i] || '').length))
    );

    let output = '';

    // Header
    output += headers.map((header, i) =>
      chalk.bold.blue(header.padEnd(columnWidths[i]))
    ).join(' │ ') + '\n';

    // Separator
    output += columnWidths.map(width =>
      chalk.gray('─'.repeat(width))
    ).join('─┼─') + '\n';

    // Rows
    rows.forEach(row => {
      output += row.map((cell, i) =>
        (cell || '').padEnd(columnWidths[i])
      ).join(' │ ') + '\n';
    });

    return output;
  }

  /**
   * Strip ANSI escape codes from string (for length calculations)
   */
  private static stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

/**
 * Convenience exports for common highlighting patterns
 */
export const highlightUtils = HighlightingUtils;
export const formatJson = HighlightingUtils.formatJson;
export const formatJsonRpc = HighlightingUtils.formatJsonRpc;
export const formatStatus = HighlightingUtils.formatStatus;
export const createJsonBox = HighlightingUtils.createJsonBox;