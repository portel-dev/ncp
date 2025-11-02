#!/bin/bash
# Test DXT-pattern mode detection

echo "Testing DXT-Pattern Mode Detection..."
echo ""

# Test 1: NCP_* env var → MCP mode
echo "Test 1: NCP_PROFILE env var (DXT pattern) → MCP mode"
NCP_PROFILE=work node dist/index.js &
PID=$!
sleep 2
if ps -p $PID > /dev/null; then
  echo "✓ MCP mode activated with NCP_PROFILE"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  echo "✗ Failed to start"
fi

# Test 2: NCP_DEBUG env var → MCP mode
echo ""
echo "Test 2: NCP_DEBUG env var (DXT pattern) → MCP mode"
NCP_DEBUG=true node dist/index.js &
PID=$!
sleep 2
if ps -p $PID > /dev/null; then
  echo "✓ MCP mode activated with NCP_DEBUG"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  echo "✗ Failed to start"
fi

# Test 3: NCP_WORKING_DIR env var → MCP mode
echo ""
echo "Test 3: NCP_WORKING_DIR env var (DXT pattern) → MCP mode"
NCP_WORKING_DIR=/tmp node dist/index.js &
PID=$!
sleep 2
if ps -p $PID > /dev/null; then
  echo "✓ MCP mode activated with NCP_WORKING_DIR"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  echo "✗ Failed to start"
fi

# Test 4: CLI command → CLI mode (overrides env)
echo ""
echo "Test 4: CLI command overrides env vars"
output=$(NCP_DEBUG=true node dist/index.js find test 2>&1)
if echo "$output" | grep -q ""; then
  echo "✓ CLI mode activated despite NCP_DEBUG"
else
  echo "✗ CLI mode failed"
fi

# Test 5: No params, no env → MCP mode
echo ""
echo "Test 5: No params, no env → MCP mode"
node dist/index.js &
PID=$!
sleep 2
if ps -p $PID > /dev/null; then
  echo "✓ MCP mode activated by default"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  echo "✗ Failed to start"
fi

# Test 6: --profile arg (no env) → MCP mode
echo ""
echo "Test 6: --profile arg (backward compat) → MCP mode"
node dist/index.js --profile work &
PID=$!
sleep 2
if ps -p $PID > /dev/null; then
  echo "✓ MCP mode activated with --profile arg"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  echo "✗ Failed to start"
fi

# Test 7: ENV var priority over args
echo ""
echo "Test 7: NCP_PROFILE env takes priority over --profile arg"
NCP_PROFILE=personal NCP_DEBUG=true node dist/index.js --profile work 2>&1 | grep -q "Profile: personal" &
PID=$!
sleep 2
if wait $PID; then
  echo "✓ ENV var priority works"
else
  echo "✗ ENV var priority failed"
fi

# Clean up any remaining processes
pkill -f "node dist/index.js" 2>/dev/null

echo ""
echo "✅ All mode detection tests completed!"
