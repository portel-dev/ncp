#!/bin/bash
set -e

echo "=========================================="
echo "Testing HTTP/SSE MCP Support"
echo "=========================================="
echo ""

# Create temporary test directory
TEST_DIR="/tmp/ncp-test-http-$$"
mkdir -p "$TEST_DIR/.ncp/profiles"

echo "✓ Created test directory: $TEST_DIR"
echo ""

# Test 1: Add HTTP server without auth (uses google.com which responds fast)
echo "Test 1: Adding HTTP server without auth..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add-http test-public https://www.google.com --profile all
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 1 passed: add-http without auth succeeded"
else
  echo "✗ Test 1 failed: add-http without auth failed"
  exit 1
fi
echo ""

# Test 2: Add HTTP server with bearer token
echo "Test 2: Adding HTTP server with bearer token..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add-http test-bearer https://www.google.com --profile all --auth-type bearer --token "test-token-12345"
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 2 passed: add-http with bearer token succeeded"
else
  echo "✗ Test 2 failed: add-http with bearer token failed"
  exit 1
fi
echo ""

# Test 3: Add HTTP server with OAuth (most complex auth)
echo "Test 3: Adding HTTP server with OAuth..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add-http test-oauth https://www.google.com --profile all \
  --auth-type oauth \
  --client-id "test-client-id" \
  --client-secret "test-secret" \
  --device-auth-url "https://example.com/device" \
  --token-url "https://example.com/token" \
  --scopes "read" "write"
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 3 passed: add-http with OAuth succeeded"
else
  echo "✗ Test 3 failed: add-http with OAuth failed"
  exit 1
fi
echo ""

# Test 4: Add stdio server for comparison
echo "Test 4: Adding stdio server for comparison..."
cd "$TEST_DIR" && node "$OLDPWD/dist/index.js" add test-stdio npx --profile all -- -y @modelcontextprotocol/server-filesystem /tmp
cd "$OLDPWD"

if [ $? -eq 0 ]; then
  echo "✓ Test 4 passed: add stdio server succeeded"
else
  echo "✗ Test 4 failed: add stdio server failed"
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

# Check for expected structure
if grep -q '"url"' "$CONFIG_FILE" && grep -q '"command"' "$CONFIG_FILE"; then
  echo "✓ Test 6 passed: Config contains both HTTP/SSE and stdio servers"
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

# Verify OAuth config is present
if grep -q '"clientId": "test-client-id"' "$CONFIG_FILE"; then
  echo "✓ OAuth configuration correctly saved"
else
  echo "✗ OAuth configuration not found in config"
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
