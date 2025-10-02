/**
 * Configuration Schema Types
 *
 * These types should be added to schema/draft/schema.ts
 */

/**
 * Describes a configuration parameter needed by the server.
 */
export interface ConfigurationParameter {
  /**
   * Unique identifier for this parameter (e.g., "GITHUB_TOKEN", "allowed-directory")
   */
  name: string;

  /**
   * Human-readable description of what this parameter is for
   */
  description: string;

  /**
   * Type of the parameter value
   */
  type: "string" | "number" | "boolean" | "path" | "url";

  /**
   * Whether this parameter is required for the server to function
   */
  required: boolean;

  /**
   * Whether this contains sensitive data (passwords, API keys)
   * If true, clients should mask input when prompting users
   */
  sensitive?: boolean;

  /**
   * Default value if not provided by the user
   */
  default?: string | number | boolean;

  /**
   * Whether multiple values are allowed (for array parameters)
   */
  multiple?: boolean;

  /**
   * Validation pattern (regex) for string parameters
   */
  pattern?: string;

  /**
   * Example values to help users understand expected format
   */
  examples?: string[];
}

/**
 * Declares configuration requirements for the server.
 *
 * Servers can use this to communicate what environment variables,
 * command-line arguments, or other configuration they need to function properly.
 *
 * This enables clients to:
 * - Detect missing configuration before attempting connection
 * - Prompt users interactively for required values
 * - Validate configuration before startup
 * - Provide helpful error messages
 */
export interface ConfigurationSchema {
  /**
   * Environment variables required by the server
   */
  environmentVariables?: ConfigurationParameter[];

  /**
   * Command-line arguments required by the server
   */
  arguments?: ConfigurationParameter[];

  /**
   * Other configuration requirements (files, URLs, etc.)
   */
  other?: ConfigurationParameter[];
}

/**
 * MODIFICATION TO EXISTING InitializeResult INTERFACE
 *
 * Add this field to the existing InitializeResult interface:
 */
export interface InitializeResult extends Result {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;

  /**
   * Optional schema declaring the server's configuration requirements.
   *
   * Servers can use this to communicate what environment variables,
   * command-line arguments, or other configuration they need.
   *
   * Clients can use this information to:
   * - Validate configuration before attempting connection
   * - Prompt users for missing required configuration
   * - Provide better error messages and setup guidance
   *
   * This field is optional and backward compatible - servers that don't
   * provide it continue to work as before.
   *
   * @example
   * ```typescript
   * // Filesystem server declaring path requirement
   * {
   *   "configurationSchema": {
   *     "arguments": [{
   *       "name": "allowed-directory",
   *       "description": "Directory path that the server is allowed to access",
   *       "type": "path",
   *       "required": true,
   *       "multiple": true
   *     }]
   *   }
   * }
   *
   * // API server declaring token requirement
   * {
   *   "configurationSchema": {
   *     "environmentVariables": [{
   *       "name": "GITHUB_TOKEN",
   *       "description": "GitHub personal access token with repo permissions",
   *       "type": "string",
   *       "required": true,
   *       "sensitive": true,
   *       "pattern": "^ghp_[a-zA-Z0-9]{36}$"
   *     }]
   *   }
   * }
   * ```
   */
  configurationSchema?: ConfigurationSchema;
}
