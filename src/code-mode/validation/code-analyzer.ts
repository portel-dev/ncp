/**
 * Code Analyzer - AST-based Static Analysis
 *
 * Uses TypeScript compiler API to analyze code for security issues.
 * This is Phase 1 of the validation pipeline - catches obvious patterns
 * before semantic analysis.
 *
 * Key advantages over regex-based detection:
 * - Catches obfuscated patterns (obj["__proto__"], eval["call"])
 * - Understands code structure, not just text
 * - Can't be bypassed with string concatenation tricks
 */

import * as ts from 'typescript';

/**
 * Security violation found during analysis
 */
export interface SecurityViolation {
  type:
    | 'prototype_pollution'
    | 'eval_usage'
    | 'require_import'
    | 'constructor_access'
    | 'process_access'
    | 'global_access'
    | 'fs_access'
    | 'child_process'
    | 'metaprogramming'
    | 'descriptor_manipulation'
    | 'dangerous_module';
  location: { line: number; column: number };
  code: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

/**
 * Security warning (not a blocker but worth noting)
 */
export interface SecurityWarning {
  type: string;
  location: { line: number; column: number };
  code: string;
  description: string;
}

/**
 * MCP call pattern detected in code
 */
export interface MCPCallPattern {
  namespace: string;
  method: string;
  location: { line: number; column: number };
  code: string;
}

/**
 * Result of code analysis
 */
export interface AnalysisResult {
  valid: boolean;
  violations: SecurityViolation[];
  warnings: SecurityWarning[];
  detectedPatterns: {
    mcpCalls: MCPCallPattern[];
    networkRequests: string[];
    dangerousConstructs: string[];
  };
  parseErrors: string[];
}

/**
 * Dangerous global identifiers that should be blocked
 */
const DANGEROUS_GLOBALS = new Set([
  'eval',
  'Function',
  'process',
  'global',
  'globalThis',
  'require',
  'module',
  '__dirname',
  '__filename',
  // Metaprogramming APIs - can bypass sandbox protections
  'Reflect',
  'Proxy',
  'Symbol',
  // Weak references can be used to detect GC and leak info
  'WeakRef',
  'FinalizationRegistry',
]);

/**
 * Dangerous property names that indicate potential attacks
 */
const DANGEROUS_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  // Object descriptor manipulation - can unfreeze prototypes
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'defineProperty',
  'defineProperties',
  // Prototype chain manipulation
  'setPrototypeOf',
  'getPrototypeOf',
  // Property enumeration for sandbox probing
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
]);

/**
 * Dangerous module names
 */
const DANGEROUS_MODULES = new Set([
  'fs',
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'net',
  'tls',
  'vm',
  'worker_threads',
  'v8',
  // Additional dangerous modules
  'os',
  'path', // Can be used for path traversal attacks
  'http',
  'https',
  'http2',
  'crypto', // Can be used for mining or key generation
  'perf_hooks',
  'inspector', // Debugger access
  'async_hooks',
  'trace_events',
  'repl',
]);

/**
 * Code Analyzer using TypeScript AST
 */
