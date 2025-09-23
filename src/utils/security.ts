/**
 * Security utilities for NCP
 * Handles sensitive data masking and sanitization
 */

/**
 * Masks sensitive information in command strings
 * Detects and masks API keys, tokens, passwords, etc.
 */
export function maskSensitiveData(text: string): string {
  if (!text) return text;

  let masked = text;

  // Mask API keys (various patterns)
  masked = masked.replace(
    /sk_test_[a-zA-Z0-9]{50,}/g,
    (match) => `sk_test_*****${match.slice(-4)}`
  );

  masked = masked.replace(
    /sk_live_[a-zA-Z0-9]{50,}/g,
    (match) => `sk_live_*****${match.slice(-4)}`
  );

  // Mask other common API key patterns
  masked = masked.replace(
    /--api-key[=\s]+([a-zA-Z0-9_-]{16,})/gi,
    (match, key) => match.replace(key, `*****${key.slice(-4)}`)
  );

  // Mask --key parameters
  masked = masked.replace(
    /--key[=\s]+([a-zA-Z0-9_-]{16,})/gi,
    (match, key) => match.replace(key, `*****${key.slice(-4)}`)
  );

  // Mask tokens
  masked = masked.replace(
    /--token[=\s]+([a-zA-Z0-9_-]{16,})/gi,
    (match, token) => match.replace(token, `*****${token.slice(-4)}`)
  );

  // Mask passwords
  masked = masked.replace(
    /--password[=\s]+([^\s]+)/gi,
    (match, password) => match.replace(password, '*****')
  );

  // Mask JWT tokens
  masked = masked.replace(
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    (match) => `eyJ*****${match.slice(-4)}`
  );

  // Mask UUID-like keys
  masked = masked.replace(
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
    (match) => `*****${match.slice(-4)}`
  );

  return masked;
}

/**
 * Formats command display with proper masking
 * @param showAsTemplates - If true, shows template variables like {{API_KEY}} instead of masked values
 */
export function formatCommandDisplay(command: string, args: string[] = [], showAsTemplates: boolean = true): string {
  const fullCommand = `${command} ${args.join(' ')}`.trim();

  if (showAsTemplates) {
    return maskSensitiveDataAsTemplates(fullCommand);
  }
  return maskSensitiveData(fullCommand);
}

/**
 * Masks sensitive data by replacing with template variable names
 * This provides cleaner display without exposing any part of secrets
 */
export function maskSensitiveDataAsTemplates(text: string): string {
  if (!text) return text;

  let masked = text;

  // Replace API key parameters
  masked = masked.replace(
    /--api-key[=\s]+([^\s]+)/gi,
    '--api-key={{API_KEY}}'
  );

  // Replace key parameters (like Upstash keys)
  masked = masked.replace(
    /--key[=\s]+([^\s]+)/gi,
    '--key={{API_KEY}}'
  );

  // Replace token parameters
  masked = masked.replace(
    /--token[=\s]+([^\s]+)/gi,
    '--token={{TOKEN}}'
  );

  // Replace OAuth tokens
  masked = masked.replace(
    /--oauth-token[=\s]+([^\s]+)/gi,
    '--oauth-token={{OAUTH_TOKEN}}'
  );

  // Replace password parameters
  masked = masked.replace(
    /--password[=\s]+([^\s]+)/gi,
    '--password={{PASSWORD}}'
  );

  // Replace secret parameters
  masked = masked.replace(
    /--secret[=\s]+([^\s]+)/gi,
    '--secret={{SECRET}}'
  );

  // Replace auth parameters
  masked = masked.replace(
    /--auth[=\s]+([^\s]+)/gi,
    '--auth={{AUTH}}'
  );

  // Replace environment variable references that look like they contain secrets
  masked = masked.replace(
    /\$\{?([A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|API|AUTH)[A-Z_]*)\}?/g,
    '{{$1}}'
  );

  return masked;
}

/**
 * Checks if a string contains sensitive data patterns
 */
export function containsSensitiveData(text: string): boolean {
  if (!text) return false;

  const sensitivePatterns = [
    /sk_test_[a-zA-Z0-9]{99}/,
    /sk_live_[a-zA-Z0-9]{99}/,
    /--api-key[=\s]+[a-zA-Z0-9_-]{16,}/i,
    /--token[=\s]+[a-zA-Z0-9_-]{16,}/i,
    /--password[=\s]+[^\s]+/i,
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
  ];

  return sensitivePatterns.some(pattern => pattern.test(text));
}