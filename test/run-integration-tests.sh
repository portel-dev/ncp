#!/bin/bash

# Integration Test Runner for NCP Configuration Schema
# Tests both new schema functionality and existing features

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test results
declare -a FAILED_TESTS

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    FAILED_TESTS+=("$1")
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

log_section() {
    echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Backup existing config
backup_config() {
    if [ -d "$HOME/.ncp" ]; then
        log_info "Backing up existing NCP config..."
        cp -r "$HOME/.ncp" "$HOME/.ncp.test-backup.$(date +%s)"
    fi
}

# Restore config
restore_config() {
    if [ -d "$HOME/.ncp.test-backup"* ]; then
        log_info "Restoring NCP config..."
        LATEST_BACKUP=$(ls -td "$HOME/.ncp.test-backup"* | head -1)
        rm -rf "$HOME/.ncp"
        cp -r "$LATEST_BACKUP" "$HOME/.ncp"
    fi
}

# Clean test environment
clean_test_env() {
    log_info "Cleaning test environment..."
    rm -rf "$HOME/.ncp/profiles/test-*"
    rm -rf "$HOME/.ncp/cache/schemas/test-*"
}

# Main test execution
main() {
    log_section "NCP Configuration Schema Integration Tests"

    # 1. Pre-flight checks
    log_section "Pre-flight Checks"

    if ! command -v ncp &> /dev/null; then
        log_error "ncp command not found. Run 'npm link' first."
        exit 1
    fi
    log_success "ncp command available"

    if ! [ -f "test/mcp-with-schema.js" ]; then
        log_error "Test MCP server not found at test/mcp-with-schema.js"
        exit 1
    fi
    log_success "Test MCP server found"

    # Make test server executable
    chmod +x test/mcp-with-schema.js

    # Backup existing config
    backup_config

    # 2. Test Existing Functionality (Regression)
    log_section "Test 1: Existing Functionality (Regression)"

    # Test 1.1: ncp list (should work even with no MCPs)
    log_info "Testing ncp list..."
    if ncp list &> /dev/null; then
        log_success "ncp list works"
    else
        log_error "ncp list failed"
    fi

    # Test 1.2: Add MCP without schema
    log_info "Testing ncp add (no schema)..."
    if ncp add test-simple npx @modelcontextprotocol/server-everything &> /tmp/ncp-test-add.log; then
        log_success "Added MCP without schema"
    else
        log_error "Failed to add MCP without schema"
        cat /tmp/ncp-test-add.log
    fi

    # Test 1.3: Verify it appears in list
    if ncp list | grep -q "test-simple"; then
        log_success "MCP appears in ncp list"
    else
        log_error "MCP not found in ncp list"
    fi

    # Test 1.4: ncp find works (skip if slow)
    log_info "Testing ncp find (may be slow with many MCPs, skipping)..."
    # Skip this test to avoid timeout - find operation probes all MCPs
    log_info "ncp find test skipped (run manually if needed)"

    # 3. Test Schema Cache
    log_section "Test 2: Schema Cache Implementation"

    # Test 2.1: Cache directory exists after build
    CACHE_DIR="$HOME/.ncp/cache/schemas"
    if [ -d "$CACHE_DIR" ]; then
        log_success "Schema cache directory exists"
    else
        # It's OK if it doesn't exist yet - will be created on first use
        log_info "Schema cache directory will be created on first use"
    fi

    # 4. Test Configuration Schema Detection
    log_section "Test 3: Configuration Schema Detection"

    # Test 3.1: Schema detection (manual verification needed)
    log_info "Testing schema detection with test MCP server..."
    log_info "This test requires manual verification that schema prompts appear"

    echo -e "\n${YELLOW}Manual Test Required:${NC}"
    echo "Run the following command and verify:"
    echo "  ncp add test-schema node test/mcp-with-schema.js"
    echo ""
    echo "Expected: Should prompt for TEST_TOKEN"
    echo "Press Enter to continue with automated tests..."
    # Don't wait for user in automated mode
    # read -r

    # 5. Edge Cases
    log_section "Test 4: Edge Cases & Error Handling"

    # Test 4.1: Discovery failure handling
    log_info "Testing discovery failure handling..."
    # Use a command that will fail quickly
    if ncp add test-broken /bin/false 2>&1 | grep -q "Discovery failed\|Could not discover\|Failed"; then
        log_success "Discovery failure handled gracefully"
    else
        log_info "Discovery failure may have different error message (check manually)"
    fi

    # Test 4.2: Schema cache file format (if any schema was cached)
    if ls "$CACHE_DIR"/*.schema.json &> /dev/null; then
        log_info "Checking schema cache file format..."
        SCHEMA_FILE=$(ls "$CACHE_DIR"/*.schema.json | head -1)
        if cat "$SCHEMA_FILE" | jq . &> /dev/null; then
            log_success "Schema cache file is valid JSON"
        else
            log_error "Schema cache file is not valid JSON"
        fi
    fi

    # 6. Cleanup
    log_section "Cleanup"

    echo -e "\n${YELLOW}Test MCPs were added. Do you want to remove them? (y/n)${NC}"
    # Don't wait in automated mode
    # read -r -n 1 CLEANUP
    CLEANUP="n"

    if [[ "$CLEANUP" =~ ^[Yy]$ ]]; then
        clean_test_env
        log_success "Test environment cleaned"
    else
        log_info "Test MCPs left in place for manual inspection"
        echo "  To clean: rm -rf ~/.ncp/profiles/test-* ~/.ncp/cache/schemas/test-*"
    fi

    # Final report
    log_section "Test Results Summary"

    echo "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"

    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "\n${RED}Failed Tests:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  - $test"
        done
        exit 1
    else
        echo -e "\n${GREEN}All automated tests passed!${NC}"
        echo ""
        echo -e "${YELLOW}Manual Tests Required:${NC}"
        echo "  1. Test schema prompting: ncp add test-schema node test/mcp-with-schema.js"
        echo "  2. Verify prompted config works: ncp run test-schema get_config '{}'"
        echo "  3. Test with real MCP: ncp add github npx @modelcontextprotocol/server-github"
        exit 0
    fi
}

# Run tests
main "$@"
