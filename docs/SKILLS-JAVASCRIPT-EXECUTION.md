# JavaScript/TypeScript Skills Execution in NCP

## Overview

NCP skills are **JavaScript/TypeScript first**. Skills contain executable code examples in their SKILL.md documentation that AI can directly use in code mode. This approach provides:

- ✅ **No installation required** - Works immediately
- ✅ **Cross-platform** - Runs everywhere (Node.js, Deno, browser)
- ✅ **Sandboxed security** - Isolated execution environment
- ✅ **Rich ecosystem** - Access to entire npm registry
- ✅ **Type safety** - TypeScript support with IntelliSense

## How It Works

### 1. Skills Contain JavaScript Examples

Skills include executable JavaScript/TypeScript code blocks:

```markdown
---
name: pdf-processing
description: PDF creation and manipulation with pdf-lib
---

# PDF Processing

## Creating a PDF

\`\`\`javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function createPDF() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello World!', {
    x: 50,
    y: 350,
    size: 30,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
\`\`\`
```

### 2. AI Reads Skill and Learns Patterns

```typescript
// AI executes this to learn
const skillContent = await skill['pdf-processing']({ depth: 2 });

// AI now has:
// - Full SKILL.md with all JavaScript examples
// - Available resources (reference/, scripts/)
// - Knowledge of pdf-lib API patterns
```

### 3. AI Writes Code Using Patterns

AI adapts the examples for the specific task:

```typescript
// AI-generated code based on skill examples
const code = `
import { PDFDocument, rgb } from 'pdf-lib';

async function createInvoice(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  
  const font = await pdfDoc.embedFont('Helvetica');
  
  // Add invoice header
  page.drawText('INVOICE', {
    x: 50,
    y: 792,
    size: 24,
    font,
    color: rgb(0, 0, 0)
  });
  
  // Add invoice details from data
  page.drawText(\`Invoice #: \${data.invoiceNumber}\`, {
    x: 50,
    y: 750,
    size: 12,
    font
  });
  
  return await pdfDoc.save();
}

// Execute with provided data
const pdfBytes = await createInvoice({
  invoiceNumber: "INV-001",
  date: "2024-12-23"
});

return pdfBytes;
`;

await code.run({ code });
```

### 4. Code Executes in Sandboxed Environment

NCP's code executor:
- ✅ Validates code with TypeScript AST analysis
- ✅ Injects MCP tool namespaces
- ✅ Provides memory limits (128MB default)
- ✅ Enforces execution timeout (30s default)
- ✅ Runs in isolated V8 context or Worker Thread

## Popular JavaScript Libraries for Skills

### Document Processing

#### PDF - pdf-lib
```javascript
import { PDFDocument, rgb } from 'pdf-lib';

// Create, edit, merge PDFs
const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage();
page.drawText('Hello!', { x: 50, y: 50 });
const bytes = await pdfDoc.save();
```

#### DOCX - docx
```javascript
import { Document, Paragraph, TextRun, Packer } from 'docx';

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({
        children: [new TextRun("Hello World")]
      })
    ]
  }]
});

const buffer = await Packer.toBuffer(doc);
```

#### PPTX - pptxgenjs
```javascript
import pptxgen from 'pptxgenjs';

let pres = new pptxgen();
let slide = pres.addSlide();
slide.addText('Hello', { x: 1, y: 1, fontSize: 24 });
const buffer = await pres.write({ outputType: 'arraybuffer' });
```

#### XLSX - xlsx (SheetJS)
```javascript
import * as XLSX from 'xlsx';

const ws = XLSX.utils.aoa_to_sheet([
  ['Name', 'Age'],
  ['John', 30],
  ['Jane', 25]
]);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, 'output.xlsx');
```

### Data Processing

```javascript
// CSV parsing
import Papa from 'papaparse';

const csv = Papa.parse(csvString, { header: true });

// JSON manipulation
import { JSONPath } from 'jsonpath-plus';

