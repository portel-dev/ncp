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
import { listRuns, getRunInfo, type WorkflowRun } from '@portel/photon-core';
import { getNcpBaseDirectory } from '../utils/ncp-paths.js';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    },
    {
      name: 'list-runs',
      description: 'List recent code execution runs for potential save-as-photon conversion',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of runs to list (default: 10)'
          }
        }
      }
    },
    {
      name: 'get-run',
      description: 'Get details of a specific code execution run including full JSONL log',
      inputSchema: {
        type: 'object',
        properties: {
          runId: {
            type: 'string',
            description: 'The run ID from a previous code execution'
          }
        },
        required: ['runId']
      }
    },
    {
      name: 'save-as-photon',
      description: 'Convert a successful code execution into a reusable Photon (.photon.ts file)',
      inputSchema: {
        type: 'object',
        properties: {
          runId: {
            type: 'string',
            description: 'The run ID of the code execution to convert'
          },
          photonName: {
            type: 'string',
            description: 'Name for the new Photon (will be kebab-case, e.g., my-tool)'
          },
          description: {
            type: 'string',
            description: 'Description of what this Photon does'
          }
        },
        required: ['runId', 'photonName', 'description']
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
   * Execute code tool or manage execution runs
   */
  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    if (toolName === 'run') {
      return this.executeRun(parameters);
    } else if (toolName === 'list-runs') {
      return this.listRuns(parameters);
    } else if (toolName === 'get-run') {
      return this.getRun(parameters);
    } else if (toolName === 'save-as-photon') {
      return this.saveAsPhoton(parameters);
    } else {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
    }
  }

  /**
   * Execute code with MCP access
   */
  private async executeRun(parameters: any): Promise<InternalToolResult> {
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
      codePreview: typeof parameters?.code === 'string' ? parameters.code.substring(0, 100) : 'N/A'
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
          logs: result.logs,
          runId: result.runId
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

  /**
   * List recent code execution runs
   */
  private async listRuns(parameters: any): Promise<InternalToolResult> {
    try {
      const limit = parameters?.limit || 10;
      const runs = await listRuns();

      // Return only the most recent ones up to limit
      const recentRuns = runs.slice(0, limit);

      return {
        success: true,
        content: JSON.stringify({
          runs: recentRuns.map((run: WorkflowRun) => ({
            runId: run.runId,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            status: run.status
          }))
        }, null, 2)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get details of a specific code execution run
   */
  private async getRun(parameters: any): Promise<InternalToolResult> {
    try {
      const { runId } = parameters;
      if (!runId || typeof runId !== 'string') {
        return {
          success: false,
          error: 'runId parameter is required'
        };
      }

      const runInfo = await getRunInfo(runId);
      if (!runInfo) {
        return {
          success: false,
          error: `Run ${runId} not found`
        };
      }

      return {
        success: true,
        content: JSON.stringify({
          runId: runInfo.runId,
          tool: runInfo.tool,
          params: runInfo.params,
          startedAt: runInfo.startedAt,
          completedAt: runInfo.completedAt,
          status: runInfo.status
        }, null, 2)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert a code execution into a reusable Photon
   */
  private async saveAsPhoton(parameters: any): Promise<InternalToolResult> {
    try {
      const { runId, photonName, description } = parameters;

      if (!runId || typeof runId !== 'string') {
        return {
          success: false,
          error: 'runId parameter is required'
        };
      }
      if (!photonName || typeof photonName !== 'string') {
        return {
          success: false,
          error: 'photonName parameter is required'
        };
      }
      if (!description || typeof description !== 'string') {
        return {
          success: false,
          error: 'description parameter is required'
        };
      }

      // Get the code from the run info
      const runInfo = await getRunInfo(runId);
      if (!runInfo) {
        return {
          success: false,
          error: `Run ${runId} not found`
        };
      }

      const code = runInfo.params?.code;

      if (!code) {
        return {
          success: false,
          error: `Could not find code in run ${runId}`
        };
      }

      // Create photon scaffold
      const toPascalCase = (str: string) =>
        str
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');

      const photonScaffold = `/**
 * ${description}
 * Generated from code execution ${runId}
 * @runtime ^1.5.0
 */

import { Photon } from '@portel/photon-core';

export const manifest = {
  name: '${photonName}',
  version: '1.0.0',
  description: '${description}'
};

export default class ${toPascalCase(photonName)} extends Photon {
  /**
   * ${description}
   */
  async run(params: Record<string, any> = {}) {
${code
  .split('\n')
  .map((line: string) => '    ' + line)
  .join('\n')}
  }
}
`;

      // Write photon file
      const ncpDir = getNcpBaseDirectory();
      const photonsDir = path.join(ncpDir, 'photons');
      await fs.mkdir(photonsDir, { recursive: true });

      const photonPath = path.join(photonsDir, `${photonName}.photon.ts`);
      await fs.writeFile(photonPath, photonScaffold);

      return {
        success: true,
        content: JSON.stringify({
          success: true,
          photonPath,
          photonName,
          message: `Photon saved to ${photonPath}. Available as '${photonName}' after restart.`
        }, null, 2)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
