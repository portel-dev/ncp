/**
 * MCP Prompts for User Interaction
 *
 * Uses MCP protocol's prompts capability to request user input/approval
 * Works with Claude Desktop and other MCP clients that support prompts
 */

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * Available prompts for NCP management operations
 */
export const NCP_PROMPTS: Prompt[] = [
  {
    name: 'confirm_add_mcp',
    description: 'Request user confirmation before adding a new MCP server',
    arguments: [
      {
        name: 'mcp_name',
        description: 'Name of the MCP server to add',
        required: true
      },
      {
        name: 'command',
        description: 'Command to execute',
        required: true
      },
      {
        name: 'profile',
        description: 'Target profile name',
        required: false
      }
    ]
  },
  {
    name: 'confirm_remove_mcp',
    description: 'Request user confirmation before removing an MCP server',
    arguments: [
      {
        name: 'mcp_name',
        description: 'Name of the MCP server to remove',
        required: true
      },
      {
        name: 'profile',
        description: 'Profile to remove from',
        required: false
      }
    ]
  },
  {
    name: 'configure_mcp',
    description: 'Request user input for MCP configuration (env vars, args)',
    arguments: [
      {
        name: 'mcp_name',
        description: 'Name of the MCP being configured',
        required: true
      },
      {
        name: 'config_type',
        description: 'Type of configuration needed',
        required: true
      }
    ]
  },
  {
    name: 'approve_dangerous_operation',
    description: 'Request approval for potentially dangerous operations',
    arguments: [
      {
        name: 'operation',
        description: 'Description of the operation',
        required: true
      },
      {
        name: 'impact',
        description: 'Potential impact description',
        required: true
      }
    ]
  },
  {
    name: 'confirm_operation',
    description: 'Request user confirmation before executing modifier operations',
    arguments: [
      {
        name: 'tool',
        description: 'Tool identifier (mcp:tool format)',
        required: true
      },
      {
        name: 'tool_description',
        description: 'Description of what the tool does',
        required: false
      },
      {
        name: 'parameters',
        description: 'JSON string of parameters being passed',
        required: false
      },
      {
        name: 'matched_pattern',
        description: 'The modifier pattern that matched',
        required: false
      },
      {
        name: 'confidence',
        description: 'Match confidence (0.0-1.0)',
        required: false
      }
    ]
  }
];

/**
 * Generate prompt message for MCP add confirmation
 *
 * SECURITY: Supports clipboard-based secret configuration!
 * User can copy config with API keys to clipboard BEFORE clicking YES.
 * NCP reads clipboard server-side - secrets NEVER exposed to AI.
 */
export function generateAddConfirmation(
  mcpName: string,
  command: string,
  args: string[],
  profile: string = 'all'
): PromptMessage[] {
  const argsStr = args.length > 0 ? ` ${args.join(' ')}` : '';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Do you want to add the MCP server "${mcpName}" to profile "${profile}"?\n\nCommand: ${command}${argsStr}\n\nThis will allow Claude to access the tools provided by this MCP server.\n\n📋 SECURE SETUP (Optional):\nTo include API keys/tokens WITHOUT exposing them to this conversation:\n1. Copy your config to clipboard BEFORE clicking YES\n2. Example: {"env":{"API_KEY":"your_secret_here"}}\n3. Click YES - NCP will read from clipboard\n\nOr click YES without copying for basic setup.`
      }
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Please respond with YES to confirm or NO to cancel.'
      }
    }
  ];
}

/**
 * Generate prompt message for MCP remove confirmation
 */
export function generateRemoveConfirmation(
  mcpName: string,
  profile: string = 'all'
): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Do you want to remove the MCP server "${mcpName}" from profile "${profile}"?\n\nThis will remove access to all tools provided by this MCP server.`
      }
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Please respond with YES to confirm or NO to cancel.'
      }
    }
  ];
}

/**
 * Generate prompt message for configuration input
 */
