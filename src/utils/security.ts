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
    /sk_test_[a-zA-Z0-9]{99}/g,
    (match) => `sk_test_*****${match.slice(-4)}`
  );

  masked = masked.replace(
    /sk_live_[a-zA-Z0-9]{99}/g,
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
 */
export function formatCommandDisplay(command: string, args: string[] = []): string {
  const fullCommand = `${command} ${args.join(' ')}`.trim();
  return maskSensitiveData(fullCommand);
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