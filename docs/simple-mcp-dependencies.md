# SimpleMCP Dependency Management

## Overview

SimpleMCPs support automatic dependency installation using inline declarations, similar to Python's UV (PEP 723). This allows MCP authors to use any npm package without requiring users to manually install dependencies.

## How It Works

### 1. Declare Dependencies

Use the `@dependencies` JSDoc tag in your MCP file:

```typescript
/**
 * GitHub MCP
 *
 * @dependencies octokit@^3.1.0
 */
export class GitHub {
  async createIssue(params: { repo: string; title: string }) {
    // Use octokit - it will be auto-installed
    const { Octokit } = await import('octokit');
    // ...
  }
}
```

### 2. Multiple Dependencies

Separate multiple dependencies with commas:

```typescript
/**
 * Advanced MCP
 *
 * @dependencies axios@^1.0.0, date-fns@^2.30.0, lodash@^4.17.0
 */
export class Advanced {
  async fetchAndFormat(params: { url: string }) {
    const axios = await import('axios');
    const { format } = await import('date-fns');
    const _ = await import('lodash');
    // ...
  }
}
```

### 3. Version Specifications

Follow npm semver conventions:

```typescript
/**
 * @dependencies
 *   axios@^1.0.0      // ^1.0.0 - compatible with 1.x
 *   lodash@~4.17.21   // ~4.17.21 - patch releases only
 *   zod@3.22.4        // 3.22.4 - exact version
 *   react@>=18.0.0    // >=18.0.0 - any version 18+
 */
```

## Installation Process

When NCP loads your MCP:

1. **Parses dependencies** from JSDoc `@dependencies` tag
2. **Creates MCP-specific cache** at `~/.ncp/mcp-cache/{mcp-name}/`
3. **Runs `npm install`** in the cache directory
4. **Imports succeed** because dependencies are now available

### Example Flow

```
User writes MCP:
  weather.mcp.ts with @dependencies axios@^1.0.0

NCP loads MCP:
  1. Extract: axios@^1.0.0
  2. Check: ~/.ncp/mcp-cache/weather/ (not found)
  3. Create: package.json in cache
  4. Install: npm install axios@^1.0.0
  5. Import: succeeds, uses cached axios
```

## Examples

### Example 1: HTTP Requests

```typescript
/**
 * Weather MCP
 *
 * @dependencies axios@^1.6.0
 */
export class Weather {
  /**
   * Get current weather
   * @param city City name
   */
  async current(params: { city: string }) {
    const axios = (await import('axios')).default;

    const API_KEY = process.env.WEATHER_API_KEY;
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${params.city}&appid=${API_KEY}`
    );

    return {
      city: params.city,
      temp: response.data.main.temp,
      description: response.data.weather[0].description,
    };
  }
}
```

### Example 2: Date Formatting

```typescript
/**
 * Date MCP
 *
 * @dependencies date-fns@^2.30.0
 */
export class Date {
  /**
   * Format a date
   * @param date Date string (ISO format)
   * @param format Format string (e.g., "yyyy-MM-dd")
   */
  async format(params: { date: string; format: string }) {
    const { format, parseISO } = await import('date-fns');

    const dateObj = parseISO(params.date);
    const formatted = format(dateObj, params.format);

    return {
      original: params.date,
      formatted,
    };
  }

  /**
   * Add days to a date
   * @param date Date string
   * @param days Number of days to add
   */
  async addDays(params: { date: string; days: number }) {
    const { addDays, parseISO, formatISO } = await import('date-fns');

    const dateObj = parseISO(params.date);
    const newDate = addDays(dateObj, params.days);

    return {
      original: params.date,
      result: formatISO(newDate),
    };
  }
}
```

### Example 3: Data Validation

```typescript
/**
 * Validation MCP
 *
 * @dependencies zod@^3.22.0
 */
export class Validation {
  /**
   * Validate email address
   * @param email Email to validate
   */
  async email(params: { email: string }) {
    const { z } = await import('zod');

    const emailSchema = z.string().email();

    try {
      emailSchema.parse(params.email);
      return { valid: true, email: params.email };
    } catch (error) {
      return { valid: false, error: 'Invalid email format' };
    }
  }

