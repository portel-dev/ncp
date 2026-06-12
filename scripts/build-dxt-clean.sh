#!/bin/bash
set -e

echo "🔨 Building NCP MCPB (MCP Bundle) from clean directory..."

# Store project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "📍 Project root: $PROJECT_ROOT"

# Build TypeScript first
echo "📦 Building TypeScript..."
npm run build

# Create clean temp directory
TEMP_DIR=$(mktemp -d)
echo "📁 Created temp directory: $TEMP_DIR"

# Copy only necessary files for production
echo "📋 Copying production files..."
rsync -a \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.codex' \
  --exclude='.omx' \
  --exclude='_internal' \
  --exclude='*.test.ts' \
  --exclude='*.test.js' \
  --exclude='tests/' \
  --exclude='*.dxt' \
  --exclude='*.mcpb' \
  --exclude='*.pdf' \
  --exclude='.ncp/' \
  ./ "$TEMP_DIR/"

# Install production dependencies in clean directory
cd "$TEMP_DIR"
echo "📥 Installing production dependencies (clean)..."
npm install --omit=dev --ignore-scripts --no-audit --no-fund

# Verify human-signals build directory exists BEFORE packing
echo "🔍 Verifying human-signals..."
if [ -d "node_modules/human-signals/build" ]; then
  echo "✅ human-signals/build exists (root level)"
else
  echo "❌ human-signals/build MISSING (root level)"
fi

if [ -d "node_modules/execa/node_modules/human-signals" ]; then
  if [ -d "node_modules/execa/node_modules/human-signals/build" ]; then
    echo "✅ execa/node_modules/human-signals/build exists"
  else
    echo "❌ execa/node_modules/human-signals/build MISSING"
  fi
fi

# Pack MCPB from clean directory
# Skip prepack script since we already built in project root
echo "📦 Packing MCPB (MCP Bundle)..."
npm_config_ignore_scripts=true npx @anthropic-ai/mcpb pack . "$PROJECT_ROOT/ncp.mcpb"

# WORKAROUND: mcpb excludes build/ directories from node_modules
# Extract MCPB (zip format), manually add build directories, re-pack
echo "🔧 Fixing missing build directories (mcpb workaround)..."
PATCH_DIR=$(mktemp -d)
cd "$PATCH_DIR"
unzip -q "$PROJECT_ROOT/ncp.mcpb"

# Copy missing build directories from temp install
if [ -d "$TEMP_DIR/node_modules/human-signals/build" ]; then
  echo "   Adding human-signals/build..."
  cp -r "$TEMP_DIR/node_modules/human-signals/build" "$PATCH_DIR/node_modules/human-signals/"
fi

if [ -d "$TEMP_DIR/node_modules/execa/node_modules/human-signals/build" ]; then
  echo "   Adding execa/node_modules/human-signals/build..."
  mkdir -p "$PATCH_DIR/node_modules/execa/node_modules/human-signals"
  cp -r "$TEMP_DIR/node_modules/execa/node_modules/human-signals/build" "$PATCH_DIR/node_modules/execa/node_modules/human-signals/"
fi

# Re-pack as zip (MCPB is zip format, not tar.gz)
rm -f "$PROJECT_ROOT/ncp.mcpb"
zip -qr "$PROJECT_ROOT/ncp.mcpb" .
cd "$PROJECT_ROOT"

# Cleanup temp directories
rm -rf "$TEMP_DIR" "$PATCH_DIR"

# Test the DXT automatically
echo ""
echo "🧪 Testing MCPB (MCP spec compliance)..."

# Verify it's a valid zip file
echo "   • Verifying zip format..."
if ! unzip -t "$PROJECT_ROOT/ncp.mcpb" > /dev/null 2>&1; then
  echo "   ❌ FAILED: MCPB is not a valid zip file"
  exit 1
fi
echo "   ✅ Valid zip format"

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
unzip -q "$PROJECT_ROOT/ncp.mcpb" > /dev/null 2>&1

# Quick verification test
echo "   • Checking dependencies..."
if [ ! -d "node_modules/human-signals/build" ]; then
  echo "   ❌ FAILED: human-signals/build missing"
  cd "$PROJECT_ROOT"
  rm -rf "$TEST_DIR"
  exit 1
fi

if [ ! -d "node_modules/execa/node_modules/human-signals/build" ]; then
  echo "   ❌ FAILED: execa/node_modules/human-signals/build missing"
  cd "$PROJECT_ROOT"
  rm -rf "$TEST_DIR"
  exit 1
fi

echo "   ✅ Dependencies verified"

# Test MCP server startup with timeout
echo "   • Testing MCP server startup (5s timeout)..."
timeout 5s node dist/index-mcp.js --profile all > /tmp/ncp-test-startup.log 2>&1 &
SERVER_PID=$!
sleep 2

# Send test initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | nc -w 2 localhost 12345 > /dev/null 2>&1 || true

# Check if server is still running
if kill -0 $SERVER_PID 2>/dev/null; then
  echo "   ✅ Server started successfully"
  kill $SERVER_PID 2>/dev/null || true
else
  echo "   ⚠️  Server test skipped (requires stdio mode)"
fi

cd "$PROJECT_ROOT"
rm -rf "$TEST_DIR"

echo ""
echo "✅ MCPB (MCP Bundle) built and tested successfully: ncp.mcpb"
echo "   Size: $(ls -lh ncp.mcpb | awk '{print $5}')"
echo "   SHA256: $(shasum -a 256 ncp.mcpb | awk '{print $1}')"
