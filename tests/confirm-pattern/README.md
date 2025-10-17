# Confirm-Before-Run Pattern Testing

This directory contains the test suite used to scientifically determine the optimal pattern and threshold for the confirm-before-run safety feature.

## Test Files

### Core Test Scripts

**`test-confirm-pattern-fast.js`**
- Fast version using cached embeddings from `~/.ncp.backup/embeddings.json`
- Tests single pattern against all MCP tools
- Evaluates multiple threshold levels (0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80)
- Outputs CSV with results

**`test-pattern-variations.js`**
- Compares 8 different pattern formulations
- Tests: verbose list, simplified verbs, core concepts, danger-focused, etc.
- Determines which wording style performs best
- Tests thresholds: 0.35, 0.40, 0.45, 0.50, 0.55, 0.60

**`test-story-patterns.js`**
- Tests story/narrative-driven pattern variations
- Compares prose vs. list formats
- Tests: definition stories, consequence-focused, behavior descriptions, etc.
- Evaluates whether natural language narrative improves matching

**`test-tag-patterns.js`** ⭐ **Winner**
- Tests tag-based patterns with hyphenated concepts
- Compares different tag densities and structures
- **Result**: Hyphenated tags achieved 46.4% peak accuracy (best performance)
- Led to current production pattern

### Result Files

**`confirm-pattern-results.csv`**
- Initial test results with original verbose pattern
- All 83 tools with confidence scores

**`optimal-pattern-results.csv`**
- Results with recommended pattern
- Includes multiple threshold trigger columns

**`pattern-comparison-summary.json`**
- Comparison of all 8 pattern variations
- Statistical analysis and recommendations

**`story-pattern-results.json`**
- Results from narrative/story pattern testing
- Shows prose patterns don't perform as well

**`tag-pattern-results.json`** ⭐ **Production Basis**
- Tag-based pattern comparison
- Shows hyphenated tags outperform all other approaches
- Used to determine production defaults

## Key Findings

### 🏆 Winner: Hyphenated Tag Pattern

```
delete-files remove-data-permanently create-files write-to-disk
send-emails execute-shell-commands deploy-to-production...
```

**Performance:**
- Max Score: **46.4%** (highest of all patterns tested)
- Avg Score: **18.9%** (best distribution)
- Threshold 0.40: Catches 5 critical tools (6.1%)

**Why it works:**
- Hyphens create semantic units (`write-to-disk` = single concept)
- Higher keyword density (27 words vs. 75 in verbose)
- No filler words ("operations that", "or", "make")
- Stronger vector signals for embedding model

### 📊 Comparison Results

| Pattern Type | Max Score | Avg Score | Tools @ 0.40 |
|--------------|-----------|-----------|--------------|
| **Tags: Hyphenated** | **46.4%** | **18.9%** | **5** ← Winner |
| Current (verbose) | 44.7% | 15.8% | 5 |
| Story: Safety warning | 41.0% | 15.6% | 1 |
| Story: Classification | 39.4% | 19.1% | 0 |
| Tags: Core actions | 42.6% | 11.5% | 1 |
| Single words only | 28.0% | 5.7% | 0 |

### 🎯 Optimal Threshold

**Recommended: 0.40**
- Catches 5 critical operations (6.1% of tools)
- Balance between safety and usability
- Tools caught:
  1. filesystem:write_file (46.4%)
  2. docker:run_command (44.7%)
  3. filesystem:edit_file (42.9%)
  4. kubernetes:kubectl_generic (42.6%)
  5. kubernetes:exec_in_pod (40.6%)

## Running the Tests

```bash
# Fast test with cached embeddings
node test-confirm-pattern-fast.js

# Compare different pattern wordings
node test-pattern-variations.js

# Test story/narrative approaches
node test-story-patterns.js

# Test tag-based patterns (production winner)
node test-tag-patterns.js
```

## Test Methodology

1. **Load cached embeddings** - Uses `~/.ncp.backup/embeddings.json` (83 real MCP tools)
2. **Generate pattern embedding** - Creates vector for the test pattern
3. **Calculate similarities** - Cosine similarity against all tool embeddings
4. **Test thresholds** - Evaluates multiple confidence levels
5. **Analyze results** - Statistical analysis and recommendations
6. **Output reports** - CSV and JSON files for review

## Understanding the Results

### Confidence Scores

- **0.50+**: Almost certainly a dangerous operation
- **0.40-0.50**: Likely dangerous, worth confirming
- **0.30-0.40**: Potentially dangerous, depends on context
- **0.20-0.30**: Probably safe, some semantic overlap
- **< 0.20**: Safe operations (read-only, informational)

### Threshold Selection

Balance between:
- **Too low (0.30)**: Too many false positives, user fatigue
- **Too high (0.60)**: Misses dangerous operations
- **Sweet spot (0.40)**: Catches real dangers, minimal annoyance

Target: **5-15% of tools** trigger confirmation (dangerous operations only)

## Insights Learned

1. **Hyphenated tags > Prose** - Tag-based patterns outperform natural language
2. **Keyword density matters** - More concentrated concepts = stronger signals
3. **Connector words dilute** - "operations that", "or", "make" weaken matching
4. **Story format doesn't help** - Narrative structure confuses embedding model
5. **Length isn't everything** - Shorter hyphenated pattern beats longer prose

## Future Testing

Ideas for additional evaluation:
- Test against larger tool corpus (200+ tools)
- Domain-specific patterns (dev-only, prod-only, financial)
- Multi-language pattern support
- Time-based pattern evolution
- User feedback incorporation

## Production Implementation

These tests led to:
- Default pattern in `/src/utils/global-settings.ts`
- Threshold set to 0.40
- Documentation in `/docs/confirm-before-run.md`
- CLI command: `ncp test confirm-pattern`