export function generateConfigInput(
  mcpName: string,
  configType: string,
  description: string
): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Configuration needed for "${mcpName}":\n\n${description}\n\nPlease provide the required value.`
      }
    }
  ];
}

/**
 * Generate prompt message for operation confirmation (confirm-before-run feature)
 *
 * Shows rich dialog with tool description, parameters, and reason for confirmation.
 * User can approve once, approve always (whitelist), or cancel.
 */
export function generateOperationConfirmation(
  toolIdentifier: string,
  toolDescription: string,
  parameters: Record<string, any>,
  matchedPattern: string,
  confidence: number
): PromptMessage[] {
  const [mcpName, toolName] = toolIdentifier.split(':');

  // Format parameters nicely
  let parametersText = '';
  if (Object.keys(parameters).length > 0) {
    parametersText = '\n\nParameters:';
    for (const [key, value] of Object.entries(parameters)) {
      const valueStr = typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
      parametersText += `\n  ${key}: ${valueStr}`;
    }
  } else {
    parametersText = '\n\nParameters: (none)';
  }

  const confidencePercent = Math.round(confidence * 100);

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `⚠️ CONFIRMATION REQUIRED

Tool: ${toolName}
MCP: ${mcpName}

Description:
${toolDescription || 'No description available'}${parametersText}

Reason: Matches modifier pattern (${confidencePercent}% confidence)
Pattern: "${matchedPattern}"

This operation may modify data or have side effects.

Do you want to proceed?
- Reply "YES" to approve this once
- Reply "ALWAYS" to approve and add to whitelist (won't ask again)
- Reply "NO" to cancel`
      }
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Please respond with YES (once), ALWAYS (whitelist), or NO (cancel).'
      }
    }
  ];
}

/**
 * Parse user response from prompt
 */
export function parseConfirmationResponse(response: string): boolean {
  const normalized = response.trim().toLowerCase();
  return normalized === 'yes' || normalized === 'y' || normalized === 'confirm';
}

/**
 * Parse operation confirmation response
 * Returns: 'once' | 'always' | 'cancel'
 */
export function parseOperationConfirmationResponse(response: string): 'once' | 'always' | 'cancel' {
  const normalized = response.trim().toLowerCase();

  if (normalized === 'always' || normalized === 'whitelist') {
    return 'always';
  }

  if (normalized === 'yes' || normalized === 'y' || normalized === 'approve' || normalized === 'confirm') {
    return 'once';
  }

  return 'cancel';
}

/**
 * Parse configuration input response
 */
export function parseConfigResponse(response: string): string {
  return response.trim();
}

/**
 * Try to read and parse clipboard content for MCP configuration
 * Returns additional config (env vars, args) from clipboard or null if invalid
 *
 * SECURITY: This is called AFTER user clicks YES on prompt that tells them
 * to copy config first. It's explicit user consent, not sneaky background reading.
 */
export async function tryReadClipboardConfig(): Promise<{
  env?: Record<string, string>;
  args?: string[];
} | null> {
  try {
    // Dynamically import clipboardy to avoid loading in all contexts
    const clipboardy = await import('clipboardy');
    const clipboardContent = await clipboardy.default.read();

    if (!clipboardContent || clipboardContent.trim().length === 0) {
      return null; // Empty clipboard - user didn't copy anything
    }

    // Try to parse as JSON
    try {
      const config = JSON.parse(clipboardContent.trim());

      // Validate it's an object with expected properties
      if (typeof config !== 'object' || config === null) {
        return null;
      }

      // Extract only env and args (ignore other fields for security)
      const result: { env?: Record<string, string>; args?: string[] } = {};

      if (config.env && typeof config.env === 'object') {
        result.env = config.env;
      }

      if (Array.isArray(config.args)) {
        result.args = config.args;
      }

      // Only return if we found something useful
      if (result.env || result.args) {
        return result;
      }

      return null;
    } catch (parseError) {
      // Not valid JSON - user didn't copy config
      return null;
    }
  } catch (error) {
    // Clipboard access failed - not critical, just return null
    return null;
  }
}

/**
 * Merge base config with clipboard config
 * Clipboard config takes precedence for env vars and can add additional args
 */
export function mergeWithClipboardConfig(
  baseConfig: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  },
  clipboardConfig: {
    env?: Record<string, string>;
    args?: string[];
  } | null
): {
  command: string;
  args?: string[];
  env?: Record<string, string>;
} {
  if (!clipboardConfig) {
    return baseConfig;
  }

  return {
    command: baseConfig.command,
    args: clipboardConfig.args || baseConfig.args,
    env: {
      ...(baseConfig.env || {}),
      ...(clipboardConfig.env || {}) // Clipboard env vars override base
    }
  };
}
