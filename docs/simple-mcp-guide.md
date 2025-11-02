# SimpleMCP Guide

SimpleMCP is a streamlined way to create internal MCPs for NCP. Instead of implementing the full MCP protocol, you just write a TypeScript class with methods - NCP handles the rest!

## Why SimpleMCP?

- **No boilerplate**: No need to define tools manually, register handlers, or implement the MCP protocol
- **Type-safe**: Full TypeScript support with automatic schema inference
- **Auto-discovery**: Drop a file in the right directory and it's automatically loaded
- **Simple**: Class name → MCP name, methods → tools, JSDoc → descriptions

## Quick Start

### 1. Create a SimpleMCP Class

```typescript
import { SimpleMCP } from '../base-mcp.js';

/**
 * My Awesome MCP
 * This class description becomes the MCP description
 */
export class MyAwesomeMCP extends SimpleMCP {
  /**
   * Say hello to someone
   * @param name The person's name
   * @param greeting Optional custom greeting
   */
  async sayHello(params: { name: string; greeting?: string }) {
    const greeting = params.greeting || 'Hello';
    return `${greeting}, ${params.name}!`;
  }

  /**
   * Add two numbers
   * @param a First number
   * @param b Second number
   */
  async add(params: { a: number; b: number }) {
    return { result: params.a + params.b };
  }
}
```

### 2. Save the File

Save your file with the `.mcp.ts` extension in one of these directories:

- **Built-in**: `src/internal-mcps/examples/*.mcp.ts` (bundled with NCP)
- **Global user**: `~/.ncp/internal/*.mcp.ts` (available in all projects)
- **Project-local**: `.ncp/internal/*.mcp.ts` (only for this project)

### 3. Use It!

The MCP is automatically loaded. Use it through NCP's `find` and `run` commands:

```bash
ncp find "say hello"
# → my-awesome:say-hello

ncp run my-awesome:say-hello name="World"
# → Hello, World!
```

## How It Works

### Class Name → MCP Name

The class name is automatically converted to kebab-case:

- `Calculator` → `calculator`
- `MyAwesomeMCP` → `my-awesome` (MCP suffix removed)
- `GitHubIntegration` → `git-hub-integration`

### Methods → Tools

All public async methods become tools:

```typescript
async add(params: { a: number; b: number }) { ... }
// → Tool name: "add"
```

Private methods (starting with `_`) are ignored:

```typescript
private async _helperFunction() { ... }
// → Not exposed as a tool
```

### TypeScript Types → Schemas

Parameter types are automatically converted to JSON Schema:

```typescript
async myTool(params: {
  name: string;           // → { type: "string" }
  age: number;            // → { type: "number" }
  active: boolean;        // → { type: "boolean" }
  tags: string[];         // → { type: "array", items: { type: "string" } }
  optional?: string;      // → Optional parameter
})
```

### JSDoc → Descriptions

JSDoc comments become tool and parameter descriptions:

```typescript
/**
 * This becomes the tool description
 * @param name This becomes the parameter description
 * @param age Another parameter description
 */
async myTool(params: { name: string; age: number }) { ... }
```

## Advanced Features

### Return Values

Return values are automatically formatted:

```typescript
// Return a string
async greet(params: { name: string }) {
  return `Hello, ${params.name}!`;
}

// Return an object
async calculate(params: { a: number; b: number }) {
  return { sum: params.a + params.b, product: params.a * params.b };
}

// Return a formatted result
async process(params: { data: string }) {
  return {
    success: true,
    content: `Processed: ${params.data}`
  };
}
```

### Lifecycle Hooks

Implement optional lifecycle hooks:

```typescript
export class MyMCP extends SimpleMCP {
  private connection: DatabaseConnection;

  async onInitialize() {
    // Called when MCP is loaded
    this.connection = await connectToDatabase();
    console.log('MCP initialized!');
  }

  async onShutdown() {
    // Called when NCP shuts down
    await this.connection.close();
    console.log('MCP shut down!');
  }

  async myTool(params: { query: string }) {
    // Use the initialized connection
    return await this.connection.query(params.query);
  }
}
```

### Error Handling

Errors are automatically caught and returned as tool results:

```typescript
async divide(params: { a: number; b: number }) {
  if (params.b === 0) {
    throw new Error('Division by zero');
  }
  return params.a / params.b;
}
// → When b=0: { success: false, error: "Division by zero" }
```

### State Management

MCPs can maintain state:

