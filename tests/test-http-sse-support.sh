#!/bin/bash
set -e

echo "=========================================="
echo "Testing HTTP/SSE MCP Support (New Syntax)"
echo "=========================================="
echo ""

# Create temporary test directory
TEST_DIR="/tmp/ncp-test-http-$$"
mkdir -p "$TEST_DIR/.ncp/profiles"

echo "✓ Created test directory: $TEST_DIR"
echo ""

# Test 1: Add HTTP server without auth (uses google.com which responds fast)
echo "Test 1: Adding HTTP server without auth (manual URL)..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add https://www.google.com --profile all
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 1 passed: manual HTTP URL without auth succeeded"
else
  echo "✗ Test 1 failed: manual HTTP URL without auth failed"
  exit 1
fi
echo ""

# Test 2: Add HTTP server with bearer token
echo "Test 2: Adding HTTP server with bearer token..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add https://api.example.com --token "test-token-12345" --profile all
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 2 passed: HTTP URL with --token flag succeeded"
else
  echo "✗ Test 2 failed: HTTP URL with --token flag failed"
  exit 1
fi
echo ""

# Test 3: Add stdio server for comparison
echo "Test 3: Adding stdio server for comparison..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add test-stdio npx @modelcontextprotocol/server-filesystem /tmp --profile all
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 3 passed: stdio server succeeded"
else
  echo "✗ Test 3 failed: stdio server failed"
  exit 1
fi
echo ""

# Test 4: Add stdio server with env vars
echo "Test 4: Adding stdio server with environment variables..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add test-github npx @modelcontextprotocol/server-github --env GITHUB_TOKEN=test_token_123 --profile all
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 4 passed: stdio server with --env flag succeeded"
else
  echo "✗ Test 4 failed: stdio server with --env flag failed"
  exit 1
fi
echo ""

# Test 5: List all servers
echo "Test 5: Listing all configured servers..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" list --profile all
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Test 5 passed: list command succeeded"
else
  echo "✗ Test 5 failed: list command failed"
  exit 1
fi
echo ""

# Test 6: Verify config file contents
echo "Test 6: Verifying config file structure..."
CONFIG_FILE="$TEST_DIR/.ncp/profiles/all.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "✗ Test 6 failed: Config file not created"
  exit 1
fi

echo "Config file contents:"
cat "$CONFIG_FILE" | jq '.' 2>/dev/null || cat "$CONFIG_FILE"
echo ""

# Check for expected structure (both HTTP and stdio)
if grep -q '"url"' "$CONFIG_FILE" && grep -q '"command"' "$CONFIG_FILE"; then
  echo "✓ Test 6 passed: Config contains both HTTP and stdio servers"
else
  echo "✗ Test 6 failed: Config missing expected entries"
  exit 1
fi

# Verify bearer token is present
if grep -q '"token": "test-token-12345"' "$CONFIG_FILE"; then
  echo "✓ Bearer token correctly saved"
else
  echo "✗ Bearer token not found in config"
  exit 1
fi

# Verify environment variable is present
if grep -q '"GITHUB_TOKEN": "test_token_123"' "$CONFIG_FILE"; then
  echo "✓ Environment variable correctly saved"
else
  echo "✗ Environment variable not found in config"
  exit 1
fi

echo ""
echo "=========================================="
echo "All tests passed! ✅"
echo "=========================================="
echo ""
echo "Cleaning up test directory..."
rm -rf "$TEST_DIR"
echo "✓ Cleanup complete"
