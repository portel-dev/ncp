/**
 * Configuration Helper Utilities for Photon
 *
 * Provides utility functions for validating and accessing environment variables
 * with clear, actionable error messages.
 */

/**
 * Require an environment variable, throwing a clear error if not set
 *
 * @param name Environment variable name
 * @param description Optional description of what this variable is used for
 * @returns The environment variable value
 * @throws Error if environment variable is not set
 *
 * @example
 * const apiKey = requireEnv('OPENAI_API_KEY', 'Required for OpenAI API access');
 */
export function requireEnv(name: string, description?: string): string {
  const value = process.env[name];

  if (!value) {
    const descText = description ? `\n${description}\n` : '';

    throw new Error(
      `${name} not configured.${descText}\n` +
        `To configure this environment variable:\n\n` +
        `1. Edit your NCP profile: ~/.ncp/all.json (or .ncp/all.json for project-local)\n` +
        `2. Add to the env section:\n` +
        `   {\n` +
        `     "mcpServers": {\n` +
        `       "your-mcp-name": {\n` +
        `         "type": "internal",\n` +
        `         "env": {\n` +
        `           "${name}": "_USE_SECURE_STORAGE_"\n` +
        `         }\n` +
        `       }\n` +
        `     }\n` +
        `   }\n\n` +
        `3. Run any tool - you'll be prompted to enter the value\n` +
        `4. The value will be stored securely in your OS keychain\n\n` +
        `Alternatively, set it in your shell:\n` +
        `  export ${name}="your-value"`
    );
  }

  return value;
}

/**
 * Get an optional environment variable with a default value
 *
 * @param name Environment variable name
 * @param defaultValue Default value if not set
 * @returns The environment variable value or default
 *
 * @example
 * const region = optionalEnv('AWS_REGION', 'us-east-1');
 * const port = optionalEnv('PORT', '3000');
 */
export function optionalEnv(
  name: string,
  defaultValue?: string
): string | undefined {
  return process.env[name] || defaultValue;
}

/**
 * Validate multiple environment variables at once
 *
 * @param schema Object mapping env var names to config
 * @returns Object mapping env var names to values
 * @throws Error if any required variable is missing
 *
 * @example
 * const config = validateConfig({
 *   OPENAI_API_KEY: { required: true, description: 'OpenAI API key' },
 *   OPENAI_ORG_ID: { required: false, default: 'personal' },
 *   AWS_REGION: { required: false, default: 'us-east-1' }
 * });
 * // Returns: { OPENAI_API_KEY: 'sk-...', OPENAI_ORG_ID: 'personal', AWS_REGION: 'us-east-1' }
 */
export function validateConfig(schema: Record<
  string,
  {
    required?: boolean;
    default?: string;
    description?: string;
  }
>): Record<string, string | undefined> {
  const config: Record<string, string | undefined> = {};
  const missingRequired: Array<{
    name: string;
    description?: string;
  }> = [];

  for (const [name, spec] of Object.entries(schema)) {
    const value = process.env[name];

    if (!value) {
      if (spec.required) {
        missingRequired.push({
          name,
          description: spec.description,
        });
      } else {
        config[name] = spec.default;
      }
    } else {
      config[name] = value;
    }
  }

  if (missingRequired.length > 0) {
    const varList = missingRequired
      .map((v) => {
        const desc = v.description ? ` - ${v.description}` : '';
        return `  • ${v.name}${desc}`;
      })
      .join('\n');

    const envSection = missingRequired
      .map((v) => `        "${v.name}": "_USE_SECURE_STORAGE_"`)
      .join(',\n');

    throw new Error(
      `Missing required environment variables:\n${varList}\n\n` +
        `To configure these variables:\n\n` +
        `1. Edit your NCP profile: ~/.ncp/all.json (or .ncp/all.json for project-local)\n` +
        `2. Add to the env section:\n` +
        `   {\n` +
        `     "mcpServers": {\n` +
        `       "your-mcp-name": {\n` +
        `         "type": "internal",\n` +
        `         "env": {\n` +
        `${envSection}\n` +
        `         }\n` +
        `       }\n` +
        `     }\n` +
        `   }\n\n` +
        `3. Run any tool - you'll be prompted to enter each value\n` +
        `4. Values will be stored securely in your OS keychain`
    );
  }

  return config;
}

