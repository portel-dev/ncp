#!/usr/bin/env node

/**
 * Mock Git MCP Server
 * Real MCP server structure for Git version control testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'git-test',
  version: '1.0.0',
  description: 'Git version control operations including commits, branches, merges, and repository management'
};

const tools = [
  {
    name: 'commit_changes',
    description: 'Create Git commits to save changes to version history. Save progress, commit code changes, record modifications.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Commit message describing changes'
        },
        files: {
          type: 'array',
          description: 'Specific files to commit (optional, defaults to all staged)',
          items: { type: 'string' }
        },
        author: {
          type: 'string',
          description: 'Commit author (name <email>)'
        },
        amend: {
          type: 'boolean',
          description: 'Amend the last commit'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'create_branch',
    description: 'Create new Git branches for feature development and parallel work. Start new features, create development branches.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Branch name'
        },
        from: {
          type: 'string',
          description: 'Source branch or commit to branch from'
        },
        checkout: {
          type: 'boolean',
          description: 'Switch to new branch after creation'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'merge_branch',
    description: 'Merge Git branches to combine changes from different development lines. Integrate features, combine work.',
    inputSchema: {
      type: 'object',
      properties: {
        branch: {
          type: 'string',
          description: 'Branch name to merge into current branch'
        },
        strategy: {
          type: 'string',
          description: 'Merge strategy (merge, squash, rebase)'
        },
        message: {
          type: 'string',
          description: 'Custom merge commit message'
        },
        no_ff: {
          type: 'boolean',
          description: 'Force creation of merge commit'
        }
      },
      required: ['branch']
    }
  },
  {
    name: 'push_changes',
    description: 'Push local Git commits to remote repositories. Share changes, sync with remote, deploy code.',
    inputSchema: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (usually origin)'
        },
        branch: {
          type: 'string',
          description: 'Branch name to push'
        },
        force: {
          type: 'boolean',
          description: 'Force push (overwrites remote history)'
        },
        tags: {
          type: 'boolean',
          description: 'Push tags along with commits'
        }
      }
    }
  },
  {
    name: 'pull_changes',
    description: 'Pull and merge changes from remote Git repositories. Get latest updates, sync with team changes.',
    inputSchema: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (usually origin)'
        },
        branch: {
          type: 'string',
          description: 'Branch name to pull'
        },
        rebase: {
          type: 'boolean',
          description: 'Rebase instead of merge'
        }
      }
    }
  },
  {
    name: 'show_status',
    description: 'Display Git repository status showing modified files and staging state. Check what changed, see staged files.',
    inputSchema: {
      type: 'object',
      properties: {
        porcelain: {
          type: 'boolean',
          description: 'Machine-readable output format'
        },
        untracked: {
          type: 'boolean',
          description: 'Show untracked files'
        }
      }
    }
  },
  {
    name: 'view_log',
    description: 'View Git commit history and log with filtering options. Review changes, see commit history, track progress.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of commits to show'
        },
        branch: {
          type: 'string',
          description: 'Specific branch to view'
        },
        author: {
          type: 'string',
          description: 'Filter by author name'
        },
        since: {
          type: 'string',
          description: 'Show commits since date'
        }
      }
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);