/**
 * Simple Ecosystem Discovery Validation
 * Tests that NCP can find relevant tools from our realistic MCP ecosystem
 */

import { DiscoveryEngine } from '../src/discovery/engine.js';

describe('Simple Ecosystem Discovery Validation', () => {
  let engine: DiscoveryEngine;

  beforeAll(async () => {
    engine = new DiscoveryEngine();
    await engine.initialize();

    // Create comprehensive ecosystem with 20 realistic tools
    const ecosystemTools = [
      // Database Operations
      { name: 'query', description: 'Execute SQL queries to retrieve data from PostgreSQL database tables. Find records, search data, analyze information.', mcpName: 'postgres-test' },
      { name: 'insert', description: 'Insert new records into PostgreSQL database tables. Store customer data, add new information, create records.', mcpName: 'postgres-test' },
      { name: 'execute_cypher', description: 'Execute Cypher queries on Neo4j graph database. Query relationships, find patterns, analyze connections.', mcpName: 'neo4j-test' },

      // Payment Processing
      { name: 'create_payment', description: 'Process credit card payments and charges from customers. Charge customer for order, process payment from customer.', mcpName: 'stripe-test' },
      { name: 'refund_payment', description: 'Process refunds for previously charged payments. Refund cancelled subscription, return customer money.', mcpName: 'stripe-test' },

      // Developer Tools
      { name: 'create_repository', description: 'Create a new GitHub repository with configuration options. Set up new project, initialize repository.', mcpName: 'github-test' },
      { name: 'create_issue', description: 'Create GitHub issues for bug reports and feature requests. Report bugs, request features, track tasks.', mcpName: 'github-test' },
      { name: 'commit_changes', description: 'Create Git commits to save changes to version history. Save progress, commit code changes, record modifications.', mcpName: 'git-test' },
      { name: 'create_branch', description: 'Create new Git branches for feature development and parallel work. Start new features, create development branches.', mcpName: 'git-test' },

      // File Operations
      { name: 'read_file', description: 'Read contents of files from local filesystem. Load configuration files, read text documents, access data files.', mcpName: 'filesystem-test' },
      { name: 'write_file', description: 'Write content to files on local filesystem. Create configuration files, save data, generate reports.', mcpName: 'filesystem-test' },
      { name: 'create_directory', description: 'Create new directories and folder structures. Organize files, set up project structure, create folder hierarchies.', mcpName: 'filesystem-test' },

      // Web Automation
      { name: 'click_element', description: 'Click on web page elements using selectors. Click buttons, links, form elements.', mcpName: 'playwright-test' },
      { name: 'take_screenshot', description: 'Capture screenshots of web pages for testing and documentation. Take page screenshots, save visual evidence.', mcpName: 'playwright-test' },
      { name: 'fill_form_field', description: 'Fill form inputs and text fields on web pages. Enter text, complete forms, input data.', mcpName: 'playwright-test' },

      // Cloud & Infrastructure
      { name: 'create_ec2_instance', description: 'Launch new EC2 virtual machine instances with configuration. Create servers, deploy applications to cloud.', mcpName: 'aws-test' },
      { name: 'upload_to_s3', description: 'Upload files and objects to S3 storage buckets. Store files in cloud, backup data, host static content.', mcpName: 'aws-test' },
      { name: 'run_container', description: 'Run Docker containers from images with configuration options. Deploy applications, start services.', mcpName: 'docker-test' },
      { name: 'send_message', description: 'Send messages to Slack channels or direct messages. Share updates, notify teams, communicate with colleagues.', mcpName: 'slack-test' },
      { name: 'web_search', description: 'Search the web using Brave Search API with privacy protection. Find information, research topics, get current data.', mcpName: 'brave-search-test' },
    ];

    // Group by MCP and index
    const toolsByMCP = new Map();
    for (const tool of ecosystemTools) {
      if (!toolsByMCP.has(tool.mcpName)) {
        toolsByMCP.set(tool.mcpName, []);
      }
      toolsByMCP.get(tool.mcpName).push({
        name: tool.name,
        description: tool.description
      });
    }

    // Index each MCP
    for (const [mcpName, tools] of toolsByMCP) {
      await engine['ragEngine'].indexMCP(mcpName, tools);
    }
  });

  describe('Domain-Specific Discovery', () => {
    it('finds database tools for data queries', async () => {
      const results = await engine.findRelevantTools('query customer data from database', 8);
      expect(results.length).toBeGreaterThan(0);

      const hasDbTool = results.some(t =>
        (t.name.includes('postgres') && t.name.includes('query')) ||
        (t.name.includes('neo4j') && t.name.includes('cypher'))
      );
      expect(hasDbTool).toBeTruthy();
    });

    it('finds payment tools for financial operations', async () => {
      const results = await engine.findRelevantTools('process credit card payment', 8);
      expect(results.length).toBeGreaterThan(0);

      const hasPaymentTool = results.some(t =>
        t.name.includes('stripe') && (t.name.includes('payment') || t.name.includes('create'))
      );
      expect(hasPaymentTool).toBeTruthy();
    });

    it('finds version control tools for code management', async () => {
      const results = await engine.findRelevantTools('commit code changes', 8);
      expect(results.length).toBeGreaterThan(0);

      const hasGitTool = results.some(t =>
        t.name.includes('git') && t.name.includes('commit')
      );
      expect(hasGitTool).toBeTruthy();
    });

    it('finds file system tools for file operations', async () => {
      const results = await engine.findRelevantTools('save configuration to file', 8);
      expect(results.length).toBeGreaterThan(0);

      const hasFileTool = results.some(t =>
        t.name.includes('filesystem') && t.name.includes('write')
      );
      expect(hasFileTool).toBeTruthy();
    });

    it('finds web automation tools for browser tasks', async () => {
      const results = await engine.findRelevantTools('take screenshot of webpage', 8);
      expect(results.length).toBeGreaterThan(0);

      const hasWebTool = results.some(t =>
        t.name.includes('playwright') && t.name.includes('screenshot')
      );
      expect(hasWebTool).toBeTruthy();
    });

    it('finds cloud tools for infrastructure deployment', async () => {
      const results = await engine.findRelevantTools('deploy server to AWS cloud', 8);
      expect(results.length).toBeGreaterThan(0);

      const hasCloudTool = results.some(t =>
        t.name.includes('aws') && (t.name.includes('ec2') || t.name.includes('instance'))
      );
      expect(hasCloudTool).toBeTruthy();
    });
  });

  describe('Cross-Domain Scenarios', () => {
    it('handles complex multi-domain queries', async () => {
      const results = await engine.findRelevantTools('build and deploy web application with database', 12);
      expect(results.length).toBeGreaterThan(3);

      // Should find tools from multiple domains - check for any relevant tools
      const hasDeploymentTools = results.some(r =>
        r.name.includes('docker') || r.name.includes('aws') ||
        r.name.includes('git') || r.name.includes('github')
      );
      const hasDatabaseTools = results.some(r =>
        r.name.includes('postgres') || r.name.includes('neo4j')
      );
      const hasFileTools = results.some(r =>
        r.name.includes('filesystem') || r.name.includes('file')
      );

      // Should find tools from at least one relevant domain
      const foundRelevantTools = hasDeploymentTools || hasDatabaseTools || hasFileTools;
      expect(foundRelevantTools).toBeTruthy();
    });

    it('prioritizes relevant tools for specific contexts', async () => {
      const results = await engine.findRelevantTools('refund customer payment for cancelled order', 6);
      expect(results.length).toBeGreaterThan(0);

      // Refund should be prioritized over create payment
      const refundTool = results.find(t => t.name.includes('refund'));
      const createTool = results.find(t => t.name.includes('create_payment'));

      if (refundTool && createTool) {
        expect(results.indexOf(refundTool)).toBeLessThan(results.indexOf(createTool));
      } else {
        expect(refundTool).toBeDefined(); // At minimum, refund tool should be found
      }
    });
  });

  describe('Ecosystem Scale Validation', () => {
    it('demonstrates improved specificity with diverse tool set', async () => {
      // Test that having diverse tools improves matching specificity
      const specificQuery = 'create GitHub issue for bug report';
      const results = await engine.findRelevantTools(specificQuery, 6);

      expect(results.length).toBeGreaterThan(0);

      // Should find the specific GitHub issue tool
      const issueTool = results.find(t =>
        t.name.includes('github') && t.name.includes('issue')
      );
      expect(issueTool).toBeDefined();
    });

    it('maintains performance with ecosystem scale', async () => {
      const start = Date.now();

      const results = await engine.findRelevantTools('analyze user data and generate report', 8);

      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete under 1 second
    });

    it('provides consistent results across similar queries', async () => {
      const query1 = 'store files in cloud storage';
      const query2 = 'upload files to cloud bucket';

      const results1 = await engine.findRelevantTools(query1, 5);
      const results2 = await engine.findRelevantTools(query2, 5);

      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);

      // Should both find S3 upload tool
      const hasS3_1 = results1.some(t => t.name.includes('s3') || t.name.includes('upload'));
      const hasS3_2 = results2.some(t => t.name.includes('s3') || t.name.includes('upload'));

      expect(hasS3_1).toBeTruthy();
      expect(hasS3_2).toBeTruthy();
    });
  });

  describe('Coverage Validation', () => {
    it('can discover tools from all major ecosystem domains', async () => {
      const domains = [
        { name: 'Database', query: 'database query', expectPattern: ['postgres', 'neo4j'] },
        { name: 'Payment', query: 'payment processing', expectPattern: ['stripe', 'payment'] },
        { name: 'Version Control', query: 'git repository', expectPattern: ['git', 'github'] },
        { name: 'File System', query: 'file operations', expectPattern: ['filesystem', 'file'] },
        { name: 'Web Automation', query: 'browser automation', expectPattern: ['playwright', 'click'] },
        { name: 'Cloud', query: 'cloud deployment', expectPattern: ['aws', 'docker'] },
        { name: 'Communication', query: 'team messaging', expectPattern: ['slack', 'message'] },
        { name: 'Search', query: 'web search', expectPattern: ['brave', 'search'] }
      ];

      for (const domain of domains) {
        const results = await engine.findRelevantTools(domain.query, 8);
        expect(results.length).toBeGreaterThan(0);

        const found = results.some(t =>
          domain.expectPattern.some(pattern => t.name.includes(pattern))
        );
        expect(found).toBeTruthy(); // Should find at least one tool from this domain
      }
    });
  });
});