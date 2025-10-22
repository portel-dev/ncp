#!/usr/bin/env node

/**
 * Mock PostgreSQL MCP Server
 * Real MCP server structure with actual tool definitions but mock implementations
 * This tests discovery without needing actual PostgreSQL connection
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'postgres-test',
  version: '1.0.0',
  description: 'PostgreSQL database operations including queries, schema management, and data manipulation'
};

const tools = [
  {
    name: 'query',
    description: 'Execute SQL queries to retrieve data from PostgreSQL database tables. Find records, search data, analyze information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query string to execute'
        },
        params: {
          type: 'array',
          description: 'Optional parameters for parameterized queries',
          items: {
            type: 'string'
          }
        }
      },
      required: ['query']
    }
  },
  {
    name: 'insert',
    description: 'Insert new records into PostgreSQL database tables. Store customer data, add new information, create records.',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Target table name'
        },
        data: {
          type: 'object',
          description: 'Record data to insert as key-value pairs'
        }
      },
      required: ['table', 'data']
    }
  },
  {
    name: 'update',
    description: 'Update existing records in PostgreSQL database tables. Modify customer information, change email addresses, edit data.',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Target table name'
        },
        data: {
          type: 'object',
          description: 'Updated record data as key-value pairs'
        },
        where: {
          type: 'string',
          description: 'WHERE clause conditions for targeting specific records'
        }
      },
      required: ['table', 'data', 'where']
    }
  },
  {
    name: 'delete',
    description: 'Delete records from PostgreSQL database tables. Remove old data, clean expired records, purge information.',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Target table name'
        },
        where: {
          type: 'string',
          description: 'WHERE clause conditions for targeting records to delete'
        }
      },
      required: ['table', 'where']
    }
  },
  {
    name: 'create_table',
    description: 'Create new tables in PostgreSQL database with schema definition. Set up user session storage, design tables for customer data.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Table name'
        },
        schema: {
          type: 'object',
          description: 'Table schema definition with columns and types'
        }
      },
      required: ['name', 'schema']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);