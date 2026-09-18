/**
 * Utility for redacting sensitive information from logs and displays
 */

/**
 * Patterns that indicate a value should be redacted
 * Case-insensitive matching
 */
const SENSITIVE_PATTERNS = [
  'TOKEN',
  'KEY',
  'SECRET',
  'PASSWORD',
  'PASS',
  'PWD',
  'API_KEY',
  'APIKEY',
  'AUTH',
  'CREDENTIAL',
  'CRED',
  'PRIVATE',
  'CERTIFICATE',
  'CERT'
];

/**
 * Check if a key name indicates sensitive data
 */
export function isSensitiveKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SENSITIVE_PATTERNS.some(pattern => upperKey.includes(pattern));
}

/**
 * Redact a value if the key is sensitive
 * @param key - The environment variable or config key name
 * @param value - The value to potentially redact
 * @param redactedText - Text to show instead of the value (default: '********')
 * @returns Original value if not sensitive, redacted text if sensitive
 */
export function redactIfSensitive(key: string, value: string, redactedText: string = '********'): string {
  return isSensitiveKey(key) ? redactedText : value;
}

/**
 * Redact sensitive values in an object
 * @param obj - Object with key-value pairs (e.g., environment variables)
 * @param redactedText - Text to show instead of sensitive values
 * @returns New object with sensitive values redacted
 */
export function redactSensitiveValues(
  obj: Record<string, string>,
  redactedText: string = '********'
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactIfSensitive(key, value, redactedText);
  }
  return result;
}

/**
 * Recursively redact values whose object keys indicate credentials. This is
 * intended for model-visible confirmations, diagnostics, and tool results.
 */
export function redactSensitiveData(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) return '********';
  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => [entryKey, redactSensitiveData(entryValue, entryKey)])
    );
  }
  return value;
}
