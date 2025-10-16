# Sigstore Compatibility Analysis

## Executive Summary

**Result:** Sigstore (cosign) is **NOT compatible** with the .dxt signing workflow used by Claude Desktop extensions.

**Reason:** Fundamental architectural differences in signature format and storage.

## Test Results

### Test Environment
- **Date:** October 16, 2025
- **Cosign Version:** v3.0.2
- **mcpb CLI Version:** Latest
- **Test File:** ncp.dxt (72 MB)

### What We Tested

1. ✅ **Cosign Installation:** Successfully installed via Homebrew
2. ✅ **Key Generation:** Generated cosign key pair
3. ✅ **File Signing:** Successfully signed .dxt file with cosign
4. ✅ **Cosign Verification:** Cosign successfully verified its own signature
5. ❌ **mcpb Verification:** mcpb CLI could NOT verify cosign signature

## Technical Incompatibility Details

### Architecture Differences

| Aspect | Cosign (Sigstore) | mcpb (Claude Desktop) |
|--------|-------------------|----------------------|
| **Signature Storage** | External .bundle file | Embedded in .dxt file |
| **Signature Format** | JSON (Sigstore bundle spec) | PKCS#7 DER-encoded |
| **Signature Location** | Separate file alongside artifact | Appended to zip with markers |
| **Key Management** | Keyless (OIDC) or key-based | Traditional cert.pem + key.pem |
| **Transparency Log** | Required (Rekor) | Not used |
| **Authentication** | Browser-based OIDC flow | File-based certificates |

### How Each System Works

#### Cosign Signing Process
```bash
# Generate keys
cosign generate-key-pair

# Sign (creates EXTERNAL .bundle file)
cosign sign-blob --key cosign.key --bundle file.bundle file.dxt

# Verify (requires BOTH files)
cosign verify-blob --key cosign.pub --bundle file.bundle file.dxt
```

**Output Files:**
- `file.dxt` (unchanged)
- `file.bundle` (JSON signature file)

#### mcpb Signing Process
```bash
# Sign (MODIFIES the .dxt file itself)
npx @anthropic-ai/mcpb sign file.dxt --cert cert.pem --key key.pem

# Verify (only needs the .dxt file)
npx @anthropic-ai/mcpb verify file.dxt
```

**Output:**
- `file.dxt` (modified with signature appended)

### Signature Format Comparison

**Cosign Bundle Format** (JSON):
```json
{
  "mediaType": "application/vnd.dev.sigstore.bundle.v0.3+json",
  "verificationMaterial": {
    "publicKey": { "hint": "..." },
    "tlogEntries": [...],
    "timestampVerificationData": {...}
  },
  "messageSignature": {...}
}
```

**mcpb Format** (Binary):
```
[Original .dxt ZIP file]
MCPB_SIG_V1
[PKCS#7 DER-encoded signature]
MCPB_SIG_END
```

## Why Sigstore Isn't Suitable for .dxt Extensions

### 1. **Separate Files Problem**
- Cosign creates `.bundle` files that must travel WITH the .dxt
- Users downloading from GitHub would need TWO files
- Claude Desktop only accepts single .dxt files
- Would break the "double-click to install" user experience

### 2. **Interactive Authentication**
- Keyless mode requires browser-based OIDC authentication
- Not suitable for automated CI/CD workflows
- Would fail in GitHub Actions without manual intervention
- Defeats the purpose of automated releases

### 3. **Transparency Log Requirement**
- Cosign wants to upload signatures to public Rekor transparency log
- Requires accepting legal terms interactively
- Adds dependency on external Sigstore infrastructure
- May expose metadata about releases

### 4. **Format Incompatibility**
- Claude Desktop's `mcpb` tooling expects PKCS#7
- No way to embed Sigstore bundles into .dxt files
- Would require Claude Desktop to support Sigstore format
- Not under our control

## Sigstore Benefits We're Missing

Despite incompatibility, Sigstore offers interesting features:

1. **No Key Management** - Ephemeral keys, no rotation needed
2. **Transparency** - All signatures logged publicly
3. **Identity-based** - Sign with GitHub/Google/etc identity
4. **Free** - No certificate authority fees
5. **Ecosystem** - Used by Kubernetes, Python, npm

## What Works: Self-Signed Certificates

Our current approach using self-signed PKCS#7 certificates:

✅ **Works with mcpb CLI**
✅ **Embeds signature in .dxt file**
✅ **Single file distribution**
✅ **Works in GitHub Actions**
✅ **No external dependencies**
✅ **No cost**

Limitations:
- Shows as "self-signed" in strict enterprise environments
- No transparency log
- Need to manage keys (but they're self-generated)

## Recommendations

### For NCP (.dxt distribution)

**Continue using self-signed certificates:**
```bash
npm run build:dxt:signed
```

This approach:
- Works perfectly with Claude Desktop
- Requires no additional infrastructure
- Fully automated in CI/CD
- Free and simple
- Good enough for GitHub distribution

### For Supply Chain Security

If we want Sigstore-style transparency:
1. Use **both** signing methods:
   - `mcpb sign` for .dxt embedding (Claude Desktop compatibility)
   - `cosign sign-blob` for transparency log (security audit trail)
2. Publish both .dxt and .bundle on GitHub releases
3. Document that security-conscious users can verify with cosign

### For Official Directory Submission

- Current self-signed approach is sufficient
- If directory requires CA-signed certificates, consider Certum (€14/year)
- No evidence that Sigstore signatures are accepted by directory

## Alternative: Paid Code Signing Certificate

If we need CA-signed certificates (e.g., for enterprise deployments):

**Certum Open Source** (€14/year):
- Traditional PKCS#7 format
- Compatible with mcpb
- Affordable for open source
- Works in all scenarios

**Not recommended:**
- Expensive certificates ($200-500/year)
- No additional benefit for our use case
- Self-signed works fine for public GitHub distribution

## Conclusion

**Sigstore/cosign is excellent technology** for container images and software supply chain security, but it's **architecturally incompatible** with the Claude Desktop extension signing workflow.

**Best approach for NCP:**
1. Continue using self-signed PKCS#7 certificates via `mcpb sign`
2. Submit to Claude Desktop directory with current signing
3. Consider dual-signing (mcpb + cosign) only if users request supply chain transparency

**The free certificate question is answered:** Yes, Sigstore is free, but it's not compatible with our requirements.
