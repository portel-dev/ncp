# Pull Request Submission Guide

## Files Prepared for Your Review

Before submitting the PR, please review these files in `docs/`:

1. **pr-summary.md** - PR title, description, and metadata
2. **pr-schema-additions.ts** - Code changes to add to `schema/draft/schema.ts`
3. **pr-documentation-additions.md** - Documentation to add to `docs/specification/draft/basic/lifecycle.mdx`
4. **mcp-configuration-proposal.md** - Full proposal (already reviewed)

## Steps to Submit the Pull Request

### Step 1: Fork and Clone the Repository

```bash
# Fork the repository on GitHub
# Visit: https://github.com/modelcontextprotocol/specification
# Click "Fork" button

# Clone your fork
git clone https://github.com/YOUR_USERNAME/specification.git
cd specification

# Add upstream remote
git remote add upstream https://github.com/modelcontextprotocol/specification.git
```

### Step 2: Create a Feature Branch

```bash
# Create and switch to new branch
git checkout -b feature/configuration-schema
```

### Step 3: Make Schema Changes

**File: `schema/draft/schema.ts`**

1. Add the new interfaces near the top of the file (after imports, before InitializeResult):
   - Copy `ConfigurationParameter` interface from `docs/pr-schema-additions.ts`
   - Copy `ConfigurationSchema` interface from `docs/pr-schema-additions.ts`

2. Modify the `InitializeResult` interface:
   - Add the `configurationSchema?: ConfigurationSchema;` field
   - Copy the JSDoc comment from `docs/pr-schema-additions.ts`

**Exact location**: After the `instructions?: string;` field in `InitializeResult`

### Step 4: Make Documentation Changes

**File: `docs/specification/draft/basic/lifecycle.mdx`**

1. Find the "Initialization" section
2. After the initialization examples, add a new section:
   - Copy entire content from `docs/pr-documentation-additions.md`
   - Ensure MDX syntax is correct (especially code blocks)

### Step 5: Update Changelog (if exists)

**File: `docs/specification/draft/changelog.mdx`** (if it exists)

Add entry:
```markdown
## [Draft] - YYYY-MM-DD

### Added
- Configuration Schema Declaration: Servers can now declare configuration requirements in InitializeResult
  - Added `ConfigurationSchema` and `ConfigurationParameter` types
  - Enables clients to detect missing configuration before connection
  - Fully backward compatible
```

### Step 6: Commit Changes

```bash
# Stage all changes
git add schema/draft/schema.ts
git add docs/specification/draft/basic/lifecycle.mdx

# If changelog exists
git add docs/specification/draft/changelog.mdx

# Commit with clear message
git commit -m "feat: add configuration schema to server initialization

Extends InitializeResult with optional configurationSchema field that allows
servers to declare their configuration requirements (environment variables,
command-line arguments, etc.) during initialization.

This enables clients to:
- Detect missing configuration before connection attempts
- Prompt users interactively for required values
- Validate configuration before startup
- Provide helpful error messages

The feature is fully backward compatible - existing servers continue to work
without any changes.

Addresses #863, relates to #1510, #279, #1284"
```

### Step 7: Push to Your Fork

```bash
# Push branch to your fork
git push -u origin feature/configuration-schema
```

### Step 8: Create Pull Request

1. Visit: `https://github.com/YOUR_USERNAME/specification`
2. Click "Compare & pull request" button
3. Use content from `docs/pr-summary.md`:
   - **Title**: "Add Configuration Schema to Server Initialization"
   - **Description**: Copy the Description section from pr-summary.md
   - Add all sections: Problem, Solution, Changes, Examples, etc.

4. In the PR description, mention:
   ```markdown
   ## Related Discussions/Issues

   This PR addresses and builds upon:
   - Discussion #863 - Similar proposal, this adds comprehensive types and real-world data
   - Discussion #1510 - Complementary (client sending vs server declaring)
   - Issue #279 - Runtime parameter input
   - Issue #1284 - Enterprise static metadata

   ## Community Feedback

   Posted to Discussion #863 for community feedback: [link after posting]
   ```

5. Check all relevant boxes in the PR template

6. Click "Create pull request"

### Step 9: Post to Discussion #863

After creating the PR:

1. Visit: https://github.com/modelcontextprotocol/specification/discussions/863

2. Add comment:

```markdown
## Comprehensive Proposal with Real-World Data

I've created a detailed proposal that extends this idea with real-world validation and comprehensive type definitions.

**Pull Request**: #XXXX (link to your PR)

### Key Additions to the Original Proposal

1. **Real-world data**: Analysis of 1,215 MCP servers showing 12% failure rate due to configuration issues

2. **Complete TypeScript types** with all parameter metadata:
   - `ConfigurationSchema` with environment variables, arguments, and other config
   - `ConfigurationParameter` with name, description, type, required, sensitive, defaults, validation patterns, and examples

3. **Multiple detailed examples**:
   - Filesystem server (path arguments)
   - GitHub server (API token)
   - Multi-parameter server (arguments + env vars)

4. **Working prototype**: The NCP project demonstrates the current fragile workaround (error parsing) and the desired user experience this proposal would enable

5. **Implementation roadmap**: 4-phase rollout plan (Specification → SDK Support → Reference Implementations → Ecosystem Adoption)

6. **Comprehensive documentation**: Integration guidelines for both server and client developers

### How This Relates to #1510

This proposal is complementary to #1510:
- **#1510**: How clients *send* configuration to servers
- **This proposal**: How servers *declare* what configuration they need

Both are needed for a complete solution!

### Questions for the Community

1. Should we support configuration templates/presets (e.g., "development" vs "production")?
2. Should we support cross-parameter validation rules (e.g., "source and destination must be different")?
3. Any concerns about the proposed type structure?

Looking forward to feedback and happy to iterate on this!
```

## Pre-Submission Checklist

Before running the above steps, review and confirm:

- [ ] PR summary clearly explains the problem and solution
- [ ] Schema changes are minimal and follow existing patterns
- [ ] Documentation includes clear examples for common use cases
- [ ] All related discussions/issues are referenced
- [ ] Backward compatibility is explicitly confirmed
- [ ] Security considerations are addressed
- [ ] Implementation guidelines are provided for both server and client developers

## What to Review Now

**Please review these files and suggest any amendments:**

1. `docs/pr-summary.md` - Is the PR description clear and compelling?
2. `docs/pr-schema-additions.ts` - Are the TypeScript types well-designed?
3. `docs/pr-documentation-additions.md` - Is the documentation comprehensive?
4. `docs/mcp-configuration-proposal.md` - Any final changes to the proposal?

**Suggested improvements to consider:**

- Should we add more examples?
- Should we emphasize certain benefits more?
- Are there additional security considerations?
- Should we adjust the parameter types (add/remove any)?
- Is the backward compatibility explanation clear enough?

Once you've reviewed and made any amendments, let me know and I'll help you submit the PR!
