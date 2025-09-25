/**
 * Discovery Engine - RAG-powered semantic tool discovery
 */
import { PersistentRAGEngine, DiscoveryResult } from './rag-engine.js';
import { logger } from '../utils/logger.js';

export class DiscoveryEngine {
  private ragEngine: PersistentRAGEngine;
  private tools: Map<string, any> = new Map();
  private toolPatterns: Map<string, string[]> = new Map();
  private toolsByDescription: Map<string, string> = new Map();
  
  constructor() {
    this.ragEngine = new PersistentRAGEngine();
  }
  
  async initialize(currentConfig?: any): Promise<void> {
    logger.info('[Discovery] Initializing RAG-powered discovery engine...');
    await this.ragEngine.initialize(currentConfig);
    logger.info('[Discovery] RAG engine ready for semantic discovery');
  }
  
  async findBestTool(description: string): Promise<{
    name: string;
    confidence: number;
    reason: string;
  } | null> {
    try {
      // Use RAG for ALL semantic discovery - no hard-coded overrides
      const results = await this.ragEngine.discover(description, 1);
      
      if (results.length > 0) {
        const best = results[0];
        return {
          name: best.toolId,
          confidence: best.confidence,
          reason: best.reason
        };
      }
      
      // Fallback to old keyword matching if RAG returns nothing
      logger.warn(`[Discovery] RAG returned no results for: "${description}"`);
      const keywordMatch = this.findKeywordMatch(description);
      if (keywordMatch) {
        return keywordMatch;
      }
      
      return null;
    } catch (error) {
      logger.error('[Discovery] RAG discovery failed:', error);
      
      // Fallback to keyword matching
      const keywordMatch = this.findKeywordMatch(description);
      if (keywordMatch) {
        return keywordMatch;
      }
      
      return null;
    }
  }

  /**
   * Find multiple relevant tools using RAG discovery
   */
  async findRelevantTools(description: string, limit: number = 15): Promise<Array<{
    name: string;
    confidence: number;
    reason: string;
  }>> {
    try {
      // Use RAG for semantic discovery
      const results = await this.ragEngine.discover(description, limit);
      
      return results.map(result => ({
        name: result.toolId,
        confidence: result.confidence,
        reason: result.reason
      }));
    } catch (error) {
      logger.error('[Discovery] RAG multi-discovery failed:', error);
      return [];
    }
  }
  
  private findPatternMatch(description: string): {
    name: string;
    confidence: number;
    reason: string;
  } | null {
    const normalized = description.toLowerCase().trim();
    
    // Check patterns that were dynamically extracted
    for (const [toolId, patterns] of this.toolPatterns) {
      for (const pattern of patterns) {
        if (normalized.includes(pattern.toLowerCase())) {
          return {
            name: toolId,
            confidence: 0.9,
            reason: `Pattern match: "${pattern}"`
          };
        }
      }
    }
    
    return null;
  }
  
  private async findSimilarityMatch(description: string): Promise<{
    name: string;
    confidence: number;
    reason: string;
  } | null> {
    const descLower = description.toLowerCase();
    let bestMatch: any = null;
    let bestScore = 0;
    
    for (const [toolId, tool] of this.tools) {
      const toolDesc = (tool.description || '').toLowerCase();
      const score = this.calculateSimilarity(descLower, toolDesc);
      
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestMatch = {
          name: toolId,
          confidence: Math.min(0.95, score),
          reason: 'Description similarity'
        };
      }
    }
    
