#!/bin/bash

echo "Starting repair test..."
node dist/index.js repair &
PID=$!
echo "Process ID: $PID"

sleep 2
echo "Checking if process is still running..."

if ps -p $PID > /dev/null 2>&1; then
    echo "Still running, killing it..."
    kill -9 $PID 2>/dev/null
else
    echo "Process already exited"
fi

wait $PID 2>/dev/null
echo "Done"
