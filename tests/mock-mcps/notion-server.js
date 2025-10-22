#!/usr/bin/env node

/**
 * Mock Notion MCP Server
 * Real MCP server structure for Notion workspace integration testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'notion-test',
  version: '1.0.0',
  description: 'Notion workspace management for documents, databases, and collaborative content creation'
};

const tools = [
  {
    name: 'create_page',
    description: 'Create new Notion pages and documents with content. Write notes, create documentation, start new projects.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: {
          type: 'string',
          description: 'Parent page or database ID'
        },
        title: {
          type: 'string',
          description: 'Page title'
        },
        content: {
          type: 'array',
          description: 'Page content blocks'
        },
        properties: {
          type: 'object',
          description: 'Page properties if parent is database'
        }
      },
      required: ['parent', 'title']
    }
  },
  {
    name: 'create_database',
    description: 'Create structured Notion databases with properties and schema. Set up project tracking, create data tables.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: {
          type: 'string',
          description: 'Parent page ID'
        },
        title: {
          type: 'string',
          description: 'Database title'
        },
        properties: {
          type: 'object',
          description: 'Database schema properties'
        },
        description: {
          type: 'string',
          description: 'Database description'
        }
      },
      required: ['parent', 'title', 'properties']
    }
  },
  {
    name: 'query_database',
    description: 'Query Notion databases with filtering and sorting. Search data, find records, analyze information.',
    inputSchema: {
      type: 'object',
      properties: {
        database_id: {
          type: 'string',
          description: 'Database ID to query'
        },
        filter: {
          type: 'object',
          description: 'Query filter conditions'
        },
        sorts: {
          type: 'array',
          description: 'Sort criteria'
        },
        start_cursor: {
          type: 'string',
          description: 'Pagination cursor'
        }
      },
      required: ['database_id']
    }
  },
  {
    name: 'update_page',
    description: 'Update existing Notion pages with new content and properties. Edit documents, modify data, update information.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'Page ID to update'
        },
        properties: {
          type: 'object',
          description: 'Properties to update'
        },
        content: {
          type: 'array',
          description: 'New content blocks to append'
        }
      },
      required: ['page_id']
    }
  },
  {
    name: 'search_pages',
    description: 'Search across Notion workspace for pages and content. Find documents, locate information, discover content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text'
        },
        filter: {
          type: 'object',
          description: 'Search filter criteria'
        },
        sort: {
          type: 'object',
          description: 'Sort results by criteria'
        }
      }
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);