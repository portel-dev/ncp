/**
 * Intent Executor for NCP
 * Enables single-call discovery + execution via embedding-based parameter matching
 *
 * Flow:
 * 1. User provides intent + context params
 * 2. Find best matching tool via semantic search
 * 3. Match user params to tool schema params via embedding similarity
 * 4. Execute tool with mapped parameters
 */

import { logger } from '../utils/logger.js';

export interface ParamMapping {
  userParam: string;
  schemaParam: string;
  confidence: number;
  userValue: any;
}

export interface UnmappedParam {
  userParam: string;
  userValue: any;
  bestMatch?: string;
  bestScore?: number;
  suggestion?: string;
}

export interface IntentResult {
  success: boolean;
  tool?: string;
  toolDescription?: string;
  mappedParams?: Record<string, any>;
  paramMappings?: ParamMapping[];
  unmappedParams?: UnmappedParam[];
  missingRequired?: string[];
  schema?: {
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
  result?: any;
  error?: string;
  hint?: string;
}

export interface SchemaProperty {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export class IntentExecutor {
  private model: any = null;
  private isInitialized: boolean = false;
  private paramEmbeddingCache: Map<string, Float32Array> = new Map();

  constructor(
    private toolFinder: (query: string, limit: number) => Promise<any[]>,
    private toolExecutor: (toolName: string, params: any) => Promise<any>
  ) {}

  /**
   * Initialize with the embedding model from RAG engine
   */
  async initialize(model: any): Promise<void> {
    this.model = model;
    this.isInitialized = true;
    logger.info('IntentExecutor initialized with embedding model');
  }

