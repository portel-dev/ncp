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
  content?: string | Array<{ type: string; text?: string; [key: string]: any }>;
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

/**
 * MCP Capabilities - what features this MCP supports
 */
export interface InternalMCPCapabilities {
  /**
   * Experimental, non-standard capabilities
   */
  experimental?: {
    /**
     * Tool validation capability - allows validating tool parameters before execution
     */
    toolValidation?: {
      /**
       * Whether this MCP supports parameter validation
       */
      supported: boolean;
      /**
       * Name of the validation tool (default: "validate")
       */
      method?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface InternalMCP {
  name: string;
  description: string;
  tools: InternalTool[];

  /**
   * MCP capabilities - what features this MCP supports
   * Follows MCP protocol capability announcement pattern
   */
  capabilities?: InternalMCPCapabilities;

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