const result = JSONPath({ path: '$.users[*].name', json: data });

// Data transformation
import _ from 'lodash';

const grouped = _.groupBy(items, 'category');
```

### Web Scraping & HTTP

```javascript
// HTTP requests
import axios from 'axios';

const response = await axios.get('https://api.example.com/data');

// HTML parsing
import * as cheerio from 'cheerio';

const $ = cheerio.load(html);
const titles = $('h1').map((i, el) => $(el).text()).get();
```

## Creating JavaScript Skills

### Skill Structure

```
my-skill/
├── SKILL.md                 # Main documentation with JS examples
├── reference/
│   ├── advanced.md          # Advanced patterns
│   └── api-reference.md     # Complete API documentation
├── scripts/
│   ├── helper.js            # Utility scripts
│   └── examples.js          # Working examples
└── package.json             # Optional: npm dependencies
```

### SKILL.md Template

```markdown
---
name: my-skill
description: Brief description of what this skill does
---

# My Skill

## Overview

Description of the skill and when to use it.

## Quick Start

\`\`\`javascript
// Simple example that works immediately
import { SomeLibrary } from 'some-package';

async function example() {
  const result = await SomeLibrary.doSomething();
  return result;
}
\`\`\`

## Common Patterns

### Pattern 1: Basic Usage

\`\`\`javascript
// Code example showing basic usage
\`\`\`

### Pattern 2: Advanced Usage

\`\`\`javascript
// Code example showing advanced features
\`\`\`

## Error Handling

\`\`\`javascript
try {
  const result = await operation();
} catch (error) {
  // Handle specific error types
  if (error.code === 'ENOENT') {
    // File not found
  }
}
\`\`\`

## Best Practices

- Use async/await for asynchronous operations
- Handle errors gracefully
- Validate inputs before processing
- Return structured data

## Reference

For more details, see [reference/advanced.md](./reference/advanced.md)
```

## Package Management

### Installing Dependencies

Dependencies are automatically installed when imported in code mode:

```javascript
// These imports trigger automatic installation if needed
import pdfLib from 'pdf-lib';
import docx from 'docx';
import pptxgen from 'pptxgenjs';
```

### Manual Installation

If automatic installation doesn't work, use npm MCP:

```typescript
// Install package via npm MCP
await npm.install({ package: 'pdf-lib' });

// Then use in code
import { PDFDocument } from 'pdf-lib';
```

## Examples

### Example 1: PDF Invoice Generator

**Skill**: Create professional invoices

```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function generateInvoice(invoiceData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Header
  page.drawText('INVOICE', {
    x: 50,
    y: 792,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0.5)
  });
  
  // Invoice details
  let y = 750;
  page.drawText(`Invoice #: ${invoiceData.number}`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText(`Date: ${invoiceData.date}`, { x: 50, y, size: 12, font });
  y -= 40;
  
  // Items table
  page.drawText('Description', { x: 50, y, size: 12, font: boldFont });
  page.drawText('Amount', { x: 450, y, size: 12, font: boldFont });
  y -= 20;
  
  invoiceData.items.forEach(item => {
    page.drawText(item.description, { x: 50, y, size: 10, font });
    page.drawText(`$${item.amount.toFixed(2)}`, { x: 450, y, size: 10, font });
    y -= 20;
  });
  
  // Total
  y -= 20;
  const total = invoiceData.items.reduce((sum, item) => sum + item.amount, 0);
  page.drawText('Total:', { x: 400, y, size: 12, font: boldFont });
  page.drawText(`$${total.toFixed(2)}`, { x: 450, y, size: 12, font: boldFont });
  
  return await pdfDoc.save();
}

// Usage
const invoice = await generateInvoice({
  number: 'INV-001',
  date: '2024-12-23',
  items: [
    { description: 'Web Development', amount: 5000 },
    { description: 'Consulting', amount: 2000 }
  ]
});
```

### Example 2: Excel Report Generator

**Skill**: Create formatted spreadsheets

```javascript
import * as XLSX from 'xlsx';