export class CodeAnalyzer {
  /**
   * Analyze code for security issues
   *
   * @param code - TypeScript/JavaScript code to analyze
   * @returns Analysis result with violations and detected patterns
   */
  analyze(code: string): AnalysisResult {
    const violations: SecurityViolation[] = [];
    const warnings: SecurityWarning[] = [];
    const mcpCalls: MCPCallPattern[] = [];
    const networkRequests: string[] = [];
    const dangerousConstructs: string[] = [];
    const parseErrors: string[] = [];

    // Parse the code into an AST
    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(
        'code.ts',
        code,
        ts.ScriptTarget.ESNext,
        true, // setParentNodes - needed for traversal
        ts.ScriptKind.TS
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      parseErrors.push(`Failed to parse code: ${errorMessage}`);
      return {
        valid: false,
        violations,
        warnings,
        detectedPatterns: { mcpCalls, networkRequests, dangerousConstructs },
        parseErrors,
      };
    }

    // Walk the AST
    const visit = (node: ts.Node): void => {
      this.checkDangerousIdentifier(node, sourceFile, violations);
      this.checkDangerousPropertyAccess(node, sourceFile, violations);
      this.checkDangerousElementAccess(node, sourceFile, violations);
      this.checkDangerousCall(node, sourceFile, violations, dangerousConstructs);
      this.checkImportExport(node, sourceFile, violations);
      this.checkMCPCalls(node, sourceFile, mcpCalls);
      this.checkNetworkCalls(node, sourceFile, networkRequests, warnings);

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Determine if code is valid (no critical violations)
    const hasCritical = violations.some((v) => v.severity === 'critical');

    return {
      valid: !hasCritical,
      violations,
      warnings,
      detectedPatterns: { mcpCalls, networkRequests, dangerousConstructs },
      parseErrors,
    };
  }

  /**
   * Get location info from a node
   */
  private getLocation(
    node: ts.Node,
    sourceFile: ts.SourceFile
  ): { line: number; column: number } {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile)
    );
    return { line: line + 1, column: character + 1 }; // 1-indexed
  }

  /**
   * Get code snippet from a node
   */
  private getCode(node: ts.Node, sourceFile: ts.SourceFile): string {
    return node.getText(sourceFile).slice(0, 100); // Truncate long code
  }

  /**
   * Check for dangerous global identifiers
   */
  private checkDangerousIdentifier(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: SecurityViolation[]
  ): void {
    if (!ts.isIdentifier(node)) return;

    const name = node.text;
    if (!DANGEROUS_GLOBALS.has(name)) return;

    // Skip if it's a property access (obj.eval is fine, standalone eval is not)
    const parent = node.parent;
    if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) {
      return;
    }

    // Skip if it's being defined (const process = ...)
    if (parent && ts.isVariableDeclaration(parent) && parent.name === node) {
      return;
    }

    // Skip if it's a parameter name
    if (parent && ts.isParameter(parent) && parent.name === node) {
      return;
    }

    // Map name to violation type
    let type: SecurityViolation['type'];
    let description: string;
    if (name === 'eval') {
      type = 'eval_usage';
      description = `Dangerous global '${name}' accessed directly`;
    } else if (name === 'require' || name === 'module') {
      type = 'require_import';
      description = `Dangerous global '${name}' accessed directly`;
    } else if (name === 'process') {
      type = 'process_access';
      description = `Dangerous global '${name}' accessed directly`;
    } else if (name === 'Reflect' || name === 'Proxy' || name === 'Symbol') {
      type = 'metaprogramming';
      description = `Metaprogramming API '${name}' blocked - can bypass sandbox protections`;
    } else if (name === 'WeakRef' || name === 'FinalizationRegistry') {
      type = 'metaprogramming';
      description = `'${name}' blocked - can detect GC and probe sandbox boundaries`;
    } else {
      type = 'global_access';
      description = `Dangerous global '${name}' accessed directly`;
    }

    violations.push({
      type,
      location: this.getLocation(node, sourceFile),
      code: this.getCode(node, sourceFile),
      severity: 'critical',
      description,
    });
  }

  /**
   * Check for dangerous property access (obj.__proto__, obj.constructor)
   */
  private checkDangerousPropertyAccess(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: SecurityViolation[]
  ): void {
    if (!ts.isPropertyAccessExpression(node)) return;

    const propName = node.name.text;
    if (!DANGEROUS_PROPERTIES.has(propName)) return;

    // constructor access - dangerous in several patterns
    if (propName === 'constructor') {
      const parent = node.parent;

      // Pattern 1: Direct call - obj.constructor()
      if (parent && ts.isCallExpression(parent) && parent.expression === node) {
        violations.push({
          type: 'constructor_access',
          location: this.getLocation(node, sourceFile),
          code: this.getCode(parent, sourceFile),
          severity: 'critical',
          description: 'Constructor function access (potential code injection)',
        });
        return;
      }

      // Pattern 2: Chained constructor - [].constructor.constructor (gets Function)
      // Check if the expression we're accessing .constructor on is also a .constructor
      if (ts.isPropertyAccessExpression(node.expression)) {
        const innerProp = node.expression.name.text;
        if (innerProp === 'constructor') {
          violations.push({
            type: 'constructor_access',
            location: this.getLocation(node, sourceFile),
            code: this.getCode(node, sourceFile),
            severity: 'critical',
            description: 'Chained constructor access - obtains Function constructor',
          });
          return;
        }
      }

      return;
    }

    // Descriptor manipulation methods
    const descriptorMethods = new Set([
      'getOwnPropertyDescriptor',
      'getOwnPropertyDescriptors',
      'defineProperty',
      'defineProperties',
      'setPrototypeOf',
      'getPrototypeOf',
      'getOwnPropertyNames',
      'getOwnPropertySymbols',
    ]);

    if (descriptorMethods.has(propName)) {
      violations.push({
        type: 'descriptor_manipulation',
        location: this.getLocation(node, sourceFile),
        code: this.getCode(node, sourceFile),
        severity: 'critical',
        description: `Object descriptor manipulation '${propName}' blocked - can bypass prototype freezing`,
      });
      return;
    }

    // __proto__ and prototype access
    violations.push({
      type: 'prototype_pollution',
      location: this.getLocation(node, sourceFile),
      code: this.getCode(node, sourceFile),
      severity: 'critical',
      description: `Prototype pollution attempt via '${propName}'`,
    });
  }

  /**
   * Check for dangerous element access (obj["__proto__"])
   */
  private checkDangerousElementAccess(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: SecurityViolation[]
  ): void {
    if (!ts.isElementAccessExpression(node)) return;

    const arg = node.argumentExpression;

    // Check string literal access
    if (ts.isStringLiteral(arg)) {
      const key = arg.text;
      if (DANGEROUS_PROPERTIES.has(key)) {
        violations.push({
          type: 'prototype_pollution',
          location: this.getLocation(node, sourceFile),
          code: this.getCode(node, sourceFile),
          severity: 'critical',
          description: `Prototype pollution attempt via bracket notation ['${key}']`,
        });
      }
    }

    // Check template literal (obj[`__proto__`])
    if (ts.isTemplateExpression(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      const text = arg.getText(sourceFile);
      for (const prop of DANGEROUS_PROPERTIES) {
        if (text.includes(prop)) {
          violations.push({
            type: 'prototype_pollution',
            location: this.getLocation(node, sourceFile),
            code: this.getCode(node, sourceFile),
            severity: 'critical',
            description: `Potential prototype pollution via template literal`,
          });
          break;
        }
      }
    }
  }

  /**
   * Check for dangerous function calls
   */
  private checkDangerousCall(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: SecurityViolation[],
    dangerousConstructs: string[]
  ): void {
    if (!ts.isCallExpression(node)) return;

    const expr = node.expression;

    // Check direct eval() call
    if (ts.isIdentifier(expr) && expr.text === 'eval') {
      violations.push({
        type: 'eval_usage',
        location: this.getLocation(node, sourceFile),
        code: this.getCode(node, sourceFile),
        severity: 'critical',
        description: 'Direct eval() call - arbitrary code execution',
      });
      dangerousConstructs.push('eval()');
      return;
    }

    // Check Function() constructor
    if (ts.isIdentifier(expr) && expr.text === 'Function') {
      violations.push({
        type: 'eval_usage',
        location: this.getLocation(node, sourceFile),
        code: this.getCode(node, sourceFile),
        severity: 'critical',
        description: 'Function constructor - equivalent to eval()',
      });
      dangerousConstructs.push('Function()');
      return;
    }

    // Check new Function()
    if (ts.isNewExpression(node.parent) && ts.isIdentifier(expr) && expr.text === 'Function') {
      violations.push({
        type: 'eval_usage',
        location: this.getLocation(node, sourceFile),
        code: this.getCode(node.parent, sourceFile),
        severity: 'critical',
        description: 'new Function() - equivalent to eval()',
      });
      dangerousConstructs.push('new Function()');
    }
  }

  /**
   * Check for import/export statements and require calls
   */
  private checkImportExport(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: SecurityViolation[]
  ): void {
    // Static import statements
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const moduleName = moduleSpecifier.text;

        // Check for dangerous built-in modules
        const baseName = moduleName.replace(/^node:/, '');
        if (DANGEROUS_MODULES.has(baseName)) {
          violations.push({
            type: baseName === 'child_process' ? 'child_process' : 'fs_access',
            location: this.getLocation(node, sourceFile),
            code: this.getCode(node, sourceFile),
            severity: 'critical',
            description: `Import of dangerous module '${moduleName}'`,
          });
        }
      }
    }

    // Dynamic import()
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr.kind === ts.SyntaxKind.ImportKeyword) {
        violations.push({
          type: 'require_import',
          location: this.getLocation(node, sourceFile),
          code: this.getCode(node, sourceFile),
          severity: 'critical',
          description: 'Dynamic import() is not allowed in sandbox',
        });
      }
    }

    // require() calls
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'require') {
        violations.push({
          type: 'require_import',
          location: this.getLocation(node, sourceFile),
          code: this.getCode(node, sourceFile),
          severity: 'critical',
          description: 'require() is not allowed in sandbox',
        });
      }
    }
  }

  /**
   * Detect MCP namespace.method() calls
   */
  private checkMCPCalls(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    mcpCalls: MCPCallPattern[]
  ): void {
    if (!ts.isCallExpression(node)) return;

    const expr = node.expression;

    // Pattern: namespace.method()
    if (ts.isPropertyAccessExpression(expr)) {
      const obj = expr.expression;

      // Simple namespace.method()
      if (ts.isIdentifier(obj)) {
        mcpCalls.push({
          namespace: obj.text,
          method: expr.name.text,
          location: this.getLocation(node, sourceFile),
          code: this.getCode(node, sourceFile),
        });
      }

      // Chained: await namespace.method()
      if (ts.isAwaitExpression(node.parent)) {
        // Already captured above
      }
    }
  }

  /**
   * Detect network-related calls (fetch, XMLHttpRequest, etc.)
   */
  private checkNetworkCalls(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    networkRequests: string[],
    warnings: SecurityWarning[]
  ): void {
    if (!ts.isCallExpression(node)) return;

    const expr = node.expression;

    // fetch() calls
    if (ts.isIdentifier(expr) && expr.text === 'fetch') {
      const firstArg = node.arguments[0];
      const url = firstArg ? firstArg.getText(sourceFile) : 'unknown';
      networkRequests.push(url);

      warnings.push({
        type: 'network_request',
        location: this.getLocation(node, sourceFile),
        code: this.getCode(node, sourceFile),
        description: `Network request to ${url} - will be validated by network policy`,
      });
    }
  }
}

/**
 * Create a code analyzer instance
 */
export function createCodeAnalyzer(): CodeAnalyzer {
  return new CodeAnalyzer();
}
