/**
 * Shared service for consistent error handling and user-friendly error messages
 * Consolidates error handling patterns and provides contextual help
 */

import { OutputFormatter } from './output-formatter.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';

export interface ErrorContext {
  component: string;
  operation: string;
  userInput?: string;
  suggestions?: string[];
}

export interface ErrorResult {
  success: false;
  error: string;
  context?: ErrorContext;
  suggestions?: string[];
}

export interface SuccessResult<T = any> {
  success: true;
  data: T;
}

export type Result<T = any> = SuccessResult<T> | ErrorResult;

export class ErrorHandler {
  /**
   * Handle and format errors consistently
   */
  static handle(error: Error | string, context?: ErrorContext): ErrorResult {
    const errorMessage = typeof error === 'string' ? error : error.message;

    // Log the error for debugging
    logger.debug(`Error in ${context?.component || 'unknown'}.${context?.operation || 'unknown'}: ${errorMessage}`);

    // Determine user-friendly error message
    const friendlyMessage = this.getFriendlyMessage(errorMessage, context);
    const suggestions = this.getSuggestions(errorMessage, context);

    return {
      success: false,
      error: friendlyMessage,
      context,
      suggestions
    };
  }

  /**
   * Wrap async operations with consistent error handling
   */
  static async wrap<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<Result<T>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      return this.handle(error as Error, context);
    }
  }

  /**
   * Wrap sync operations with consistent error handling
   */
  static wrapSync<T>(
    operation: () => T,
    context: ErrorContext
  ): Result<T> {
    try {
      const data = operation();
      return { success: true, data };
    } catch (error) {
      return this.handle(error as Error, context);
    }
  }

  /**
   * Convert technical error messages to user-friendly ones
   */
  private static getFriendlyMessage(error: string, context?: ErrorContext): string {
    // File system errors
    if (error.includes('ENOENT')) {
      return `File or directory not found${context?.userInput ? `: ${context.userInput}` : ''}`;
    }
    if (error.includes('EACCES') || error.includes('permission denied')) {
      return `Permission denied${context?.userInput ? ` for: ${context.userInput}` : ''}`;
    }
    if (error.includes('EISDIR')) {
      return `Expected a file but found a directory${context?.userInput ? `: ${context.userInput}` : ''}`;
    }

    // Network errors
    if (error.includes('ECONNREFUSED') || error.includes('connect ECONNREFUSED')) {
      return 'Connection refused - service may not be running';
    }
    if (error.includes('ETIMEDOUT') || error.includes('timeout')) {
      return 'Operation timed out - please try again';
    }
    if (error.includes('ENOTFOUND')) {
      return 'Host not found - check your internet connection';
    }

    // MCP-specific errors
    if (error.includes('Unknown tool')) {
      const toolName = this.extractToolName(error);
      return `Tool "${toolName}" not found`;
    }
    if (error.includes('MCP not configured')) {
      return 'MCP server not configured';
    }
    if (error.includes('not in allowed directories')) {
      return 'Access denied - path not in allowed directories';
    }

    // JSON/Parsing errors
    if (error.includes('JSON') && error.includes('parse')) {
      return 'Invalid JSON format in configuration';
    }

    // Configuration errors
    if (error.includes('Profile') && error.includes('not found')) {
      return `Profile not found${context?.userInput ? `: ${context.userInput}` : ''}`;
    }

    // Default: return original message but cleaned up
    return this.cleanErrorMessage(error);
  }

  /**
   * Generate helpful suggestions based on error type
   */
  private static getSuggestions(error: string, context?: ErrorContext): string[] {
    const suggestions: string[] = [];

    // File not found suggestions
    if (error.includes('ENOENT') || error.includes('not found')) {
      suggestions.push('Check the file path and ensure it exists');
      if (context?.userInput) {
        suggestions.push(`Verify the spelling of "${context.userInput}"`);
      }
    }

    // Permission denied suggestions
    if (error.includes('EACCES') || error.includes('permission denied')) {
      suggestions.push('Check file permissions');
      suggestions.push('Try running with appropriate permissions');
    }

    // Tool not found suggestions
    if (error.includes('Unknown tool')) {
      const [mcpName] = (context?.userInput || '').split(':');
      if (mcpName) {
        suggestions.push(`Try 'ncp find "${mcpName}"' to see available tools`);
      }
      suggestions.push('Use \'ncp find\' to explore all available tools');
    }

    // Connection errors
    if (error.includes('ECONNREFUSED') || error.includes('connect ECONNREFUSED')) {
      suggestions.push('Ensure the MCP server is running');
      suggestions.push('Check your configuration');
    }

    // Configuration suggestions
    if (error.includes('Profile') && error.includes('not found')) {
      suggestions.push('Use \'ncp list\' to see available profiles');
      suggestions.push('Check your profile configuration');
    }

    // Add context-specific suggestions
    if (context?.suggestions) {
      suggestions.push(...context.suggestions);
    }

    return suggestions;
  }

  /**
   * Extract tool name from error message
   */
  private static extractToolName(error: string): string {
    const match = error.match(/Unknown tool[:\s]+([^"\s]+)/);
    return match?.[1] || 'unknown';
  }

  /**
   * Clean up technical error messages
   */
  private static cleanErrorMessage(error: string): string {
    return error
      .replace(/^Error:\s*/, '') // Remove "Error:" prefix
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Format error for console output
   */
  static formatForConsole(result: ErrorResult): string {
    let output = OutputFormatter.error(result.error);

    if (result.suggestions && result.suggestions.length > 0) {
      output += '\n\n' + result.suggestions.map(s => {
        // If suggestion already starts with emoji or bullet, use as-is with blue color
        if (s.startsWith('💡') || s.startsWith('  •')) {
          return chalk.blue(s);
        }
        // Otherwise, format as a tip
        return OutputFormatter.tip(s);
      }).join('\n');
    }

    return output;
  }

  /**
   * Create context for error handling
   */
  static createContext(
    component: string,
    operation: string,
    userInput?: string,
    suggestions?: string[]
  ): ErrorContext {
    return { component, operation, userInput, suggestions };
  }

  /**
   * Common file operation error handler
   */
  static fileOperation(operation: string, path: string): ErrorContext {
    return this.createContext('filesystem', operation, path, [
      'Ensure the path exists and is accessible',
      'Check file permissions'
    ]);
  }

  /**
   * Common network operation error handler
   */
  static networkOperation(operation: string, target?: string): ErrorContext {
    return this.createContext('network', operation, target, [
      'Check your internet connection',
      'Verify the service is running'
    ]);
  }

  /**
   * Common MCP operation error handler
   */
  static mcpOperation(operation: string, tool?: string): ErrorContext {
    return this.createContext('mcp', operation, tool, [
      'Verify the MCP server is configured correctly',
      'Check if the tool exists using \'ncp find\''
    ]);
  }
}