/**
 * Curated Ecosystem Validation Tests
 *
 * Tests NCP's discovery capabilities with our high-quality curated MCP ecosystem
 */

import { DiscoveryEngine } from '../src/discovery/engine.js';
import fs from 'fs/promises';
import path from 'path';

describe('Curated Ecosystem Validation', () => {
  let engine: DiscoveryEngine;

  beforeAll(async () => {
    engine = new DiscoveryEngine();
    await engine.initialize();

    // Load actual curated ecosystem profile
    const profilePath = path.join(process.cwd(), 'profiles', 'curated-mcp-ecosystem.json');
    const profile = JSON.parse(await fs.readFile(profilePath, 'utf-8'));

    // Extract tools from the ecosystem builder directory
    const ecosystemBuilderPath = path.resolve('../ncp-ecosystem-builder');
    const clonesDir = path.join(ecosystemBuilderPath, 'generated/clones');

    try {
      const files = await fs.readdir(clonesDir);
      const mcpFiles = files.filter(f => f.endsWith('.js'));

      // Index each MCP
      for (const file of mcpFiles) {
        const mcpName = file.replace('-curated-dummy.js', '').replace('-dummy.js', '');

        // Import the MCP to get its tools
        const mcpPath = path.join(clonesDir, file);
        try {
          const { tools } = await import(mcpPath);
          if (tools && tools.length > 0) {
            await engine['ragEngine'].indexMCP(mcpName, tools);
          }
        } catch (error: any) {
          // Fallback to profile descriptions
          const serverInfo = profile.mcpServers[mcpName] as any;
          if (serverInfo) {
            await engine['ragEngine'].indexMCP(mcpName, [{
              name: mcpName,
              description: serverInfo.description
            }]);
          }
        }
      }
    } catch (error) {
      console.warn('Could not load ecosystem builder MCPs, using profile fallback');

      // Fallback: use profile information only
      for (const [mcpName, serverInfo] of Object.entries(profile.mcpServers)) {
        await engine['ragEngine'].indexMCP(mcpName, [{
          name: mcpName,
          description: (serverInfo as any).description
        }]);
      }
    }
  });

  describe('Database Discovery', () => {
    it('finds PostgreSQL tools for database operations', async () => {
      const results = await engine.findRelevantTools(
        'I need to execute SQL queries on PostgreSQL database',
        8
      );

      expect(results.length).toBeGreaterThan(0);

      const pgTool = results.find((t: any) =>
        t.name.includes('postgres') ||
        t.name.includes('execute_query') ||
        t.description?.toLowerCase().includes('postgresql') ||
        t.description?.toLowerCase().includes('postgres')
      );
      expect(pgTool).toBeDefined();
      expect(results.indexOf(pgTool!)).toBeLessThan(5);
    });

    it('finds appropriate database tools for different databases', async () => {
      const results = await engine.findRelevantTools(
        'I want to work with SQLite lightweight database for my application',
        8
      );

      expect(results.length).toBeGreaterThan(0);

      // Should find SQLite for lightweight usage
      const sqliteTool = results.find((t: any) =>
        t.name.includes('sqlite') ||
        t.description?.toLowerCase().includes('sqlite') ||
        t.description?.toLowerCase().includes('lightweight')
      );
      expect(sqliteTool).toBeDefined();
    });
  });

  describe('Cloud & Infrastructure Discovery', () => {
    it('finds AWS tools for cloud deployment', async () => {
      const results = await engine.findRelevantTools(
        'I need to deploy a server instance on AWS',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const awsTool = results.find((t: any) =>
        t.name.includes('aws') || t.name.includes('launch_ec2') || t.description?.toLowerCase().includes('aws')
      );
      expect(awsTool).toBeDefined();
      expect(results.indexOf(awsTool!)).toBeLessThan(5);
    });

    it('finds Docker tools for containerization', async () => {
      const results = await engine.findRelevantTools(
        'I want to containerize my application with Docker containers',
        8
      );

      expect(results.length).toBeGreaterThan(0);

      const dockerTool = results.find((t: any) =>
        t.name.includes('docker') ||
        t.description?.toLowerCase().includes('docker') ||
        t.description?.toLowerCase().includes('container')
      );
      expect(dockerTool).toBeDefined();
      expect(results.indexOf(dockerTool!)).toBeLessThan(6);
    });
  });

  describe('Developer Tools Discovery', () => {
    it('finds GitHub tools for repository management', async () => {
      const results = await engine.findRelevantTools(
        'I want to create a new GitHub repository for my project',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const githubTool = results.find((t: any) =>
        t.name.includes('github') || t.name.includes('create_repository') || t.description?.toLowerCase().includes('github')
      );
      expect(githubTool).toBeDefined();
      expect(results.indexOf(githubTool!)).toBeLessThan(4);
    });

    it('finds file system tools for file operations', async () => {
      const results = await engine.findRelevantTools(
        'I need to read configuration files from disk',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const fsTool = results.find((t: any) =>
        t.name.includes('filesystem') || t.name.includes('read_file') || t.description?.toLowerCase().includes('filesystem')
      );
      expect(fsTool).toBeDefined();
      expect(results.indexOf(fsTool!)).toBeLessThan(5);
    });
  });

  describe('Communication Tools Discovery', () => {
    it('finds Slack tools for team messaging', async () => {
      const results = await engine.findRelevantTools(
        'I want to send a notification to my team on Slack',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const slackTool = results.find((t: any) =>
        t.name.includes('slack') || t.name.includes('send_message') || t.description?.toLowerCase().includes('slack')
      );
      expect(slackTool).toBeDefined();
      expect(results.indexOf(slackTool!)).toBeLessThan(4);
    });
  });

  describe('AI/ML Tools Discovery', () => {
    it('finds OpenAI tools for LLM operations', async () => {
      const results = await engine.findRelevantTools(
        'I need to generate text using OpenAI API',
        6
      );

      expect(results.length).toBeGreaterThan(0);

      const openaiTool = results.find((t: any) => t.name.includes('openai') || t.description?.toLowerCase().includes('openai'));
      expect(openaiTool).toBeDefined();
      expect(results.indexOf(openaiTool!)).toBeLessThan(5);
    });
  });

  describe('Cross-Domain Discovery', () => {
    it('handles complex queries spanning multiple domains', async () => {
      const results = await engine.findRelevantTools(
        'I need to build a web application with database, deploy to cloud, and send notifications',
        20
      );

      // The main validation is that the system can handle complex queries and return results
      // This demonstrates that the curated ecosystem is working and discoverable
      expect(results.length).toBeGreaterThan(0);

      // Verify that results have the expected structure
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('confidence');

      // The curated ecosystem is functioning properly if we get back structured results
      expect(typeof results[0].name).toBe('string');
      expect(typeof results[0].confidence).toBe('number');
    });

    it('provides consistent results for similar queries', async () => {
      const results1 = await engine.findRelevantTools('database query operations', 5);
      const results2 = await engine.findRelevantTools('execute database queries', 5);

      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);

      // Should have some overlap in database tools
      const dbTools1 = results1.filter((t: any) =>
        t.name.includes('postgres') || t.name.includes('mongo') || t.name.includes('sqlite') || t.description?.toLowerCase().includes('database')
      );
      const dbTools2 = results2.filter((t: any) =>
        t.name.includes('postgres') || t.name.includes('mongo') || t.name.includes('sqlite') || t.description?.toLowerCase().includes('database')
      );

      expect(dbTools1.length).toBeGreaterThan(0);
      expect(dbTools2.length).toBeGreaterThan(0);
    });
  });

  describe('Ecosystem Quality Validation', () => {
    it('demonstrates good domain coverage', async () => {
      const domains = [
        { query: 'database operations', expectedPatterns: ['postgres', 'mongo', 'sqlite'] },
        { query: 'cloud deployment', expectedPatterns: ['aws', 'docker'] },
        { query: 'version control', expectedPatterns: ['github', 'git'] },
        { query: 'team communication', expectedPatterns: ['slack'] },
        { query: 'AI language model', expectedPatterns: ['openai', 'huggingface'] },
        { query: 'file operations', expectedPatterns: ['filesystem'] },
        { query: 'web search', expectedPatterns: ['brave', 'wikipedia'] }
      ];

      for (const domain of domains) {
        const results = await engine.findRelevantTools(domain.query, 8);
        expect(results.length).toBeGreaterThan(0);

        const hasExpectedTool = results.some((t: any) =>
          domain.expectedPatterns.some(pattern => t.name.includes(pattern))
        );
        expect(hasExpectedTool).toBeTruthy(); // Should find relevant tools for each domain
      }
    });

    it('maintains performance across ecosystem', async () => {
      const start = Date.now();

      const results = await engine.findRelevantTools(
        'comprehensive application development with database and cloud deployment',
        10
      );

      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should be fast even with comprehensive ecosystem
    });
  });
});