/**
 * Smart MCP Error Parser
 * Detects configuration needs from stderr error messages using generic patterns
 * NO hardcoded MCP-specific logic - purely pattern-based detection
 */

export interface ConfigurationNeed {
  type: 'api_key' | 'env_var' | 'command_arg' | 'package_missing' | 'unknown';
  variable: string;  // Name of the variable/parameter needed
  description: string;  // Human-readable explanation
  prompt: string;  // What to ask the user
  sensitive: boolean;  // Hide input (for passwords/API keys)
  extractedFrom: string;  // Original error message snippet
}

export class MCPErrorParser {
  /**
   * Parse stderr and exit code to detect configuration needs
   */
  parseError(mcpName: string, stderr: string, exitCode: number): ConfigurationNeed[] {
    const needs: ConfigurationNeed[] = [];

    // Pattern 1: Package not found (404 errors)
    if (this.detectPackageMissing(stderr)) {
      needs.push({
        type: 'package_missing',
        variable: '',
        description: `${mcpName} package not found on npm`,
        prompt: '',
        sensitive: false,
        extractedFrom: this.extractLine(stderr, /404|not found/i)
      });
      return needs; // Don't try other patterns if package is missing
    }

    // Pattern 2: API Keys (X_API_KEY, X_TOKEN)
    const apiKeyNeeds = this.detectAPIKeys(stderr, mcpName);
    needs.push(...apiKeyNeeds);

    // Pattern 3: Generic environment variables (VAR is required/missing/not set)
    const envVarNeeds = this.detectEnvVars(stderr, mcpName);
    needs.push(...envVarNeeds);

    // Pattern 4: Command-line arguments from Usage messages
    const argNeeds = this.detectCommandArgs(stderr, mcpName);
    needs.push(...argNeeds);

    // Pattern 5: Missing configuration files or paths
    const pathNeeds = this.detectPaths(stderr, mcpName);
    needs.push(...pathNeeds);

    return needs;
  }

  /**
   * Detect if npm package doesn't exist
   */
  private detectPackageMissing(stderr: string): boolean {
    const patterns = [
      /npm error 404/i,
      /404 not found/i,
      /ENOTFOUND.*registry\.npmjs\.org/i,
      /requested resource.*could not be found/i
    ];

    return patterns.some(pattern => pattern.test(stderr));
  }

  /**
   * Detect API key requirements (e.g., ELEVENLABS_API_KEY, GITHUB_TOKEN)
   */
  private detectAPIKeys(stderr: string, mcpName: string): ConfigurationNeed[] {
    const needs: ConfigurationNeed[] = [];

    // Pattern: VARNAME_API_KEY or VARNAME_TOKEN followed by "required", "missing", "not found", "not set"
    const apiKeyPattern = /([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|KEY))\s+(?:is\s+)?(?:required|missing|not found|not set|must be set)/gi;

    let match;
    while ((match = apiKeyPattern.exec(stderr)) !== null) {
      const variable = match[1];
      const line = this.extractLine(stderr, new RegExp(variable, 'i'));

      needs.push({
        type: 'api_key',
        variable,
        description: `${mcpName} requires an API key or token`,
        prompt: `Enter ${variable}:`,
        sensitive: true,
        extractedFrom: line
      });
    }

    return needs;
  }

  /**
   * Detect generic environment variable requirements
   */
  private detectEnvVars(stderr: string, mcpName: string): ConfigurationNeed[] {
    const needs: ConfigurationNeed[] = [];

    // Pattern: VARNAME (uppercase with underscores) followed by requirement indicators
    // Exclude API_KEY/TOKEN patterns (already handled)
    // Note: No 'i' flag - must be actual uppercase to avoid matching regular words
    const envVarPattern = /([A-Z][A-Z0-9_]{2,})\s+(?:is\s+)?(?:required|missing|not found|not set|must be (?:set|provided)|environment variable)/g;

    let match;
    while ((match = envVarPattern.exec(stderr)) !== null) {
      const variable = match[1];

      // Skip if it's an API key/token pattern (already handled by detectAPIKeys)
      if (/(?:API_KEY|TOKEN|KEY)$/i.test(variable)) {
        continue;
      }

      // Skip common false positives
      if (this.isCommonFalsePositive(variable)) {
        continue;
      }

      const line = this.extractLine(stderr, new RegExp(variable, 'i'));

      // Determine if sensitive based on keywords
      const isSensitive = /password|secret|credential|auth/i.test(line);

      needs.push({
        type: 'env_var',
        variable,
        description: `${mcpName} requires environment variable`,
        prompt: `Enter ${variable}:`,
        sensitive: isSensitive,
        extractedFrom: line
      });
    }

    return needs;
  }

  /**
   * Detect command-line argument requirements from Usage messages
   */
  private detectCommandArgs(stderr: string, mcpName: string): ConfigurationNeed[] {
    const needs: ConfigurationNeed[] = [];
    let hasPathArgument = false;

    // First, extract the Usage line
    const usageLine = this.extractLine(stderr, /Usage:/i);

    if (usageLine) {
      // Pattern to match all bracketed arguments: [arg] or <arg>
      const argPattern = /[\[<]([a-zA-Z][\w-]+)[\]>]/g;

      let match;
      while ((match = argPattern.exec(usageLine)) !== null) {
        const argument = match[1];

        // Determine type based on argument name
        const isPath = /dir|path|folder|file|location/i.test(argument);
        if (isPath) {
          hasPathArgument = true;
        }

        needs.push({
          type: 'command_arg',
          variable: argument,
          description: isPath
            ? `${mcpName} requires a ${argument}`
            : `${mcpName} requires command argument: ${argument}`,
          prompt: `Enter ${argument}:`,
          sensitive: false,
          extractedFrom: usageLine
        });
      }
    }

    // Also check for: "requires at least one" or "must provide"
    // But skip if we already detected a path argument from Usage pattern
    if (!hasPathArgument && /(?:requires? at least one|must provide).*?(?:directory|path|file)/i.test(stderr)) {
      const line = this.extractLine(stderr, /requires? at least one|must provide/i);

      needs.push({
        type: 'command_arg',
        variable: 'required-path',
        description: `${mcpName} requires a path or directory`,
        prompt: 'Enter path:',
        sensitive: false,
        extractedFrom: line
      });
    }

    return needs;
  }