  /**
   * Validate JSON against schema
   * @param data JSON data
   * @param schema Zod schema definition
   */
  async json(params: { data: any }) {
    const { z } = await import('zod');

    // Example: validate user object
    const userSchema = z.object({
      name: z.string(),
      email: z.string().email(),
      age: z.number().min(18),
    });

    try {
      const validated = userSchema.parse(params.data);
      return { valid: true, data: validated };
    } catch (error: any) {
      return { valid: false, errors: error.errors };
    }
  }
}
```

## Cache Management

### View Cache

```bash
ls ~/.ncp/mcp-cache/
```

Shows:
```
weather/
date/
validation/
github/
```

Each directory contains:
- `package.json` - Dependency specifications
- `node_modules/` - Installed packages

### Clear Cache

To force reinstallation (e.g., after updating dependency versions):

```bash
rm -rf ~/.ncp/mcp-cache/{mcp-name}
```

NCP will reinstall on next load.

## Best Practices

### 1. Use Dynamic Imports

Always use `await import()` to import dependencies:

```typescript
// ✅ Good
const axios = (await import('axios')).default;
const { format } = await import('date-fns');

// ❌ Bad (top-level imports won't find dependencies)
import axios from 'axios';
```

### 2. Pin Versions

Use specific version ranges to ensure reproducibility:

```typescript
/**
 * @dependencies axios@^1.6.0, zod@3.22.4
 */
```

### 3. Minimize Dependencies

Only include what you actually use:

```typescript
// ✅ Good
/**
 * @dependencies date-fns@^2.30.0
 */

// ❌ Bad (unnecessary dependencies)
/**
 * @dependencies date-fns@^2.30.0, lodash@^4.17.0, moment@^2.29.0
 */
```

### 4. Handle Import Errors

Gracefully handle missing dependencies:

```typescript
async getData(params: { url: string }) {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(params.url);
    return response.data;
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('axios dependency not installed. Check @dependencies tag.');
    }
    throw error;
  }
}
```

## Comparison with Other Systems

### Python UV (PEP 723)

```python
# /// script
# dependencies = [
#   "requests>=2.31.0",
#   "beautifulsoup4>=4.12.0",
# ]
# ///

import requests
from bs4 import BeautifulSoup
```

### SimpleMCP (TypeScript)

```typescript
/**
 * @dependencies axios@^1.6.0, cheerio@^1.0.0
 */

export class Scraper {
  async fetch(params: { url: string }) {
    const axios = (await import('axios')).default;
    const cheerio = (await import('cheerio')).default;
    // ...
  }
}
```

**Same concept, TypeScript syntax!**

## Troubleshooting

### Dependencies Not Installing

**Problem**: MCP fails to import dependencies

**Solutions**:
1. Check JSDoc syntax: `@dependencies package@version`
2. Verify npm is installed: `npm --version`
3. Check logs for installation errors
4. Try clearing cache: `rm -rf ~/.ncp/mcp-cache/`

### Module Not Found

**Problem**: `Cannot find module 'package-name'`

**Solutions**:
1. Ensure you're using `await import()` (dynamic import)
2. Check spelling in `@dependencies` tag
3. Verify package exists on npm
4. Check NCP logs for installation errors

### Version Conflicts

**Problem**: Different MCPs need different versions of the same package

**Solution**: Each MCP has its own `node_modules`, so no conflicts!

```
~/.ncp/mcp-cache/
  ├── mcp-a/node_modules/axios@1.0.0
  └── mcp-b/node_modules/axios@2.0.0
```

## Limitations

1. **Only npm packages**: Can't use local packages or git URLs
2. **Install time**: First load requires dependency installation (5-30 seconds)
3. **Disk space**: Each MCP has its own `node_modules` (can be large)
4. **No peer dependencies**: Automatic resolution only

## Future Enhancements

- [ ] Bun/pnpm support for faster installs
- [ ] Shared dependency caching
- [ ] Pre-install step for published MCPs
- [ ] Dependency lock files
- [ ] Version update notifications

## Summary

SimpleMCP dependency management makes it trivial to create powerful MCPs with external dependencies:

1. **Declare** with `@dependencies` JSDoc tag
2. **Import** with `await import()`
3. **Use** - NCP handles the rest!

No manual installation, no package.json management, no build steps. Just write code and go! 🚀
