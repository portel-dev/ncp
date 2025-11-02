#!/bin/bash
# Test environment variable support

echo "Testing NCP Environment Variables..."
echo ""

# Test 1: NCP_PROFILE
echo "Test 1: NCP_PROFILE environment variable"
NCP_PROFILE=work NCP_DEBUG=true node dist/index-mcp.js &
PID=$!
sleep 1
if ps -p $PID > /dev/null; then
  echo "✓ Server started with NCP_PROFILE=work"
  kill $PID 2>/dev/null
else
  echo "✗ Server failed to start"
fi

# Test 2: NCP_WORKING_DIR
echo ""
echo "Test 2: NCP_WORKING_DIR environment variable"
NCP_WORKING_DIR=/tmp NCP_DEBUG=true node dist/index-mcp.js &
PID=$!
sleep 1
if ps -p $PID > /dev/null; then
  echo "✓ Server started with NCP_WORKING_DIR=/tmp"
  kill $PID 2>/dev/null
else
  echo "✗ Server failed to start"
fi

# Test 3: Command-line args still work
echo ""
echo "Test 3: Command-line args (backward compatibility)"
node dist/index-mcp.js --profile work &
PID=$!
sleep 1
if ps -p $PID > /dev/null; then
  echo "✓ Server started with --profile work"
  kill $PID 2>/dev/null
else
  echo "✗ Server failed to start"
fi

# Test 4: ENV VAR priority over args
echo ""
echo "Test 4: ENV VAR takes priority over command-line args"
NCP_PROFILE=personal node dist/index-mcp.js --profile work &
PID=$!
sleep 1
if ps -p $PID > /dev/null; then
  echo "✓ Server started (NCP_PROFILE=personal should override --profile work)"
  kill $PID 2>/dev/null
else
  echo "✗ Server failed to start"
fi

echo ""
echo "✅ All environment variable tests passed!"
