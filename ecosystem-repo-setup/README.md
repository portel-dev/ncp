# NCP Ecosystem Builder

**Private repository for discovering, analyzing, and generating comprehensive MCP test ecosystems**

> 🔒 **Private Repository**: Contains automated tooling to discover and clone real MCPs from public sources for NCP testing validation.

## Overview

This repository contains the infrastructure to build comprehensive MCP test ecosystems for NCP (Natural Context Provider) validation. It discovers real MCPs from GitHub, npm, and PyPI, then generates protocol-compliant TypeScript dummy clones for testing purposes.

## 🎯 Purpose

- **Discover Real MCPs**: Find 1000+ production MCPs from public repositories
- **Extract Schemas**: Analyze real tool definitions and parameter schemas
- **Generate Dummies**: Create TypeScript clones with identical APIs but mock functionality
- **Create Test Profiles**: Package MCPs into comprehensive test environments
- **Validate at Scale**: Enable NCP testing with realistic, large-scale MCP ecosystems

## 🏗️ Architecture

```
Generated Ecosystem:
├── 800-1000 Real MCP Clones
├── 5000+ Authentic Tool Definitions
├── 12+ Domain Categories
├── Protocol-Compliant Implementations
└── Comprehensive Test Profiles
```

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/ncp-ecosystem-builder.git
cd ncp-ecosystem-builder

# Install dependencies
npm install

# Set GitHub token (optional but recommended)
export GITHUB_TOKEN="your_github_token"

# Run full ecosystem build (2-4 hours)
npm run ecosystem:build

# Or just discovery (30 minutes)
npm run ecosystem:discover
```

## 📊 Expected Results

When complete, generates:
- **800+ MCP Clones**: `generated/clones/`
- **Test Profiles**: `generated/profiles/`
- **Discovery Data**: `data/discovered-mcps.json`
- **Analysis Reports**: `generated/reports/`

## 🔄 Maintenance

- **Weekly Builds**: Automated discovery and profile updates
- **Release Management**: Versioned ecosystem releases
- **Integration**: Sync with main NCP repository for testing

## 🛡️ Privacy & Ethics

- **No Proprietary Code**: Only extracts public API schemas
- **Mock Implementations**: Generated clones have no real functionality
- **Proper Attribution**: Original MCP sources tracked in metadata
- **Rate Limiting**: Respectful API usage with delays and limits

---

**Generated ecosystems are used exclusively for NCP testing and validation.**