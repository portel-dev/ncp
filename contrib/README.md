# MCP Contribution Tools

This directory contains ecosystem contribution tools that are **not part of the core NCP product**.

## Moved to Private Repository

These tools have been moved to a private repository:

**Repository**: https://github.com/portel-dev/mcp-contrib-tools (private)

## What's in the Private Repo

### Tools for Contributing to MCP Ecosystem

1. **Configuration Schema Generator**
   - Generates `configurationSchema` from error patterns
   - Creates TypeScript code for MCP repositories
   - Outputs PR descriptions with examples

2. **PR Target Identifier**
   - Analyzes 1,215+ MCPs to prioritize PR targets
   - Scores by impact, popularity, complexity
   - Generates campaign plans by tier

3. **PR Content Generator**
   - Automates PR description generation
   - Creates testing notes
   - Provides example InitializeResult JSON

4. **Campaign Strategy**
   - Full PR campaign documentation
   - Messaging guidelines
   - Success metrics tracking

## Why Separate?

**Product vs Ecosystem Work:**
- NCP (main repo) = **consumer** of configuration schemas
- mcp-contrib-tools (private) = **generator** of schemas for other repos

This separation keeps the main NCP codebase focused on product features while ecosystem contribution tools remain organized separately.

## Strategy Documents (Kept Here for Reference)

- `mcp-pr-campaign-strategy.md` - Full campaign plan and messaging

These docs remain in the main repo as reference material but the implementation tools are in the private repository.

## For NCP Contributors

If you're working on NCP core product:
- ✅ Focus on `src/services/config-schema-reader.ts` (reads schemas)
- ✅ Focus on `src/services/config-prompter.ts` (prompts users)
- ✅ These are the **consumer** side of configuration schemas

If you're working on ecosystem contributions:
- ✅ Use the private mcp-contrib-tools repository
- ✅ These are the **generator** tools for creating schemas

## Access

The private repository is accessible to the NCP/Portel Dev team only. Contact the maintainers for access if needed.
