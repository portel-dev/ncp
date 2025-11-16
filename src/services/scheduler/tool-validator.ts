/**
 * Tool Validator - Pre-validate MCP tools before scheduling
 * Implements MCP-native validation protocol with fallback
 *
 * Protocol: Tries tools/validate first (deep validation), falls back to schema validation
 */

import { logger } from '../../utils/logger.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  validationMethod?: 'mcp-native' | 'schema-only' | 'test-execution';
  schema?: any;
  testExecutionResult?: {
    success: boolean;
    output?: any;
    error?: string;
    duration: number;
  };
}

export class ToolValidator {
  constructor(private orchestrator?: any) {} // NCPOrchestrator - using any to avoid circular dependency

  /**
   * Validate tool and parameters before scheduling
   *
   * Validation Strategy:
   * 1. Try MCP-native validation (tools/validate) - GOLD STANDARD
   * 2. Fall back to schema-only validation if not supported
   * 3. Optional: Test execution as final verification
   */
  async validateTool(
    tool: string,
    parameters: Record<string, any>,
    options?: {
      testRun?: boolean; // Actually execute the tool once as a test
      timeout?: number;
    }
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse tool format
      const [mcpName, toolName] = tool.includes(':') ? tool.split(':') : [null, tool];

      if (!mcpName || !toolName) {
        errors.push(`Invalid tool format: "${tool}". Expected format: "mcp_name:tool_name"`);
        return { valid: false, errors, warnings };
      }

      // Get or create orchestrator
      const orchestrator = this.orchestrator || await this.createTemporaryOrchestrator();
      const shouldCleanup = !this.orchestrator; // Only cleanup if we created it

      // Wait for orchestrator to finish indexing before validation
      if (orchestrator && 'waitForInitialization' in orchestrator) {
        await (orchestrator as any).waitForInitialization();
      }

      // STEP 1: Try MCP-native validation (tools/validate)
      logger.info(`[ToolValidator] Attempting MCP-native validation for ${tool}`);
      const nativeValidation = await this.tryMCPNativeValidation(
        orchestrator,
        mcpName,
        toolName,
        parameters
      );

      if (nativeValidation.supported && nativeValidation.result) {
        logger.info(`[ToolValidator] Using MCP-native validation for ${tool}`);

        if (!nativeValidation.result.valid) {
          errors.push(...nativeValidation.result.errors);
        }
        if (nativeValidation.result.warnings.length > 0) {
          warnings.push(...nativeValidation.result.warnings);
        }

        if (shouldCleanup) {
          await orchestrator.cleanup();
        }

        return {
          valid: nativeValidation.result.valid,
          errors,
          warnings,
          validationMethod: 'mcp-native'
        };
      }

      // STEP 2: Fall back to schema validation
      logger.info(`[ToolValidator] MCP doesn't support tools/validate, using schema validation`);
      warnings.push(`MCP "${mcpName}" doesn't support native validation - using basic schema validation only`);
      warnings.push(`For better validation, implement tools/validate in the MCP`);

      // Find the tool
      const toolInfo = await this.findTool(orchestrator, tool);

      if (!toolInfo) {
        if (shouldCleanup) {
          await orchestrator.cleanup();
        }
        errors.push(`Tool not found: ${tool}. Use 'ncp find' to discover available tools.`);
        return { valid: false, errors, warnings };
      }

      // Validate parameters against schema
      const schemaValidation = this.validateAgainstSchema(
        parameters,
        toolInfo.schema
      );

      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);

      // If schema validation failed, don't proceed to test run
      if (errors.length > 0) {
        if (shouldCleanup) {
          await orchestrator.cleanup();
        }
        return { valid: false, errors, warnings, schema: toolInfo.schema };
      }

      // Optional: Test execution
      let testExecutionResult;
      if (options?.testRun) {
        logger.info(`[ToolValidator] Running test execution for ${tool}`);
        testExecutionResult = await this.runTestExecution(
          orchestrator,
          tool,
          parameters,
          options.timeout || 30000 // 30 second default timeout for test
        );

        if (!testExecutionResult.success) {
          errors.push(`Test execution failed: ${testExecutionResult.error}`);
        } else {
          warnings.push('Test execution succeeded, but actual execution conditions may differ');
        }
      }

