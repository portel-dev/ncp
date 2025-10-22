import { SearchEnhancer } from '../src/discovery/search-enhancer';

describe('SearchEnhancer', () => {
  describe('Action Semantic Mapping', () => {
    test('should get semantic mappings for save action', () => {
      const semantics = SearchEnhancer.getActionSemantics('save');
      expect(semantics).toContain('write');
      expect(semantics).toContain('create');
      expect(semantics).toContain('store');
      expect(semantics).toContain('edit');
      expect(semantics).toContain('modify');
      expect(semantics).toContain('update');
    });

    test('should get semantic mappings for load action', () => {
      const semantics = SearchEnhancer.getActionSemantics('load');
      expect(semantics).toContain('read');
      expect(semantics).toContain('get');
      expect(semantics).toContain('open');
    });

    test('should return empty array for unknown action', () => {
      const semantics = SearchEnhancer.getActionSemantics('unknownaction');
      expect(semantics).toEqual([]);
    });

    test('should handle case-insensitive action words', () => {
      const semantics1 = SearchEnhancer.getActionSemantics('SAVE');
      const semantics2 = SearchEnhancer.getActionSemantics('save');
      expect(semantics1).toEqual(semantics2);
    });
  });

  describe('Term Classification', () => {
    test('should classify action terms correctly', () => {
      expect(SearchEnhancer.classifyTerm('save')).toBe('ACTION');
      expect(SearchEnhancer.classifyTerm('write')).toBe('ACTION');
      expect(SearchEnhancer.classifyTerm('read')).toBe('ACTION');
      expect(SearchEnhancer.classifyTerm('delete')).toBe('ACTION');
    });

    test('should classify object terms correctly', () => {
      expect(SearchEnhancer.classifyTerm('file')).toBe('OBJECT');
      expect(SearchEnhancer.classifyTerm('document')).toBe('OBJECT');
      expect(SearchEnhancer.classifyTerm('database')).toBe('OBJECT');
      expect(SearchEnhancer.classifyTerm('user')).toBe('OBJECT');
    });

    test('should classify modifier terms correctly', () => {
      expect(SearchEnhancer.classifyTerm('text')).toBe('MODIFIER');
      expect(SearchEnhancer.classifyTerm('json')).toBe('MODIFIER');
      expect(SearchEnhancer.classifyTerm('large')).toBe('MODIFIER');
      expect(SearchEnhancer.classifyTerm('new')).toBe('MODIFIER');
    });

    test('should classify scope terms correctly', () => {
      expect(SearchEnhancer.classifyTerm('all')).toBe('SCOPE');
      expect(SearchEnhancer.classifyTerm('multiple')).toBe('SCOPE');
      expect(SearchEnhancer.classifyTerm('batch')).toBe('SCOPE');
      expect(SearchEnhancer.classifyTerm('recursive')).toBe('SCOPE');
    });

    test('should return OTHER for unrecognized terms', () => {
      expect(SearchEnhancer.classifyTerm('xyz')).toBe('OTHER');
      expect(SearchEnhancer.classifyTerm('randomword')).toBe('OTHER');
    });
  });

  describe('Type Weights', () => {
    test('should return correct weights for ACTION type', () => {
      const weights = SearchEnhancer.getTypeWeights('ACTION');
      expect(weights.name).toBe(0.7);
      expect(weights.desc).toBe(0.35);
    });

    test('should return correct weights for OBJECT type', () => {
      const weights = SearchEnhancer.getTypeWeights('OBJECT');
      expect(weights.name).toBe(0.2);
      expect(weights.desc).toBe(0.1);
    });

    test('should return correct weights for MODIFIER type', () => {
      const weights = SearchEnhancer.getTypeWeights('MODIFIER');
      expect(weights.name).toBe(0.05);
      expect(weights.desc).toBe(0.025);
    });

    test('should return correct weights for SCOPE type', () => {
      const weights = SearchEnhancer.getTypeWeights('SCOPE');
      expect(weights.name).toBe(0.03);
      expect(weights.desc).toBe(0.015);
    });

    test('should return default weights for unknown type', () => {
      const weights = SearchEnhancer.getTypeWeights('UNKNOWN');
      expect(weights.name).toBe(0.15);
      expect(weights.desc).toBe(0.075);
    });
  });

  describe('Intent Penalty', () => {
    test('should penalize read-only tools when intent is save', () => {
      const penalty = SearchEnhancer.getIntentPenalty('save', 'read_file');
      expect(penalty).toBe(0.3);
    });

    test('should penalize read-only tools when intent is write', () => {
      const penalty = SearchEnhancer.getIntentPenalty('write', 'read_text_file');
      expect(penalty).toBe(0.3);
    });

    test('should not penalize tools with both read and write capabilities', () => {
      const penalty = SearchEnhancer.getIntentPenalty('save', 'read_write_file');
      expect(penalty).toBe(0);
    });

    test('should not penalize tools with edit capability', () => {
      const penalty = SearchEnhancer.getIntentPenalty('save', 'edit_file');
      expect(penalty).toBe(0);
    });

    test('should penalize write-only tools when intent is read', () => {
      const penalty = SearchEnhancer.getIntentPenalty('read', 'write_file');
      expect(penalty).toBe(0.2);
    });

    test('should penalize delete tools when intent is create', () => {
      const penalty = SearchEnhancer.getIntentPenalty('create', 'delete_file');
      expect(penalty).toBe(0.3);
    });

    test('should penalize delete tools when intent is add', () => {
      const penalty = SearchEnhancer.getIntentPenalty('add', 'delete_record');
      expect(penalty).toBe(0.3);
    });

    test('should return no penalty for aligned operations', () => {
      const penalty1 = SearchEnhancer.getIntentPenalty('save', 'write_file');
      const penalty2 = SearchEnhancer.getIntentPenalty('read', 'read_file');
      const penalty3 = SearchEnhancer.getIntentPenalty('delete', 'delete_file');

      expect(penalty1).toBe(0);
      expect(penalty2).toBe(0);
      expect(penalty3).toBe(0);
    });
  });

  describe('Query Analysis', () => {
    test('should analyze query and provide comprehensive information', () => {
      const analysis = SearchEnhancer.analyzeQuery('save text file');

      expect(analysis.terms).toEqual(['save', 'text', 'file']);
      expect(analysis.classifications['save']).toBe('ACTION');
      expect(analysis.classifications['text']).toBe('MODIFIER');
      expect(analysis.classifications['file']).toBe('OBJECT');

      expect(analysis.actionSemantics['save']).toBeDefined();
      expect(analysis.actionSemantics['save']).toContain('write');

      expect(analysis.weights['save'].name).toBe(0.7);
      expect(analysis.weights['text'].name).toBe(0.05);
      expect(analysis.weights['file'].name).toBe(0.2);
    });

    test('should filter short terms in query analysis', () => {
      const analysis = SearchEnhancer.analyzeQuery('save a to file');

      // 'a' and 'to' should be filtered out (length <= 2)
      expect(analysis.terms).toEqual(['save', 'file']);
      expect(analysis.terms).not.toContain('a');
      expect(analysis.terms).not.toContain('to');
    });
  });

  describe('Actions by Category', () => {
    test('should get write category actions', () => {
      const actions = SearchEnhancer.getActionsByCategory('write');
      expect(actions).toContain('save');
      expect(actions).toContain('write');
      expect(actions).toContain('create');
      expect(actions).toContain('store');
    });

    test('should get read category actions', () => {
      const actions = SearchEnhancer.getActionsByCategory('read');
      expect(actions).toContain('read');
      expect(actions).toContain('get');
      expect(actions).toContain('load');
      expect(actions).toContain('fetch');
    });

    test('should get delete category actions', () => {
      const actions = SearchEnhancer.getActionsByCategory('delete');
      expect(actions).toContain('delete');
      expect(actions).toContain('remove');
      expect(actions).toContain('clear');
      expect(actions).toContain('drop');
    });
  });

  describe('Extensibility Methods', () => {
    test('should add new action semantic mapping', () => {
      SearchEnhancer.addActionSemantic('custom', ['test1', 'test2']);
      const semantics = SearchEnhancer.getActionSemantics('custom');
      expect(semantics).toEqual(['test1', 'test2']);
    });

    test('should add terms to type category', () => {
      SearchEnhancer.addTermsToType('CUSTOM_TYPE', ['term1', 'term2']);
      expect(SearchEnhancer.classifyTerm('term1')).toBe('CUSTOM_TYPE');
      expect(SearchEnhancer.classifyTerm('term2')).toBe('CUSTOM_TYPE');
    });

    test('should update type weights', () => {
      SearchEnhancer.updateTypeWeights('CUSTOM_TYPE', 0.5, 0.25);
      const weights = SearchEnhancer.getTypeWeights('CUSTOM_TYPE');
      expect(weights.name).toBe(0.5);
      expect(weights.desc).toBe(0.25);
    });
  });

  describe('Utility Methods', () => {
    test('should get all term types', () => {
      const types = SearchEnhancer.getAllTermTypes();
      expect(types).toContain('ACTION');
      expect(types).toContain('OBJECT');
      expect(types).toContain('MODIFIER');
      expect(types).toContain('SCOPE');
      // Check if array is sorted
      const sorted = [...types].sort();
      expect(types).toEqual(sorted);
    });

    test('should get all actions', () => {
      const actions = SearchEnhancer.getAllActions();
      expect(actions).toContain('save');
      expect(actions).toContain('load');
      expect(actions).toContain('modify');
      // Check if array is sorted
      const sorted = [...actions].sort();
      expect(actions).toEqual(sorted);
    });
  });
});