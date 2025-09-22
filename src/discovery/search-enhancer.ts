/**
 * Search Enhancement System
 * Maps action words to semantic equivalents and categorizes terms for intelligent ranking
 */

interface ActionSemanticMapping {
  [action: string]: string[];
}

interface TermTypeMapping {
  [type: string]: string[];
}

interface ScoringWeights {
  [type: string]: {
    name: number;
    desc: number;
  };
}

export class SearchEnhancer {
  /**
   * Semantic action mappings for enhanced intent matching
   * Maps indirect actions to their direct equivalents
   */
  private static readonly ACTION_SEMANTIC: ActionSemanticMapping = {
    // Write/Create actions
    'save': ['write', 'create', 'store', 'edit'],
    'make': ['create', 'write', 'add'],
    'store': ['write', 'save', 'put'],
    'put': ['write', 'store', 'add'],
    'insert': ['add', 'write', 'create'],

    // Read/Retrieve actions
    'load': ['read', 'get', 'open'],
    'show': ['view', 'display', 'read'],
    'fetch': ['get', 'retrieve', 'read'],
    'retrieve': ['get', 'fetch', 'read'],
    'display': ['show', 'view', 'read'],

    // Modify/Update actions
    'modify': ['edit', 'update', 'change'],
    'alter': ['edit', 'modify', 'update'],
    'patch': ['edit', 'update', 'modify'],
    'change': ['edit', 'modify', 'update'],

    // Delete/Remove actions
    'remove': ['delete', 'clear', 'drop'],
    'clear': ['delete', 'remove', 'drop'],
    'destroy': ['delete', 'remove', 'clear'],
    'drop': ['delete', 'remove', 'clear'],

    // Search/Query actions
    'find': ['search', 'query', 'get'],
    'lookup': ['find', 'search', 'get'],
    'query': ['search', 'find', 'get'],
    'filter': ['search', 'find', 'query'],

    // Execute/Run actions
    'execute': ['run', 'start', 'launch'],
    'launch': ['run', 'start', 'execute'],
    'invoke': ['run', 'execute', 'call'],
    'trigger': ['run', 'execute', 'start']
  };

  /**
   * Term type classification for differentiated scoring
   * Categorizes query terms by their semantic role
   */
  private static readonly TERM_TYPES: TermTypeMapping = {
    ACTION: [
      // Primary actions
      'save', 'write', 'create', 'make', 'add', 'insert', 'store', 'put',
      'read', 'get', 'load', 'open', 'view', 'show', 'fetch', 'retrieve',
      'edit', 'update', 'modify', 'change', 'alter', 'patch',
      'delete', 'remove', 'clear', 'drop', 'destroy',
      'list', 'find', 'search', 'query', 'filter', 'lookup',
      'run', 'execute', 'start', 'stop', 'restart', 'launch', 'invoke',

      // Extended actions
      'copy', 'move', 'rename', 'duplicate', 'clone',
      'upload', 'download', 'sync', 'backup', 'restore',
      'import', 'export', 'convert', 'transform', 'process',
      'validate', 'verify', 'check', 'test', 'monitor'
    ],

    OBJECT: [
      // File/Document objects
      'file', 'files', 'document', 'documents', 'data', 'content',
      'folder', 'directory', 'directories', 'path', 'paths',
      'image', 'images', 'video', 'videos', 'audio', 'media',

      // Data objects
      'record', 'records', 'entry', 'entries', 'item', 'items',
      'database', 'table', 'tables', 'collection', 'dataset',
      'user', 'users', 'account', 'accounts', 'profile', 'profiles',

      // System objects
      'process', 'processes', 'service', 'services', 'application', 'apps',
      'server', 'servers', 'connection', 'connections', 'session', 'sessions',
      'config', 'configuration', 'settings', 'preferences', 'options'
    ],

    MODIFIER: [
      // Format modifiers
      'text', 'binary', 'json', 'xml', 'csv', 'html', 'markdown', 'pdf',
      'yaml', 'toml', 'ini', 'config', 'log', 'tmp', 'temp',

      // Size modifiers
      'large', 'small', 'big', 'tiny', 'huge', 'mini', 'massive',

      // State modifiers
      'new', 'old', 'existing', 'current', 'active', 'inactive',
      'enabled', 'disabled', 'public', 'private', 'hidden', 'visible',

      // Quality modifiers
      'empty', 'full', 'partial', 'complete', 'broken', 'valid', 'invalid'
    ],

    SCOPE: [
      // Quantity scope
      'all', 'some', 'none', 'every', 'each', 'any',
      'multiple', 'single', 'one', 'many', 'few', 'several',

      // Processing scope
      'batch', 'bulk', 'individual', 'group', 'mass',
      'recursive', 'nested', 'deep', 'shallow',

      // Range scope
      'first', 'last', 'next', 'previous', 'recent', 'latest'
    ]
  };

