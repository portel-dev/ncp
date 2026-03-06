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
import {
  PhotonMCP,
  DependencyManager,
  isClass,
  hasAsyncMethods,
  findPhotonClasses,
  compilePhotonTS,
} from '@portel/photon-core';
import type { MCPClientFactory } from './mcp-client-factory.js';
import { PhotonAdapter } from './photon-adapter.js';
import { InternalMCP } from './types.js';
import { logger } from '../utils/logger.js';
import { loadPhotonConfig, applyPhotonEnvVars } from '../utils/photon-config.js';
import envPaths from 'env-paths';

export class PhotonLoader {
  private loadedMCPs: Map<string, InternalMCP> = new Map();
  private dependencyManager: DependencyManager;
  private mcpClientFactory?: MCPClientFactory;

  constructor(mcpClientFactory?: MCPClientFactory) {
    this.dependencyManager = new DependencyManager();
    this.mcpClientFactory = mcpClientFactory;
  }

  /**
   * Set the MCP client factory for enabling this.mcp() in Photons
   */
  setMCPClientFactory(factory: MCPClientFactory): void {
    this.mcpClientFactory = factory;
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
    return filename.endsWith('.photon.ts') || filename.endsWith('.photon.js');
  }

  /**
   * Load a single MCP file
   */
  private async loadMCPFile(filePath: string): Promise<InternalMCP | null> {
    try {
      // Find source .ts file if we're loading from dist
      let sourceFilePath = filePath;
      if (filePath.includes('/dist/') && filePath.endsWith('.js')) {
        // First try .schema.json in dist (for packaged DXT)
        // If not found, will fall back to src/*.ts in development
        sourceFilePath = filePath.replace('.photon.js', '.photon.ts');

        // Check if we should try src/ instead (development mode)
        const schemaInDist = filePath.replace('.photon.js', '.photon.schema.json');
        try {
          await fs.access(schemaInDist);
          // Schema file exists in dist, use dist path
          sourceFilePath = filePath.replace('.photon.js', '.photon.ts');
        } catch {
          // No schema in dist, try src/ (development mode)
          sourceFilePath = filePath
            .replace('/dist/', '/src/')
            .replace('.photon.js', '.photon.ts');
        }
      }

      // Extract and install dependencies (only if source file exists)
      let nodeModulesPath: string | null = null;
      try {
        await fs.access(sourceFilePath);
        const dependencies = await this.dependencyManager.extractDependencies(sourceFilePath);

        if (dependencies.length > 0) {
          logger.info(`📦 Found ${dependencies.length} dependencies in ${path.basename(filePath)}`);

          // Get MCP name for cache directory
          const mcpName = path.basename(filePath, '.photon.js').replace('.photon.ts', '');

          // Install dependencies and get node_modules path
          nodeModulesPath = await this.dependencyManager.ensureDependencies(mcpName, dependencies);
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

        const cachedJsPath = await this.compileTypeScript(filePath, nodeModulesPath || undefined);
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

      // Apply photon-specific env vars from config.json before instantiation
      const photonName = path.basename(filePath).replace(/\.(photon|micro)\.(ts|js)$/, '');
      try {
        const config = await loadPhotonConfig();
        const envVars = config.photons[photonName];
        if (envVars && Object.keys(envVars).length > 0) {
          applyPhotonEnvVars(envVars);
          logger.debug(`Applied ${Object.keys(envVars).length} env vars for ${photonName}`);
        }
      } catch (error: any) {
        logger.debug(`No config found for ${photonName}: ${error.message}`);
      }

      const instance = new MCPClass();

      // Call lifecycle hook if present
      if (instance.onInitialize) {
        await instance.onInitialize();
      }

      // Extract full metadata including settings and notification subscriptions
      let settingsSchema = undefined;
      let notificationSubscriptions = undefined;

      if (sourceFilePath) {
        try {
          const extractor = new (await import('@portel/photon-core')).SchemaExtractor();
          const metadata = await extractor.extractAllFromSource(sourceFilePath);
          settingsSchema = metadata.settingsSchema;
          notificationSubscriptions = metadata.notificationSubscriptions;

          if (settingsSchema) {
            logger.debug(`Extracted settings schema for ${path.basename(sourceFilePath)}`);
          }
          if (notificationSubscriptions) {
            logger.debug(`Extracted notification subscriptions for ${path.basename(sourceFilePath)}`);
          }
        } catch (error: any) {
          logger.debug(`Could not extract metadata from ${sourceFilePath}: ${error.message}`);
        }
      }

      // Create adapter (async initialization)
      // Pass MCP client factory to enable this.mcp() calls in Photons
      // Pass metadata for settings and notifications support
      const adapter = await PhotonAdapter.create(
        MCPClass,
        instance,
        sourceFilePath,
        this.mcpClientFactory,
        settingsSchema,
        notificationSubscriptions
      );

      logger.info(`✅ Loaded Photon: ${adapter.name} (${adapter.tools.length} tools)`);

      return adapter;
    } catch (error: any) {
      logger.error(`Failed to load ${filePath}: ${error.message}`);
      console.error(`[PhotonLoader] Failed to load ${path.basename(filePath)}: ${error.message}`);
      console.error(error.stack);
      return null;
    }
  }

  /**
   * Compile TypeScript file to JavaScript and cache it
   * Delegates to shared compilePhotonTS from photon-core
   */
  private async compileTypeScript(tsFilePath: string, nodeModulesPath?: string): Promise<string> {
    const cacheDir = nodeModulesPath
      ? path.dirname(nodeModulesPath)  // Same dir as node_modules
      : path.join(envPaths('ncp', { suffix: '' }).cache, 'compiled-mcp'); // Fallback

    return compilePhotonTS(tsFilePath, { cacheDir });
  }

  /**
   * Find all classes in a module
   * Delegates to shared findPhotonClasses from photon-core
   */
  private findMCPClasses(module: any): Array<any> {
    return findPhotonClasses(module);
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
