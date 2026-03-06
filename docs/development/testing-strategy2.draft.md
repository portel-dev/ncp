# Testing Strategy for Code Unification

## Overview
When unifying code from multiple sources (e.g., commercial and OSS versions), regression testing is critical to ensure functionality remains intact.

## Key Testing Approaches

### 1. Before/After Snapshot Testing
- Capture command outputs before changes
- Compare outputs after unification
- Use normalized snapshots to ignore irrelevant differences (versions, timestamps)

```bash
# Create baseline snapshots
UPDATE_SNAPSHOTS=true npm test -- regression-snapshot

# After changes, verify no regressions
npm test -- regression-snapshot
```

### 2. Critical Path Testing
Essential functionality that must never break:
- **Search functionality**: `find <query>` should return consistent results
- **Tool discovery**: All configured MCPs should be discoverable
- **Error handling**: Probe failures should not leak to CLI output
- **Command intelligence**: Single-word queries should work

### 3. Integration Points
Areas requiring special attention during unification:

#### Data Flow Between Components
- **Orchestrator → RAG Engine**: Tool descriptions should be passed raw, not pre-formatted
- **RAG Engine → Search Results**: Prefixing should happen once, consistently
- **CLI → Orchestrator**: Command parameters should maintain backward compatibility

#### Common Regression Patterns
1. **Double-processing**: Same transformation applied twice (e.g., double-prefixing)
2. **Missing processing**: Expected transformation skipped
3. **Format mismatches**: Different components expecting different data formats
4. **Timeout issues**: Different timeout values between versions

## Testing Checklist for Unification

### Pre-Unification
- [ ] Run full test suite on both codebases
- [ ] Capture output snapshots for key commands
- [ ] Document expected behaviors
- [ ] Note any known differences

### During Unification
- [ ] Test after each major component merge
- [ ] Run regression tests frequently
- [ ] Compare outputs with baseline snapshots
- [ ] Check for error leakage to CLI

### Post-Unification
- [ ] Full regression test suite
- [ ] Manual testing of critical paths
- [ ] Performance comparison
- [ ] Error handling verification

## Example Regression Test

```typescript
describe('Critical functionality after unification', () => {
  test('search should not double-prefix descriptions', () => {
    const output = runCommand('find git-commit');
    // Should have single prefix
    expect(output).toContain('portel: Apply atomic operations');
    // Should NOT have double prefix
    expect(output).not.toContain('portel: portel:');
  });

  test('probe failures should not leak to CLI', () => {
    const output = runCommand('find anything');
    expect(output).not.toContain('[NCP ERROR]');
    expect(output).not.toContain('Probe timeout');
  });
});
```

## Automated Testing Commands

```bash
# Run regression tests
npm test -- regression-snapshot

# Update snapshots after verified changes
UPDATE_SNAPSHOTS=true npm test -- regression-snapshot

# Run with debug output
DEBUG=* npm test -- regression-snapshot
```

## Red Flags During Unification

1. **Sudden loss of search results** - Check for data format mismatches
2. **Error messages in CLI output** - Check logging levels
3. **Performance degradation** - Check for duplicate operations
4. **Missing functionality** - Check for skipped initialization
5. **Inconsistent behavior** - Check for race conditions

## Recovery Strategy

If regression is detected:
1. Use git bisect to find the exact commit
2. Review the specific changes in that commit
3. Check for data flow mismatches
4. Test the component in isolation
5. Add specific regression test for the issue