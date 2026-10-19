/**
 * Selective MCP Apps forwarding for a server that otherwise keeps ordinary
 * downstream tools behind its discovery/code tools.
 *
 * This module deliberately knows nothing about transport or a concrete MCP
 * client. The owner supplies a live catalog, a resource reader, and a native
 * tool executor so results and downstream metadata can pass through unchanged.
 */

export const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui';
export const MCP_APP_HTML_MIME_TYPE = 'text/html;profile=mcp-app';

export type McpAppToolVisibility = 'model' | 'app';

export interface McpAppsToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpAppsResourceDefinition {
  uri: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpAppsServerCatalog {
  /** Stable identity of the downstream MCP server. */
  serverName: string;
  tools: McpAppsToolDefinition[];
  /** Optional native resources/list result. UI resources may be omitted here. */
  resources?: McpAppsResourceDefinition[];
}

export interface McpAppsGatewayOptions {
  getServers(): Promise<McpAppsServerCatalog[]> | McpAppsServerCatalog[];
  /** Return the native resources/read result, including each content's mimeType/_meta. */
  readResource(serverName: string, uri: string): Promise<unknown>;
  /** Execute with the original downstream name; return the native result unchanged. */
  callTool(serverName: string, toolName: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<unknown>;
  /** Names already owned by the outer server; app groups colliding with them are omitted. */
  reservedToolNames?: ReadonlySet<string> | readonly string[];
  onDiagnostic?: (message: string) => void;
}

interface IndexedTool {
  serverName: string;
  tool: McpAppsToolDefinition;
  resourceUri: string;
  visibility: Set<McpAppToolVisibility>;
}

interface AppIndex {
  tools: IndexedTool[];
  modelTools: IndexedTool[];
  callbackTools: Map<string, Map<string, IndexedTool>>;
  resources: Map<string, { serverName: string; definition: McpAppsResourceDefinition }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getAppsMetadata(tool: McpAppsToolDefinition): { resourceUri?: string; visibility: Set<McpAppToolVisibility> } | undefined {
  const meta = isRecord(tool._meta) ? tool._meta : undefined;
  if (!meta) return undefined;
  const ui = isRecord(meta.ui) ? meta.ui : undefined;
  const resourceUri = typeof ui?.resourceUri === 'string'
    ? ui.resourceUri
    : typeof meta['ui/resourceUri'] === 'string'
      ? meta['ui/resourceUri'] as string
      : undefined;
  // The stable extension defaults to visibility for both the model and app.
  const visibilityValue = ui?.visibility;
  const visibility = new Set<McpAppToolVisibility>();
  if (visibilityValue === undefined && resourceUri) {
    visibility.add('model');
    visibility.add('app');
  } else if (Array.isArray(visibilityValue)) {
    for (const item of visibilityValue) {
      if (item === 'model' || item === 'app') visibility.add(item);
    }
  }
  if (!resourceUri && !visibility.has('app')) return undefined;
  return { resourceUri, visibility };
}

function visibilityArray(visibility: Set<McpAppToolVisibility>): McpAppToolVisibility[] {
  return [...visibility];
}

/**
 * Routes app-associated tools without changing their public names. If names
 * collide across server groups, those whole groups are withheld from the
 * model-facing app catalog. App-only callbacks remain in getTools() with
 * their original visibility metadata and are addressable by the owning UI URI.
 */
export class McpAppsGateway {
  private readonly options: McpAppsGatewayOptions;
  private readonly reservedNames: Set<string>;

  constructor(options: McpAppsGatewayOptions) {
    this.options = options;
    this.reservedNames = new Set(options.reservedToolNames ?? []);
  }

  /** All app-associated tools for the host catalog; visibility metadata is preserved. */
  async getTools(): Promise<McpAppsToolDefinition[]> {
    const index = await this.buildIndex();
    return index.tools.map(({ tool }) => tool);
  }

