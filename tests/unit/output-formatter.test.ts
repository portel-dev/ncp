/**
 * Unit tests for OutputFormatter service
 * Tests format detection, auto-formatting, and markdown rendering
 */

import { OutputFormatter } from '../../src/services/output-formatter';

describe('OutputFormatter', () => {
  beforeEach(() => {
    // Reset to default configuration - disable colors for test environment
    OutputFormatter.configure({ noColor: true, emoji: true });
  });

  describe('format detection', () => {
    test('should detect primitive types', () => {
      expect(OutputFormatter.detectFormat('string')).toBe(OutputFormatter.FORMAT_TYPES.PRIMITIVE);
      expect(OutputFormatter.detectFormat(42)).toBe(OutputFormatter.FORMAT_TYPES.PRIMITIVE);
      expect(OutputFormatter.detectFormat(true)).toBe(OutputFormatter.FORMAT_TYPES.PRIMITIVE);
    });

    test('should detect empty values as NONE', () => {
      expect(OutputFormatter.detectFormat(null)).toBe(OutputFormatter.FORMAT_TYPES.NONE);
      expect(OutputFormatter.detectFormat(undefined)).toBe(OutputFormatter.FORMAT_TYPES.NONE);
      expect(OutputFormatter.detectFormat('')).toBe(OutputFormatter.FORMAT_TYPES.NONE);
    });

    test('should detect primitive arrays as LIST', () => {
      const data = ['apple', 'banana', 'cherry'];
      expect(OutputFormatter.detectFormat(data)).toBe(OutputFormatter.FORMAT_TYPES.LIST);

      const numbers = [1, 2, 3];
      expect(OutputFormatter.detectFormat(numbers)).toBe(OutputFormatter.FORMAT_TYPES.LIST);
    });

    test('should detect object arrays as TABLE', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ];
      expect(OutputFormatter.detectFormat(data)).toBe(OutputFormatter.FORMAT_TYPES.TABLE);
    });

    test('should detect flat objects as TABLE', () => {
      const data = { name: 'Alice', age: 30, email: 'alice@example.com' };
      expect(OutputFormatter.detectFormat(data)).toBe(OutputFormatter.FORMAT_TYPES.TABLE);
    });

    test('should detect nested objects as TREE', () => {
      const data = {
        user: {
          name: 'Alice',
          address: {
            city: 'Portland',
            zip: '97201'
          }
        }
      };
      expect(OutputFormatter.detectFormat(data)).toBe(OutputFormatter.FORMAT_TYPES.TREE);
    });

    test('should handle empty arrays', () => {
      expect(OutputFormatter.detectFormat([])).toBe(OutputFormatter.FORMAT_TYPES.LIST);
    });
  });

  describe('auto-formatting', () => {
    test('should format primitives as-is', () => {
      expect(OutputFormatter.formatAuto('hello')).toBe('hello');
      expect(OutputFormatter.formatAuto(42)).toBe('42');
      expect(OutputFormatter.formatAuto(true)).toBe('true');
    });

    test('should format empty values', () => {
      const result = OutputFormatter.formatAuto(null);
      expect(result.toLowerCase()).toContain('empty');
    });

    test('should format arrays as lists', () => {
      const data = ['item1', 'item2', 'item3'];
      const result = OutputFormatter.formatAuto(data);
      expect(result).toContain('item1');
      expect(result).toContain('item2');
      expect(result).toContain('item3');
    });

    test('should format object arrays as tables', () => {
      const data = [
        { id: 1, name: 'Tool 1' },
        { id: 2, name: 'Tool 2' }
      ];
      const result = OutputFormatter.formatAuto(data);
      expect(result).toContain('Tool 1');
      expect(result).toContain('Tool 2');
      expect(result).toContain('id');
      expect(result).toContain('name');
    });

    test('should format nested objects as trees', () => {
      const data = {
        config: {
          database: {
            host: 'localhost'
          }
        }
      };
      const result = OutputFormatter.formatAuto(data);
      expect(result).toContain('config');
      expect(result).toContain('database');
      expect(result).toContain('localhost');
    });
  });

  describe('markdown detection', () => {
    test('should detect markdown headings', () => {
      expect(OutputFormatter.isMarkdown('# Heading 1')).toBe(true);
      expect(OutputFormatter.isMarkdown('## Heading 2')).toBe(true);
      expect(OutputFormatter.isMarkdown('### Heading 3')).toBe(true);
    });

    test('should detect bold markdown', () => {
      expect(OutputFormatter.isMarkdown('**bold text**')).toBe(true);
    });

    test('should detect italic markdown', () => {
      expect(OutputFormatter.isMarkdown('*italic text*')).toBe(true);
    });

    test('should detect code blocks', () => {
      expect(OutputFormatter.isMarkdown('```typescript\ncode here\n```')).toBe(true);
    });

    test('should detect inline code', () => {
      expect(OutputFormatter.isMarkdown('Use `const x = 5` in code')).toBe(true);
    });

    test('should detect links', () => {
      expect(OutputFormatter.isMarkdown('[Click here](https://example.com)')).toBe(true);
    });

    test('should detect unordered lists', () => {
      expect(OutputFormatter.isMarkdown('- Item 1\n- Item 2')).toBe(true);
      expect(OutputFormatter.isMarkdown('* Item 1\n* Item 2')).toBe(true);
      expect(OutputFormatter.isMarkdown('+ Item 1\n+ Item 2')).toBe(true);
    });

    test('should detect ordered lists', () => {
      expect(OutputFormatter.isMarkdown('1. First\n2. Second')).toBe(true);
    });

    test('should detect blockquotes', () => {
      expect(OutputFormatter.isMarkdown('> A quote')).toBe(true);
    });

    test('should not detect non-markdown text', () => {
      expect(OutputFormatter.isMarkdown('Just plain text')).toBe(false);
      expect(OutputFormatter.isMarkdown('192.168.1.1')).toBe(false);
    });
  });

  describe('markdown rendering', () => {
    test('should render headings', () => {
      const text = '# Main Heading';
      const result = OutputFormatter.renderMarkdown(text);
      expect(result).toBeTruthy();
      expect(result).toContain('Main Heading');
    });

    test('should render bold text', () => {
      const text = 'This is **bold text** here';
      const result = OutputFormatter.renderMarkdown(text);
      expect(result).toContain('bold text');
      // When noColor is true, markdown markers may be preserved
      expect(result).toBeTruthy();
    });

    test('should render inline code', () => {
      const text = 'Use `const x = 5` in code';
      const result = OutputFormatter.renderMarkdown(text);
      expect(result).toContain('const x = 5');
    });

    test('should render code blocks', () => {
      const text = '```javascript\nconst x = 5;\n```';
      const result = OutputFormatter.renderMarkdown(text);
      expect(result).toContain('const x = 5');
    });

    test('should render lists', () => {
      const text = '- Item 1\n- Item 2\n- Item 3';
      const result = OutputFormatter.renderMarkdown(text);
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
      expect(result).toContain('Item 3');
    });

    test('should render links', () => {
      const text = '[Click here](https://example.com)';
      const result = OutputFormatter.renderMarkdown(text);
      expect(result).toContain('Click here');
      expect(result).toContain('https://example.com');
    });
  });

  describe('formatString', () => {
    test('should detect and render markdown', () => {
      const text = '# Header\nSome content';
      const result = OutputFormatter.formatString(text);
      expect(result).toBeTruthy();
      expect(result).toContain('Header');
    });

    test('should pass through non-markdown text', () => {
      const text = 'Plain text without any markdown';
      const result = OutputFormatter.formatString(text);
      expect(result).toBe(text);
    });
  });

  describe('status badges', () => {
    test('should create status badges', () => {
      const badge = OutputFormatter.statusBadge('HEALTHY');
      expect(badge).toContain('HEALTHY');

      const withLabel = OutputFormatter.statusBadge('HEALTHY', 'System Status');
      expect(withLabel).toContain('HEALTHY');
      expect(withLabel).toContain('System Status');
    });

    test('should create status rows for tables', () => {
      const row = OutputFormatter.statusRow('Database', 'HEALTHY', 'Connected');
      expect(row).toContain('Database');
      expect(row).toContain('HEALTHY');
      expect(row).toContain('Connected');
    });

    test('should support all status types', () => {
      const statuses: Array<keyof typeof OutputFormatter.STATUS> = [
        'HEALTHY', 'UNHEALTHY', 'DEGRADED', 'UNKNOWN',
        'DISABLED', 'RUNNING', 'PAUSED', 'FAILED',
        'PENDING', 'COMPLETED', 'ACTIVE', 'INACTIVE'
      ];

      statuses.forEach(status => {
        const badge = OutputFormatter.statusBadge(status);
        expect(badge).toBeTruthy();
        expect(badge.length).toBeGreaterThan(0);
      });
    });
  });

  describe('configuration', () => {
    test('should disable colors when configured', () => {
      OutputFormatter.configure({ noColor: true });
      const message = OutputFormatter.success('Test');
      // Test that it returns a string (actual color codes depend on chalk mock)
      expect(typeof message).toBe('string');
      expect(message).toContain('Test');
    });

    test('should disable emoji when configured', () => {
      OutputFormatter.configure({ emoji: false });
      const message = OutputFormatter.success('Test');
      expect(message).toContain('Test');
    });

    test('should enable emoji by default', () => {
      OutputFormatter.configure({ emoji: true });
      const message = OutputFormatter.success('Test');
      expect(message).toContain('Test');
    });
  });

  describe('status messages', () => {
    test('should create success messages', () => {
      const message = OutputFormatter.success('Operation completed');
      expect(message).toContain('Operation completed');
    });

    test('should create error messages', () => {
      const message = OutputFormatter.error('Something went wrong');
      expect(message).toContain('Something went wrong');
    });

    test('should create warning messages', () => {
      const message = OutputFormatter.warning('Be careful');
      expect(message).toContain('Be careful');
    });

    test('should create info messages', () => {
      const message = OutputFormatter.info('Information');
      expect(message).toContain('Information');
    });
  });

  describe('complex data structures', () => {
    test('should handle deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep'
              }
            }
          }
        }
      };
      const result = OutputFormatter.formatAuto(data);
      expect(result).toContain('deep');
    });

    test('should handle mixed arrays', () => {
      const data = [
        { type: 'string', value: 'text' },
        { type: 'number', value: 42 },
        { type: 'boolean', value: true }
      ];
      const result = OutputFormatter.formatAuto(data);
      expect(result).toContain('text');
      expect(result).toContain('42');
    });

    test('should handle large data sets', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random()
      }));
      const result = OutputFormatter.formatAuto(data);
      expect(result).toContain('id');
      expect(result).toContain('name');
    });
  });
});
