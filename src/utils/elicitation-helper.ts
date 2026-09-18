/**
 * Elicitation Helper for User Input via MCP Dialogs
 *
 * Provides utilities to show UI dialogs (via MCP elicitation) to collect
 * sensitive information from users without exposing it in chat.
 */

import { logger } from './logger.js';
export interface UserInputRequest {
  message: string;
  requestedSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface UserInputProvider {
  requestInput(params: UserInputRequest): Promise<{
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, any>;
  }>;
}

/**
 * Collect a single credential value from user via elicitation dialog
 *
 * Shows a structured input form. The value is returned directly to the active
 * request workflow and is never placed in requestState or chat output.
 *
 * @param server request-scoped MCP input provider
 * @param credentialName Human-readable name (e.g., "GitHub Token", "API Key")
 * @param envVarName Environment variable name (e.g., "GITHUB_TOKEN")
 * @param example Optional example value to show user
 * @returns The credential value, or null if user cancelled
 */
export async function collectCredential(
  server: UserInputProvider,
  credentialName: string,
  envVarName: string,
  example?: string
): Promise<string | null> {
  const result = await server.requestInput({
    message: `Please provide your ${credentialName}. The value is stored locally by NCP and is not included in chat output.`,
    requestedSchema: {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          minLength: 1,
          description: `${credentialName}${example ? ` (for example: ${example})` : ''}`
        }
      },
      required: ['value']
    }
  });

  if (result.action !== 'accept') {
    logger.info(`User ${result.action} providing ${credentialName}`);
    return null;
  }

  const value = result.content?.value;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Collect multiple credentials from one structured form
 *
 * Returns a map of environment variable names to values from one form.
 *
 * @param server MCP server instance
 * @param credentials Array of credentials to collect
 * @returns Map of env var names to values, or null if user cancelled
 */
export async function collectCredentials(
  server: UserInputProvider,
  credentials: Array<{
    envVarName: string;
    displayName: string;
    example?: string;
    required?: boolean;
  }>
): Promise<Record<string, string> | null> {
  if (credentials.length === 0) return {};

  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const credential of credentials) {
    properties[credential.envVarName] = {
      type: 'string',
      ...(credential.required === false ? {} : { minLength: 1 }),
      description: `${credential.displayName}${credential.example ? ` (for example: ${credential.example})` : ''}`,
    };
    if (credential.required !== false) required.push(credential.envVarName);
  }

  const result = await server.requestInput({
    message: 'Provide the credentials required by this MCP. Values are stored locally and are not included in chat output.',
    requestedSchema: { type: 'object', properties, required },
  });
  if (result.action !== 'accept') return null;

  const collected: Record<string, string> = {};
  for (const credential of credentials) {
    const value = result.content?.[credential.envVarName];
    if (typeof value === 'string' && value.trim().length > 0) {
      collected[credential.envVarName] = value.trim();
    }
  }
  return collected;
}

/**
 * Collect ALL credentials for multiple MCPs in ONE form
 *
 * Shows a single consolidated elicitation dialog with all credential fields.
 * Much better UX than separate dialogs for each credential.
 *
 * @param server MCP server instance
 * @param bulkCredentials Map of MCP names to their required credentials
 * @returns Map of credential keys (mcpName:envVar) to values, or null if cancelled
 */
export async function collectBulkCredentials(
  server: UserInputProvider,
  bulkCredentials: Record<string, Array<{
    envVarName: string;
    displayName: string;
    example?: string;
    required?: boolean;
    transport?: 'stdio' | 'http';
  }>>
): Promise<Record<string, string> | null> {
  // Build consolidated schema with all credential fields
  const properties: Record<string, any> = {};
  const fieldKeys: string[] = [];
  const requiredFieldKeys: string[] = [];
  let message = '📋 Credential Collection for Bulk Import\n\n';
  message += 'Please provide credentials for the following MCPs:\n\n';

  for (const [mcpName, credentials] of Object.entries(bulkCredentials)) {
    if (credentials.length === 0) continue;

    message += `**${mcpName}**:\n`;

    for (const cred of credentials) {
      // Create unique field key: mcpName:envVarName
      const fieldKey = `${mcpName}:${cred.envVarName}`;
      fieldKeys.push(fieldKey);
      if (cred.required !== false) requiredFieldKeys.push(fieldKey);

      // Add to schema
      properties[fieldKey] = {
        type: 'string',
        ...(cred.required === false ? {} : { minLength: 1 }),
        description: `${cred.displayName}${cred.example ? ` (e.g., ${cred.example})` : ''}`
      };

      message += `  • ${cred.displayName}${cred.required === false ? ' (optional)' : ''}\n`;
    }

    message += '\n';
  }

  message += '💡 Leave fields empty to skip optional credentials.\n';
  message += '⚠️  Credentials are stored locally in your NCP config.';

  // Show consolidated form
  const result = await server.requestInput({
    message,
    requestedSchema: {
      type: 'object',
      properties,
      required: requiredFieldKeys
    }
  });

  if (result.action !== 'accept') {
    logger.info(`User ${result.action} bulk credential collection`);
    return null;
  }

  // Extract collected values
  const collected: Record<string, string> = {};
  const content = result.content || {};

  for (const fieldKey of fieldKeys) {
    const value = content[fieldKey];
    if (value && typeof value === 'string' && value.trim().length > 0) {
      collected[fieldKey] = value.trim();
    }
  }

  logger.info(`Collected ${Object.keys(collected).length} credentials from bulk form`);
  return collected;
}

