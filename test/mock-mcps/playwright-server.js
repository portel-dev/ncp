#!/usr/bin/env node

/**
 * Mock Playwright MCP Server
 * Real MCP server structure for browser automation testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'playwright-test',
  version: '1.0.0',
  description: 'Browser automation and web scraping with cross-browser support'
};

const tools = [
  {
    name: 'navigate_to_page',
    description: 'Navigate to web pages and URLs for automation tasks. Open websites, load web applications.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to'
        },
        wait_until: {
          type: 'string',
          description: 'Wait condition (load, domcontentloaded, networkidle)'
        },
        timeout: {
          type: 'number',
          description: 'Navigation timeout in milliseconds'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'click_element',
    description: 'Click on web page elements using selectors. Click buttons, links, form elements.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or XPath for element'
        },
        button: {
          type: 'string',
          description: 'Mouse button to click (left, right, middle)'
        },
        click_count: {
          type: 'number',
          description: 'Number of clicks'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'fill_form_field',
    description: 'Fill form inputs and text fields on web pages. Enter text, complete forms, input data.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for input field'
        },
        value: {
          type: 'string',
          description: 'Text value to fill'
        },
        clear: {
          type: 'boolean',
          description: 'Clear field before filling'
        }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'take_screenshot',
    description: 'Capture screenshots of web pages for testing and documentation. Take page screenshots, save visual evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to save screenshot'
        },
        full_page: {
          type: 'boolean',
          description: 'Capture full page or just viewport'
        },
        quality: {
          type: 'number',
          description: 'JPEG quality (0-100)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'extract_text',
    description: 'Extract text content from web page elements. Scrape data, read page content, get element text.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element'
        },
        attribute: {
          type: 'string',
          description: 'Optional attribute to extract instead of text'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'wait_for_element',
    description: 'Wait for elements to appear or become available on web pages. Wait for dynamic content, ensure element visibility.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element to wait for'
        },
        state: {
          type: 'string',
          description: 'Element state to wait for (visible, hidden, attached)'
        },
        timeout: {
          type: 'number',
          description: 'Wait timeout in milliseconds'
        }
      },
      required: ['selector']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);