      if (shouldCleanup) {
        await orchestrator.cleanup();
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        validationMethod: options?.testRun ? 'test-execution' : 'schema-only',
        schema: toolInfo.schema,
        testExecutionResult
      };

    } catch (error) {
      logger.error(`[ToolValidator] Validation error: ${error instanceof Error ? error.message : String(error)}`);
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Create a temporary orchestrator (fallback when none provided)
   * WARNING: This is slow! Prefer dependency injection for production use.
   */
  private async createTemporaryOrchestrator(): Promise<any> {
    logger.warn('[ToolValidator] No orchestrator provided - creating temporary instance (this is slow!)');
    logger.warn('[ToolValidator] For better performance, inject an orchestrator via constructor');

    const { NCPOrchestrator } = await import('../../orchestrator/ncp-orchestrator.js');
    const orchestrator = new NCPOrchestrator('all', false);
    await orchestrator.initialize();
    return orchestrator;
  }

  /**
   * Try MCP-native validation (tools/validate method)
   *
   * This is the GOLD STANDARD for validation - allows MCPs to do deep validation
   * like checking if paths exist, testing database connections, verifying permissions, etc.
   *
   * Implementation follows capability-based approach:
   * 1. Check if MCP announces experimental.toolValidation capability
   * 2. If yes, call the validate tool
   * 3. If no, return not supported (skip validation attempt)
   */
  private async tryMCPNativeValidation(
    orchestrator: any,
    mcpName: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<{
    supported: boolean;
    result?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    };
  }> {
    try {
      // Check if the MCP is an internal MCP
      const internalMCPManager = (orchestrator as any).internalMCPManager;
      if (internalMCPManager && internalMCPManager.isInternalMCP(mcpName)) {

        // STEP 1: Check if MCP announces validation capability (MCP protocol pattern)
        const hasValidationCapability = internalMCPManager.hasCapability(
          mcpName,
          'experimental.toolValidation.supported'
        );

        if (!hasValidationCapability) {
          // MCP doesn't announce validation support - skip validation attempt
          logger.debug(`[ToolValidator] MCP ${mcpName} doesn't announce validation capability`);
          return { supported: false };
        }

        // STEP 2: MCP announces validation - call the validate tool
        logger.debug(`[ToolValidator] MCP ${mcpName} announces validation capability, using it`);
        try {
          const validateResult = await internalMCPManager.executeInternalTool(
            mcpName,
            'validate',
            { tool: toolName, arguments: parameters }
          );

          if (validateResult.success) {
            // Parse the validation response
            const content = validateResult.content;
            let validationData;

            if (typeof content === 'string') {
              try {
                validationData = JSON.parse(content);
              } catch {
                // If it's not JSON, assume it's an error message
                return { supported: false };
              }
            } else if (Array.isArray(content) && content[0]?.text) {
              try {
                validationData = JSON.parse(content[0].text);
              } catch {
                return { supported: false };
              }
            } else {
              validationData = content;
            }

            return {
              supported: true,
              result: {
                valid: validationData.valid || false,
                errors: validationData.errors || [],
                warnings: validationData.warnings || []
              }
            };
          }
        } catch (error) {
          // Tool execution failed - unexpected since capability was announced
          logger.warn(`[ToolValidator] MCP ${mcpName} announced validation but execution failed: ${error instanceof Error ? error.message : String(error)}`);
          return { supported: false };
        }
      }

      // For external MCPs, we would call the MCP's tools/validate method
      // This would require extending the orchestrator to support raw MCP protocol calls
      // For now, return not supported for external MCPs
      logger.debug(`[ToolValidator] External MCP validation not yet implemented for ${mcpName}`);
      return { supported: false };

    } catch (error) {
      logger.debug(`[ToolValidator] Native validation check failed: ${error instanceof Error ? error.message : String(error)}`);
      return { supported: false };
    }
  }

  /**
   * Find tool in orchestrator
   */
  private async findTool(
    orchestrator: any,
    tool: string
  ): Promise<{ schema: any } | null> {
    try {
      // Parse tool identifier (format: "mcpName:toolName")
      const [mcpName, toolName] = tool.includes(':') ? tool.split(':') : [null, tool];

      if (!mcpName || !toolName) {
        logger.error(`[ToolValidator] Invalid tool format: ${tool}`);
        return null;
      }

      // Use getToolSchema for exact lookup (not semantic search)
      const schema = orchestrator.getToolSchema(mcpName, toolName);

      if (!schema) {
        logger.debug(`[ToolValidator] Tool not found: ${tool}`);
        return null;
      }

      return { schema };
    } catch (error) {
      logger.error(`[ToolValidator] Error finding tool: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Validate parameters against JSON schema
   */
  private validateAgainstSchema(
    parameters: Record<string, any>,
    schema: any
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!schema) {
      warnings.push('No schema available for parameter validation');
      return { errors, warnings };
    }

    const schemaProps = schema.properties || {};
    const required = schema.required || [];

    // Check required parameters
    for (const requiredParam of required) {
      if (!(requiredParam in parameters)) {
        errors.push(`Missing required parameter: "${requiredParam}"`);
      }
    }

    // Check parameter types
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      const paramSchema = schemaProps[paramName];

      if (!paramSchema) {
        warnings.push(`Parameter "${paramName}" not in schema (may be ignored by tool)`);
        continue;
      }

      // Type validation
      const typeError = this.validateType(paramName, paramValue, paramSchema);
      if (typeError) {
        errors.push(typeError);
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate parameter type
   */
  private validateType(
    paramName: string,
    value: any,
    schema: any
  ): string | null {
    const expectedType = schema.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    // Type mapping
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'integer': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'array'
    };

    const mappedExpected = typeMap[expectedType];
    const mappedActual = typeMap[actualType];

    if (mappedExpected && mappedActual !== mappedExpected) {
      return `Parameter "${paramName}" type mismatch: expected ${expectedType}, got ${actualType}`;
    }

    // Additional validation for numbers
    if (expectedType === 'integer' && !Number.isInteger(value)) {
      return `Parameter "${paramName}" must be an integer, got ${value}`;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      return `Parameter "${paramName}" must be one of: ${schema.enum.join(', ')}`;
    }

    return null;
  }

  /**
   * Run test execution
   */
  private async runTestExecution(
    orchestrator: any,
    tool: string,
    parameters: Record<string, any>,
    timeout: number
  ): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        orchestrator.run(tool, parameters),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Test execution timeout')), timeout)
        )
      ]);

      const duration = Date.now() - startTime;

      if (result.success) {
        return {
          success: true,
          output: result.content,
          duration
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error',
          duration
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration
      };
    }
  }
}
