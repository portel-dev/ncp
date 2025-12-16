# SimpleMCP Quick Start

## Two Ways to Create MCPs

### Option 1: Plain Class (Recommended - Like Restler!)

No framework coupling - just write plain TypeScript:

```typescript
/**
 * Weather MCP - No base class needed!
 */
export class Weather {
  async current(params: { city: string }) {
    return { city: params.city, temp: 72, condition: 'sunny' };
  }
}
```

**That's it!** Drop it in `~/.ncp/internal/weather.mcp.ts` and it works.

### Option 2: Extend SimpleMCP (Optional)

For lifecycle hooks or shared utilities:

```typescript
import { SimpleMCP } from 'ncp/internal-mcps/base-mcp';

export class Weather extends SimpleMCP {
  async onInitialize() {
    // Called when MCP loads
  }

  async current(params: { city: string }) {
    return { city: params.city, temp: 72 };
  }
}
```

**Both work identically!** Choose based on your needs.

## Quick Win MCPs You Can Build

### 🎯 Ultra Simple (5-10 minutes)

#### 1. Math MCP
```typescript
export class Math {
  async random(params: { min: number; max: number }) {
    return Math.floor(Math.random() * (params.max - params.min + 1)) + params.min;
  }

  async percentage(params: { value: number; total: number }) {
    return (params.value / params.total) * 100;
  }
}
```

**Usage**: `ncp run math random --min 1 --max 100`

#### 2. String MCP
```typescript
export class String {
  async uppercase(params: { text: string }) {
    return params.text.toUpperCase();
  }

  async slugify(params: { text: string }) {
    return params.text.toLowerCase().replace(/\s+/g, '-');
  }
}
```

**Usage**: `ncp run string slugify --text "Hello World"`

#### 3. Encode MCP
```typescript
export class Encode {
  async base64(params: { text: string; action: 'encode' | 'decode' }) {
    if (params.action === 'encode') {
      return Buffer.from(params.text).toString('base64');
    } else {
      return Buffer.from(params.text, 'base64').toString('utf-8');
    }
  }

  async url(params: { text: string; action: 'encode' | 'decode' }) {
    return params.action === 'encode'
      ? encodeURIComponent(params.text)
      : decodeURIComponent(params.text);
  }
}
```

**Usage**: `ncp run encode base64 --text "Hello" --action encode`

### 🚀 With Dependencies (15-20 minutes)

#### 4. HTTP MCP
```typescript
/**
 * @dependencies axios@^1.6.0
 */
export class HTTP {
  async get(params: { url: string }) {
    const axios = (await import('axios')).default;
    const response = await axios.get(params.url);
    return response.data;
  }

  async post(params: { url: string; data: any }) {
    const axios = (await import('axios')).default;
    const response = await axios.post(params.url, params.data);
    return response.data;
  }
}
```

**Usage**: `ncp run http get --url "https://api.github.com/users/octocat"`

#### 5. Date MCP
```typescript
/**
 * @dependencies date-fns@^2.30.0
 */
export class Date {
  async format(params: { date: string; format: string }) {
    const { format, parseISO } = await import('date-fns');
    return format(parseISO(params.date), params.format);
  }

  async addDays(params: { date: string; days: number }) {
    const { addDays, parseISO, formatISO } = await import('date-fns');
    return formatISO(addDays(parseISO(params.date), params.days));
  }
}
```

**Usage**: `ncp run date format --date "2024-01-01" --format "MMMM dd, yyyy"`

#### 6. Validation MCP
```typescript
/**
 * @dependencies validator@^13.11.0
 */
export class Validation {
  async email(params: { email: string }) {
    const validator = (await import('validator')).default;
    return { valid: validator.isEmail(params.email) };
  }

  async url(params: { url: string }) {
    const validator = (await import('validator')).default;
    return { valid: validator.isURL(params.url) };
  }
}
```

**Usage**: `ncp run validation email --email "test@example.com"`

### 💪 More Complex (30+ minutes)

#### 7. GitHub MCP
```typescript
/**
 * @dependencies octokit@^3.1.0
 */
export class GitHub {
  async createIssue(params: { repo: string; title: string; body: string }) {
    const { Octokit } = await import('octokit');
    const [owner, repoName] = params.repo.split('/');

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const issue = await octokit.rest.issues.create({
      owner,
      repo: repoName,
      title: params.title,
      body: params.body,
    });

    return {
      number: issue.data.number,
      url: issue.data.html_url,
    };
  }

  async listIssues(params: { repo: string }) {
    const { Octokit } = await import('octokit');
    const [owner, repoName] = params.repo.split('/');

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const issues = await octokit.rest.issues.listForRepo({
      owner,
      repo: repoName,
    });

    return issues.data.map(i => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
    }));
  }
}
```

