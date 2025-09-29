# Real MCP Ecosystem Builder

This directory contains scripts to discover, analyze, and clone real MCPs to build a comprehensive test ecosystem for NCP validation and stress testing.

## Overview

The ecosystem builder creates **1000 protocol-compliant dummy MCPs** based on real MCPs discovered from GitHub, npm, and PyPI. These dummies have:

- ✅ **Real tool descriptions** from actual MCPs
- ✅ **Full parameter validation** using original schemas
- ✅ **Proper MCP protocol compliance**
- ✅ **Mock responses** (no real functionality)
- ✅ **Multi-language support** (Python, Rust, JavaScript → TypeScript dummies)

## Quick Start

### Full Ecosystem Build

```bash
# Install dependencies
npm install

# Build complete ecosystem (discovers + analyzes + clones)
npm run ecosystem:build
```

This will:
1. Discover top 1000 real MCPs from all sources
2. Install and analyze each MCP to extract schemas
3. Generate TypeScript dummy clones
4. Create comprehensive test profile
5. Generate detailed reports

### Discovery Only

```bash
# Just discover MCPs (no cloning)
npm run ecosystem:discover
```

## Architecture

### Generated Ecosystem Structure

The ecosystem builder creates a complete test environment with:

- **1000+ Real MCP Clones**: Protocol-compliant TypeScript dummies
- **5000+ Tools**: Extracted from real MCPs with original schemas
- **Test Profile**: Ready-to-use NCP profile configuration
- **Comprehensive Reports**: Detailed analysis and metrics

### Usage with NCP

```bash
# Use the generated ecosystem
ncp --profile real-mcp-ecosystem

# Discover tools across 1000 MCPs
ncp find "I need to query database records"

# Stress test with all MCPs
ncp list-tools  # Shows 5,000+ tools from 1000 MCPs
```

**Result**: A treasure trove of 1000 real, protocol-compliant MCP dummies for comprehensive NCP testing and validation! 🎉