function generateReport(data) {
  // Create worksheet from array of arrays
  const ws = XLSX.utils.aoa_to_sheet([
    ['Report Generated:', new Date().toISOString()],
    [],
    ['Name', 'Sales', 'Region', 'Performance'],
    ...data.map(row => [
      row.name,
      row.sales,
      row.region,
      row.sales > 10000 ? 'Excellent' : 'Good'
    ])
  ]);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // Name
    { wch: 10 }, // Sales
    { wch: 15 }, // Region
    { wch: 15 }  // Performance
  ];
  
  // Create workbook and add worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
  
  // Generate buffer
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Usage
const reportData = [
  { name: 'John Doe', sales: 15000, region: 'North' },
  { name: 'Jane Smith', sales: 8000, region: 'South' }
];

const excelBuffer = generateReport(reportData);
```

## Best Practices

### 1. Use Async/Await Consistently

```javascript
// ✅ Good
async function processDocument() {
  const doc = await loadDocument();
  const result = await processContent(doc);
  return result;
}

// ❌ Bad - mixing callbacks and promises
function processDocument(callback) {
  loadDocument().then(doc => {
    processContent(doc, callback);
  });
}
```

### 2. Handle Errors Gracefully

```javascript
async function safeOperation() {
  try {
    return await riskyOperation();
  } catch (error) {
    // Log error for debugging
    console.error('Operation failed:', error.message);
    
    // Return safe fallback
    return { success: false, error: error.message };
  }
}
```

### 3. Validate Inputs

```javascript
function processUser(user) {
  // Validate required fields
  if (!user || !user.name || !user.email) {
    throw new Error('Invalid user: name and email required');
  }
  
  // Validate format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(user.email)) {
    throw new Error('Invalid email format');
  }
  
  // Process valid data
  return transformUser(user);
}
```

### 4. Return Structured Data

```javascript
// ✅ Good - structured response
async function createDocument() {
  try {
    const doc = await generateDoc();
    return {
      success: true,
      document: doc,
      metadata: {
        size: doc.length,
        created: new Date()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ❌ Bad - unclear return values
async function createDocument() {
  const doc = await generateDoc();
  return doc; // What if it fails? No context.
}
```

## Troubleshooting

### Package Not Found

If import fails, install explicitly:

```typescript
// If this fails:
import pdfLib from 'pdf-lib';

// Try manual install:
await npm.install({ package: 'pdf-lib' });
```

### Memory Limit Exceeded

Increase memory limit for large operations:

```typescript
await code.run({
  code: largeOperation,
  memory: 256 * 1024 * 1024 // 256MB
});
```

### Timeout Issues

Increase timeout for long-running operations:

```typescript
await code.run({
  code: slowOperation,
  timeout: 60000 // 60 seconds
});
```

## Migration from Python Skills

If you have Python-based skills, here are JavaScript equivalents:

| Python | JavaScript | npm Package |
|--------|------------|-------------|
| pypdf | PDFDocument | pdf-lib |
| python-docx | Document | docx |
| python-pptx | Presentation | pptxgenjs |
| pandas | DataFrame operations | danfojs, lodash |
| requests | HTTP client | axios, fetch |
| beautifulsoup4 | HTML parser | cheerio |
| Pillow (PIL) | Image processing | sharp, jimp |
| numpy | Numeric arrays | ndarray, numjs |

## Summary

JavaScript/TypeScript skills in NCP:

- ✅ Work immediately without installation
- ✅ Execute in secure sandboxed environment  
- ✅ Access to entire npm ecosystem
- ✅ Type-safe with TypeScript support
- ✅ Cross-platform compatibility
- ✅ AI can read, learn, and execute patterns
- ✅ Full integration with code mode

Skills are **executable documentation** that teach AI how to solve problems using JavaScript!