  /**
   * Detect missing paths, files, or directories
   */
  private detectPaths(stderr: string, mcpName: string): ConfigurationNeed[] {
    const needs: ConfigurationNeed[] = [];

    // Pattern 1 (High Priority): Extract filenames from "Please place X in..." messages
    // This is the most specific and usually gives the exact filename needed
    const pleasePlacePattern = /please place\s+([a-zA-Z][\w.-]*\.(?:json|yaml|yml|txt|config|env|key|keys))/gi;

    let match;
    while ((match = pleasePlacePattern.exec(stderr)) !== null) {
      const filename = match[1];
      const line = this.extractLine(stderr, new RegExp(filename, 'i'));

      needs.push({
        type: 'command_arg',
        variable: filename,
        description: `${mcpName} requires ${filename}`,
        prompt: `Enter path to ${filename}:`,
        sensitive: false,
        extractedFrom: line
      });
    }

    // Pattern 2: Specific filename mentioned before "not found" (e.g., "config.json not found")
    const filenameNotFoundPattern = /([a-zA-Z][\w.-]*\.(?:json|yaml|yml|txt|config|env|key|keys))\s+(?:not found|missing|required|needed)/gi;

    while ((match = filenameNotFoundPattern.exec(stderr)) !== null) {
      const filename = match[1];
      const line = this.extractLine(stderr, new RegExp(filename, 'i'));

      // Check if we already added this file
      if (!needs.some(n => n.variable === filename)) {
        needs.push({
          type: 'command_arg',
          variable: filename,
          description: `${mcpName} requires ${filename}`,
          prompt: `Enter path to ${filename}:`,
          sensitive: false,
          extractedFrom: line
        });
      }
    }

    // Pattern 3 (Fallback): Generic "cannot find", "no such file" patterns
    const pathPattern = /(?:cannot find|no such file|does not exist|not found|missing).*?([a-zA-Z][\w/-]*(?:file|dir|directory|path|config|\.json|\.yaml|\.yml))/gi;

    while ((match = pathPattern.exec(stderr)) !== null) {
      const pathRef = match[1];
      const line = this.extractLine(stderr, new RegExp(pathRef, 'i'));

      // Check if we already added this file or a more specific version
      // Skip if this looks like a partial match (e.g., "keys.json" when "gcp-oauth.keys.json" already exists)
      const isDuplicate = needs.some(n =>
        n.variable === pathRef ||
        n.variable.endsWith(pathRef) ||
        pathRef.endsWith(n.variable)
      );

      if (!isDuplicate) {
        needs.push({
          type: 'command_arg',
          variable: pathRef,
          description: `${mcpName} cannot find ${pathRef}`,
          prompt: `Enter path to ${pathRef}:`,
          sensitive: false,
          extractedFrom: line
        });
      }
    }

    return needs;
  }

  /**
   * Extract the full line containing the pattern
   */
  private extractLine(text: string, pattern: RegExp): string {
    const lines = text.split('\n');
    const matchingLine = lines.find(line => pattern.test(line));
    return matchingLine?.trim() || text.substring(0, 100).trim();
  }

  /**
   * Common false positives to skip
   */
  private isCommonFalsePositive(variable: string): boolean {
    const falsePositives = [
      'ERROR', 'WARN', 'INFO', 'DEBUG',
      'HTTP', 'HTTPS', 'URL', 'PORT',
      'TRUE', 'FALSE', 'NULL',
      'GET', 'POST', 'PUT', 'DELETE',
      'JSON', 'XML', 'HTML', 'CSS'
    ];

    return falsePositives.includes(variable);
  }

  /**
   * Generate a summary of all configuration needs
   */
  generateSummary(needs: ConfigurationNeed[]): string {
    if (needs.length === 0) {
      return 'No configuration issues detected.';
    }

    const summary: string[] = [];

    const apiKeys = needs.filter(n => n.type === 'api_key');
    const envVars = needs.filter(n => n.type === 'env_var');
    const args = needs.filter(n => n.type === 'command_arg');
    const packageMissing = needs.filter(n => n.type === 'package_missing');

    if (packageMissing.length > 0) {
      summary.push('❌ Package not found on npm');
    }

    if (apiKeys.length > 0) {
      summary.push(`🔑 Needs ${apiKeys.length} API key(s): ${apiKeys.map(k => k.variable).join(', ')}`);
    }

    if (envVars.length > 0) {
      summary.push(`⚙️  Needs ${envVars.length} env var(s): ${envVars.map(v => v.variable).join(', ')}`);
    }

    if (args.length > 0) {
      summary.push(`📁 Needs ${args.length} argument(s): ${args.map(a => a.variable).join(', ')}`);
    }

    return summary.join('\n');
  }
}
