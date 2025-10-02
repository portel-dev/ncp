# MCP Configuration Schema PR Campaign

## Vision

Submit PRs to popular MCP repositories adding `configurationSchema` to their servers, promoting both the MCP spec enhancement AND NCP as a tool that leverages it.

## Win-Win-Win Strategy

### For MCP Maintainers
- ✅ Self-documenting configuration
- ✅ Better user experience
- ✅ Fewer support issues
- ✅ Programmatic validation

### For NCP
- ✅ Organic promotion through contributions
- ✅ Links from popular repos
- ✅ Validation of our spec proposal
- ✅ Better data for our cache

### For MCP Ecosystem
- ✅ More adoptable servers
- ✅ Standardized configuration patterns
- ✅ Better tooling support
- ✅ Proven spec enhancement

## Campaign Flow

```
1. Analyze Our Data          2. Generate Schema         3. Submit PR
   (1,215 MCPs indexed)          (Auto-generate)           (w/ NCP mention)
         ↓                            ↓                          ↓
   Find config needs         ConfigurationSchema        "Tools like NCP
   from error patterns        in TypeScript              can now guide users"
                                                                ↓
                                                         4. Get Merged
                                                                ↓
                                                         5. Cache in NCP
                                                            (Better UX)
```

## Target Selection Criteria

### Tier 1: High-Impact MCPs (Target First)
**Criteria:**
- ✅ Official MCP repositories (@modelcontextprotocol)
- ✅ High star count (>100 stars)
- ✅ Known configuration requirements
- ✅ Active maintenance

**Examples:**
- `@modelcontextprotocol/server-filesystem` (needs allowed-directory)
- `@modelcontextprotocol/server-github` (needs GITHUB_TOKEN)
- `@modelcontextprotocol/server-slack` (needs SLACK_TOKEN)
- `@modelcontextprotocol/server-postgres` (needs DATABASE_URL)

**Why:** Maximum visibility, official blessing, sets precedent

### Tier 2: Popular Third-Party MCPs
**Criteria:**
- ✅ 50+ stars
- ✅ Multiple configuration requirements
- ✅ Recent activity (commit in last 3 months)

**Why:** Broad ecosystem impact, community adoption

### Tier 3: Specialized MCPs
**Criteria:**
- ✅ Unique use case
- ✅ Complex configuration
- ✅ Good documentation candidates

**Why:** Demonstrates flexibility of approach

## PR Content Template

### Title
```
feat: add configuration schema for better tooling support
```

### Description
```markdown
## Summary

Adds `configurationSchema` to the `InitializeResult` to declare configuration requirements programmatically.

## Motivation

Currently, users only discover configuration requirements after connection failures:

**Before:**
```bash
$ npx @modelcontextprotocol/server-filesystem
❌ Connection closed
# User must read README to find out about allowed-directory argument
```

**After (with this change):**
```bash
$ ncp add filesystem
✓ Configuration detected: requires allowed-directory (path)
✓ Enter allowed-directory: /Users/me/projects
✓ Server configured successfully
```

## Changes

Extends `InitializeResult` with optional `configurationSchema`:

```typescript
{
  protocolVersion: "2024-11-05",
  serverInfo: { name: "filesystem", version: "1.0.0" },
  capabilities: {},
  configurationSchema: {
    arguments: [{
      name: "allowed-directory",
      description: "Directory path that the server is allowed to access",
      type: "path",
      required: true,
      multiple: true,
      examples: ["/home/user/projects", "/tmp"]
    }]
  }
}
```

## Benefits

### For Users
- Clear guidance on configuration requirements
- Interactive setup with tools like [NCP](https://github.com/PortelU/ncp)
- Fewer connection failures

### For Developers
- Self-documenting configuration
- Programmatic validation
- Better tooling support

## Related Work

This follows the proposed MCP spec enhancement:
- **Spec PR**: https://github.com/modelcontextprotocol/specification/pull/1583
- **Discussion**: https://github.com/modelcontextprotocol/specification/discussions/863

Tools leveraging this:
- **NCP** (Natural Context Provider): Uses configuration schema to guide users through MCP setup
  - Repo: https://github.com/PortelU/ncp
  - Analysis of 1,215+ MCPs shows 12% fail due to configuration issues
  - Interactive repair system uses configuration schema for validation

## Testing

- [ ] Server starts successfully with valid configuration
- [ ] Configuration schema is included in InitializeResult
- [ ] Backwards compatible (existing clients ignore new field)

## Checklist

- [ ] Code follows repository style
- [ ] Documentation updated (if applicable)
- [ ] Backwards compatible
- [ ] No breaking changes
```

## Implementation Guide

### Step 1: Analyze MCP
Run the MCP with our error parser to detect configuration needs:
```bash
ncp add <mcp-name> <command>
# Capture stderr and parse with MCPErrorParser
```

