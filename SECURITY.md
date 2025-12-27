# Security Policy

## Supported Versions

We actively support the following versions of NCP with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.8.x   | :white_check_mark: |
| 1.7.x   | :white_check_mark: |
| < 1.7   | :x:                |

**Note:** We support the current version and the previous major.minor version with security updates. Older versions are not supported.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in NCP, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities via GitHub Security Advisory:

**https://github.com/anthropics/ncp/security/advisories/new**

Include the following information in your report:
- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Initial Response**: We will provide an initial response within 7 days with next steps
- **Updates**: We will keep you informed of our progress throughout the process
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days
- **Credit**: We will credit you in our security advisory (unless you prefer to remain anonymous)

### Security Update Process

1. **Vulnerability Assessment**: Our team will verify and assess the impact
2. **Fix Development**: We will develop and test a fix
3. **Security Advisory**: We will publish a security advisory (if applicable)
4. **Patch Release**: We will release a patched version
5. **Disclosure**: We will coordinate disclosure timing with the reporter

### Scope

This security policy applies to:
- The main NCP application
- All supported versions
- Official Docker containers
- Dependencies we directly maintain

### Out of Scope

The following are generally considered out of scope:
- Issues in third-party MCP servers (report to their maintainers)
- Vulnerabilities requiring physical access to the system
- Issues affecting only unsupported versions
- Social engineering attacks

### Bug Bounty

Currently, we do not offer a paid bug bounty program. However, we deeply appreciate security researchers who help improve NCP's security and will publicly acknowledge their contributions.

### Questions

If you have questions about this security policy, please open a GitHub issue or use the security advisory link above.

---

**Thank you for helping keep NCP secure!**