  /**
   * Scoring weights for different term types
   * Higher weights indicate more important semantic roles
   */
  private static readonly SCORING_WEIGHTS: ScoringWeights = {
    ACTION: { name: 0.7, desc: 0.35 },    // Highest weight - intent is critical
    OBJECT: { name: 0.2, desc: 0.1 },     // Medium weight - what we're acting on
    MODIFIER: { name: 0.05, desc: 0.025 }, // Low weight - how we're acting
    SCOPE: { name: 0.03, desc: 0.015 }    // Lowest weight - scale of action
  };

  /**
   * Get semantic mappings for an action word
   */
  static getActionSemantics(action: string): string[] {
    return this.ACTION_SEMANTIC[action.toLowerCase()] || [];
  }

  /**
   * Classify a term by its semantic type
   */
  static classifyTerm(term: string): string {
    const lowerTerm = term.toLowerCase();

    for (const [type, terms] of Object.entries(this.TERM_TYPES)) {
      if (terms.includes(lowerTerm)) {
        return type;
      }
    }

    return 'OTHER';
  }

  /**
   * Get scoring weights for a term type
   */
  static getTypeWeights(termType: string): { name: number; desc: number } {
    return this.SCORING_WEIGHTS[termType] || { name: 0.15, desc: 0.075 };
  }

  /**
   * Get all action words for a specific category
   */
  static getActionsByCategory(category: 'write' | 'read' | 'modify' | 'delete' | 'search' | 'execute'): string[] {
    const actions = this.TERM_TYPES.ACTION;
    const categoryMappings = {
      write: ['save', 'write', 'create', 'make', 'add', 'insert', 'store', 'put'],
      read: ['read', 'get', 'load', 'open', 'view', 'show', 'fetch', 'retrieve'],
      modify: ['edit', 'update', 'modify', 'change', 'alter', 'patch'],
      delete: ['delete', 'remove', 'clear', 'drop', 'destroy'],
      search: ['list', 'find', 'search', 'query', 'filter', 'lookup'],
      execute: ['run', 'execute', 'start', 'stop', 'restart', 'launch', 'invoke']
    };

    return categoryMappings[category] || [];
  }

  /**
   * Add new action semantic mapping (for extensibility)
   */
  static addActionSemantic(action: string, semantics: string[]): void {
    this.ACTION_SEMANTIC[action.toLowerCase()] = semantics;
  }

  /**
   * Add terms to a type category (for extensibility)
   */
  static addTermsToType(type: string, terms: string[]): void {
    if (!this.TERM_TYPES[type]) {
      this.TERM_TYPES[type] = [];
    }
    this.TERM_TYPES[type].push(...terms.map(t => t.toLowerCase()));
  }

  /**
   * Update scoring weights for a term type (for tuning)
   */
  static updateTypeWeights(type: string, nameWeight: number, descWeight: number): void {
    this.SCORING_WEIGHTS[type] = { name: nameWeight, desc: descWeight };
  }

  /**
   * Get debug information for a query
   */
  static analyzeQuery(query: string): {
    terms: string[];
    classifications: { [term: string]: string };
    actionSemantics: { [action: string]: string[] };
    weights: { [term: string]: { name: number; desc: number } };
  } {
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    const classifications: { [term: string]: string } = {};
    const actionSemantics: { [action: string]: string[] } = {};
    const weights: { [term: string]: { name: number; desc: number } } = {};

    for (const term of terms) {
      const type = this.classifyTerm(term);
      classifications[term] = type;
      weights[term] = this.getTypeWeights(type);

      if (type === 'ACTION') {
        const semantics = this.getActionSemantics(term);
        if (semantics.length > 0) {
          actionSemantics[term] = semantics;
        }
      }
    }

    return { terms, classifications, actionSemantics, weights };
  }

  /**
   * Get all available term types (for documentation)
   */
  static getAllTermTypes(): string[] {
    return Object.keys(this.TERM_TYPES).sort();
  }

  /**
   * Get all action words (for documentation)
   */
  static getAllActions(): string[] {
    return Object.keys(this.ACTION_SEMANTIC).sort();
  }
}

export default SearchEnhancer;