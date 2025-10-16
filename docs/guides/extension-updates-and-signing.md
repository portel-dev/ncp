# Extension Updates and Signing

## Overview

This document explains how Claude Desktop handles extension updates and the signing process for NCP's .dxt extension.

## How Claude Desktop Detects Updates

### Manual Installation (.dxt files from GitHub)

When you manually install a .dxt file, Claude Desktop:

1. **Extracts and reads `manifest.json`** from the archive
2. **Compares versions** using semantic versioning (semver)
3. **Shows UI based on comparison:**
   - **Higher version** → "Update" button
   - **Same/lower version** → "Uninstall" button

**Important:** Manually distributed extensions (like NCP from GitHub releases) do **NOT** receive automatic updates. Users must download and install new versions manually.

### Automatic Updates (Official Directory Only)

Extensions installed from the **official Claude Desktop extension directory**:
- Update automatically in the background
- Claude Desktop checks a centralized registry maintained by Anthropic
- Update intervals and mechanisms are not publicly documented

## Extension Signing

### Why Signing Matters

1. **Trust & Verification:** Proves the extension hasn't been tampered with
2. **Enterprise Requirements:** Some organizations require `isDxtSignatureRequired` policy
3. **Future Directory Submission:** May be required for official directory listing

### Signing Options

#### Self-Signed (Development)
```bash
npm run build:dxt:signed
```

Creates a self-signed certificate automatically. Suitable for:
- Development and testing
- Private distribution
- Users who trust your GitHub releases

#### Production Signing (Certificate Required)
```bash
npm run build:dxt:prod
```

Requires certificate files:
- `cert.pem` - Your certificate
- `key.pem` - Your private key

**Note:** We don't currently have production certificates. To obtain them, you would need to:
1. Get a code signing certificate from a trusted Certificate Authority
2. Export as PEM format
3. Keep private key secure (add to .gitignore)

### Verifying Signatures

```bash
# Check if extension is signed
npx @anthropic-ai/mcpb verify ncp.dxt

# Get extension info
npx @anthropic-ai/mcpb info ncp.dxt
```

## Manifest Fields for Updates

Our `manifest.json` includes fields that may be used by update mechanisms:

```json
{
  "name": "ncp",
  "version": "1.5.3",
  "repository": {
    "type": "git",
    "url": "https://github.com/portel-dev/ncp"
  },
  "homepage": "https://github.com/portel-dev/ncp#readme",
  "support": {
    "url": "https://github.com/portel-dev/ncp/issues"
  }
}
```

**Hypothesis:** Claude Desktop *may* use the `repository.url` field to check for updates when the extension is submitted to the official directory, but this is not confirmed.

## Current NCP Distribution Strategy

### For Users

