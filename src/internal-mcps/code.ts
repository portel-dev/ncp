/**
 * Code Execution Internal MCP
 *
 * Exposes the code:run tool for executing TypeScript code
 * with access to all other MCPs as namespaces.
 *
 * This enables the automation powerhouse:
 * - Schedule CODE that orchestrates multiple MCPs
 * - Code can access any MCP in the system
 * - Supports complex workflows in single execution
 */

import { InternalMCP, InternalTool, InternalToolResult } from './types.js';
import { NCPOrchestrator } from '../orchestrator/ncp-orchestrator.js';

export class CodeMCP implements InternalMCP {
  name = 'code';
  description = 'Execute TypeScript code with access to all MCPs';

  private orchestrator: NCPOrchestrator | null = null;

  tools: InternalTool[] = [
    {
      name: 'run',
      description: `Execute TypeScript code with access to all MCPs as namespaces.

ORCHESTRATION POWERHOUSE - Schedule code that calls multiple MCPs!

EXAMPLES:
  // Single MCP call
  const result = await gmail.list_messages({ query: "is:unread" });

  // Orchestrate multiple MCPs
  const emails = await gmail.list_messages({ ... });
  const contacts = await gmail.get_contacts({});
  await slack.send_message({
    channel: "alerts",
    text: \`Found \${emails.length} emails from \${contacts.length} contacts\`
  });

  // Schedule code execution
  await schedule.create({
    name: "daily-automation",
    schedule: "0 6 * * *",
    tool: "code:run",
    parameters: {
      code: "... your code here ..."
    }
  });

All MCPs available as namespaces: gmail, github, slack, stripe, schedule, analytics, mcp, etc.`,
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'TypeScript code. Access MCPs as namespaces (e.g., await gmail.send_email({...})). Last expression or return value is result.'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in ms (default: 30000, max: 300000)'
          }
        },
        required: ['code']
      }
    }
  ];

  constructor() {
    // Orchestrator is set later via setOrchestrator()
  }

  /**
   * Set the orchestrator instance (called after construction)
   */
  setOrchestrator(orchestrator: NCPOrchestrator): void {
    this.orchestrator = orchestrator;
  }

  /**
   * Execute code with MCP access
   */
  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    if (toolName !== 'run') {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
    }

    if (!this.orchestrator) {
      return {
        success: false,
        error: 'Code execution not yet initialized'
      };
    }

    // Diagnostic logging to help debug parameter issues
    console.error('[code:run] Tool called with parameters:', {
      rawType: typeof parameters,
      isNull: parameters === null,
      isUndefined: parameters === undefined,
      keys: parameters ? Object.keys(parameters) : [],
      codeType: typeof parameters?.code,
      codeLength: parameters?.code?.length,
      codePreview: parameters?.code ? parameters.code.substring(0, 100) : 'N/A'
    });

    const { code, timeout } = parameters;

    if (!code || typeof code !== 'string') {
      console.error('[code:run] Validation failed:', {
        code,
        codeType: typeof code,
        allParams: JSON.stringify(parameters)
      });
      return {
        success: false,
        error: `code parameter is required and must be a string. Received: ${typeof code}`
      };
    }

    try {
      const result = await this.orchestrator.executeCode(code, timeout || 30000);

      if (result.error) {
        return {
          success: false,
          error: result.error,
          content: result.logs ? `Logs:\n${result.logs.join('\n')}` : undefined
        };
      }

      return {
        success: true,
        content: JSON.stringify({
          result: result.result,
          logs: result.logs
        }, null, 2)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        content: error.stack
      };
    }
  }
}
