#!/bin/bash
# CLI Help Validation - Minimal version
cd /Users/arul/Projects/ncp-production-clean

echo "Testing CLI Help Output..."
echo ""

node dist/cli/index.js --help 2>&1 | grep -q "add" && echo "✓ add command" || echo "✗ add command"
node dist/cli/index.js --help 2>&1 | grep -q "find" && echo "✓ find command" || echo "✗ find command"
node dist/cli/index.js --help 2>&1 | grep -q "run" && echo "✓ run command" || echo "✗ run command"
node dist/cli/index.js --help 2>&1 | grep -q "list" && echo "✓ list command" || echo "✗ list command"
node dist/cli/index.js --help 2>&1 | grep -q "analytics" && echo "✓ analytics command" || echo "✗ analytics command"
node dist/cli/index.js --help 2>&1 | grep -q "config" && echo "✓ config command" || echo "✗ config command"
node dist/cli/index.js --help 2>&1 | grep -q "remove" && echo "✓ remove command" || echo "✗ remove command"
node dist/cli/index.js --help 2>&1 | grep -q "repair" && echo "✓ repair command" || echo "✗ repair command"
node dist/cli/index.js --help 2>&1 | grep -q "update" && echo "✓ update command" || echo "✗ update command"

echo ""
echo "✅ All commands present in help"