  /**
   * Select the wire catalog after extension negotiation. Text-only hosts receive
   * normal model-callable app tools and their text/structured result fallback,
   * while app-only callbacks stay out of their agent tool list.
   */
  async getToolsForHost(supportsMcpApps: boolean): Promise<McpAppsToolDefinition[]> {
    return supportsMcpApps ? this.getTools() : this.getModelTools();
  }

  /** App tools the host may expose to the model after applying visibility policy. */
  async getModelTools(): Promise<McpAppsToolDefinition[]> {
    const index = await this.buildIndex();
    return index.modelTools.map(({ tool }) => tool);
  }

  /** App-only callback declarations for one UI, for hosts that expose an app tool path. */
  async getAppCallbackTools(resourceUri: string): Promise<McpAppsToolDefinition[]> {
    const index = await this.buildIndex();
    const byName = index.callbackTools.get(resourceUri);
    if (!byName) return [];
    return [...byName.values()]
      .filter(({ visibility }) => visibility.has('app'))
      .map(({ tool }) => tool);
  }

  /** Resource declarations associated with model-visible app tools. */
  async listResources(): Promise<McpAppsResourceDefinition[]> {
    const index = await this.buildIndex();
    return [...index.resources.values()].map(({ definition }) => definition);
  }

  /** Read a UI resource and preserve the downstream native result exactly. */
  async readResource(uri: string): Promise<unknown> {
    const index = await this.buildIndex();
    const resource = index.resources.get(uri);
    if (!resource) throw new Error(`Unknown or ambiguous MCP Apps resource: ${uri}`);
    return this.options.readResource(resource.serverName, uri);
  }

  /** Find a uniquely named app tool by its original downstream name. */
  async resolveTool(name: string): Promise<{ serverName: string; tool: McpAppsToolDefinition } | undefined> {
    const index = await this.buildIndex();
    const matches = index.tools.filter(({ tool }) => tool.name === name);
    if (matches.length !== 1) return undefined;
    return { serverName: matches[0].serverName, tool: matches[0].tool };
  }

  /** Invoke a host-routed app tool, preserving the downstream result. */
  async callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<unknown> {
    const resolved = await this.resolveTool(name);
    if (!resolved) throw new Error(`Unknown or ambiguous MCP Apps tool: ${name}`);
    return this.options.callTool(resolved.serverName, resolved.tool.name, args, meta);
  }

