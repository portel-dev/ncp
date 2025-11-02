/**
 * Workflow MCP - Intelligent task orchestration for scheduling
 *
 * Provides workflow definitions that Claude can execute in the current session.
 * Designed to work with the Schedule MCP for automated task execution.
 *
 * Key Features:
 * - Predefined workflows (daily-standup, content-pipeline, data-sync)
 * - Custom workflow creation
 * - Workflow templates with step-by-step instructions
 * - Integration with Schedule MCP for automation
 *
 * Usage:
 * 1. Get workflow definition: ncp run workflow:get workflowName="daily-standup"
 * 2. List available workflows: ncp run workflow:list
 * 3. Create custom workflow: ncp run workflow:create ...
 * 4. Schedule workflow: ncp run schedule:add command="ncp run workflow:get ..." schedule="0 9 * * *"
 */

import { MicroMCP } from '../base-micro.js';

interface WorkflowStep {
  name: string;
  description: string;
  action: string; // What to do (e.g., "call_tool", "analyze", "summarize")
  tool?: string; // MCP tool to call (e.g., "github:list-issues")
  parameters?: Record<string, any>; // Parameters for the tool
  condition?: string; // Optional condition for execution (natural language)
  saveResultAs?: string; // Variable name to save result for later steps
}

interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
  requiredContext?: string[]; // Context variables needed (e.g., ["slackWebhook", "repo"])
  recommendedSchedule?: string; // Cron expression for scheduling
}

export class Workflow extends MicroMCP {
  /**
   * Get a predefined workflow definition
   * Returns the workflow plan for Claude to execute
   */
  async get(params: { workflowName: string; context?: Record<string, any> }) {
    const workflow = this.getWorkflowDefinition(params.workflowName);
    if (!workflow) {
      throw new Error(
        `Workflow "${params.workflowName}" not found.\n` +
          `Available workflows: daily-standup, content-pipeline, data-sync, metrics-monitor`
      );
    }

    // Validate required context
    if (workflow.requiredContext && workflow.requiredContext.length > 0) {
      const missingContext: string[] = [];
      for (const key of workflow.requiredContext) {
        if (!params.context || !(key in params.context)) {
          missingContext.push(key);
        }
      }
      if (missingContext.length > 0) {
        return {
          success: false,
          error: `Missing required context: ${missingContext.join(', ')}`,
          requiredContext: workflow.requiredContext,
          example: this.getWorkflowExample(params.workflowName)
        };
      }
    }

    return {
      success: true,
      workflow,
      context: params.context || {},
      instructions: this.generateExecutionInstructions(workflow, params.context),
      schedulingHint: workflow.recommendedSchedule
        ? `To schedule this workflow: ncp run schedule:add name="${params.workflowName}" command="ncp run workflow:get workflowName=${params.workflowName} context='${JSON.stringify(params.context)}'" schedule="${workflow.recommendedSchedule}"`
        : undefined
    };
  }

  /**
   * List all available workflows
   */
  async list() {
    const workflows = this.getAllWorkflowDefinitions();

    return {
      success: true,
      count: workflows.length,
      workflows: workflows.map(w => ({
        name: w.name,
        description: w.description,
        steps: w.steps.length,
        requiredContext: w.requiredContext || [],
        recommendedSchedule: w.recommendedSchedule
      })),
      note: 'Use "ncp run workflow:get workflowName=<name>" to get full workflow details'
    };
  }

