#!/usr/bin/env node

/**
 * Mock Shell MCP Server
 * Real MCP server structure for shell command execution testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'shell-test',
  version: '1.0.0',
  description: 'Execute shell commands and system operations including scripts, processes, and system management'
};

const tools = [
  {
    name: 'execute_command',
    description: 'Execute shell commands and system operations. Run scripts, manage processes, perform system tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute'
        },
        working_directory: {
          type: 'string',
          description: 'Working directory for command execution'
        },
        timeout: {
          type: 'number',
          description: 'Command timeout in seconds'
        },
        environment: {
          type: 'object',
          description: 'Environment variables for command'
        },
        capture_output: {
          type: 'boolean',
          description: 'Capture command output'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'run_script',
    description: 'Execute shell scripts and batch operations with parameters. Run automation scripts, execute batch jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        script_path: {
          type: 'string',
          description: 'Path to script file'
        },
        arguments: {
          type: 'array',
          description: 'Script arguments',
          items: { type: 'string' }
        },
        interpreter: {
          type: 'string',
          description: 'Script interpreter (bash, python, node, etc.)'
        },
        working_directory: {
          type: 'string',
          description: 'Working directory for script'
        }
      },
      required: ['script_path']
    }
  },
  {
    name: 'manage_process',
    description: 'Manage system processes including start, stop, and monitoring. Control services, manage applications.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Process action (start, stop, restart, status, list)'
        },
        process_name: {
          type: 'string',
          description: 'Process or service name'
        },
        pid: {
          type: 'number',
          description: 'Process ID for specific process operations'
        },
        signal: {
          type: 'string',
          description: 'Signal to send to process (TERM, KILL, etc.)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'check_system_info',
    description: 'Get system information including resources, processes, and status. Monitor system health, check resources.',
    inputSchema: {
      type: 'object',
      properties: {
        info_type: {
          type: 'string',
          description: 'Type of system info (cpu, memory, disk, network, processes)'
        },
        detailed: {
          type: 'boolean',
          description: 'Include detailed information'
        }
      },
      required: ['info_type']
    }
  },
  {
    name: 'manage_environment',
    description: 'Manage environment variables and system configuration. Set variables, configure system settings.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Environment action (get, set, unset, list)'
        },
        variable: {
          type: 'string',
          description: 'Environment variable name'
        },
        value: {
          type: 'string',
          description: 'Variable value for set action'
        },
        scope: {
          type: 'string',
          description: 'Variable scope (session, user, system)'
        }
      },
      required: ['action']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);