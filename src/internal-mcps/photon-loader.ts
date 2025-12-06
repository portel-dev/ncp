/**
 * Photon Loader
 *
 * Discovers and loads Photon classes from:
 * 1. Built-in directory (src/internal-mcps/)
 * 2. Global user directory (~/.ncp/internal/)
 * 3. Project-local directory (.ncp/internal/)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as crypto from 'crypto';
import { Photon } from './base-photon.js';
import { PhotonAdapter } from './photon-adapter.js';
import { InternalMCP } from './types.js';
import { logger } from '../utils/logger.js';
import { DependencyManager } from '@portel/photon-core';
import envPaths from 'env-paths';

export class PhotonLoader {
  private loadedMCPs: Map<string, InternalMCP> = new Map();
  private dependencyManager: DependencyManager;

  constructor() {
    this.dependencyManager = new DependencyManager();
  }

  /**
   * Load all Photon classes from multiple directories
   */
  async loadAll(directories: string[]): Promise<InternalMCP[]> {
    const mcps: InternalMCP[] = [];

    for (const directory of directories) {
      try {
        const dirMCPs = await this.loadFromDirectory(directory);
        mcps.push(...dirMCPs);
      } catch (error: any) {
        logger.warn(`Failed to load MCPs from ${directory}: ${error.message}`);
      }
    }

    return mcps;
  }

  /**
   * Load Photon classes from a directory
   */
  async loadFromDirectory(directory: string): Promise<InternalMCP[]> {
    const mcps: InternalMCP[] = [];

    try {
      // Check if directory exists
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        return mcps;
      }

      // Find all .photon.ts and .photon.js files
      const files = await this.findMCPFiles(directory);

      logger.debug(`Found ${files.length} MCP files in ${directory}`);

      // Load each file
      for (const filePath of files) {
        try {
          const mcp = await this.loadMCPFile(filePath);
          if (mcp) {
            mcps.push(mcp);
            this.loadedMCPs.set(mcp.name, mcp);
          }
        } catch (error: any) {
          logger.error(`Failed to load MCP from ${filePath}: ${error.message}`);
        }
      }
    } catch (error: any) {
      // Directory doesn't exist or can't be read
      logger.debug(`Cannot load from ${directory}: ${error.message}`);
    }

    return mcps;
  }

  /**
   * Find all .photon.ts and .photon.js files in a directory
   */
  private async findMCPFiles(directory: string): Promise<string[]> {
    const files: string[] = [];

    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await this.findMCPFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && this.isMCPFile(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if file is a Photon file
   */
  private isMCPFile(filename: string): boolean {
    return filename.endsWith('.photon.ts') || filename.endsWith('.photon.js') ||
           filename.endsWith('.photon.ts') || filename.endsWith('.photon.js'); // Backward compat during migration
  }

  /**
   * Load a single MCP file
   */
  private async loadMCPFile(filePath: string): Promise<InternalMCP | null> {
    try {
      // Find source .ts file if we're loading from dist
      let sourceFilePath = filePath;
      if (filePath.includes('/dist/') && filePath.endsWith('.js')) {
        const isPhoton = filePath.endsWith('.photon.js');
        const ext = isPhoton ? '.photon' : '.micro';

        // First try .schema.json in dist (for packaged DXT)
        // If not found, will fall back to src/*.ts in development
        sourceFilePath = filePath.replace(`${ext}.js`, `${ext}.ts`);

        // Check if we should try src/ instead (development mode)
        const schemaInDist = filePath.replace(`${ext}.js`, `${ext}.schema.json`);
        try {
          await fs.access(schemaInDist);
          // Schema file exists in dist, use dist path
          sourceFilePath = filePath.replace(`${ext}.js`, `${ext}.ts`);
        } catch {
          // No schema in dist, try src/ (development mode)
          sourceFilePath = filePath
            .replace('/dist/', '/src/')
            .replace(`${ext}.js`, `${ext}.ts`);
        }
      }

      // Extract and install dependencies (only if source file exists)
      try {
        await fs.access(sourceFilePath);
        const dependencies = await this.dependencyManager.extractDependencies(sourceFilePath);

        if (dependencies.length > 0) {
          logger.info(`📦 Found ${dependencies.length} dependencies in ${path.basename(filePath)}`);

          // Get MCP name for cache directory
          const mcpName = path.basename(filePath, '.photon.js').replace('.photon.ts', '');

          // Install dependencies
          await this.dependencyManager.ensureDependencies(mcpName, dependencies);
        }
      } catch (error: any) {
        // Source file doesn't exist (production mode) - skip dependency extraction
        logger.debug(`Skipping dependency extraction for ${path.basename(filePath)} (source not found)`);
      }

      // Convert file path to file:// URL for ESM imports
      const fileUrl = pathToFileURL(filePath).href;

      // Dynamically import the module
      let module: any;

      if (filePath.endsWith('.ts')) {
        // Compile TypeScript to JavaScript using esbuild
        logger.debug(`Compiling TypeScript file: ${path.basename(filePath)}`);

        const cachedJsPath = await this.compileTypeScript(filePath);
        const cachedJsUrl = pathToFileURL(cachedJsPath).href;
        module = await import(cachedJsUrl);
      } else {
        // Regular JavaScript import
        module = await import(fileUrl);
      }

      // Find all exported classes (Photon or plain classes)
      const mcpClasses = this.findMCPClasses(module);

      if (mcpClasses.length === 0) {
        logger.warn(`No Photon classes found in ${path.basename(filePath)}`);
        return null;
      }

      if (mcpClasses.length > 1) {
        logger.warn(
          `Multiple Photon classes found in ${path.basename(filePath)}. Using first one.`
        );
      }

      // Use the first Photon class found
      const MCPClass = mcpClasses[0];
      const instance = new MCPClass();

      // Call lifecycle hook if present
      if (instance.onInitialize) {
        await instance.onInitialize();
      }

      // Create adapter (async initialization)
      const adapter = await PhotonAdapter.create(MCPClass, instance, sourceFilePath);

      logger.info(`✅ Loaded Photon: ${adapter.name} (${adapter.tools.length} tools)`);

      return adapter;
    } catch (error: any) {
      logger.error(`Failed to load ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Compile TypeScript file to JavaScript and cache it
   */
  private async compileTypeScript(tsFilePath: string): Promise<string> {
    // Generate cache path based on file content hash
    const tsContent = await fs.readFile(tsFilePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(tsContent).digest('hex').slice(0, 16);

    const paths = envPaths('ncp', { suffix: '' });
    const cacheDir = path.join(paths.cache, 'compiled-mcp');
    const fileName = path.basename(tsFilePath, '.ts');
    const cachedJsPath = path.join(cacheDir, `${fileName}.${hash}.mjs`);

    // Check if cached version exists
    try {
      await fs.access(cachedJsPath);
      logger.debug(`Using cached compiled version: ${path.basename(cachedJsPath)}`);
      return cachedJsPath;
    } catch {
      // Cache miss - compile it
    }

    // Compile TypeScript to JavaScript
    logger.debug(`Compiling ${path.basename(tsFilePath)} with esbuild...`);

    const esbuild = await import('esbuild');
    const result = await esbuild.transform(tsContent, {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      sourcemap: 'inline'
    });

    // Ensure cache directory exists
    await fs.mkdir(cacheDir, { recursive: true });

    // Write compiled JavaScript to cache
    await fs.writeFile(cachedJsPath, result.code, 'utf-8');
    logger.debug(`Cached compiled JS: ${path.basename(cachedJsPath)}`);

    return cachedJsPath;
  }

  /**
   * Find all classes in a module
   *
   * Accepts ANY class - no base class requirement!
   * Just like PHP Restler, we use pure convention.
   */
  private findMCPClasses(module: any): Array<any> {
    const classes: Array<any> = [];

    for (const exportedItem of Object.values(module)) {
      if (typeof exportedItem === 'function' && this.isClass(exportedItem)) {
        // Check if it has async methods (indication it's a Photon)
        if (this.hasAsyncMethods(exportedItem)) {
          classes.push(exportedItem);
        }
      }
    }

    return classes;
  }

  /**
   * Check if a function is a class constructor
   */
  private isClass(fn: any): boolean {
    return typeof fn === 'function' && /^\s*class\s+/.test(fn.toString());
  }

  /**
   * Check if a class has async methods
   */
  private hasAsyncMethods(ClassConstructor: any): boolean {
    const prototype = ClassConstructor.prototype;

    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (descriptor && typeof descriptor.value === 'function') {
        // Check if it's an async function
        const fn = descriptor.value;
        if (fn.constructor.name === 'AsyncFunction') {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all loaded MCPs
   */
  getLoadedMCPs(): InternalMCP[] {
    return Array.from(this.loadedMCPs.values());
  }

  /**
   * Get a loaded MCP by name
   */
  getMCP(name: string): InternalMCP | undefined {
    return this.loadedMCPs.get(name);
  }
}
