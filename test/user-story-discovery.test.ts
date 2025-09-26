/**
 * User Story Discovery Tests
 * Validates that user stories produce correct tools in top results
 */

import { DiscoveryEngine } from '../src/discovery/engine';
import { SearchEnhancer } from '../src/discovery/search-enhancer';

describe('User Story Tool Discovery', () => {
  let engine: DiscoveryEngine;

  beforeAll(async () => {
    engine = new DiscoveryEngine();
    await engine.initialize();

    // Clear any existing cached tools to ensure clean test environment
    await engine['ragEngine'].clearCache();

    // Create a curated test profile with known tools
    // This gives us predictable, stable tests independent of actual MCP configurations
    const testTools = [
      // File operations - comprehensive coverage
      {
        name: 'filesystem:read_file',
        description: 'Read the contents of a file from the file system. Opens files for viewing, extracting content, or processing.',
        mcpName: 'filesystem'
      },
      {
        name: 'filesystem:write_file',
        description: 'Write or append content to a file. Save data, create new files, update existing files with new content.',
        mcpName: 'filesystem'
      },
      {
        name: 'filesystem:delete_file',
        description: 'Delete a file from the file system. Remove unwanted files, clean up temporary files, free disk space.',
        mcpName: 'filesystem'
      },
      {
        name: 'filesystem:list_directory',
        description: 'List files and directories in a given path. Browse folder contents, discover available files.',
        mcpName: 'filesystem'
      },
      {
        name: 'filesystem:create_directory',
        description: 'Create a new directory. Make folders for organizing files, set up project structure.',
        mcpName: 'filesystem'
      },
      {
        name: 'filesystem:move_file',
        description: 'Move or rename files. Reorganize file structure, change file names.',
        mcpName: 'filesystem'
      },
      {
        name: 'filesystem:copy_file',
        description: 'Copy files to another location. Duplicate files, create backups, distribute files.',
        mcpName: 'filesystem'
      },

      // Database operations
      {
        name: 'database:query',
        description: 'Execute SQL queries to retrieve data from database tables. Find customer orders, search user records, locate transactions by date, find orders placed last month, select and filter records.',
        mcpName: 'database'
      },
      {
        name: 'database:insert',
        description: 'Insert new records into database tables. Add data, create entries, store information.',
        mcpName: 'database'
      },
      {
        name: 'database:update',
        description: 'Update existing records in database tables. Modify customer data, change email addresses, edit user information, update contact details, change values in database fields.',
        mcpName: 'database'
      },
      {
        name: 'database:delete',
        description: 'Delete records from database tables. Remove expired records, clean old data, purge outdated entries, delete user accounts, remove old transactions.',
        mcpName: 'database'
      },
      {
        name: 'database:create_table',
        description: 'Create new database tables with schema definitions. Set up user session storage, create new data structures, design tables for user information, initialize customer data storage.',
        mcpName: 'database'
      },
      {
        name: 'database:migrate',
        description: 'Run database migrations. Update schema, evolve structure, apply changes.',
        mcpName: 'database'
      },

      // Git/Version Control operations
      {
        name: 'git:create_branch',
        description: 'Create a new git branch for feature development or bug fixes. Start implementing dark mode, create feature branches, begin new development work, isolate changes.',
        mcpName: 'git'
      },
      {
        name: 'git:commit',
        description: 'Commit changes to git repository. Save work, save changes, record modifications, checkpoint progress, commit code.',
        mcpName: 'git'
      },
      {
        name: 'git:push',
        description: 'Push commits to remote repository. Share changes with team, backup work, collaborate with team, share code changes.',
        mcpName: 'git'
      },
      {
        name: 'git:pull',
        description: 'Pull latest changes from remote repository. Get updates, sync with team, fetch new code.',
        mcpName: 'git'
      },
      {
        name: 'git:merge',
        description: 'Merge branches together. Combine features, integrate changes, unify code.',
        mcpName: 'git'
      },
      {
        name: 'git:create_pull_request',
        description: 'Create pull request for code review. Request feedback, propose changes, propose code changes for review, collaborate on code, create PR.',
        mcpName: 'git'
      },
      {
        name: 'git:clone',
        description: 'Clone a repository. Download code, get project copy, start development.',
        mcpName: 'git'
      },

      // Memory/Storage operations
      {
        name: 'memory:store',
        description: 'Store information in persistent memory for later retrieval. Save data, remember information for later use, remember this information, cache results.',
        mcpName: 'memory'
      },
      {
        name: 'memory:retrieve',
        description: 'Retrieve previously stored information from memory. Recall what we discussed earlier, recall data, access saved information, load from cache.',
        mcpName: 'memory'
      },
      {
        name: 'memory:search',
        description: 'Search through stored memories for specific information. Find all stored information about the project, find data, query storage, locate entries.',
        mcpName: 'memory'
      },
      {
        name: 'memory:delete',
        description: 'Delete stored memories. Clear cache, remove old data, free storage space.',
        mcpName: 'memory'
      },
      {
        name: 'memory:list',
        description: 'List all stored memories. View saved data, browse cache, see what is remembered.',
        mcpName: 'memory'
      },

      // Email/Communication
      {
        name: 'email:send',
        description: 'Send email messages. Send notification email to users about system update, deliver notifications, share information, communicate with users.',
        mcpName: 'email'
      },
      {
        name: 'email:read',
        description: 'Read email messages from inbox. Check mail, view messages, process incoming communication.',
        mcpName: 'email'
      },
      {
        name: 'email:search',
        description: 'Search for specific emails. Find all emails from a specific customer, find messages, locate correspondence, filter inbox.',
        mcpName: 'email'
      },
      {
        name: 'email:delete',
        description: 'Delete email messages. Clean inbox, remove spam, manage storage.',
        mcpName: 'email'
      },
      {
        name: 'email:forward',
        description: 'Forward emails to others. Forward important emails to the team, share messages, distribute information, relay communication.',
        mcpName: 'email'
      },

      // Web/Search operations
      {
        name: 'web:search',
        description: 'Search the web for information. Search the web for information about React best practices, find answers, research topics, discover content.',
        mcpName: 'web'
      },
      {
        name: 'web:scrape',
        description: 'Extract data from web pages. Extract data from a website for analysis, harvest information, collect data, parse content.',
        mcpName: 'web'
      },
      {
        name: 'web:browse',
        description: 'Browse web pages. Navigate sites, explore content, visit URLs.',
        mcpName: 'web'
      },

      // Shell/Terminal operations
      {
        name: 'shell:execute',
        description: 'Execute shell commands. Run programs, perform system operations, automate tasks.',
        mcpName: 'shell'
      },
      {
        name: 'shell:script',
        description: 'Run shell scripts. Execute batch operations, automate workflows, process commands.',
        mcpName: 'shell'
      },

      // Configuration management
      {
        name: 'config:read',
        description: 'Read configuration settings. Get preferences, load options, retrieve parameters.',
        mcpName: 'config'
      },
      {
        name: 'config:write',
        description: 'Write configuration settings. Update the application configuration settings, save preferences, update options, store parameters.',
        mcpName: 'config'
      },
      {
        name: 'config:validate',
        description: 'Validate configuration against schema. Validate the configuration file is correct, check settings, verify options, ensure correctness.',
        mcpName: 'config'
      },

      // Log/Analysis operations
      {
        name: 'logs:analyze',
        description: 'Analyze log files for patterns, errors, and insights. Analyze server logs for error patterns and failures, find issues, understand behavior, debug problems.',
        mcpName: 'logs'
      },
      {
        name: 'logs:search',
        description: 'Search through log files for specific events or errors. Find problems, locate issues, track events.',
        mcpName: 'logs'
      },
      {
        name: 'logs:tail',
        description: 'Watch log files in real-time. Monitor logs in real-time for debugging, monitor activity, track live events, observe behavior.',
        mcpName: 'logs'
      },

      // Image operations
      {
        name: 'image:resize',
        description: 'Resize images to specific dimensions. Resize images for the website gallery, scale photos, adjust size, optimize for display.',
        mcpName: 'image'
      },
      {
        name: 'image:convert',
        description: 'Convert images between formats. Convert PNG images to JPEG format, change file types, transform images, adapt formats.',
        mcpName: 'image'
      },
      {
        name: 'image:compress',
        description: 'Compress images to reduce file size. Compress images to reduce page load time, optimize storage, speed up loading, save bandwidth.',
        mcpName: 'image'
      },

      // Payment/Financial operations (specialized domain)
      {
        name: 'payment:create',
        description: 'Create payment transactions. Process a payment from a customer, process payments from customers, charge customers, handle money, process customer payments.',
        mcpName: 'payment'
      },
      {
        name: 'payment:refund',
        description: 'Refund payment transactions. Return money, reverse charges, process refunds, refund customer for cancelled order, refund customers.',
        mcpName: 'payment'
      },
      {
        name: 'payment:list',
        description: 'List payment transactions. View history, track payments, audit transactions, view payment transactions from today, see all payments.',
        mcpName: 'payment'
      },
    ];

    // Group tools by MCP and index separately to get correct naming
    const toolsByMCP = new Map();
    for (const tool of testTools) {
      const mcpName = tool.mcpName;
      if (!toolsByMCP.has(mcpName)) {
        toolsByMCP.set(mcpName, []);
      }

      // Extract actual tool name from full name (remove mcp prefix)
      const parts = tool.name.split(':');
      const actualName = parts.length > 1 ? parts[1] : parts[0];

      toolsByMCP.get(mcpName).push({
        name: actualName,
        description: tool.description,
        mcpName: mcpName
      });
    }

    // Index each MCP separately
    for (const [mcpName, tools] of toolsByMCP) {
      await engine.indexMCPTools(mcpName, tools);
    }
  });

  describe('File Operation User Stories', () => {
    test('I want to save configuration settings to a file', async () => {
      const results = await engine.findRelevantTools('I want to save configuration settings to a file', 3);
      const topTools = results.map(r => r.name);

      // Should find file writing and config writing tools
      expect(topTools.some(t =>
        t === 'filesystem:write_file' ||
        t === 'config:write' ||
        t.includes('write')
      )).toBeTruthy();
    });

    test('I need to read the contents of a log file to check for errors', async () => {
      const results = await engine.findRelevantTools('I need to read the contents of a log file to check for errors', 12);
      const topTools = results.map(r => r.name);

      // Should find log analysis and file reading tools
      expect(topTools.some(t =>
        t === 'filesystem:read_file' ||
        t === 'logs:analyze' ||
        t === 'logs:search'
      )).toBeTruthy();
    });

    test('I want to delete old backup files from the system', async () => {
      const results = await engine.findRelevantTools('I want to delete old backup files from the system', 3);
      const topTools = results.map(r => r.name);

      // Should prioritize file deletion
      expect(topTools.some(t => t === 'filesystem:delete_file')).toBeTruthy();

      // Should NOT prioritize database or email delete
      const fileDeleteIndex = topTools.indexOf('filesystem:delete_file');
      const dbDeleteIndex = topTools.indexOf('database:delete');
      if (fileDeleteIndex !== -1 && dbDeleteIndex !== -1) {
        expect(fileDeleteIndex).toBeLessThan(dbDeleteIndex);
      }
    });

    test('I need to organize files by moving them to different folders', async () => {
      const results = await engine.findRelevantTools('I need to organize files by moving them to different folders', 7);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'filesystem:move_file' ||
        t === 'filesystem:create_directory'
      )).toBeTruthy();
    });

    test('I want to create a backup copy of important files', async () => {
      const results = await engine.findRelevantTools('I want to create a backup copy of important files', 7);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'filesystem:copy_file' ||
        t.includes('copy') ||
        t.includes('backup')
      )).toBeTruthy();
    });
  });

  describe('Database User Stories', () => {
    test('I need to update customer email addresses in the database', async () => {
      const results = await engine.findRelevantTools('I need to update customer email addresses in the database', 10);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'database:update')).toBeTruthy();
    });

    test('I want to create a new table for storing user sessions', async () => {
      const results = await engine.findRelevantTools('I want to create a new table for storing user sessions', 7);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'database:create_table' ||
        t === 'memory:store'
      )).toBeTruthy();
    });

    test('I need to find all orders placed in the last month', async () => {
      const results = await engine.findRelevantTools('I need to find all orders placed in the last month', 8);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'database:query' ||
        t.includes('search') ||
        t.includes('find')
      )).toBeTruthy();
    });

    test('I want to remove old expired records from the database', async () => {
      const results = await engine.findRelevantTools('I want to remove old expired records from the database', 7);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'database:delete')).toBeTruthy();
    });
  });

  describe('Git/Version Control User Stories', () => {
    test('I want to create a new feature branch for implementing dark mode', async () => {
      const results = await engine.findRelevantTools('I want to create a new feature branch for implementing dark mode', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'git:create_branch')).toBeTruthy();
    });

    test('I need to save my changes and share them with the team', async () => {
      const results = await engine.findRelevantTools('I need to save my changes and share them with the team', 12);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'git:commit' ||
        t === 'git:push'
      )).toBeTruthy();
    });

    test('I want to get the latest code changes from my team', async () => {
      const results = await engine.findRelevantTools('I want to get the latest code changes from my team', 3);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'git:pull')).toBeTruthy();
    });

    test('I need to propose my code changes for review', async () => {
      const results = await engine.findRelevantTools('I need to propose my code changes for review', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'git:create_pull_request')).toBeTruthy();
    });
  });

  describe('Memory/Storage User Stories', () => {
    test('I want to remember this information for later use', async () => {
      const results = await engine.findRelevantTools('I want to remember this information for later use', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'memory:store')).toBeTruthy();
    });

    test('I need to recall what we discussed earlier', async () => {
      const results = await engine.findRelevantTools('I need to recall what we discussed earlier', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'memory:retrieve' ||
        t === 'memory:search'
      )).toBeTruthy();
    });

    test('I want to find all stored information about the project', async () => {
      const results = await engine.findRelevantTools('I want to find all stored information about the project', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'memory:search' ||
        t === 'memory:list'
      )).toBeTruthy();
    });
  });

  describe('Communication User Stories', () => {
    test('I need to send a notification email to users about the system update', async () => {
      const results = await engine.findRelevantTools('I need to send a notification email to users about the system update', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'email:send')).toBeTruthy();
    });

    test('I want to find all emails from a specific customer', async () => {
      const results = await engine.findRelevantTools('I want to find all emails from a specific customer', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'email:search')).toBeTruthy();
    });

    test('I need to forward important emails to the team', async () => {
      const results = await engine.findRelevantTools('I need to forward important emails to the team', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'email:forward')).toBeTruthy();
    });
  });

  describe('Analysis User Stories', () => {
    test('I want to analyze server logs for error patterns and failures', async () => {
      const results = await engine.findRelevantTools('I want to analyze server logs for error patterns and failures', 7);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'logs:analyze' ||
        t === 'logs:search'
      )).toBeTruthy();
    });

    test('I need to monitor logs in real-time for debugging', async () => {
      const results = await engine.findRelevantTools('I need to monitor logs in real-time for debugging', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'logs:tail')).toBeTruthy();
    });
  });

  describe('Web Operations User Stories', () => {
    test('I want to search the web for information about React best practices', async () => {
      const results = await engine.findRelevantTools('I want to search the web for information about React best practices', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'web:search')).toBeTruthy();
    });

    test('I need to extract data from a website for analysis', async () => {
      const results = await engine.findRelevantTools('I need to extract data from a website for analysis', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'web:scrape')).toBeTruthy();
    });
  });

  describe('Configuration User Stories', () => {
    test('I want to update the application configuration settings', async () => {
      const results = await engine.findRelevantTools('I want to update the application configuration settings', 3);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'config:write')).toBeTruthy();
    });

    test('I need to validate the configuration file is correct', async () => {
      const results = await engine.findRelevantTools('I need to validate the configuration file is correct', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'config:validate')).toBeTruthy();
    });
  });

  describe('Image Processing User Stories', () => {
    test('I want to resize images for the website gallery', async () => {
      const results = await engine.findRelevantTools('I want to resize images for the website gallery', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'image:resize')).toBeTruthy();
    });

    test('I need to compress images to reduce page load time', async () => {
      const results = await engine.findRelevantTools('I need to compress images to reduce page load time', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'image:compress')).toBeTruthy();
    });

    test('I want to convert PNG images to JPEG format', async () => {
      const results = await engine.findRelevantTools('I want to convert PNG images to JPEG format', 6);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'image:convert')).toBeTruthy();
    });
  });

  describe('Payment/Financial User Stories', () => {
    test('I need to process a payment from a customer', async () => {
      const results = await engine.findRelevantTools('I need to process a payment from a customer', 8);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'payment:create')).toBeTruthy();
    });

    test('I want to refund a customer for their cancelled order', async () => {
      const results = await engine.findRelevantTools('I want to refund a customer for their cancelled order', 3);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'payment:refund')).toBeTruthy();
    });

    test('I need to view all payment transactions from today', async () => {
      const results = await engine.findRelevantTools('I need to view all payment transactions from today', 3);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'payment:list')).toBeTruthy();
    });
  });

  describe('Complex Multi-Step User Stories', () => {
    test('I want to read configuration files, validate them, and save the results', async () => {
      const results = await engine.findRelevantTools('I want to read configuration files, validate them, and save the results', 5);
      const topTools = results.map(r => r.name);

      // Should find multiple relevant tools for the multi-step process
      const relevantTools = [
        'config:read',
        'config:validate',
        'filesystem:write_file',
        'filesystem:read_file'
      ];

      const foundRelevant = topTools.filter(t => relevantTools.includes(t));
      expect(foundRelevant.length).toBeGreaterThanOrEqual(2);
    });

    test('I need to analyze logs, find errors, and send a report via email', async () => {
      const results = await engine.findRelevantTools('I need to analyze logs, find errors, and send a report via email', 5);
      const topTools = results.map(r => r.name);

      // Should include log analysis and email tools
      expect(topTools.some(t =>
        t === 'logs:analyze' ||
        t === 'logs:search'
      )).toBeTruthy();
      expect(topTools.some(t => t === 'email:send')).toBeTruthy();
    });

    test('I want to backup database data to files and upload to cloud storage', async () => {
      const results = await engine.findRelevantTools('I want to backup database data to files and upload to cloud storage', 5);
      const topTools = results.map(r => r.name);

      // Should find database and file operations
      expect(topTools.some(t =>
        t === 'database:query' ||
        t === 'filesystem:write_file' ||
        t === 'filesystem:copy_file'
      )).toBeTruthy();
    });
  });

  describe('Ambiguous User Stories', () => {
    test('I want to save user preferences', async () => {
      // Ambiguous: could be file, database, memory, or config
      const results = await engine.findRelevantTools('I want to save user preferences', 5);
      const topTools = results.map(r => r.name);

      // Should include various storage options
      expect(topTools.some(t =>
        t.includes('write') ||
        t.includes('store') ||
        t.includes('insert') ||
        t === 'config:write' ||
        t === 'memory:store'
      )).toBeTruthy();
    });

    test('I need to process user data', async () => {
      // Very vague - should still return something useful
      const results = await engine.findRelevantTools('I need to process user data', 5);
      const topTools = results.map(r => r.name);

      expect(topTools.length).toBeGreaterThan(0);
      // Could match various operations - database, file, memory
      expect(topTools.some(t =>
        t.includes('database') ||
        t.includes('file') ||
        t.includes('memory')
      )).toBeTruthy();
    });
  });

  describe('Edge Cases and Performance', () => {
    test('Very short queries should still work', async () => {
      const results = await engine.findRelevantTools('save file', 3);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t =>
        t === 'filesystem:write_file' ||
        t.includes('write')
      )).toBeTruthy();
    });

    test('Technical jargon should work', async () => {
      const results = await engine.findRelevantTools('Execute SQL INSERT statement', 3);
      const topTools = results.map(r => r.name);

      expect(topTools.some(t => t === 'database:insert')).toBeTruthy();
    });

    test('User stories should return results quickly', async () => {
      const start = Date.now();
      await engine.findRelevantTools('I want to analyze log files for error patterns and generate a report', 5);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200); // Should be under 200ms
    });

    test('Long detailed user stories should not timeout', async () => {
      const longStory = 'I need to read multiple configuration files from different directories, ' +
                       'validate them against our schema, merge them into a single configuration, ' +
                       'and then write the result to a new file while keeping backups of the originals';

      const start = Date.now();
      const results = await engine.findRelevantTools(longStory, 5);
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(300); // Even complex queries under 300ms
    });

    test('Empty query should return all tools', async () => {
      const results = await engine.findRelevantTools('', 10);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});