# Release Process

This document describes how to release a new version of NCP.

## Automated Release via GitHub Actions

### Prerequisites

1. All changes committed and pushed to `main`
2. All tests passing
3. Clean working directory

### Release Steps

1. **Trigger Release Workflow**
   - Go to Actions → Release workflow
   - Click "Run workflow"
   - Select release type: `patch`, `minor`, or `major`
   - Optionally check "Dry run" to test without publishing

2. **What Happens Automatically**

   The release workflow (`release.yml`) will:
   - ✅ Run full test suite
   - ✅ Build the project
   - ✅ Bump version in `package.json`
   - ✅ Update `CHANGELOG.md` with conventional commits
   - ✅ Create git tag (e.g., `1.4.0`)
   - ✅ Push tag to GitHub
   - ✅ Create GitHub Release
   - ✅ Publish to NPM (`@portel/ncp`)

3. **MCP Registry Publication** (Automatic)

   After GitHub Release is published, the MCP registry workflow (`publish-mcp-registry.yml`) automatically:
   - ✅ Syncs version to `server.json`
   - ✅ Validates `server.json` against MCP schema
   - ✅ Downloads MCP Publisher CLI
   - ✅ Authenticates via GitHub OIDC (no secrets needed!)
   - ✅ Publishes to MCP Registry

   **Registry Details**:
   - Package: `io.github.portel-dev/ncp`
   - Authentication: GitHub OIDC (automatic via `id-token: write` permission)
   - No manual steps required!

## Manual Release (Not Recommended)

If you need to release manually:

```bash
# Ensure clean state
git status

# Run release-it
npm run release

# This will:
# - Prompt for version bump type
# - Run tests
# - Update version and CHANGELOG
# - Create git tag
# - Push to GitHub
# - Publish to NPM

# MCP Registry will auto-publish when GitHub Release is created
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Major** (X.0.0): Breaking changes
- **Minor** (x.X.0): New features (backward compatible)
- **Patch** (x.x.X): Bug fixes (backward compatible)

## Post-Release Checklist

After release completes:

- [ ] Verify NPM package: https://www.npmjs.com/package/@portel/ncp
- [ ] Check GitHub Release: https://github.com/portel-dev/ncp/releases
- [ ] Verify MCP Registry listing (may take a few minutes)
- [ ] Test installation: `npx @portel/ncp@latest --version`
- [ ] Announce release (if significant)

## Troubleshooting

### NPM Publish Failed
- Check NPM authentication in GitHub Secrets
- Verify package name isn't taken
- Check `.npmignore` for correct file exclusions

### MCP Registry Publish Failed
- Check GitHub Actions logs for `publish-mcp-registry` workflow
- Verify `server.json` is valid (run `jsonschema -i server.json /tmp/mcp-server.schema.json`)
- Ensure `id-token: write` permission is set in workflow
- GitHub OIDC authentication doesn't require secrets

### Release Workflow Failed
- Check test failures in Actions logs
- Ensure clean working directory
- Verify all dependencies are installed

## Emergency Hotfix Process

For critical bugs requiring immediate release:

1. Create hotfix branch from affected release tag
2. Fix the bug
3. Follow normal release process with `patch` bump
4. Both NPM and MCP Registry will auto-publish

## Release Artifacts

Each release produces:

- **NPM Package**: `@portel/ncp@X.Y.Z` on npmjs.com
- **MCP Registry Entry**: `io.github.portel-dev/ncp` in MCP registry
- **GitHub Release**: Tagged release with changelog
- **Git Tag**: `X.Y.Z` (or `vX.Y.Z` format)

## Contact

For release issues or questions:
- GitHub Issues: https://github.com/portel-dev/ncp/issues
- Repository: https://github.com/portel-dev/ncp
