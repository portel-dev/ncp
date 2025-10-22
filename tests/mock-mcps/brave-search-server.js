#!/usr/bin/env node

/**
 * Mock Brave Search MCP Server
 * Real MCP server structure for Brave Search API testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'brave-search-test',
  version: '1.0.0',
  description: 'Web search capabilities with privacy-focused results and real-time information'
};

const tools = [
  {
    name: 'web_search',
    description: 'Search the web using Brave Search API with privacy protection. Find information, research topics, get current data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string'
        },
        count: {
          type: 'number',
          description: 'Number of results to return'
        },
        offset: {
          type: 'number',
          description: 'Result offset for pagination'
        },
        country: {
          type: 'string',
          description: 'Country code for localized results'
        },
        search_lang: {
          type: 'string',
          description: 'Search language code'
        },
        ui_lang: {
          type: 'string',
          description: 'UI language code'
        },
        freshness: {
          type: 'string',
          description: 'Result freshness (pd, pw, pm, py for past day/week/month/year)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'news_search',
    description: 'Search for news articles with current events and breaking news. Get latest news, find articles, track stories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'News search query'
        },
        count: {
          type: 'number',
          description: 'Number of news results'
        },
        offset: {
          type: 'number',
          description: 'Result offset'
        },
        freshness: {
          type: 'string',
          description: 'News freshness filter'
        },
        text_decorations: {
          type: 'boolean',
          description: 'Include text decorations in results'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'image_search',
    description: 'Search for images with filtering options. Find pictures, locate visual content, discover graphics.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Image search query'
        },
        count: {
          type: 'number',
          description: 'Number of image results'
        },
        offset: {
          type: 'number',
          description: 'Result offset'
        },
        size: {
          type: 'string',
          description: 'Image size filter (small, medium, large, wallpaper)'
        },
        color: {
          type: 'string',
          description: 'Color filter'
        },
        type: {
          type: 'string',
          description: 'Image type (photo, clipart, lineart, animated)'
        },
        layout: {
          type: 'string',
          description: 'Image layout (square, wide, tall)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'video_search',
    description: 'Search for videos across platforms with filtering capabilities. Find educational content, tutorials, entertainment.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Video search query'
        },
        count: {
          type: 'number',
          description: 'Number of video results'
        },
        offset: {
          type: 'number',
          description: 'Result offset'
        },
        duration: {
          type: 'string',
          description: 'Video duration filter (short, medium, long)'
        },
        resolution: {
          type: 'string',
          description: 'Video resolution filter'
        }
      },
      required: ['query']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);