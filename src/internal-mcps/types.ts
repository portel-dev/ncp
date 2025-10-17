/**
 * Internal MCP Types
 *
 * Defines interfaces for MCPs that are implemented internally by NCP itself
 * These MCPs appear in tool discovery like external MCPs but are handled internally
 */

export interface InternalTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface InternalToolResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface ElicitationCapable {
  elicitInput(params: {
    message: string;
    requestedSchema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  }): Promise<{
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, any>;
  }>;
}

export interface InternalMCP {
  name: string;
  description: string;
  tools: InternalTool[];

  /**
   * Execute a tool from this internal MCP
   */
  executeTool(toolName: string, parameters: any): Promise<InternalToolResult>;

  /**
   * Optionally set elicitation server for user interaction
   * Used by management tools to show confirmation dialogs
   */
  setElicitationServer?(server: ElicitationCapable): void;
}