```typescript
export class CounterMCP extends SimpleMCP {
  private count = 0;

  /**
   * Increment the counter
   */
  async increment() {
    this.count++;
    return { count: this.count };
  }

  /**
   * Get current count
   */
  async getCount() {
    return { count: this.count };
  }

  /**
   * Reset the counter
   */
  async reset() {
    this.count = 0;
    return { count: this.count };
  }
}
```

## Complete Example

Here's a complete example of a GitHub integration MCP:

```typescript
import { SimpleMCP } from '../base-mcp.js';

/**
 * GitHub Integration MCP
 * Provides tools for interacting with GitHub repositories
 */
export class GitHubMCP extends SimpleMCP {
  private apiToken: string | undefined;

  async onInitialize() {
    this.apiToken = process.env.GITHUB_TOKEN;
    if (!this.apiToken) {
      console.warn('GITHUB_TOKEN not set. Some features may not work.');
    }
  }

  /**
   * Create a new GitHub issue
   * @param repo Repository name (owner/repo)
   * @param title Issue title
   * @param body Issue description
   */
  async createIssue(params: {
    repo: string;
    title: string;
    body: string;
  }) {
    if (!this.apiToken) {
      throw new Error('GitHub token not configured');
    }

    const [owner, repoName] = params.repo.split('/');
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: params.title,
          body: params.body,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const issue = await response.json();
    return {
      success: true,
      issueNumber: issue.number,
      url: issue.html_url,
    };
  }

  /**
   * List repository issues
   * @param repo Repository name (owner/repo)
   * @param state Issue state (open, closed, or all)
   */
  async listIssues(params: {
    repo: string;
    state?: 'open' | 'closed' | 'all';
  }) {
    const [owner, repoName] = params.repo.split('/');
    const state = params.state || 'open';

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues?state=${state}`
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const issues = await response.json();
    return {
      count: issues.length,
      issues: issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
      })),
    };
  }
}
```

Save this as `~/.ncp/internal/github.mcp.ts` and it's ready to use:

```bash
ncp find "create github issue"
# → git-hub:create-issue

ncp run git-hub:create-issue \
  repo="owner/repo" \
  title="Bug found" \
  body="Description of the bug"
```

## Comparison: Old vs New

### Old Way (InternalMCP interface)

```typescript
export class MyMCP implements InternalMCP {
  name = 'my-mcp';
  description = 'My MCP';

  tools: InternalTool[] = [
    {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
    },
  ];

  async executeTool(toolName: string, parameters: any): Promise<InternalToolResult> {
    if (toolName === 'add') {
      return { success: true, content: String(parameters.a + parameters.b) };
    }
    return { success: false, error: 'Unknown tool' };
  }
}
```

### New Way (SimpleMCP)

```typescript
export class MyMCP extends SimpleMCP {
  /**
   * Add two numbers
   * @param a First number
   * @param b Second number
   */
  async add(params: { a: number; b: number }) {
    return parameters.a + parameters.b;
  }
}
```

**60% less code, same functionality!**

## Best Practices

1. **Use descriptive class names**: They become MCP names visible to users
2. **Write clear JSDoc**: It becomes the tool's documentation
3. **Type your parameters**: TypeScript types become the schema
4. **Handle errors gracefully**: Throw descriptive errors
5. **Keep methods focused**: One tool = one task
6. **Use lifecycle hooks**: Initialize resources in `onInitialize()`
7. **Test your MCPs**: Use `ncp find` and `ncp run` to test locally

## Troubleshooting

### MCP Not Loading

Check the logs for errors:
```bash
ncp find "test" --verbose
```

Common issues:
- File doesn't end with `.mcp.ts`
- Class doesn't extend `SimpleMCP`
- Class is not exported
- Syntax errors in the file

### Schemas Not Showing

Make sure:
- Methods have JSDoc comments
- Parameters are properly typed
- File is in a scanned directory

### Methods Not Appearing as Tools

Check:
- Method is `async`
- Method is public (doesn't start with `_`)
- Method is not a lifecycle hook (`onInitialize`, `onShutdown`)

## Migration Guide

Converting existing internal MCPs to SimpleMCP:

1. Change `implements InternalMCP` to `extends SimpleMCP`
2. Remove manual tool definitions
3. Convert `executeTool()` switch statement to individual methods
4. Add JSDoc comments
5. Add TypeScript parameter types
6. Remove the `name` and `description` properties (inferred from class)

That's it! Your MCP now has less code and is easier to maintain.
