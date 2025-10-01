#!/bin/bash

# Test repair command with timeout
node dist/index.js repair &
PID=$!

sleep 5

if kill -0 $PID 2>/dev/null; then
    echo "❌ Process still running after 5 seconds - HANGING"
    kill -9 $PID 2>/dev/null
    exit 1
else
    echo "✅ Process completed within 5 seconds"
    exit 0
fi