    return bestMatch;
  }
  
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    // Jaccard similarity
    return intersection.size / union.size;
  }
  
  private findKeywordMatch(description: string): {
    name: string;
    confidence: number;
    reason: string;
  } | null {
    const keywords = description.toLowerCase().split(/\s+/);
    const scores = new Map<string, number>();
    
    // Score each tool based on keyword matches in patterns
    for (const [toolId, patterns] of this.toolPatterns) {
      let score = 0;
      
      for (const pattern of patterns) {
        const patternWords = pattern.toLowerCase().split(/\s+/);
        for (const word of patternWords) {
          if (keywords.includes(word)) {
            score += 1;
          }
        }
      }
      
      if (score > 0) {
        scores.set(toolId, score);
      }
    }
    
    // Find best scoring tool
    if (scores.size > 0) {
      const sorted = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1]);
      
      const [bestTool, bestScore] = sorted[0];
      const maxScore = Math.max(...Array.from(scores.values()));
      
      return {
        name: bestTool,
        confidence: Math.min(0.7, bestScore / maxScore),
        reason: 'Keyword matching'
      };
    }
    
    return null;
  }
  
  async findRelatedTools(toolName: string): Promise<any[]> {
    // Find tools with similar descriptions
    const tool = this.tools.get(toolName);
    if (!tool) return [];
    
    const related = [];
    for (const [id, otherTool] of this.tools) {
      if (id === toolName) continue;
      
      const similarity = this.calculateSimilarity(
        tool.description.toLowerCase(),
        otherTool.description.toLowerCase()
      );
      
      if (similarity > 0.3) {
        related.push({
          id,
          name: otherTool.name,
          similarity
        });
      }
    }
    
    return related.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }
  
  /**
   * Index a tool using RAG embeddings
   */
  async indexTool(tool: any): Promise<void> {
    this.tools.set(tool.id, tool);
    
    // Keep old pattern extraction as fallback
    const patterns = this.extractPatternsFromDescription(tool.description || '');
    const namePatterns = this.extractPatternsFromName(tool.name);
    const allPatterns = [...patterns, ...namePatterns];
    
    if (allPatterns.length > 0) {
      this.toolPatterns.set(tool.id, allPatterns);
    }
    
    this.toolsByDescription.set(tool.description?.toLowerCase() || '', tool.id);
    
    logger.debug(`[Discovery] Indexed ${tool.id} (${allPatterns.length} fallback patterns)`);
  }

  /**
   * Index tools from an MCP using RAG
   */
  async indexMCPTools(mcpName: string, tools: any[]): Promise<void> {
    // Index individual tools for fallback
    for (const tool of tools) {
      // Create tool with proper ID format for discovery
      const toolWithId = {
        ...tool,
        id: `${mcpName}:${tool.name}`
      };
      await this.indexTool(toolWithId);
    }

    // Index in RAG engine for semantic discovery
    await this.ragEngine.indexMCP(mcpName, tools);
  }

  /**
   * Get RAG engine statistics
   */
  getRagStats() {
    return this.ragEngine.getStats();
  }

  /**
   * Clear RAG cache
   */
  async clearRagCache(): Promise<void> {
    await this.ragEngine.clearCache();
  }

  /**
   * Force refresh RAG cache
   */
  async refreshRagCache(): Promise<void> {
    await this.ragEngine.refreshCache();
  }
  
  /**
   * Extract meaningful patterns from a tool description
   */
  private extractPatternsFromDescription(description: string): string[] {
    if (!description) return [];
    
    const patterns = new Set<string>();
    const words = description.toLowerCase().split(/\s+/);
    
    // Common action verbs in MCP tools
    const actionVerbs = [
      'create', 'read', 'update', 'delete', 'edit',
      'run', 'execute', 'apply', 'commit', 'save',
      'get', 'set', 'list', 'search', 'find',
      'move', 'copy', 'rename', 'remove', 'monitor',
      'check', 'validate', 'test', 'build', 'deploy'
    ];
    
    // Common objects in MCP tools
    const objects = [
      'file', 'files', 'directory', 'folder',
      'commit', 'changes', 'operation', 'operations',
      'task', 'tasks', 'command', 'script',
      'project', 'code', 'data', 'content',
      'tool', 'tools', 'resource', 'resources'
    ];
    
    // Extract verb-object patterns
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // If it's an action verb
      if (actionVerbs.includes(word)) {
        // Add the verb itself
        patterns.add(word);
        
        // Look for objects after the verb
        if (i + 1 < words.length) {
          const nextWord = words[i + 1];
          patterns.add(`${word} ${nextWord}`);
          
          // Check for "verb multiple objects" pattern
          if (nextWord === 'multiple' && i + 2 < words.length) {
            patterns.add(`${word} multiple ${words[i + 2]}`);
          }
        }
      }
      
      // If it's an object
      if (objects.includes(word)) {
        patterns.add(word);
        
        // Check for "multiple objects" pattern
        if (i > 0 && words[i - 1] === 'multiple') {
          patterns.add(`multiple ${word}`);
        }
      }
    }
    
    // Extract any phrases in quotes or parentheses
    const quotedPattern = /["'`]([^"'`]+)["'`]/g;
    let match;
    while ((match = quotedPattern.exec(description)) !== null) {
      patterns.add(match[1].toLowerCase());
    }
    
    // Extract key phrases (3-word combinations that include verbs/objects)
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (actionVerbs.some(v => phrase.includes(v)) || 
          objects.some(o => phrase.includes(o))) {
        patterns.add(phrase);
      }
    }
    
    return Array.from(patterns);
  }
  
  /**
   * Extract patterns from tool name
   */
  private extractPatternsFromName(name: string): string[] {
    if (!name) return [];
    
    const patterns = [];
    
    // Split by underscore, hyphen, or camelCase
    const parts = name.split(/[_\-]|(?=[A-Z])/);
    
    // Add individual parts and combinations
    for (const part of parts) {
      if (part.length > 2) {
        patterns.push(part.toLowerCase());
      }
    }
    
    // Add the full name as a pattern
    patterns.push(name.toLowerCase());
    
    return patterns;
  }
  
  /**
   * Check if description is a git operation that should be routed to Shell
   */
  private checkGitOperationOverride(description: string): {
    name: string;
    confidence: number;
    reason: string;
  } | null {
    const desc = description.toLowerCase().trim();
    
    // Git-specific patterns that should always go to Shell
    const gitPatterns = [
      'git commit', 'git push', 'git pull', 'git status', 'git add', 'git log', 
      'git diff', 'git branch', 'git checkout', 'git merge', 'git clone',
      'git remote', 'git fetch', 'git rebase', 'git stash', 'git tag',
      'commit changes', 'push to git', 'pull from git', 'check git status',
      'add files to git', 'create git branch'
    ];
    
    // Check for explicit git patterns
    for (const pattern of gitPatterns) {
      if (desc.includes(pattern)) {
        return {
          name: 'Shell:run_command',
          confidence: 0.95,
          reason: `Git operation override: "${pattern}"`
        };
      }
    }
    
    // Check for single "git" word if it's the primary intent
    if (desc === 'git' || desc.startsWith('git ') || desc.endsWith(' git')) {
      return {
        name: 'Shell:run_command',
        confidence: 0.90,
        reason: 'Git command override'
      };
    }
    
    return null;
  }

  /**
   * Check if description is a single file operation that should go to read_file
   */
  private checkSingleFileOperationOverride(description: string): {
    name: string;
    confidence: number;
    reason: string;
  } | null {
    const desc = description.toLowerCase().trim();
    
    // Single file reading patterns that should go to read_file (not read_multiple_files)
    const singleFilePatterns = [
      'show file', 'view file', 'display file', 'get file',
      'show file content', 'view file content', 'display file content',
      'file content', 'read file', 'show single file', 'view single file'
    ];
    
    // Exclude patterns that should actually use multiple files
    const multipleFileIndicators = ['multiple', 'many', 'all', 'several'];
    
    // Check if it contains multiple file indicators
    const hasMultipleIndicator = multipleFileIndicators.some(indicator => 
      desc.includes(indicator)
    );
    
    if (hasMultipleIndicator) {
      return null; // Let it go to multiple files
    }
    
    // Check for single file patterns
    for (const pattern of singleFilePatterns) {
      if (desc.includes(pattern)) {
        return {
          name: 'desktop-commander:read_file',
          confidence: 0.95,
          reason: `Single file operation override: "${pattern}"`
        };
      }
    }
    
    return null;
  }

  /**
   * Get statistics about indexed tools
   */
  getStats(): any {
    return {
      totalTools: this.tools.size,
      totalPatterns: Array.from(this.toolPatterns.values())
        .reduce((sum, patterns) => sum + patterns.length, 0),
      toolsWithPatterns: this.toolPatterns.size
    };
  }
}
