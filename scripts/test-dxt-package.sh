#!/bin/bash

# Test DXT Package - Validates built .dxt extension works correctly
# This catches issues like missing dependencies, crashes, etc.

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Testing DXT Package...${NC}"

# Find the .dxt file
DXT_FILE=""
if [ -f "ncp.dxt" ]; then
    DXT_FILE="ncp.dxt"
elif [ -f "$HOME/Downloads/ncp.dxt" ]; then
    DXT_FILE="$HOME/Downloads/ncp.dxt"
else
    echo -e "${RED}❌ Error: ncp.dxt not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found DXT: $DXT_FILE"

# Create temp directory for testing
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

echo -e "${YELLOW}📦 Unpacking extension to: $TEST_DIR${NC}"
unzip -q "$DXT_FILE" -d "$TEST_DIR"

cd "$TEST_DIR"

# Helper function to test MCP server with timeout
# Usage: test_mcp_with_timeout TIMEOUT_SEC INPUT1 [INPUT2 INPUT3...]
test_mcp_with_timeout() {
    local timeout_sec="$1"
    shift # Remove timeout from args, rest are inputs

    # Create temp files for communication
    local output_file=$(mktemp)
    local input_fifo=$(mktemp -u)
    mkfifo "$input_fifo"

    # Start MCP server in background
    env NCP_ENABLE_SCHEDULE_MCP=true NCP_ENABLE_MCP_MANAGEMENT=true NCP_MODE=extension \
        node dist/index-mcp.js --profile=all < "$input_fifo" > "$output_file" 2>&1 &
    local mcp_pid=$!

    # Send inputs in background
    {
        for input in "$@"; do
            echo "$input"
            sleep 0.2
        done
        sleep "$timeout_sec"
    } > "$input_fifo" &
    local feeder_pid=$!

    # Wait for timeout then kill everything
    sleep "$timeout_sec"
    kill $mcp_pid 2>/dev/null
    kill $feeder_pid 2>/dev/null
    wait $mcp_pid 2>/dev/null
    wait $feeder_pid 2>/dev/null

    # Return the output
    cat "$output_file"
    rm -f "$output_file" "$input_fifo"
}

echo -e "${YELLOW}🔍 Running validation tests...${NC}"

# Test 1: Check critical files exist
echo -n "  1. Checking critical files... "
if [ ! -f "dist/index-mcp.js" ]; then
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Missing dist/index-mcp.js${NC}"
    exit 1
fi
if [ ! -f "manifest.json" ]; then
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Missing manifest.json${NC}"
    exit 1
fi
echo -e "${GREEN}PASS${NC}"

# Test 2: Check critical dependencies
echo -n "  2. Checking critical dependencies... "
MISSING_DEPS=""
for dep in "uuid" "@modelcontextprotocol/sdk" "@xenova/transformers" "chalk" "commander"; do
    if [ ! -d "node_modules/$dep" ]; then
        MISSING_DEPS="$MISSING_DEPS $dep"
    fi
done
if [ -n "$MISSING_DEPS" ]; then
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Missing dependencies:$MISSING_DEPS${NC}"
    exit 1
fi
echo -e "${GREEN}PASS${NC}"

# Test 3: Test MCP initialization (no crash)
echo -n "  3. Testing MCP initialization... "
INIT_OUTPUT=$(test_mcp_with_timeout 1 '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}')

if echo "$INIT_OUTPUT" | grep -q '"result".*"serverInfo"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Server failed to initialize${NC}"
    echo -e "${RED}     Output: $INIT_OUTPUT${NC}"
    exit 1
fi

# Test 4: Test tools/list request
echo -n "  4. Testing tools/list... "
TOOLS_OUTPUT=$(test_mcp_with_timeout 1 \
    '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' \
    '{"jsonrpc":"2.0","method":"tools/list","id":2}')

if echo "$TOOLS_OUTPUT" | grep -q '"name":"find"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     tools/list failed or missing 'find' tool${NC}"
    echo -e "${RED}     Output: $TOOLS_OUTPUT${NC}"
    exit 1
fi

# Test 5: Check no silent crashes (process should stay alive for at least 2 seconds)
echo -n "  5. Testing process stability... "
TIMEOUT_TEST=$(test_mcp_with_timeout 2 '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}')

if echo "$TIMEOUT_TEST" | grep -q '"result"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Process crashed or timed out${NC}"
    exit 1
fi

# Test 6: Check manifest.json has required config options
echo -n "  6. Validating manifest configuration... "
if ! grep -q '"enableScheduleMcp"' manifest.json; then
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Missing enableScheduleMcp in manifest${NC}"
    exit 1
fi
if ! grep -q '"enableMcpManagement"' manifest.json; then
    echo -e "${RED}FAIL${NC}"
    echo -e "${RED}     Missing enableMcpManagement in manifest${NC}"
    exit 1
fi
echo -e "${GREEN}PASS${NC}"

echo ""
echo -e "${GREEN}✅ All DXT tests passed!${NC}"
echo -e "${GREEN}   The extension is ready to install in Claude Desktop${NC}"

exit 0