  /**
   * Create a custom workflow definition
   */
  async create(params: {
    name: string;
    description: string;
    steps: WorkflowStep[];
    requiredContext?: string[];
  }) {
    // Validate workflow structure
    if (!params.name || !params.description || !params.steps || params.steps.length === 0) {
      throw new Error('Workflow must have name, description, and at least one step');
    }

    // Validate each step
    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i];
      if (!step.name || !step.description || !step.action) {
        throw new Error(`Step ${i + 1} is missing required fields (name, description, action)`);
      }
    }

    const workflow: WorkflowDefinition = {
      name: params.name,
      description: params.description,
      steps: params.steps,
      requiredContext: params.requiredContext
    };

    return {
      success: true,
      workflow,
      instructions: this.generateExecutionInstructions(workflow, {}),
      note: 'Custom workflow created. You can now execute it by following the instructions above.'
    };
  }

  /**
   * Generate a workflow template from natural language description
   * Returns a suggested workflow structure for Claude to review and customize
   */
  async generate(params: { description: string; availableTools?: string[] }) {
    // Return a template that Claude can customize
    return {
      success: true,
      template: {
        name: 'custom-workflow',
        description: params.description,
        steps: [
          {
            name: 'Step 1',
            description: 'Define the first step based on: ' + params.description,
            action: 'call_tool',
            tool: 'select_appropriate_tool',
            parameters: {},
            saveResultAs: 'step1_result'
          }
        ],
        requiredContext: []
      },
      instructions: [
        '1. Review the workflow template above',
        '2. Customize steps based on your needs',
        '3. Specify which tools to call (e.g., github:list-issues, slack:post)',
        '4. Define parameters and context variables',
        '5. Use workflow:create to save the customized workflow'
      ],
      availableTools: params.availableTools || [
        'Use "ncp find" to discover available tools',
        'Common tools: github:*, slack:*, database:*, ai:*'
      ]
    };
  }

  // Private helper methods

  private getAllWorkflowDefinitions(): WorkflowDefinition[] {
    return [
      {
        name: 'daily-standup',
        description: 'Daily standup: Check GitHub issues, summarize, post to Slack',
        requiredContext: ['slackWebhook', 'repo'],
        recommendedSchedule: '0 9 * * 1-5', // Weekdays at 9am
        steps: [
          {
            name: 'Fetch GitHub Issues',
            description: 'Get open issues from repository',
            action: 'call_tool',
            tool: 'github:list-issues',
            parameters: { repo: '{{context.repo}}', state: 'open' },
            saveResultAs: 'issues'
          },
          {
            name: 'Summarize Issues',
            description: 'Create a summary of issues for standup meeting',
            action: 'analyze',
            saveResultAs: 'summary'
          },
          {
            name: 'Post to Slack',
            description: 'Send summary to Slack channel',
            action: 'call_tool',
            tool: 'slack:post',
            parameters: {
              webhookUrl: '{{context.slackWebhook}}',
              text: '{{summary}}'
            }
          }
        ]
      },
      {
        name: 'content-pipeline',
        description: 'Fetch data, analyze with AI, generate report, email results',
        requiredContext: ['sourceUrl', 'recipient'],
        recommendedSchedule: '0 0 * * *', // Daily at midnight
        steps: [
          {
            name: 'Fetch Content',
            description: 'Scrape content from URL',
            action: 'call_tool',
            tool: 'scraper:extract',
            parameters: { url: '{{context.sourceUrl}}' },
            saveResultAs: 'content'
          },
          {
            name: 'Analyze Content',
            description: 'Analyze content and extract key insights',
            action: 'analyze',
            saveResultAs: 'insights'
          },
          {
            name: 'Generate Report',
            description: 'Create formatted report from insights',
            action: 'analyze',
            saveResultAs: 'report'
          },
          {
            name: 'Email Report',
            description: 'Send report via email',
            action: 'call_tool',
            tool: 'email:send',
            parameters: {
              to: '{{context.recipient}}',
              subject: 'Content Analysis Report',
              body: '{{report}}'
            }
          }
        ]
      },
      {
        name: 'data-sync',
        description: 'Sync data between database and cloud storage',
        requiredContext: ['dbPath', 's3Bucket', 'slackWebhook'],
        recommendedSchedule: '0 2 * * *', // Daily at 2am
        steps: [
          {
            name: 'Export Database',
            description: 'Backup database to JSON',
            action: 'call_tool',
            tool: 'database:backup',
            parameters: { dbPath: '{{context.dbPath}}' },
            saveResultAs: 'backup'
          },
          {
            name: 'Upload to S3',
            description: 'Upload backup to S3',
            action: 'call_tool',
            tool: 's3:upload',
            parameters: {
              bucket: '{{context.s3Bucket}}',
              key: 'backups/db-{{timestamp}}.json',
              content: '{{backup}}'
            },
            saveResultAs: 'uploadResult'
          },
          {
            name: 'Notify Success',
            description: 'Send success notification',
            action: 'call_tool',
            tool: 'slack:post',
            parameters: {
              webhookUrl: '{{context.slackWebhook}}',
              text: 'Database backup completed successfully'
            },
            condition: 'uploadResult.success === true'
          }
        ]
      },
      {
        name: 'metrics-monitor',
        description: 'Monitor metrics and alert on anomalies',
        requiredContext: ['dbPath', 'slackWebhook'],
        recommendedSchedule: '0 * * * *', // Every hour
        steps: [
          {
            name: 'Query Metrics',
            description: 'Get metrics from last hour',
            action: 'call_tool',
            tool: 'database:query',
            parameters: {
              dbPath: '{{context.dbPath}}',
              query: 'SELECT * FROM metrics WHERE timestamp > datetime("now", "-1 hour")'
            },
            saveResultAs: 'metrics'
          },
          {
            name: 'Analyze for Anomalies',
            description: 'Check if metrics are within normal range',
            action: 'analyze',
            saveResultAs: 'analysis'
          },
          {
            name: 'Alert if Unusual',
            description: 'Send alert if anomalies detected',
            action: 'call_tool',
            tool: 'slack:post',
            parameters: {
              webhookUrl: '{{context.slackWebhook}}',
              text: '⚠️ Anomaly detected: {{analysis}}'
            },
            condition: 'analysis.hasAnomalies === true'
          }
        ]
      }
    ];
  }

  private getWorkflowDefinition(name: string): WorkflowDefinition | null {
    const workflows = this.getAllWorkflowDefinitions();
    return workflows.find(w => w.name === name) || null;
  }

  private generateExecutionInstructions(
    workflow: WorkflowDefinition,
    context?: Record<string, any>
  ): string[] {
    const instructions: string[] = [
      `Workflow: ${workflow.name}`,
      `Description: ${workflow.description}`,
      '',
      'Steps to execute:'
    ];

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      let stepInstruction = `${i + 1}. ${step.name}: ${step.description}`;

      if (step.action === 'call_tool' && step.tool) {
        const params = this.resolveParameters(step.parameters || {}, context || {});
        stepInstruction += `\n   Tool: ${step.tool}`;
        stepInstruction += `\n   Parameters: ${JSON.stringify(params, null, 2)}`;
      } else if (step.action === 'analyze') {
        stepInstruction += `\n   Action: Analyze data and provide insights`;
      }

      if (step.condition) {
        stepInstruction += `\n   Condition: ${step.condition}`;
      }

      if (step.saveResultAs) {
        stepInstruction += `\n   Save result as: ${step.saveResultAs}`;
      }

      instructions.push(stepInstruction);
    }

    instructions.push('');
    instructions.push('Note: Execute each step in order, saving results for subsequent steps.');

    return instructions;
  }

  private resolveParameters(
    params: Record<string, any>,
    context: Record<string, any>
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // Template variable
        const varPath = value.slice(2, -2).trim(); // Remove {{ }}
        const parts = varPath.split('.');

        if (parts[0] === 'context' && parts.length > 1) {
          // Context variable: {{context.slackWebhook}}
          resolved[key] = context[parts[1]] || value;
        } else {
          // Result variable: {{summary}} or {{step1_result}}
          resolved[key] = `[Use result from: ${varPath}]`;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private getWorkflowExample(workflowName: string): string {
    const examples: Record<string, string> = {
      'daily-standup': `ncp run workflow:get workflowName="daily-standup" context='{"slackWebhook":"https://hooks.slack.com/services/YOUR/WEBHOOK","repo":"owner/repository"}'`,
      'content-pipeline': `ncp run workflow:get workflowName="content-pipeline" context='{"sourceUrl":"https://example.com","recipient":"user@example.com"}'`,
      'data-sync': `ncp run workflow:get workflowName="data-sync" context='{"dbPath":"./data.db","s3Bucket":"my-bucket","slackWebhook":"https://hooks.slack.com/services/YOUR/WEBHOOK"}'`,
      'metrics-monitor': `ncp run workflow:get workflowName="metrics-monitor" context='{"dbPath":"./metrics.db","slackWebhook":"https://hooks.slack.com/services/YOUR/WEBHOOK"}'`
    };

    return examples[workflowName] || `ncp run workflow:get workflowName="${workflowName}" context='{...}'`;
  }
}