### Step 2: Generate Schema
Convert detected needs to `configurationSchema`:
```typescript
// From our error parser output
{
  type: 'command_arg',
  variable: 'allowed-directory',
  description: 'filesystem requires a allowed-directory',
  required: true
}

// To configurationSchema
{
  arguments: [{
    name: "allowed-directory",
    description: "Directory path that the server is allowed to access",
    type: "path",
    required: true,
    multiple: true
  }]
}
```

### Step 3: Fork and Implement
1. Fork MCP repository
2. Add `configurationSchema` to initialization
3. Test locally
4. Create PR with template above

### Step 4: Follow Up
- Monitor PR for feedback
- Be responsive to maintainer questions
- Offer to help with implementation

## Automation Tools Needed

### 1. Configuration Schema Generator
```typescript
// Input: MCPErrorParser output
// Output: configurationSchema TypeScript code

interface SchemaGeneratorInput {
  mcpName: string;
  configNeeds: ConfigurationNeed[];
  repoUrl: string;
}

interface SchemaGeneratorOutput {
  schemaCode: string;      // TypeScript code to add
  prDescription: string;   // Customized PR description
  testSuggestions: string; // Testing recommendations
}
```

### 2. PR Automation Script
```bash
# Usage: ./create-config-pr.sh <mcp-repo-url> <mcp-command>

# 1. Clone repo
# 2. Run MCP with error detection
# 3. Generate schema
# 4. Create branch
# 5. Make changes
# 6. Open PR with template
```

### 3. Priority Ranker
```typescript
// Analyze our 1,215 MCPs data
// Rank by:
// - Failure rate
// - Popularity (stars, downloads)
// - Maintenance activity
// - Configuration complexity

interface MCPPriority {
  name: string;
  repoUrl: string;
  stars: number;
  failureRate: number;
  configComplexity: number;
  score: number; // Weighted priority score
}
```

## Success Metrics

### Quantitative
- **PRs submitted**: Target 20 in first month
- **PRs merged**: Target 50% merge rate
- **Stars on NCP**: Track growth during campaign
- **Inbound links**: Count backlinks to NCP
- **Spec proposal traction**: Comments, approvals on PR #1583

### Qualitative
- Community reception to PRs
- Maintainer feedback
- Spec proposal discussion quality
- NCP mentions in MCP ecosystem

## Messaging Guidelines

### DO
- ✅ Lead with value to maintainer/users
- ✅ Reference spec proposal as official MCP enhancement
- ✅ Mention NCP as one example tool (not the only one)
- ✅ Provide complete, tested implementation
- ✅ Be helpful and responsive

### DON'T
- ❌ Make it about promoting NCP primarily
- ❌ Sound salesy or self-promotional
- ❌ Rush maintainers for merge
- ❌ Submit low-quality PRs
- ❌ Spam repositories

## Timeline

### Week 1-2: Preparation
- [ ] Build schema generator tool
- [ ] Build PR automation script
- [ ] Identify top 50 target MCPs
- [ ] Test on 2-3 friendly repos first

### Week 3-6: Initial Wave (Tier 1)
- [ ] Submit PRs to official @modelcontextprotocol repos
- [ ] Target: 5 PRs per week
- [ ] Focus on quality over quantity

### Week 7-10: Second Wave (Tier 2)
- [ ] Submit to popular third-party MCPs
- [ ] Target: 5 PRs per week
- [ ] Refine based on feedback from Tier 1

### Week 11-12: Long Tail (Tier 3)
- [ ] Submit to specialized MCPs
- [ ] Document learnings
- [ ] Create case studies

## Risk Mitigation

### Risk: PRs seen as spam
**Mitigation:**
- High-quality, tested implementations only
- Personalized PR descriptions
- Limit to 2-3 PRs per day
- Engage genuinely with maintainer feedback

### Risk: Spec proposal not approved
**Mitigation:**
- PRs still valuable (self-documenting config)
- Can pivot to "inline documentation" approach
- Schema format is simple JSON, works regardless

### Risk: Low merge rate
**Mitigation:**
- Start with friendly repos
- Build relationships with maintainers
- Offer to help with implementation
- Create standalone documentation if PR not merged

## Communication Plan

### For Maintainers
- Clear, value-focused PR descriptions
- Quick response to feedback
- Offer implementation help
- Share success stories

### For Community
- Blog post: "Making MCPs More Adoptable"
- Twitter/X thread about campaign
- MCP Discord announcements
- Developer newsletter features

### For NCP Users
- Showcase improved UX with schemas
- Highlight MCPs that adopt schema
- Create tutorials using auto-configuration

## Next Steps

1. **Build tooling** (schema generator, PR automation)
2. **Create test PR** to friendly repo
3. **Refine based on feedback**
4. **Launch campaign** with Tier 1 targets
5. **Scale systematically** through Tiers 2 & 3

---

**This campaign positions NCP as a leader in the MCP ecosystem while contributing genuine value to the community.**
