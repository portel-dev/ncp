/**
 * Focused Ecosystem Discovery Tests
 * Tests core discovery functionality across realistic MCP ecosystem
 */

import { DiscoveryEngine } from '../src/discovery/engine.js';

describe('Focused Ecosystem Discovery', () => {
  let engine: DiscoveryEngine;

  beforeAll(async () => {
    engine = new DiscoveryEngine();
    await engine.initialize();

    // Create focused test ecosystem representing our mock MCPs
    const ecosystemTools = [
      // Database - PostgreSQL
      {
        name: 'postgres:query',
        description: 'Execute SQL queries to retrieve data from PostgreSQL database tables. Find records, search data, analyze information.',
        mcpName: 'postgres-test'
      },
      {
        name: 'postgres:insert',
        description: 'Insert new records into PostgreSQL database tables. Store customer data, add new information, create records.',
        mcpName: 'postgres-test'
      },

      // Financial - Stripe
      {
        name: 'stripe:create_payment',
        description: 'Process credit card payments and charges from customers. Charge customer for order, process payment from customer.',
        mcpName: 'stripe-test'
      },
      {
        name: 'stripe:refund_payment',
        description: 'Process refunds for previously charged payments. Refund cancelled subscription, return customer money.',
        mcpName: 'stripe-test'
      },

      // Developer Tools - GitHub
      {
        name: 'github:create_repository',
        description: 'Create a new GitHub repository with configuration options. Set up new project, initialize repository.',
        mcpName: 'github-test'
      },
      {
        name: 'github:create_issue',
        description: 'Create GitHub issues for bug reports and feature requests. Report bugs, request features, track tasks.',
        mcpName: 'github-test'
      },

      // Git Version Control
      {
        name: 'git:commit_changes',
        description: 'Create Git commits to save changes to version history. Save progress, commit code changes, record modifications.',
        mcpName: 'git-test'
      },
      {
        name: 'git:create_branch',
        description: 'Create new Git branches for feature development and parallel work. Start new features, create development branches.',
        mcpName: 'git-test'
      },

      // Filesystem Operations
      {
        name: 'filesystem:read_file',
        description: 'Read contents of files from local filesystem. Load configuration files, read text documents, access data files.',
        mcpName: 'filesystem-test'
      },
      {
        name: 'filesystem:write_file',
        description: 'Write content to files on local filesystem. Create configuration files, save data, generate reports.',
        mcpName: 'filesystem-test'
      },

      // Communication - Slack
      {
        name: 'slack:send_message',
        description: 'Send messages to Slack channels or direct messages. Share updates, notify teams, communicate with colleagues.',
        mcpName: 'slack-test'
      },

      // Web Automation - Playwright
      {
        name: 'playwright:click_element',
        description: 'Click on web page elements using selectors. Click buttons, links, form elements.',
        mcpName: 'playwright-test'
      },
      {
        name: 'playwright:take_screenshot',
        description: 'Capture screenshots of web pages for testing and documentation. Take page screenshots, save visual evidence.',
        mcpName: 'playwright-test'
      },

      // Cloud Infrastructure - AWS
      {
        name: 'aws:create_ec2_instance',
        description: 'Launch new EC2 virtual machine instances with configuration. Create servers, deploy applications to cloud.',
        mcpName: 'aws-test'
      },
      {
        name: 'aws:upload_to_s3',
        description: 'Upload files and objects to S3 storage buckets. Store files in cloud, backup data, host static content.',
        mcpName: 'aws-test'
      },

      // System Operations - Docker
      {
        name: 'docker:run_container',
        description: 'Run Docker containers from images with configuration options. Deploy applications, start services.',
        mcpName: 'docker-test'
      },

      // Shell Commands
      {
        name: 'shell:execute_command',
        description: 'Execute shell commands and system operations. Run scripts, manage processes, perform system tasks.',
        mcpName: 'shell-test'
      },

      // Graph Database - Neo4j
      {
        name: 'neo4j:execute_cypher',
        description: 'Execute Cypher queries on Neo4j graph database. Query relationships, find patterns, analyze connections.',
        mcpName: 'neo4j-test'
      },

      // Search - Brave
      {
        name: 'brave:web_search',
        description: 'Search the web using Brave Search API with privacy protection. Find information, research topics, get current data.',
        mcpName: 'brave-search-test'
      },

      // Content Management - Notion
      {
        name: 'notion:create_page',
        description: 'Create new Notion pages and documents with content. Write notes, create documentation, start new projects.',
        mcpName: 'notion-test'
      }
    ];

    // Group tools by MCP and index separately - following existing pattern
    const toolsByMCP = new Map();
    for (const tool of ecosystemTools) {
      const mcpName = tool.mcpName;
      if (!toolsByMCP.has(mcpName)) {
        toolsByMCP.set(mcpName, []);
      }

      // Extract actual tool name from full name (remove mcp prefix)
      const parts = tool.name.split(':');
      const actualName = parts.length > 1 ? parts[1] : parts[0];

      toolsByMCP.get(mcpName).push({
        name: actualName,
        description: tool.description
      });
    }

    // Index each MCP's tools using proper method that creates IDs
    for (const [mcpName, tools] of toolsByMCP) {
      await engine.indexMCPTools(mcpName, tools);
    }
  });

  describe('Core Domain Discovery', () => {
    it('should find PostgreSQL tools for database queries', async () => {
      const results = await engine.findRelevantTools(
        'I need to query customer data from a PostgreSQL database',
        8
      );

      expect(results.length).toBeGreaterThan(0);

      // Look for postgres tools with correct naming pattern
      const queryTool = results.find((t: any) => t.name.includes('postgres') && t.name.includes('query'));
      expect(queryTool).toBeDefined();
      expect(results.indexOf(queryTool!)).toBeLessThan(6); // More realistic expectation
    });

    it('should find Stripe tools for payment processing', async () => {
      const results = await engine.findRelevantTools(
        'I need to process a credit card payment for customer order',
        8
      );

      expect(results.length).toBeGreaterThan(0);

      const paymentTool = results.find((t: any) => t.name.includes('stripe') && t.name.includes('payment'));
      expect(paymentTool).toBeDefined();
      expect(results.indexOf(paymentTool!)).toBeLessThan(6);
    });

    it('should find Git tools for version control', async () => {
      const results = await engine.findRelevantTools(
        'I need to commit my code changes with a message',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const commitTool = results.find((t: any) => t.name === 'git-test:commit_changes');
      expect(commitTool).toBeDefined();
      expect(results.indexOf(commitTool!)).toBeLessThan(4);
    });

    it('should find filesystem tools for file operations', async () => {
      const results = await engine.findRelevantTools(
        'I need to save configuration data to a JSON file',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const writeFileTool = results.find((t: any) => t.name === 'filesystem-test:write_file');
      expect(writeFileTool).toBeDefined();
      expect(results.indexOf(writeFileTool!)).toBeLessThan(4);
    });

    it('should find Playwright tools for web automation', async () => {
      const results = await engine.findRelevantTools(
        'I want to take a screenshot of the webpage for testing',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const screenshotTool = results.find((t: any) => t.name === 'playwright-test:take_screenshot');
      expect(screenshotTool).toBeDefined();
      expect(results.indexOf(screenshotTool!)).toBeLessThan(4);
    });

    it('should find AWS tools for cloud deployment', async () => {
      const results = await engine.findRelevantTools(
        'I need to deploy a web server on AWS cloud infrastructure',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const ec2Tool = results.find((t: any) => t.name === 'aws-test:create_ec2_instance');
      expect(ec2Tool).toBeDefined();
      expect(results.indexOf(ec2Tool!)).toBeLessThan(5);
    });

    it('should find Docker tools for containerization', async () => {
      const results = await engine.findRelevantTools(
        'I need to run my application in a Docker container',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const runTool = results.find((t: any) => t.name === 'docker-test:run_container');
      expect(runTool).toBeDefined();
      expect(results.indexOf(runTool!)).toBeLessThan(4);
    });

    it('should find Slack tools for team communication', async () => {
      const results = await engine.findRelevantTools(
        'I want to send a notification message to my team channel',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const messageTool = results.find((t: any) => t.name === 'slack-test:send_message');
      expect(messageTool).toBeDefined();
      expect(results.indexOf(messageTool!)).toBeLessThan(4);
    });
  });

  describe('Cross-Domain Discovery', () => {
    it('should handle ambiguous queries with diverse relevant tools', async () => {
      const results = await engine.findRelevantTools(
        'I need to analyze data and generate a report',
        10
      );

      expect(results.length).toBeGreaterThan(3);

      // Should include database tools for data analysis
      const hasDbTools = results.some((t: any) => t.name.includes('postgres') || t.name.includes('neo4j'));
      expect(hasDbTools).toBeTruthy();

      // Should include file tools for report generation
      const hasFileTools = results.some((t: any) => t.name.includes('filesystem') || t.name.includes('notion'));
      expect(hasFileTools).toBeTruthy();
    });

    it('should maintain relevance across domain boundaries', async () => {
      const results = await engine.findRelevantTools(
        'Set up monitoring for my payment processing system',
        8
      );

      expect(results.length).toBeGreaterThan(0);

      // Payment-related tools should be present
      const hasPaymentTools = results.some((t: any) => t.name.includes('stripe'));
      expect(hasPaymentTools).toBeTruthy();

      // System monitoring tools should also be present
      const hasSystemTools = results.some((t: any) => t.name.includes('shell') || t.name.includes('docker'));
      expect(hasSystemTools).toBeTruthy();
    });
  });

  describe('Performance Validation', () => {
    it('should handle discovery across ecosystem within reasonable time', async () => {
      const start = Date.now();

      const results = await engine.findRelevantTools(
        'I need to process user authentication and store session data',
        8
      );

      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    it('should provide consistent results for similar queries', async () => {
      const results1 = await engine.findRelevantTools('Deploy web application to production', 5);
      const results2 = await engine.findRelevantTools('Deploy my web app to prod environment', 5);

      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);

      // Should have some overlap in top results
      const topNames1 = results1.slice(0, 3).map((t: any) => t.name);
      const topNames2 = results2.slice(0, 3).map((t: any) => t.name);

      const overlap = topNames1.filter(name => topNames2.includes(name));
      expect(overlap.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Ecosystem Coverage', () => {
    it('should have indexed all test ecosystem tools', async () => {
      // Verify we can find tools from all major domains
      const domains = [
        { query: 'database query', expectedTool: 'postgres-test:query' },
        { query: 'payment processing', expectedTool: 'stripe-test:create_payment' },
        { query: 'git commit', expectedTool: 'git-test:commit_changes' },
        { query: 'read file', expectedTool: 'filesystem-test:read_file' },
        { query: 'web automation click', expectedTool: 'playwright-test:click_element' },
        { query: 'cloud server deployment', expectedTool: 'aws-test:create_ec2_instance' },
        { query: 'docker container', expectedTool: 'docker-test:run_container' },
        { query: 'team messaging', expectedTool: 'slack-test:send_message' }
      ];

      for (const domain of domains) {
        const results = await engine.findRelevantTools(domain.query, 8);
        const found = results.find((t: any) => t.name === domain.expectedTool);
        expect(found).toBeDefined(); // Should find ${domain.expectedTool} for query: ${domain.query}
      }
    });

    it('should demonstrate ecosystem scale benefits', async () => {
      // Test that having more tools improves specificity
      const specificQuery = 'I need to refund a cancelled subscription payment';
      const results = await engine.findRelevantTools(specificQuery, 6);

      expect(results.length).toBeGreaterThan(0);

      // Should prioritize specific refund tool over general payment tool
      const refundTool = results.find((t: any) => t.name === 'stripe-test:refund_payment');
      const createTool = results.find((t: any) => t.name === 'stripe-test:create_payment');

      expect(refundTool).toBeDefined();
      if (createTool) {
        expect(results.indexOf(refundTool!)).toBeLessThan(results.indexOf(createTool));
      }
    });
  });
});