/**
 * Collect HTTP/SSE authentication credentials from user
 *
 * Currently supports bearer tokens. Returns auth config for HTTP/SSE servers.
 *
 * @param server MCP server instance
 * @param mcpName Name of the MCP
 * @param url URL of the HTTP/SSE server
 * @returns Auth configuration object, or null if user cancelled
 */
export async function collectHTTPCredentials(
  server: UserInputProvider,
  mcpName: string,
  url: string
): Promise<{ type: string; token?: string } | null> {
  const credentialRequirements = detectHTTPCredentials(mcpName, url);

  if (credentialRequirements.length === 0) {
    // No credentials needed (public endpoint)
    return null;
  }

  // For now, we only support bearer token collection
  // OAuth and basic auth would require more complex flows
  const bearerCred = credentialRequirements.find(c => c.credentialType === 'bearer');

  if (!bearerCred) {
    logger.info(`HTTP MCP "${mcpName}" requires non-bearer auth, skipping auto-collection`);
    return null;
  }

  // Collect bearer token in the active request workflow.
  const token = await collectCredential(
    server,
    bearerCred.displayName,
    'AUTH_TOKEN',
    bearerCred.example
  );

  if (token === null) {
    return null; // User cancelled
  }

  return {
    type: 'bearer',
    token
  };
}

/**
 * Format environment variable name for display
 * Converts: "GITHUB_TOKEN" -> "GitHub Token"
 */
