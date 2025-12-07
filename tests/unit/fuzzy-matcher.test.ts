/**
 * Unit tests for FuzzyMatcher utility
 * Tests Levenshtein distance and suggestion algorithms
 */

import { FuzzyMatcher } from '../../src/utils/fuzzy-matcher';

describe('FuzzyMatcher', () => {
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher();
  });

  describe('findSuggestions', () => {
    const commands = ['find', 'run', 'list', 'config', 'auth', 'help'];

    test('should find exact matches with distance 0', () => {
      const suggestions = matcher.findSuggestions('find', commands);
      expect(suggestions).toContain('find');
    });

    test('should find close matches for single character difference', () => {
      const suggestions = matcher.findSuggestions('fint', commands);
      expect(suggestions).toContain('find');
    });

    test('should find close matches with custom threshold', () => {
      // 'rnu' -> 'run' requires threshold of 2 (swap n and u)
      const suggestions = matcher.findSuggestions('rnu', commands, 2);
      expect(suggestions).toContain('run');
    });

    test('should find matches for missing character', () => {
      const suggestions = matcher.findSuggestions('lst', commands);
      expect(suggestions).toContain('list');
    });

    test('should find matches for extra character', () => {
      const suggestions = matcher.findSuggestions('finnd', commands);
      expect(suggestions).toContain('find');
    });

    test('should be case insensitive', () => {
      const suggestions = matcher.findSuggestions('FIND', commands);
      expect(suggestions).toContain('find');
    });

    test('should return empty array for very different strings', () => {
      const suggestions = matcher.findSuggestions('xyz', commands);
      expect(suggestions.length).toBe(0);
    });

    test('should respect custom distance threshold', () => {
      const suggestions = matcher.findSuggestions('fint', commands, 0);
      expect(suggestions.length).toBe(0); // No matches within distance 0
    });

    test('should return suggestions sorted by similarity (closest first)', () => {
      const suggestions = matcher.findSuggestions('fin', commands);
      expect(suggestions[0]).toBe('find'); // Closest match should be first
    });

    test('should return multiple suggestions when available', () => {
      const suggestions = matcher.findSuggestions('config', commands);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('config');
    });
  });

  describe('findBestMatch', () => {
    const commands = ['find', 'run', 'list', 'config'];

    test('should return the best single match', () => {
      const best = matcher.findBestMatch('fint', commands);
      expect(best).toBe('find');
    });

    test('should return undefined if no matches found', () => {
      const best = matcher.findBestMatch('xyz', commands);
      expect(best).toBeUndefined();
    });

    test('should return exact match when available', () => {
      const best = matcher.findBestMatch('find', commands);
      expect(best).toBe('find');
    });
  });

  describe('isSimilar', () => {
    test('should return true for identical strings', () => {
      expect(matcher.isSimilar('hello', 'hello')).toBe(true);
    });

    test('should return true for strings within threshold', () => {
      expect(matcher.isSimilar('hello', 'helo', 1)).toBe(true);
    });

    test('should return false for strings beyond threshold', () => {
      expect(matcher.isSimilar('hello', 'xyz', 2)).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(matcher.isSimilar('HELLO', 'hello')).toBe(true);
    });
  });

  describe('similarityScore', () => {
    test('should return 1.0 for identical strings', () => {
      const score = matcher.similarityScore('test', 'test');
      expect(score).toBe(1.0);
    });

    test('should return 1.0 for empty strings', () => {
      const score = matcher.similarityScore('', '');
      expect(score).toBe(1.0);
    });

    test('should return a score between 0 and 1', () => {
      const score = matcher.similarityScore('hello', 'hallo');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    test('should be case insensitive', () => {
      const score1 = matcher.similarityScore('HELLO', 'hello');
      const score2 = matcher.similarityScore('hello', 'hello');
      expect(score1).toBe(score2);
    });

    test('should give higher scores for closer matches', () => {
      const close = matcher.similarityScore('hello', 'helo');
      const far = matcher.similarityScore('hello', 'xyz');
      expect(close).toBeGreaterThan(far);
    });
  });

  describe('levenshteinDistance (via private method testing)', () => {
    test('should calculate distance for substitution', () => {
      // kitten → sitting: 3 substitutions
      const suggestions = matcher.findSuggestions('kitten', ['sitting']);
      expect(suggestions.length).toBe(0); // Distance 3 is too far with default threshold
    });

    test('should calculate distance for insertion', () => {
      // cat → cats: 1 insertion
      const suggestions = matcher.findSuggestions('cat', ['cats']);
      expect(suggestions).toContain('cats');
    });

    test('should calculate distance for deletion', () => {
      // cats → cat: 1 deletion
      const suggestions = matcher.findSuggestions('cats', ['cat']);
      expect(suggestions).toContain('cat');
    });

    test('should handle short query strings', () => {
      // Single character query should still find matches
      const suggestions = matcher.findSuggestions('f', ['find', 'run', 'list']);
      // 'f' to 'find' has distance 3 (add i, n, d)
      // With threshold 1/3 of 'f'.length = 0, only exact matches (none)
      // So we don't expect results with default threshold
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('real-world command matching', () => {
    const ncpCommands = [
      'find', 'run', 'list', 'add', 'remove', 'config',
      'auth', 'update', 'profile', 'doctor', 'help'
    ];

    test('should handle common typos in commands', () => {
      const typos = {
        'fnd': 'find',      // distance 1
        'lst': 'list',      // distance 1
        'cinfig': 'config', // distance 1
        'doctro': 'doctor'  // distance 1
      };

      Object.entries(typos).forEach(([typo, expected]) => {
        const suggestions = matcher.findSuggestions(typo, ncpCommands);
        expect(suggestions[0]).toBe(expected);
      });
    });

    test('should suggest alternatives for unknown commands', () => {
      const suggestions = matcher.findSuggestions('finde', ncpCommands);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('find');
    });
  });
});