  /**
   * Invoke a callback from an app. URI ownership binds the callback to the same
   * downstream server as the displayed UI; model visibility is not required.
   */
  async callAppTool(resourceUri: string, name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<unknown> {
    const index = await this.buildIndex();
    const route = index.callbackTools.get(resourceUri)?.get(name);
    if (!route || !route.visibility.has('app')) {
      throw new Error(`Tool '${name}' is not callable by the app for resource '${resourceUri}'`);
    }
    return this.options.callTool(route.serverName, route.tool.name, args, meta);
  }

  private async buildIndex(): Promise<AppIndex> {
    const servers = await this.options.getServers();
    const candidates: IndexedTool[] = [];
    const callbackDeclarations: Array<{ serverName: string; tool: McpAppsToolDefinition; visibility: Set<McpAppToolVisibility> }> = [];
    const groupUris = new Map<string, Set<string>>();
    const definitionsByServer = new Map<string, Map<string, McpAppsResourceDefinition>>();

    for (const server of servers) {
      const nativeResources = new Map((server.resources ?? []).map(resource => [resource.uri, resource]));
      definitionsByServer.set(server.serverName, nativeResources);
      for (const tool of server.tools) {
        const app = getAppsMetadata(tool);
        if (!app) continue;
        const resourceUri = app.resourceUri;
        if (!resourceUri) {
          callbackDeclarations.push({ serverName: server.serverName, tool, visibility: app.visibility });
          continue;
        }
        if (!resourceUri.startsWith('ui://')) {
          this.options.onDiagnostic?.(`Omitting MCP Apps tool '${server.serverName}:${tool.name}': resource URI must use ui://`);
          continue;
        }
        candidates.push({ serverName: server.serverName, tool, resourceUri, visibility: app.visibility });
        const uris = groupUris.get(server.serverName) ?? new Set<string>();
        uris.add(resourceUri);
        groupUris.set(server.serverName, uris);
      }
    }

    const excludedGroups = new Set<string>();
    const nameOwners = new Map<string, Set<string>>();
    for (const candidate of [...candidates, ...callbackDeclarations]) {
      const owners = nameOwners.get(candidate.tool.name) ?? new Set<string>();
      owners.add(candidate.serverName);
      nameOwners.set(candidate.tool.name, owners);
    }
    for (const [name, owners] of nameOwners) {
      if (owners.size > 1 || this.reservedNames.has(name)) {
        for (const owner of owners) excludedGroups.add(owner);
        const reason = this.reservedNames.has(name) ? 'conflicts with an outer server tool' : 'is ambiguous across downstream servers';
        this.options.onDiagnostic?.(`Omitting MCP Apps server group(s) for tool '${name}': name ${reason}`);
      }
    }

    // A UI URI must resolve to exactly one server. Exclude all owners in the
    // event of duplicate URI declarations to avoid proxying across origins.
    const uriOwners = new Map<string, Set<string>>();
    for (const [serverName, uris] of groupUris) {
      for (const uri of uris) {
        const owners = uriOwners.get(uri) ?? new Set<string>();
        owners.add(serverName);
        uriOwners.set(uri, owners);
      }
    }
    for (const [uri, owners] of uriOwners) {
      if (owners.size > 1) {
        for (const owner of owners) excludedGroups.add(owner);
        this.options.onDiagnostic?.(`Omitting MCP Apps server group(s): resource URI '${uri}' is declared by multiple downstream servers`);
      }
    }

    const tools: IndexedTool[] = [];
    const modelTools: IndexedTool[] = [];
    const callbackTools = new Map<string, Map<string, IndexedTool>>();
    const resources = new Map<string, { serverName: string; definition: McpAppsResourceDefinition }>();
    const appToolKeys = new Set<string>();

    for (const candidate of candidates) {
      if (excludedGroups.has(candidate.serverName)) continue;
      tools.push(candidate);
      appToolKeys.add(`${candidate.serverName}\u0000${candidate.tool.name}`);
      if (candidate.visibility.has('model')) modelTools.push(candidate);
      const callbacks = callbackTools.get(candidate.resourceUri) ?? new Map<string, IndexedTool>();
      callbacks.set(candidate.tool.name, candidate);
      callbackTools.set(candidate.resourceUri, callbacks);
    }

    // App-only callbacks commonly omit their own resourceUri. Bind them to
    // each UI resource owned by the same downstream server, while keeping the
    // downstream tool declaration exactly as supplied.
    for (const callback of callbackDeclarations) {
      if (excludedGroups.has(callback.serverName) || !callback.visibility.has('app')) continue;
      const uris = [...(groupUris.get(callback.serverName) ?? [])];
      for (const resourceUri of uris) {
        const route: IndexedTool = { ...callback, resourceUri };
        const callbacks = callbackTools.get(resourceUri) ?? new Map<string, IndexedTool>();
        callbacks.set(callback.tool.name, route);
        callbackTools.set(resourceUri, callbacks);
      }
      if (uris.length && !appToolKeys.has(`${callback.serverName}\u0000${callback.tool.name}`)) {
        tools.push({ ...callback, resourceUri: uris[0] });
        appToolKeys.add(`${callback.serverName}\u0000${callback.tool.name}`);
      }
    }

    for (const candidate of modelTools) {
      if (resources.has(candidate.resourceUri)) continue;
      const native = definitionsByServer.get(candidate.serverName)?.get(candidate.resourceUri);
      resources.set(candidate.resourceUri, {
        serverName: candidate.serverName,
        definition: native ?? {
          uri: candidate.resourceUri,
          name: candidate.resourceUri.slice('ui://'.length),
          mimeType: MCP_APP_HTML_MIME_TYPE,
        },
      });
    }

    return { tools, modelTools, callbackTools, resources };
  }
}