export function formatEnvVarName(envVar: string): string {
  return envVar
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Detect required credentials for HTTP/SSE servers
 *
 * Returns bearer token requirements for known HTTP/SSE MCPs
 */
export function detectHTTPCredentials(mcpName: string, url?: string): Array<{
  credentialType: 'bearer' | 'apiKey' | 'oauth' | 'basic';
  displayName: string;
  example?: string;
}> {
  // Common patterns for HTTP/SSE MCPs that need authentication
  const httpPatterns: Record<string, Array<{ credentialType: 'bearer' | 'apiKey' | 'oauth' | 'basic'; displayName: string; example?: string }>> = {
    'github': [
      { credentialType: 'bearer', displayName: 'GitHub Personal Access Token', example: 'ghp_xxxxxxxxxxxx' }
    ],
    'gitlab': [
      { credentialType: 'bearer', displayName: 'GitLab Personal Access Token', example: 'glpat-xxxxxxxxxxxx' }
    ],
    'stripe': [
      { credentialType: 'bearer', displayName: 'Stripe API Key', example: 'sk_test_xxxxxxxxxxxx' }
    ],
    'openai': [
      { credentialType: 'bearer', displayName: 'OpenAI API Key', example: 'sk-xxxxxxxxxxxx' }
    ],
    'anthropic': [
      { credentialType: 'bearer', displayName: 'Anthropic API Key', example: 'sk-ant-xxxxxxxxxxxx' }
    ],
    'slack': [
      { credentialType: 'bearer', displayName: 'Slack Bot Token', example: 'xoxb-xxxxxxxxxxxx' }
    ]
  };

  // Check URL for patterns
  if (url) {
    const urlLower = url.toLowerCase();
    for (const [pattern, creds] of Object.entries(httpPatterns)) {
      if (urlLower.includes(pattern)) {
        return creds;
      }
    }
  }

  // Check MCP name for patterns
  const nameLower = mcpName.toLowerCase();
  for (const [pattern, creds] of Object.entries(httpPatterns)) {
    if (nameLower.includes(pattern)) {
      return creds;
    }
  }

  return [];
}

/**
 * Elicit a selection from a list of options (enum)
 *
 * Shows a dialog with radio buttons/dropdown for structured selection.
 * Follows GitHub's MCP elicitation best practice: use schema-driven prompts.
 *
 * @param server MCP server instance
 * @param fieldName Name of the field being selected
 * @param options Array of {value, label} options to choose from
 * @param message Optional custom message
 * @returns Selected option value, or null if cancelled
 */
export async function elicitSelect(
  server: UserInputProvider,
  fieldName: string,
  options: Array<{ value: string; label: string }>,
  message?: string
): Promise<string | null> {
  if (options.length === 0) {
    logger.warn(`elicitSelect: No options provided for ${fieldName}`);
    return null;
  }

  const defaultMessage = `Select a ${fieldName}:`;
  const description = options.map(opt => `• ${opt.label}`).join('\n');

  try {
    const result = await server.requestInput({
      message: message || `${defaultMessage}\n\n${description}`,
      requestedSchema: {
        type: 'object',
        properties: {
          [fieldName]: {
            type: 'string',
            enum: options.map(opt => opt.value),
            description: `Choose from available ${fieldName} options`
          }
        },
        required: [fieldName]
      }
    });

    if (result.action !== 'accept' || !result.content) {
      logger.info(`User ${result.action} elicit selection for ${fieldName}`);
      return null;
    }

    const selected = result.content[fieldName];
    if (selected) {
      logger.info(`User selected: ${selected}`);
      return selected;
    }

    return null;
  } catch (error: any) {
    // Optional selections degrade to the existing empty outcome.
    logger.warn(`Elicitation failed for ${fieldName}: ${error.message}`);
    return null;
  }
}

/**
 * Elicit multiple selections from a list of options
 *
 * Shows a dialog with checkboxes for multi-select.
 * User can select multiple options.
 *
 * @param server MCP server instance
 * @param fieldName Name of the field being selected
 * @param options Array of {value, label} options to choose from
 * @param message Optional custom message
 * @returns Array of selected option values, empty array if cancelled
 */
export async function elicitMultiSelect(
  server: UserInputProvider,
  fieldName: string,
  options: Array<{ value: string; label: string }>,
  message?: string
): Promise<string[]> {
  if (options.length === 0) {
    logger.warn(`elicitMultiSelect: No options provided for ${fieldName}`);
    return [];
  }

  const defaultMessage = `Select ${fieldName}s (one or more):`;
  const description = options.map(opt => `☐ ${opt.label}`).join('\n');

  try {
    const result = await server.requestInput({
      message: message || `${defaultMessage}\n\n${description}`,
      requestedSchema: {
        type: 'object',
        properties: {
          [fieldName]: {
            type: 'array',
            items: {
              type: 'string',
              enum: options.map(opt => opt.value)
            },
            description: `Choose one or more ${fieldName} options`
          }
        },
        required: [fieldName]
      }
    });

    if (result.action !== 'accept' || !result.content) {
      logger.info(`User ${result.action} elicit multi-select for ${fieldName}`);
      return [];
    }

    const selected = result.content[fieldName];
    if (Array.isArray(selected)) {
      logger.info(`User selected ${selected.length} items: ${selected.join(', ')}`);
      return selected;
    }

    return [];
  } catch (error: any) {
    // Optional selections degrade to the existing empty outcome.
    logger.warn(`Elicitation failed for ${fieldName}: ${error.message}`);
    return [];
  }
}

/**
 * Detect required environment variables from MCP metadata
 *
 * This can be extended to parse from:
 * - Registry metadata
 * - Package.json
 * - README files
 * - Auto-detection from errors
 */
export function detectRequiredEnvVars(mcpName: string): Array<{
  envVarName: string;
  displayName: string;
  example?: string;
}> {
  // Common patterns for well-known stdio MCPs
  const knownPatterns: Record<string, Array<{ envVarName: string; displayName: string; example?: string }>> = {
    'github': [
      { envVarName: 'GITHUB_TOKEN', displayName: 'GitHub Personal Access Token', example: 'ghp_xxxxxxxxxxxx' }
    ],
    'gitlab': [
      { envVarName: 'GITLAB_TOKEN', displayName: 'GitLab Personal Access Token', example: 'glpat-xxxxxxxxxxxx' }
    ],
    'slack': [
      { envVarName: 'SLACK_BOT_TOKEN', displayName: 'Slack Bot Token', example: 'xoxb-xxxxxxxxxxxx' },
      { envVarName: 'SLACK_TEAM_ID', displayName: 'Slack Team ID', example: 'T01234567' }
    ],
    'postgres': [
      { envVarName: 'POSTGRES_CONNECTION_STRING', displayName: 'PostgreSQL Connection String', example: 'postgresql://user:pass@host:5432/db' }
    ],
    'openai': [
      { envVarName: 'OPENAI_API_KEY', displayName: 'OpenAI API Key', example: 'sk-xxxxxxxxxxxx' }
    ],
    'google-drive': [
      { envVarName: 'GOOGLE_DRIVE_CREDENTIALS', displayName: 'Google Drive Credentials JSON', example: '{"client_id": "...", ...}' }
    ]
  };

  // Check if MCP name matches known patterns
  for (const [pattern, envVars] of Object.entries(knownPatterns)) {
    if (mcpName.toLowerCase().includes(pattern)) {
      return envVars;
    }
  }

  return [];
}
