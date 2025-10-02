# Smithery → MCP ConfigurationSchema Migration

## Note

This strategy has been moved to the **ncp-ecosystem-builder** repository where the implementation will occur.

**Location**: `/Users/arul/Projects/ncp-ecosystem-builder/SMITHERY-TO-MCP-STRATEGY.md`

## Summary

Instead of trying to read `smithery.yaml` from npm packages (Tier 2 detection in NCP), we're taking a better approach:

1. **Scan Smithery registry** for MCPs with smithery.yaml metadata
2. **Convert** smithery.yaml → MCP protocol `configurationSchema` code
3. **Generate PRs** for MCP repositories with implementation
4. **Help ecosystem adopt** the official MCP spec

## Benefits

- **For NCP**: Tier 1 coverage increases from ~5% to 40-60%
- **For MCP Maintainers**: Free implementation of official spec
- **For Ecosystem**: Faster standardization
- **Better Positioning**: We're helping, not asking ecosystem to change for us

## Implementation Repository

**ncp-ecosystem-builder** - Private repository for:
- Discovering and analyzing real MCPs
- Generating test ecosystems for NCP validation
- **NEW**: Automating Smithery→MCP spec migration

See the full strategy document in that repository for:
- Detailed implementation plan
- Phase-by-phase rollout
- Code examples and templates
- PR submission strategy
- Success metrics

---

**Related in this repo**:
- `src/utils/smithery-config-reader.ts` - Will be copied to ecosystem-builder
- `src/utils/schema-converter.ts` - Will be copied to ecosystem-builder
- `docs/config-detection-strategy.md` - Tier 2 detection (bonus, <5% coverage)