**Usage**: `ncp run github create-issue --repo "owner/repo" --title "Bug" --body "Description"`

#### 8. JSON MCP
```typescript
/**
 * @dependencies jsonpath-plus@^7.2.0
 */
export class JSON {
  async query(params: { data: any; path: string }) {
    const { JSONPath } = await import('jsonpath-plus');
    return JSONPath({ path: params.path, json: params.data });
  }

  async validate(params: { data: string }) {
    try {
      JSON.parse(params.data);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}
```

**Usage**: `ncp run json query --data '{"users":[{"name":"Alice"}]}' --path "$.users[*].name"`

## Complete Example: Weather MCP

```typescript
/**
 * Weather MCP - Get weather information
 *
 * @dependencies axios@^1.6.0
 */

export class Weather {
  private apiKey = process.env.OPENWEATHER_API_KEY;

  /**
   * Get current weather for a city
   * @param city City name
   */
  async current(params: { city: string }) {
    if (!this.apiKey) {
      throw new Error('OPENWEATHER_API_KEY environment variable not set');
    }

    const axios = (await import('axios')).default;

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather`,
      {
        params: {
          q: params.city,
          appid: this.apiKey,
          units: 'metric',
        },
      }
    );

    return {
      city: response.data.name,
      temperature: response.data.main.temp,
      feelsLike: response.data.main.feels_like,
      description: response.data.weather[0].description,
      humidity: response.data.main.humidity,
    };
  }

  /**
   * Get 5-day forecast
   * @param city City name
   */
  async forecast(params: { city: string }) {
    if (!this.apiKey) {
      throw new Error('OPENWEATHER_API_KEY environment variable not set');
    }

    const axios = (await import('axios')).default;

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast`,
      {
        params: {
          q: params.city,
          appid: this.apiKey,
          units: 'metric',
        },
      }
    );

    return {
      city: response.data.city.name,
      forecasts: response.data.list.slice(0, 5).map((item: any) => ({
        date: item.dt_txt,
        temp: item.main.temp,
        description: item.weather[0].description,
      })),
    };
  }
}
```

Save as `~/.ncp/internal/weather.mcp.ts`, then:

```bash
# First time - dependencies auto-install
ncp run weather current --city "London"

# Returns:
{
  "city": "London",
  "temperature": 15.5,
  "feelsLike": 14.2,
  "description": "light rain",
  "humidity": 82
}
```

## Development Workflow

### 1. Create MCP File

```bash
# Create in global directory (available everywhere)
nano ~/.ncp/internal/my-tool.mcp.ts

# Or project-local (only this project)
nano .ncp/internal/my-tool.mcp.ts
```

### 2. Write Class

```typescript
export class MyTool {
  async doSomething(params: { input: string }) {
    return { result: params.input.toUpperCase() };
  }
}
```

### 3. Test It

```bash
# NCP auto-discovers and loads it
ncp find "do something"

# Run it
ncp run my-tool do-something --input "hello"
```

### 4. Iterate

- Edit the file
- Run `ncp run` again (auto-reloads)
- No build step needed!

## Tips

### 1. Use Descriptive Names

```typescript
// ✅ Good
async convertCurrency(params: { amount: number; from: string; to: string })

// ❌ Bad
async convert(params: { a: number; f: string; t: string })
```

### 2. Add JSDoc Comments

```typescript
/**
 * Convert currency using live exchange rates
 * @param amount Amount to convert
 * @param from Source currency code (USD, EUR, etc.)
 * @param to Target currency code
 */
async convertCurrency(params: { amount: number; from: string; to: string })
```

### 3. Handle Errors Gracefully

```typescript
async getData(params: { url: string }) {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(params.url);
    return response.data;
  } catch (error: any) {
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}
```

### 4. Return Structured Data

```typescript
// ✅ Good - structured
return {
  success: true,
  data: [...],
  count: 5
};

// ❌ Bad - just data
return [...];
```

## Quick Wins Summary

| MCP | Lines of Code | Dependencies | Use Case |
|-----|---------------|--------------|----------|
| Math | ~50 | None | Random numbers, percentages, averages |
| String | ~80 | None | Text manipulation |
| Encode | ~30 | None | Base64, URL encoding |
| HTTP | ~40 | axios | API requests |
| Date | ~50 | date-fns | Date formatting |
| Validation | ~40 | validator | Email, URL validation |
| GitHub | ~60 | octokit | GitHub automation |
| Weather | ~70 | axios | Weather data |

**All under 100 lines of code!** 🎯

## Next Steps

1. Pick a simple MCP from the list
2. Create `~/.ncp/internal/name.mcp.ts`
3. Write the class
4. Test with `ncp run`
5. Share with the community!

Happy building! 🚀