/**
 * Check if an environment variable is set
 *
 * @param name Environment variable name
 * @returns True if set and non-empty
 *
 * @example
 * if (hasEnv('OPENAI_API_KEY')) {
 *   // Use OpenAI
 * } else {
 *   // Fall back to other provider
 * }
 */
export function hasEnv(name: string): boolean {
  return !!process.env[name];
}

/**
 * Get environment variable or throw with custom error message
 *
 * @param name Environment variable name
 * @param errorMessage Custom error message
 * @returns The environment variable value
 * @throws Error with custom message if not set
 *
 * @example
 * const token = requireEnvOr(
 *   'GITHUB_TOKEN',
 *   'GitHub token required. Get one at https://github.com/settings/tokens'
 * );
 */
export function requireEnvOr(name: string, errorMessage: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(errorMessage);
  }

  return value;
}

/**
 * Validate environment variable matches a pattern
 *
 * @param name Environment variable name
 * @param pattern Regular expression pattern
 * @param description Description of expected format
 * @returns The environment variable value
 * @throws Error if not set or doesn't match pattern
 *
 * @example
 * const apiKey = validateEnvPattern(
 *   'OPENAI_API_KEY',
 *   /^sk-[a-zA-Z0-9]{40,}$/,
 *   'OpenAI API key format: sk-...'
 * );
 */
export function validateEnvPattern(
  name: string,
  pattern: RegExp,
  description?: string
): string {
  const value = requireEnv(name);

  if (!pattern.test(value)) {
    const desc = description ? `\nExpected format: ${description}` : '';
    throw new Error(
      `${name} has invalid format.${desc}\n` +
        `Current value does not match pattern: ${pattern}\n\n` +
        `Please check your configuration and ensure the value is correct.`
    );
  }

  return value;
}

/**
 * Parse environment variable as integer
 *
 * @param name Environment variable name
 * @param defaultValue Default value if not set or invalid
 * @returns Parsed integer value
 *
 * @example
 * const port = envInt('PORT', 3000);
 * const timeout = envInt('TIMEOUT', 30);
 */
export function envInt(name: string, defaultValue: number): number {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    console.warn(
      `Warning: ${name}="${value}" is not a valid integer, using default: ${defaultValue}`
    );
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse environment variable as boolean
 *
 * Treats 'true', '1', 'yes', 'on' as true (case-insensitive)
 * Treats 'false', '0', 'no', 'off' as false (case-insensitive)
 *
 * @param name Environment variable name
 * @param defaultValue Default value if not set or invalid
 * @returns Boolean value
 *
 * @example
 * const debug = envBool('DEBUG', false);
 * const secure = envBool('SMTP_SECURE', true);
 */
export function envBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  const normalized = value.toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  console.warn(
    `Warning: ${name}="${value}" is not a valid boolean, using default: ${defaultValue}`
  );
  return defaultValue;
}

/**
 * Parse environment variable as JSON
 *
 * @param name Environment variable name
 * @param defaultValue Default value if not set or invalid
 * @returns Parsed JSON value
 *
 * @example
 * const gcpCreds = envJSON('GCP_CREDENTIALS', {});
 * const config = envJSON('APP_CONFIG', { timeout: 30 });
 */
export function envJSON<T = any>(name: string, defaultValue: T): T {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn(
      `Warning: ${name} is not valid JSON, using default value. Error: ${error}`
    );
    return defaultValue;
  }
}

/**
 * Build connection string from environment variables
 *
 * @param template Template string with {{VAR}} placeholders
 * @param required Array of required variable names
 * @returns Connection string with variables replaced
 * @throws Error if any required variable is missing
 *
 * @example
 * const dbUrl = buildConnectionString(
 *   'postgresql://{{DB_USER}}:{{DB_PASS}}@{{DB_HOST}}:{{DB_PORT}}/{{DB_NAME}}',
 *   ['DB_USER', 'DB_PASS', 'DB_HOST', 'DB_PORT', 'DB_NAME']
 * );
 */
export function buildConnectionString(
  template: string,
  required: string[]
): string {
  let result = template;

  for (const varName of required) {
    const value = requireEnv(varName);
    result = result.replace(new RegExp(`{{${varName}}}`, 'g'), value);
  }

  return result;
}
