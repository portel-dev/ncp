#!/usr/bin/env node

/**
 * Mock GitHub MCP Server
 * Real MCP server structure for GitHub API integration testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'github-test',
  version: '1.0.0',
  description: 'GitHub API integration for repository management, file operations, issues, and pull requests'
};

const tools = [
  {
    name: 'create_repository',
    description: 'Create a new GitHub repository with configuration options. Set up new project, initialize repository.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Repository name'
        },
        description: {
          type: 'string',
          description: 'Repository description'
        },
        private: {
          type: 'boolean',
          description: 'Whether repository should be private'
        },
        auto_init: {
          type: 'boolean',
          description: 'Initialize with README'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'create_issue',
    description: 'Create GitHub issues for bug reports and feature requests. Report bugs, request features, track tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Issue title'
        },
        body: {
          type: 'string',
          description: 'Issue description'
        },
        labels: {
          type: 'array',
          description: 'Issue labels',
          items: { type: 'string' }
        },
        assignees: {
          type: 'array',
          description: 'User assignments',
          items: { type: 'string' }
        }
      },
      required: ['title']
    }
  },
  {
    name: 'create_pull_request',
    description: 'Create pull requests for code review and merging changes. Submit code changes, request reviews.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Pull request title'
        },
        body: {
          type: 'string',
          description: 'Pull request description'
        },
        head: {
          type: 'string',
          description: 'Source branch'
        },
        base: {
          type: 'string',
          description: 'Target branch'
        }
      },
      required: ['title', 'head', 'base']
    }
  },
  {
    name: 'get_file_contents',
    description: 'Read file contents from GitHub repositories. Access source code, read configuration files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path in repository'
        },
        ref: {
          type: 'string',
          description: 'Branch or commit reference'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_repositories',
    description: 'Search GitHub repositories by keywords, topics, and filters. Find open source projects, discover libraries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query with keywords'
        },
        sort: {
          type: 'string',
          description: 'Sort criteria (stars, forks, updated)'
        },
        order: {
          type: 'string',
          description: 'Sort order (asc, desc)'
        }
      },
      required: ['query']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);