**Recommended Installation:**
1. Download `ncp.dxt` from [GitHub Releases](https://github.com/portel-dev/ncp/releases/latest)
2. Double-click to install in Claude Desktop

**Updating:**
1. Download new version from GitHub releases
2. Open the new .dxt file
3. Click "Update" button in Claude Desktop (appears when version is higher than installed)

### For Official Directory (Future)

To enable automatic updates, we need to:
1. ✅ Add repository, homepage, and support URLs to manifest (DONE)
2. ✅ Sign the extension (DONE - self-signed)
3. ⏳ Obtain production code signing certificate (optional)
4. ⏳ Submit to Claude Desktop extension directory
5. ⏳ Get approved and listed

## Build Commands

```bash
# Build unsigned extension
npm run build:dxt

# Build with self-signed certificate
npm run build:dxt:signed

# Build with production certificate (requires cert.pem and key.pem)
npm run build:dxt:prod
```

## Release Process

Our GitHub Actions workflow (`release.yml`) automatically:
1. Builds the extension with self-signed certificate
2. Creates signed ncp.dxt file
3. Uploads to GitHub release

## Security Notes

- **Never commit private keys** (.pem, .key files)
- **Self-signed certificates** work perfectly - no UI warnings shown to users (tested Oct 2025)
- **Production certificates** cost €14-500/year but provide no visible benefit for manual installs
- **Signature verification** protects against tampering and satisfies enterprise policies
- **Note:** The CLI tool is called `@anthropic-ai/mcpb` but it creates `.dxt` files
- **Important:** Claude Desktop doesn't display signature status in UI for manually installed extensions

## Future Improvements

1. **Investigate official directory submission**
   - Research requirements and process
   - Determine if production certificate is needed
   - Apply for listing

2. **Consider production certificate**
   - Evaluate cost vs. benefit
   - Choose Certificate Authority
   - Set up secure key storage

3. **Automated update checking**
   - Only possible through official directory
   - Would eliminate manual download/install process

## Free Certificate Options (Not Compatible)

While researching free code signing certificates for open source projects, we discovered:

**Sigstore** (Linux Foundation):
- ✅ Free for open source
- ✅ Used by Kubernetes, Python, npm
- ✅ No key management required
- ❌ **NOT compatible with .dxt signing**

See detailed analysis: [Sigstore Compatibility Analysis](./sigstore-compatibility-analysis.md)

**Key finding:** Sigstore creates external `.bundle` signature files, while Claude Desktop expects embedded PKCS#7 signatures. These are fundamentally incompatible architectures.

**Other options:**
- **Certum** (€14/year) - Compatible, affordable
- **SignPath Foundation** - Free but requires CI integration
- **Self-signed** (FREE) - What we use, works perfectly

## References

- [MCPB CLI Documentation](https://github.com/anthropics/mcpb/blob/main/CLI.md)
- [MCPB Manifest Specification](https://github.com/anthropics/mcpb/blob/main/MANIFEST.md)
- [Claude Desktop Extensions Blog Post](https://www.anthropic.com/engineering/desktop-extensions)
- [Sigstore Compatibility Analysis](./sigstore-compatibility-analysis.md) (our testing results)

## Real-World Test Results

**Test Date:** October 16, 2025  
**Claude Desktop Version:** Latest (macOS)  
**Extension:** ncp.dxt v1.5.3 with self-signed certificate

### What We Tested

✅ **Installation:** Works perfectly - no errors  
✅ **Functionality:** Extension runs normally  
✅ **Signature:** Embedded correctly (verified by checking file markers)

### What We Observed

**UI Behavior:**
- Standard warning shown: "Only install extensions from developers you trust"
- **No mention of signature status** (signed/unsigned/verified)
- **No visual indicator** that extension is signed
- No difference in UI compared to unsigned extension

**Key Finding:**  
Self-signed certificates work but **do not affect the user experience**. Claude Desktop doesn't display signature information in the UI for manually installed extensions.

### What This Means

**Self-signed signatures are useful for:**
- ✅ Technical verification (can be checked with `mcpb verify`)
- ✅ Enterprise policies that require signatures (`isDxtSignatureRequired`)
- ✅ Future directory submission (may be required)
- ✅ Internal supply chain verification

**Self-signed signatures do NOT:**
- ❌ Remove or change the trust warning
- ❌ Provide visual "verified" badge in UI
- ❌ Change installation flow for end users
- ❌ Require CA-signed certificate for basic usage

### Recommendation

**For GitHub distribution:** Self-signed is perfectly fine
- Works reliably
- No cost
- No user-visible impact
- Meets technical requirements

**Only upgrade to CA-signed if:**
- Directory submission explicitly requires it
- Enterprise customers have strict policies
- You want "verified publisher" status (if/when Claude adds UI for it)

### Comparison Summary

| Scenario | Unsigned | Self-Signed | CA-Signed (€14/yr) |
|----------|----------|-------------|-------------------|
| Installation works? | ✅ Yes | ✅ Yes | ✅ Yes |
| Warning shown? | ⚠️ Yes | ⚠️ Yes | ⚠️ Possibly yes* |
| Signature in UI? | ❌ No | ❌ No | ❓ Unknown* |
| Works with policy? | ❌ No | ✅ Yes | ✅ Yes |
| Cost | Free | Free | €14/year |

*CA-signed behavior unknown without testing - may also show warning for non-directory extensions
