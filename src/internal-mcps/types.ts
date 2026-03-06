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
  /**
   * Middleware declarations (e.g., @cached, @retryable, @circuitBreaker)
   * Preserved from photon-core schema extraction for client visibility
   */
  middleware?: Array<{
    name: string;
    config?: Record<string, any>;
    phase?: 'before' | 'after' | 'around';
  }>;
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

/**
 * Settings schema for Photons - defines configuration required before tool execution
 */
export interface SettingsSchema {
  properties: Record<string, any>;
  required?: string[];
}

/**
 * Notification subscription - defines events a Photon wants to receive
 */
export interface NotificationSubscription {
  watchFor: string[];
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
   * Settings schema - defines configuration required for this MCP
   * Extracted from Photon's `protected settings = {...}` declaration
   */
  settingsSchema?: SettingsSchema;

  /**
   * Notification subscriptions - defines events this MCP wants to receive
   * Extracted from Photon's @notify-on JSDoc tag
   */
  notificationSubscriptions?: NotificationSubscription;

  /**
   * Execute a tool from this internal MCP
   */
  executeTool(toolName: string, parameters: any): Promise<InternalToolResult>;

  /**
   * Optionally set elicitation server for user interaction
   * Used by management tools to show confirmation dialogs
   */
  setElicitationServer?(server: ElicitationCapable): void;

  /**
   * Optionally handle notifications when events are dispatched
   * Called by InternalMCPManager when subscribed events occur
   */
  onNotification?(type: string, payload: any): Promise<void>;
}