  /**
   * Execute intent with automatic tool discovery and parameter mapping
   */
  async execute(intent: string, context: Record<string, any>): Promise<IntentResult> {
    if (!this.isInitialized || !this.model) {
      return {
        success: false,
        error: 'IntentExecutor not initialized. Embedding model required.'
      };
    }

    try {
      // Step 1: Find best matching tool
      logger.info(`🎯 Finding tool for intent: "${intent}"`);
      const tools = await this.toolFinder(intent, 1);

      if (!tools || tools.length === 0) {
        return {
          success: false,
          error: `No tool found for intent: "${intent}"`
        };
      }

      const tool = tools[0];
      const toolName = tool.toolName;
      const schema = tool.schema;

      logger.info(`✅ Found tool: ${toolName} (confidence: ${Math.round(tool.confidence * 100)}%)`);

      // Step 2: Extract schema properties
      const schemaProps = this.extractSchemaProperties(schema);

      if (schemaProps.length === 0) {
        // Tool has no parameters, execute directly
        logger.info(`⚡ Tool has no parameters, executing directly`);
        const result = await this.toolExecutor(toolName, {});
        return {
          success: true,
          tool: toolName,
          mappedParams: {},
          paramMappings: [],
          result
        };
      }

      // Build schema info for feedback
      const schemaInfo = {
        properties: Object.fromEntries(
          schemaProps.map(p => [p.name, { type: p.type, description: p.description }])
        ),
        required: schemaProps.filter(p => p.required).map(p => p.name)
      };

      // Step 3: Map user params to schema params via embedding similarity
      const { mappings, unmapped } = await this.mapParameters(context, schemaProps);

      // Build final params object
      const mappedParams: Record<string, any> = {};
      for (const mapping of mappings) {
        mappedParams[mapping.schemaParam] = mapping.userValue;
      }

      // Check for required params that weren't mapped
      const missingRequired = schemaProps
        .filter(p => p.required && !mappedParams[p.name])
        .map(p => p.name);

      // If there are unmapped params or missing required, return helpful feedback
      if (unmapped.length > 0 || missingRequired.length > 0) {
        const hints: string[] = [];

        if (unmapped.length > 0) {
          hints.push(`Unmapped params: ${unmapped.map(u => `"${u.userParam}"${u.suggestion ? ` (${u.suggestion})` : ''}`).join(', ')}`);
        }
        if (missingRequired.length > 0) {
          hints.push(`Missing required: ${missingRequired.join(', ')}`);
        }
        hints.push(`Available params: ${schemaProps.map(p => `${p.name}${p.required ? '*' : ''}`).join(', ')}`);

        return {
          success: false,
          tool: toolName,
          toolDescription: tool.description,
          schema: schemaInfo,
          mappedParams,
          paramMappings: mappings,
          unmappedParams: unmapped,
          missingRequired: missingRequired.length > 0 ? missingRequired : undefined,
          error: missingRequired.length > 0
            ? `Missing required parameters: ${missingRequired.join(', ')}`
            : `Could not map parameters: ${unmapped.map(u => u.userParam).join(', ')}`,
          hint: hints.join('. ')
        };
      }

      logger.info(`🔗 Parameter mappings:`);
      for (const m of mappings) {
        logger.info(`   ${m.userParam} → ${m.schemaParam} (${Math.round(m.confidence * 100)}%)`);
      }

      // Step 4: Execute tool
      logger.info(`⚡ Executing ${toolName}...`);
      const result = await this.toolExecutor(toolName, mappedParams);

      return {
        success: true,
        tool: toolName,
        toolDescription: tool.description,
        mappedParams,
        paramMappings: mappings,
        result
      };

    } catch (error: any) {
      logger.error(`Intent execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract properties from JSON schema
   */
  private extractSchemaProperties(schema: any): SchemaProperty[] {
    if (!schema || !schema.properties) {
      return [];
    }

    const required = new Set(schema.required || []);
    const props: SchemaProperty[] = [];

    for (const [name, prop] of Object.entries(schema.properties)) {
      const p = prop as any;
      props.push({
        name,
        type: p.type || 'string',
        description: p.description,
        required: required.has(name)
      });
    }

    return props;
  }

  /**
   * Map user-provided params to schema params via embedding similarity
   * Returns both successful mappings and unmapped params with suggestions
   */
  private async mapParameters(
    userParams: Record<string, any>,
    schemaProps: SchemaProperty[]
  ): Promise<{ mappings: ParamMapping[]; unmapped: UnmappedParam[] }> {
    const mappings: ParamMapping[] = [];
    const unmapped: UnmappedParam[] = [];
    const usedSchemaParams = new Set<string>();

    for (const [userParam, userValue] of Object.entries(userParams)) {
      // Generate embedding for user param name
      const userEmbedding = await this.getParamEmbedding(userParam);

      let bestMatch: { prop: SchemaProperty; score: number } | null = null;

      for (const schemaProp of schemaProps) {
        // Skip already mapped schema params
        if (usedSchemaParams.has(schemaProp.name)) continue;

        // Generate embedding for schema param (name + description)
        const schemaText = schemaProp.description
          ? `${schemaProp.name}: ${schemaProp.description}`
          : schemaProp.name;
        const schemaEmbedding = await this.getParamEmbedding(schemaText);

        // Calculate similarity
        const score = this.cosineSimilarity(userEmbedding, schemaEmbedding);

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { prop: schemaProp, score };
        }
      }

      // Only map if similarity is above threshold
      if (bestMatch && bestMatch.score > 0.5) {
        mappings.push({
          userParam,
          schemaParam: bestMatch.prop.name,
          confidence: bestMatch.score,
          userValue: this.coerceType(userValue, bestMatch.prop.type)
        });
        usedSchemaParams.add(bestMatch.prop.name);
      } else {
        // Track unmapped param with best suggestion
        unmapped.push({
          userParam,
          userValue,
          bestMatch: bestMatch?.prop.name,
          bestScore: bestMatch?.score,
          suggestion: bestMatch ? `Try "${bestMatch.prop.name}" instead of "${userParam}"` : undefined
        });
        logger.warn(`Could not map param "${userParam}" (best score: ${bestMatch?.score.toFixed(2) || 'none'})`);
      }
    }

    return { mappings, unmapped };
  }

  /**
   * Get embedding for a parameter name/description (with caching)
   */
  private async getParamEmbedding(text: string): Promise<Float32Array> {
    // Check cache
    if (this.paramEmbeddingCache.has(text)) {
      return this.paramEmbeddingCache.get(text)!;
    }

    // Generate embedding
    const result = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });

    const embedding = new Float32Array(result.data);

    // Cache it
    this.paramEmbeddingCache.set(text, embedding);

    return embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Coerce value to expected type
   */
  private coerceType(value: any, type: string): any {
    switch (type) {
      case 'number':
      case 'integer':
        const num = Number(value);
        return isNaN(num) ? value : num;
      case 'boolean':
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'string':
      default:
        return String(value);
    }
  }

  /**
   * Clear param embedding cache
   */
  clearCache(): void {
    this.paramEmbeddingCache.clear();
  }
}
