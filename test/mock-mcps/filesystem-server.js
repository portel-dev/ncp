#!/usr/bin/env node

/**
 * Mock Filesystem MCP Server
 * Real MCP server structure for file system operations testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'filesystem-test',
  version: '1.0.0',
  description: 'Local file system operations including reading, writing, directory management, and permissions'
};

const tools = [
  {
    name: 'read_file',
    description: 'Read contents of files from local filesystem. Load configuration files, read text documents, access data files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to read'
        },
        encoding: {
          type: 'string',
          description: 'Text encoding (utf8, ascii, etc.)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to files on local filesystem. Create configuration files, save data, generate reports.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write to'
        },
        content: {
          type: 'string',
          description: 'Content to write to file'
        },
        encoding: {
          type: 'string',
          description: 'Text encoding (utf8, ascii, etc.)'
        },
        create_dirs: {
          type: 'boolean',
          description: 'Create parent directories if they do not exist'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'create_directory',
    description: 'Create new directories and folder structures. Organize files, set up project structure, create folder hierarchies.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to create'
        },
        recursive: {
          type: 'boolean',
          description: 'Create parent directories if needed'
        },
        mode: {
          type: 'string',
          description: 'Directory permissions (octal notation)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and directories with filtering and sorting options. Browse folders, find files, explore directory structure.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list'
        },
        recursive: {
          type: 'boolean',
          description: 'Include subdirectories recursively'
        },
        include_hidden: {
          type: 'boolean',
          description: 'Include hidden files and directories'
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter files'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete files and directories from filesystem. Remove old files, clean up temporary data, delete folders.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory path to delete'
        },
        recursive: {
          type: 'boolean',
          description: 'Delete directories and contents recursively'
        },
        force: {
          type: 'boolean',
          description: 'Force deletion without confirmation'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'copy_file',
    description: 'Copy files and directories to new locations. Backup files, duplicate data, organize content.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source file or directory path'
        },
        destination: {
          type: 'string',
          description: 'Destination path for copy'
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it exists'
        },
        preserve_attributes: {
          type: 'boolean',
          description: 'Preserve file timestamps and permissions'
        }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'get_file_info',
    description: 'Get detailed information about files and directories. Check file size, modification time, permissions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory path'
        },
        follow_symlinks: {
          type: 'boolean',
          description: 'Follow symbolic links'
        }
      },
      required: ['path']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);