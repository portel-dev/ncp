#!/usr/bin/env node

/**
 * Mock Docker MCP Server
 * Real MCP server structure for Docker container management testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'docker-test',
  version: '1.0.0',
  description: 'Container management including Docker operations, image building, and deployment'
};

const tools = [
  {
    name: 'run_container',
    description: 'Run Docker containers from images with configuration options. Deploy applications, start services.',
    inputSchema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'Docker image name and tag'
        },
        name: {
          type: 'string',
          description: 'Container name'
        },
        ports: {
          type: 'array',
          description: 'Port mappings (host:container)',
          items: { type: 'string' }
        },
        volumes: {
          type: 'array',
          description: 'Volume mappings',
          items: { type: 'string' }
        },
        environment: {
          type: 'object',
          description: 'Environment variables'
        },
        detached: {
          type: 'boolean',
          description: 'Run container in background'
        }
      },
      required: ['image']
    }
  },
  {
    name: 'build_image',
    description: 'Build Docker images from Dockerfile with build context. Create custom images, package applications.',
    inputSchema: {
      type: 'object',
      properties: {
        dockerfile_path: {
          type: 'string',
          description: 'Path to Dockerfile'
        },
        context_path: {
          type: 'string',
          description: 'Build context directory'
        },
        tag: {
          type: 'string',
          description: 'Image tag name'
        },
        build_args: {
          type: 'object',
          description: 'Build arguments'
        },
        no_cache: {
          type: 'boolean',
          description: 'Build without cache'
        }
      },
      required: ['dockerfile_path', 'tag']
    }
  },
  {
    name: 'manage_container',
    description: 'Manage Docker container lifecycle including start, stop, restart operations. Control running containers.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Container action (start, stop, restart, remove, pause, unpause)'
        },
        container: {
          type: 'string',
          description: 'Container name or ID'
        },
        force: {
          type: 'boolean',
          description: 'Force action if needed'
        }
      },
      required: ['action', 'container']
    }
  },
  {
    name: 'list_containers',
    description: 'List Docker containers with filtering and status information. View running containers, check container status.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Include stopped containers'
        },
        filter: {
          type: 'object',
          description: 'Filter criteria'
        },
        format: {
          type: 'string',
          description: 'Output format'
        }
      }
    }
  },
  {
    name: 'execute_in_container',
    description: 'Execute commands inside running Docker containers. Debug containers, run maintenance tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          description: 'Container name or ID'
        },
        command: {
          type: 'string',
          description: 'Command to execute'
        },
        interactive: {
          type: 'boolean',
          description: 'Interactive mode'
        },
        tty: {
          type: 'boolean',
          description: 'Allocate pseudo-TTY'
        },
        user: {
          type: 'string',
          description: 'User to run command as'
        }
      },
      required: ['container', 'command']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);