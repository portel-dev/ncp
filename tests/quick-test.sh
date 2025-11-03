#!/bin/bash
# Quick Test Suite - Fast validation

echo "Quick Test Suite"
echo "================"

# Test 1: CLI Scanner
echo "1. CLI Scanner..."
node tests/debug-cli-scanner.cjs 2>&1 | grep -q "Found.*tools" && echo "  ✓ Scanner works" || echo "  ✗ Scanner failed"

# Test 2: Shell MCP loads
echo "2. Shell MicroMCP..."
export NCP_ENABLE_SHELL=true
./dist/index.js find "shell" --depth 0 2>&1 | grep -q "shell:" && echo "  ✓ Shell MCP loads" || echo "  ✗ Shell MCP not found"

# Test 3: Default mode
echo "3. Default mode..."
unset NCP_ENABLE_SHELL
unset NCP_CLI_AUTOSCAN
./dist/index.js find "read file" --depth 0 2>&1 | grep -q "read_file" && echo "  ✓ Default works" || echo "  ✗ Default broken"

# Test 4: Build check
echo "4. Build integrity..."
[ -f "./dist/index.js" ] && echo "  ✓ Build exists" || echo "  ✗ Build missing"

echo ""
echo "Done!"
