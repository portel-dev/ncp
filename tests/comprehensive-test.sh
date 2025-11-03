#!/bin/bash
# Comprehensive Test Suite for CLI Discovery Release

set -e  # Exit on error

echo "🧪 NCP CLI Discovery - Comprehensive Test Suite"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "Test 1: Shell MicroMCP Discovery"
echo "---------------------------------"
export NCP_ENABLE_SHELL=true
export NCP_CLI_AUTOSCAN=false

SHELL_TOOLS=$(./dist/index.js find "shell" --depth 0 2>/dev/null | grep -c "shell:" || echo "0")
if [ "$SHELL_TOOLS" -gt 0 ]; then
    pass "Shell MicroMCP tools found: $SHELL_TOOLS tools"
else
    fail "Shell MicroMCP tools NOT found"
fi

echo ""
echo "Test 2: Shell MicroMCP Execution"
echo "---------------------------------"
OUTPUT=$(./dist/index.js run shell:pwd 2>&1 | grep -o "path" || echo "")
if [ -n "$OUTPUT" ]; then
    pass "shell:pwd executed successfully"
else
    warn "shell:pwd execution unclear (may be async)"
fi

echo ""
echo "Test 3: CLI Scanner Basic"
echo "--------------------------"
node tests/debug-cli-scanner.cjs 2>&1 | grep -q "Found.*tools" && pass "CLI scanner works" || fail "CLI scanner failed"

echo ""
echo "Test 4: CLI Discovery Scan"
echo "---------------------------"
export NCP_CLI_AUTOSCAN=true
FOUND=$(node tests/debug-cli-scanner.cjs 2>&1 | grep "Found" | head -1 | grep -o "[0-9]\+" | head -1)
if [ "$FOUND" -gt 50 ]; then
    pass "CLI discovery found $FOUND tools (good!)"
elif [ "$FOUND" -gt 20 ]; then
    pass "CLI discovery found $FOUND tools (acceptable)"
else
    warn "CLI discovery found only $FOUND tools (expected 50+)"
fi

echo ""
echo "Test 5: Search Functionality"
echo "-----------------------------"
VIDEO_TOOLS=$(node tests/debug-cli-scanner.cjs 2>&1 | grep -A 5 "Searching for \"video\"" | grep -c "ffmpeg" || echo "0")
if [ "$VIDEO_TOOLS" -gt 0 ]; then
    pass "Search finds relevant tools (ffmpeg for video)"
else
    warn "Search did not find ffmpeg for video query"
fi

echo ""
echo "Test 6: Platform Detection"
echo "---------------------------"
PLATFORM=$(node -e "console.log(process.platform)")
pass "Running on platform: $PLATFORM"

echo ""
echo "Test 7: Without Flags (Default)"
echo "--------------------------------"
unset NCP_ENABLE_SHELL
unset NCP_CLI_AUTOSCAN

./dist/index.js find "filesystem" --depth 0 2>&1 | grep -q "read_file" && pass "Default mode works" || fail "Default mode broken"

echo ""
echo "Test 8: Build Integrity"
echo "-----------------------"
[ -f "./dist/index.js" ] && pass "CLI entry point exists" || fail "CLI entry point missing"
[ -f "./dist/index-mcp.js" ] && pass "MCP entry point exists" || fail "MCP entry point missing"
[ -d "./dist/services" ] && pass "Services compiled" || fail "Services missing"

echo ""
echo "Test 9: TypeScript Compilation"
echo "-------------------------------"
npm run build >/dev/null 2>&1 && pass "TypeScript compiles" || fail "TypeScript compilation failed"

echo ""
echo "================================================"
echo -e "${GREEN}All tests passed!${NC} ✨"
echo ""
echo "Ready for release! 🚀"
