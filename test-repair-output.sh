#!/bin/bash

# Capture output
node dist/index.js repair > /tmp/ncp-repair-output.txt 2>&1 &
PID=$!

# Wait 2 seconds
sleep 2

# Kill if still running
if ps -p $PID > /dev/null 2>&1; then
    kill -9 $PID 2>/dev/null
fi

# Show output
cat /tmp/ncp-repair-output.txt
echo ""
echo "Output captured above"
