/**
 * Fuzzy matching utility for typo tolerance
 * Uses Levenshtein distance algorithm to find similar strings
 * Adapted from Photon's implementation
 */

export interface FuzzyMatch {
  text: string;
  distance: number;
}

/**
 * Fuzzy matcher for finding similar strings
 * Useful for: "Did you mean?" suggestions, typo correction, command aliases
 */
export class FuzzyMatcher {
  /**
   * Find similar matches for a query string
   * Returns matches sorted by similarity (lowest distance first)
   */
  findSuggestions(
    query: string,
    candidates: string[],
    maxDistance?: number
  ): string[] {
    if (!query || candidates.length === 0) {
      return [];
    }

    // Default: allow up to 1/3 of query length as distance
    // This keeps suggestions reasonable while still being forgiving
    const threshold =
      maxDistance !== undefined
        ? maxDistance
        : Math.max(1, Math.floor(query.length / 3));

    const matches: FuzzyMatch[] = candidates
      .map(candidate => ({
        text: candidate,
        distance: this.levenshteinDistance(query.toLowerCase(), candidate.toLowerCase())
      }))
      .filter(match => match.distance <= threshold)
      .sort((a, b) => a.distance - b.distance);

    return matches.map(m => m.text);
  }

  /**
   * Get the best single match for a query
   */
  findBestMatch(query: string, candidates: string[]): string | undefined {
    const suggestions = this.findSuggestions(query, candidates);
    return suggestions.length > 0 ? suggestions[0] : undefined;
  }

  /**
   * Check if two strings are similar enough (for aliasing)
   */
  isSimilar(str1: string, str2: string, threshold: number = 2): boolean {
    const distance = this.levenshteinDistance(
      str1.toLowerCase(),
      str2.toLowerCase()
    );
    return distance <= threshold;
  }

  /**
   * Calculate Levenshtein distance (edit distance) between two strings
   * Measures minimum edits (insert, delete, substitute) needed to transform one string into another
   */
  private levenshteinDistance(a: string, b: string): number {
    const aLen = a.length;
    const bLen = b.length;

    // Create matrix to store distances
    const matrix: number[][] = Array(bLen + 1)
      .fill(null)
      .map(() => Array(aLen + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= aLen; i++) {
      matrix[0][i] = i;
    }
    for (let j = 0; j <= bLen; j++) {
      matrix[j][0] = j;
    }

    // Fill in the rest of the matrix
    for (let j = 1; j <= bLen; j++) {
      for (let i = 1; i <= aLen; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[bLen][aLen];
  }

  /**
   * Get similarity score (0-1) between two strings
   * 1.0 = identical, 0.0 = completely different
   */
  similarityScore(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0; // Both empty = similar

    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1.0 - distance / maxLen;
  }
}
