#!/bin/bash

# Manual MicroMCP Installation Test Script
# Tests real-world scenarios with actual GitHub URLs

set -e

echo "🧪 MicroMCP Installation Manual Test Suite"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
MICROMCP_DIR="$HOME/.ncp/micromcps"
BACKUP_DIR="$HOME/.ncp/micromcps-manual-test-backup"

# Real MicroMCP URLs from portel-dev/ncp repository
CALCULATOR_URL="https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/calculator.micro.ts"
STRING_URL="https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/string.micro.ts"
WORKFLOW_URL="https://raw.githubusercontent.com/portel-dev/ncp/main/src/internal-mcps/examples/workflow.micro.ts"

# Helper functions
function print_test() {
    echo -e "${BLUE}📋 TEST: $1${NC}"
}

function print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

function print_error() {
    echo -e "${RED}❌ $1${NC}"
}

function print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

function backup_micromcps() {
    if [ -d "$MICROMCP_DIR" ]; then
        print_info "Backing up existing MicroMCPs..."
        mv "$MICROMCP_DIR" "$BACKUP_DIR"
    fi
    mkdir -p "$MICROMCP_DIR"
}

function restore_micromcps() {
    if [ -d "$MICROMCP_DIR" ]; then
        rm -rf "$MICROMCP_DIR"
    fi
    if [ -d "$BACKUP_DIR" ]; then
        print_info "Restoring original MicroMCPs..."
        mv "$BACKUP_DIR" "$MICROMCP_DIR"
    fi
}

function check_file_exists() {
    if [ -f "$1" ]; then
        print_success "File exists: $1"
        return 0
    else
        print_error "File missing: $1"
        return 1
    fi
}

function cleanup() {
    print_info "Cleaning up test environment..."
    restore_micromcps
}

# Set up cleanup on exit
trap cleanup EXIT

# Backup existing MicroMCPs
backup_micromcps

echo ""
print_test "Test 1: Install MicroMCP from GitHub raw URL"
echo "URL: $CALCULATOR_URL"
node dist/index.js add "$CALCULATOR_URL"
echo ""

if check_file_exists "$MICROMCP_DIR/calculator.micro.ts"; then
    print_success "Calculator MicroMCP installed successfully"
    echo ""
    print_info "File contents preview:"
    head -n 10 "$MICROMCP_DIR/calculator.micro.ts"
else
    print_error "Calculator MicroMCP installation failed"
    exit 1
fi

echo ""
echo "---"
echo ""

print_test "Test 2: Install multiple MicroMCPs from URLs"
node dist/index.js add "$STRING_URL"
echo ""

if check_file_exists "$MICROMCP_DIR/string.micro.ts"; then
    print_success "String MicroMCP installed successfully"
else
    print_error "String MicroMCP installation failed"
    exit 1
fi

echo ""
echo "---"
echo ""

print_test "Test 3: Create and install local MicroMCP file"

# Create test MicroMCP
TEST_FILE="/tmp/localtest.micro.ts"
cat > "$TEST_FILE" << 'EOFMICRO'
import { MicroMCP, tool } from '@portel/ncp';

export class LocalTestMCP implements MicroMCP {
  name = 'localtest';
  version = '1.0.0';
  description = 'Local test MicroMCP';

  @tool({
    description: 'Echo the input',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to echo' }
      },
      required: ['message']
    }
  })
  async echo(args: { message: string }): Promise<string> {
    return `Echo: ${args.message}`;
  }

  @tool({
    description: 'Get current timestamp',
    parameters: { type: 'object', properties: {} }
  })
  async timestamp(): Promise<string> {
    return new Date().toISOString();
  }
}
EOFMICRO

print_info "Created test file: $TEST_FILE"
node dist/index.js add "$TEST_FILE"
echo ""

if check_file_exists "$MICROMCP_DIR/localtest.micro.ts"; then
    print_success "Local MicroMCP installed successfully"
else
    print_error "Local MicroMCP installation failed"
    exit 1
fi

# Clean up test file
rm "$TEST_FILE"

echo ""
echo "---"
echo ""

print_test "Test 4: Verify all installed MicroMCPs"
echo ""
print_info "Installed MicroMCPs in $MICROMCP_DIR:"
ls -lah "$MICROMCP_DIR"

echo ""
echo "---"
echo ""

print_test "Test 5: Test MicroMCP discovery"
echo ""
print_info "Searching for 'calculator' tools..."
node dist/index.js find calculator || print_info "Discovery may require server restart"

echo ""
echo "---"
echo ""

print_test "Test 6: Test tool execution (if server is running)"
echo ""
print_info "Attempting to run calculator:add..."
node dist/index.js run calculator:add --params '{"a":5,"b":3}' || print_info "Execution may require server restart"

echo ""
echo "---"
echo ""

print_test "Test 7: Error handling - Invalid URL"
echo ""
print_info "Testing 404 URL..."
node dist/index.js add "https://raw.githubusercontent.com/invalid/repo/main/notfound.micro.ts" && {
    print_error "Should have failed with 404"
    exit 1
} || {
    print_success "Correctly handled 404 error"
}

echo ""
echo "---"
echo ""

print_test "Test 8: Error handling - Non-existent local file"
echo ""
print_info "Testing missing file..."
node dist/index.js add "/tmp/nonexistent-file-12345.micro.ts" && {
    print_error "Should have failed with file not found"
    exit 1
} || {
    print_success "Correctly handled missing file"
}

echo ""
echo "---"
echo ""

print_test "Test 9: Reinstallation (overwrite existing)"
echo ""
print_info "Reinstalling calculator..."
node dist/index.js add "$CALCULATOR_URL"
echo ""

if check_file_exists "$MICROMCP_DIR/calculator.micro.ts"; then
    print_success "Reinstallation successful (file overwritten)"
else
    print_error "Reinstallation failed"
    exit 1
fi

echo ""
echo "---"
echo ""

print_test "Test 10: Verify file integrity"
echo ""
for file in "$MICROMCP_DIR"/*.micro.ts; do
    if [ -f "$file" ]; then
        if grep -q "export class" "$file" && grep -q "MicroMCP" "$file"; then
            print_success "Valid MicroMCP: $(basename $file)"
        else
            print_error "Invalid MicroMCP format: $(basename $file)"
        fi
    fi
done

echo ""
echo "==========================================="
echo -e "${GREEN}🎉 All manual tests completed!${NC}"
echo ""
print_info "Installed MicroMCPs:"
ls -1 "$MICROMCP_DIR"/*.micro.ts 2>/dev/null | xargs -n1 basename || echo "None"

echo ""
print_info "Test environment will be cleaned up automatically"
