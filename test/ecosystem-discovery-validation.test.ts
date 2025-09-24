/**
 * Comprehensive Ecosystem Discovery Validation Tests
 *
 * Tests NCP's tool discovery capabilities against a realistic ecosystem of MCP servers
 * with real descriptions but mock implementations. This validates that user stories produce
 * the right tools in top results across diverse domains.
 *
 * Uses real MCP tool definitions from mock servers to test discovery accuracy
 * across major domains: database, financial, developer tools, web automation, etc.
 */

import { DiscoveryEngine } from '../src/discovery/engine.js';
import { ToolDefinition } from '../src/types.js';

describe('Ecosystem Discovery Validation', () => {
  let engine: DiscoveryEngine;

  beforeAll(async () => {
    engine = new DiscoveryEngine();
    await engine.initialize();

    // Create comprehensive test ecosystem with tools from our mock MCPs
    const ecosystemTools: ToolDefinition[] = [
      // PostgreSQL Database Tools
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
      {
        name: 'postgres:update',
        description: 'Update existing records in PostgreSQL database tables. Modify customer information, change email addresses, edit data.',
        mcpName: 'postgres-test'
      },

      // Stripe Payment Tools
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
      {
        name: 'stripe:create_subscription',
        description: 'Create recurring subscription billing for customers. Set up monthly billing, create subscription plans.',
        mcpName: 'stripe-test'
      },

      // GitHub Developer Tools
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
      {
        name: 'github:create_pull_request',
        description: 'Create pull requests for code review and merging changes. Submit code changes, request reviews.',
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
      {
        name: 'git:push_changes',
        description: 'Push local Git commits to remote repositories. Share changes, sync with remote, deploy code.',
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
      {
        name: 'filesystem:create_directory',
        description: 'Create new directories and folder structures. Organize files, set up project structure, create folder hierarchies.',
        mcpName: 'filesystem-test'
      },

      // Slack Communication
      {
        name: 'slack:send_message',
        description: 'Send messages to Slack channels or direct messages. Share updates, notify teams, communicate with colleagues.',
        mcpName: 'slack-test'
      },
      {
        name: 'slack:create_channel',
        description: 'Create new Slack channels for team collaboration. Set up project channels, organize team discussions.',
        mcpName: 'slack-test'
      },

      // Playwright Web Automation
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
      {
        name: 'playwright:fill_form_field',
        description: 'Fill form inputs and text fields on web pages. Enter text, complete forms, input data.',
        mcpName: 'playwright-test'
      },

      // AWS Cloud Infrastructure
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
      {
        name: 'aws:create_lambda_function',
        description: 'Deploy serverless Lambda functions for event-driven computing. Run code without servers, process events.',
        mcpName: 'aws-test'
      },

      // Docker Container Management
      {
        name: 'docker:run_container',
        description: 'Run Docker containers from images with configuration options. Deploy applications, start services.',
        mcpName: 'docker-test'
      },
      {
        name: 'docker:build_image',
        description: 'Build Docker images from Dockerfile with build context. Create custom images, package applications.',
        mcpName: 'docker-test'
      },

      // Shell System Operations
      {
        name: 'shell:execute_command',
        description: 'Execute shell commands and system operations. Run scripts, manage processes, perform system tasks.',
        mcpName: 'shell-test'
      },

      // Neo4j Graph Database
      {
        name: 'neo4j:execute_cypher',
        description: 'Execute Cypher queries on Neo4j graph database. Query relationships, find patterns, analyze connections.',
        mcpName: 'neo4j-test'
      },
      {
        name: 'neo4j:find_path',
        description: 'Find paths between nodes in Neo4j graph database. Discover connections, analyze relationships, trace routes.',
        mcpName: 'neo4j-test'
      },

      // Notion Content Management
      {
        name: 'notion:create_page',
        description: 'Create new Notion pages and documents with content. Write notes, create documentation, start new projects.',
        mcpName: 'notion-test'
      },
      {
        name: 'notion:create_database',
        description: 'Create structured Notion databases with properties and schema. Set up project tracking, create data tables.',
        mcpName: 'notion-test'
      },

      // Brave Search
      {
        name: 'brave:web_search',
        description: 'Search the web using Brave Search API with privacy protection. Find information, research topics, get current data.',
        mcpName: 'brave-search-test'
      }
    ];

    // Index all tools for testing
    engine['ragEngine']['tools'] = new Map(ecosystemTools.map(tool => [tool.name, tool]));
    await engine['ragEngine'].indexTools(ecosystemTools);
  });

  describe('Database Operations', () => {
    it('should find PostgreSQL query tools for database queries', async () => {
      const results = await engine.findTools(
        'I need to query customer data from a PostgreSQL database to find orders from last month',
        { limit: 8 }
      );

      expect(results.length).toBeGreaterThan(0);

      const postgresTools = results.filter((t: any) => t.name.includes('postgres'));
      expect(postgresTools.length).toBeGreaterThan(0);

      const queryTool = results.find((t: any) => t.name === 'postgres:query');
      expect(queryTool).toBeDefined();
      expect(results.indexOf(queryTool!)).toBeLessThan(5);
    });

    it('should find Neo4j tools for graph relationships', async () => {
      const results = await client.find({
        query: 'I want to find connections between users in a social network using graph database',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const neo4jTools = results.filter(t => t.id.includes('neo4j'));
      expect(neo4jTools.length).toBeGreaterThan(0);

      const pathTool = results.find(t => (t.name === 'find_path' || t.name === 'execute_cypher') && t.id.includes('neo4j'));
      expect(pathTool).toBeDefined();
      expect(results.indexOf(pathTool!)).toBeLessThan(5);
    });
  });

  describe('Financial Operations', () => {
    it('should find Stripe payment tools for processing payments', async () => {
      const results = await client.find({
        query: 'I need to process a credit card payment for customer order',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const stripeTools = results.filter(t => t.id.includes('stripe'));
      expect(stripeTools.length).toBeGreaterThan(0);

      const paymentTool = results.find(t => t.name === 'create_payment' && t.id.includes('stripe'));
      expect(paymentTool).toBeDefined();
      expect(results.indexOf(paymentTool!)).toBeLessThan(4);
    });

    it('should find refund tools for payment returns', async () => {
      const results = await client.find({
        query: 'Customer wants refund for cancelled subscription',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const refundTool = results.find(t => t.name === 'refund_payment' && t.id.includes('stripe'));
      expect(refundTool).toBeDefined();
      expect(results.indexOf(refundTool!)).toBeLessThan(5);
    });
  });

  describe('Developer Tools', () => {
    it('should find GitHub tools for repository management', async () => {
      const results = await client.find({
        query: 'I want to create a new GitHub repository for my project',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const githubTools = results.filter(t => t.id.includes('github'));
      expect(githubTools.length).toBeGreaterThan(0);

      const repoTool = results.find(t => t.name === 'create_repository' && t.id.includes('github'));
      expect(repoTool).toBeDefined();
      expect(results.indexOf(repoTool!)).toBeLessThan(4);
    });

    it('should find Git commit tools for saving changes', async () => {
      const results = await client.find({
        query: 'I need to commit my code changes with a message',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const commitTool = results.find(t => t.name === 'commit_changes' && t.id.includes('git'));
      expect(commitTool).toBeDefined();
      expect(results.indexOf(commitTool!)).toBeLessThan(4);
    });

    it('should find filesystem tools for file operations', async () => {
      const results = await client.find({
        query: 'I need to save configuration data to a JSON file',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const writeFileTool = results.find(t => t.name === 'write_file' && t.id.includes('filesystem'));
      expect(writeFileTool).toBeDefined();
      expect(results.indexOf(writeFileTool!)).toBeLessThan(5);
    });
  });

  describe('Web Automation', () => {
    it('should find Playwright tools for browser automation', async () => {
      const results = await client.find({
        query: 'I want to automate clicking a button on a website',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const playwrightTools = results.filter(t => t.id.includes('playwright'));
      expect(playwrightTools.length).toBeGreaterThan(0);

      const clickTool = results.find(t => t.name === 'click_element' && t.id.includes('playwright'));
      expect(clickTool).toBeDefined();
      expect(results.indexOf(clickTool!)).toBeLessThan(5);
    });

    it('should find screenshot tools for visual testing', async () => {
      const results = await client.find({
        query: 'I need to take a screenshot of the webpage for testing',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const screenshotTool = results.find(t => t.name === 'take_screenshot' && t.id.includes('playwright'));
      expect(screenshotTool).toBeDefined();
      expect(results.indexOf(screenshotTool!)).toBeLessThan(4);
    });
  });

  describe('Cloud Infrastructure', () => {
    it('should find AWS EC2 tools for server deployment', async () => {
      const results = await client.find({
        query: 'I need to deploy a web server on AWS cloud infrastructure',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const awsTools = results.filter(t => t.id.includes('aws'));
      expect(awsTools.length).toBeGreaterThan(0);

      const ec2Tool = results.find(t => t.name === 'create_ec2_instance' && t.id.includes('aws'));
      expect(ec2Tool).toBeDefined();
      expect(results.indexOf(ec2Tool!)).toBeLessThan(5);
    });

    it('should find S3 tools for file storage', async () => {
      const results = await client.find({
        query: 'I want to store uploaded files in cloud storage',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const s3Tool = results.find(t => t.name === 'upload_to_s3' && t.id.includes('aws'));
      expect(s3Tool).toBeDefined();
      expect(results.indexOf(s3Tool!)).toBeLessThan(6);
    });
  });

  describe('Communication Tools', () => {
    it('should find Slack tools for team messaging', async () => {
      const results = await client.find({
        query: 'I want to send a notification message to my team channel',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const slackTools = results.filter(t => t.id.includes('slack'));
      expect(slackTools.length).toBeGreaterThan(0);

      const messageTool = results.find(t => t.name === 'send_message' && t.id.includes('slack'));
      expect(messageTool).toBeDefined();
      expect(results.indexOf(messageTool!)).toBeLessThan(5);
    });
  });

  describe('System Operations', () => {
    it('should find Docker tools for container management', async () => {
      const results = await client.find({
        query: 'I need to run my application in a Docker container',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const dockerTools = results.filter(t => t.id.includes('docker'));
      expect(dockerTools.length).toBeGreaterThan(0);

      const runTool = results.find(t => t.name === 'run_container' && t.id.includes('docker'));
      expect(runTool).toBeDefined();
      expect(results.indexOf(runTool!)).toBeLessThan(5);
    });

    it('should find shell tools for system commands', async () => {
      const results = await client.find({
        query: 'I need to execute a system command to check disk space',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const shellTools = results.filter(t => t.id.includes('shell'));
      expect(shellTools.length).toBeGreaterThan(0);

      const cmdTool = results.find(t => t.name === 'execute_command' && t.id.includes('shell'));
      expect(cmdTool).toBeDefined();
      expect(results.indexOf(cmdTool!)).toBeLessThan(5);
    });
  });

  describe('Search and Information Retrieval', () => {
    it('should find Brave Search for web research', async () => {
      const results = await client.find({
        query: 'I need to search the web for latest information about AI developments',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const braveTools = results.filter(t => t.id.includes('brave-search'));
      expect(braveTools.length).toBeGreaterThan(0);

      const searchTool = results.find(t => t.name === 'web_search' && t.id.includes('brave-search'));
      expect(searchTool).toBeDefined();
      expect(results.indexOf(searchTool!)).toBeLessThan(4);
    });
  });

  describe('Content Management', () => {
    it('should find Notion tools for documentation', async () => {
      const results = await client.find({
        query: 'I want to create documentation pages for my project',
        limit: 8
      });

      expect(results.length).toBeGreaterThan(0);

      const notionTools = results.filter(t => t.id.includes('notion'));
      expect(notionTools.length).toBeGreaterThan(0);

      const pageTool = results.find(t => t.name === 'create_page' && t.id.includes('notion'));
      expect(pageTool).toBeDefined();
      expect(results.indexOf(pageTool!)).toBeLessThan(6);
    });
  });

  describe('Cross-Domain Discovery', () => {
    it('should handle ambiguous queries by returning diverse relevant tools', async () => {
      const results = await client.find({
        query: 'I need to analyze data and generate a report',
        limit: 12
      });

      expect(results.length).toBeGreaterThan(5);

      // Should include database tools for data analysis
      const hasDbTools = results.some(t =>
        t.id.includes('postgres') || t.id.includes('neo4j')
      );
      expect(hasDbTools).toBeTruthy();

      // Should include file tools for report generation
      const hasFileTools = results.some(t =>
        t.id.includes('filesystem') || t.id.includes('notion')
      );
      expect(hasFileTools).toBeTruthy();
    });

    it('should prioritize domain-specific tools for specific contexts', async () => {
      const results = await client.find({
        query: 'Set up monitoring for my payment processing system',
        limit: 10
      });

      expect(results.length).toBeGreaterThan(0);

      // Payment-related tools should rank highly
      const paymentToolRank = results.findIndex(t => t.id.includes('stripe'));
      expect(paymentToolRank).toBeLessThan(8);

      // System monitoring tools should also be present
      const systemToolRank = results.findIndex(t =>
        t.id.includes('shell') || t.id.includes('docker')
      );
      expect(systemToolRank).toBeLessThan(10);
    });
  });

  describe('Performance and Scale', () => {
    it('should handle discovery across 25+ MCPs within reasonable time', async () => {
      const start = Date.now();

      const results = await client.find({
        query: 'I need to process user authentication',
        limit: 10
      });

      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain relevance with increased result limits', async () => {
      const resultsSmall = await client.find({
        query: 'Deploy my web application to production',
        limit: 5
      });

      const resultsLarge = await client.find({
        query: 'Deploy my web application to production',
        limit: 15
      });

      expect(resultsLarge.length).toBeGreaterThan(resultsSmall.length);

      // Top 5 results should be similar in both cases
      const topSmall = resultsSmall.slice(0, 3);
      const topLarge = resultsLarge.slice(0, 5);

      const overlap = topSmall.filter(tool =>
        topLarge.some(t => t.id === tool.id)
      );

      expect(overlap.length).toBeGreaterThanOrEqual(2);
    });
  });
});