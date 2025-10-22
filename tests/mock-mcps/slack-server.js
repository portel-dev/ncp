#!/usr/bin/env node

/**
 * Mock Slack MCP Server
 * Real MCP server structure for Slack integration testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'slack-test',
  version: '1.0.0',
  description: 'Slack integration for messaging, channel management, file sharing, and team communication'
};

const tools = [
  {
    name: 'send_message',
    description: 'Send messages to Slack channels or direct messages. Share updates, notify teams, communicate with colleagues.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name or user ID to send message to'
        },
        text: {
          type: 'string',
          description: 'Message content to send'
        },
        thread_ts: {
          type: 'string',
          description: 'Optional thread timestamp for replies'
        }
      },
      required: ['channel', 'text']
    }
  },
  {
    name: 'create_channel',
    description: 'Create new Slack channels for team collaboration. Set up project channels, organize team discussions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Channel name'
        },
        purpose: {
          type: 'string',
          description: 'Channel purpose description'
        },
        private: {
          type: 'boolean',
          description: 'Whether channel should be private'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'upload_file',
    description: 'Upload files to Slack channels for sharing and collaboration. Share documents, images, code files.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path or content to upload'
        },
        channels: {
          type: 'string',
          description: 'Comma-separated list of channel names'
        },
        title: {
          type: 'string',
          description: 'File title'
        },
        initial_comment: {
          type: 'string',
          description: 'Initial comment when sharing file'
        }
      },
      required: ['file', 'channels']
    }
  },
  {
    name: 'get_channel_history',
    description: 'Retrieve message history from Slack channels. Read past conversations, search team discussions.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID to get history from'
        },
        count: {
          type: 'number',
          description: 'Number of messages to retrieve'
        },
        oldest: {
          type: 'string',
          description: 'Oldest timestamp for message range'
        },
        latest: {
          type: 'string',
          description: 'Latest timestamp for message range'
        }
      },
      required: ['channel']
    }
  },
  {
    name: 'set_channel_topic',
    description: 'Set or update channel topic and purpose. Update channel information, set discussion guidelines.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID'
        },
        topic: {
          type: 'string',
          description: 'New channel topic'
        }
      },
      required: ['channel', 'topic']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);