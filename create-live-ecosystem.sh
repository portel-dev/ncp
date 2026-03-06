#!/bin/bash

# Create live-ecosystem profile from real-mcps.csv

echo "Creating live-ecosystem profile..."

# Path to CSV file
CSV_FILE="./src/testing/real-mcps.csv"

# Profile name
PROFILE="live-ecosystem"

# Counter for progress
count=0
total=$(tail -n +2 "$CSV_FILE" | grep ',active$' | wc -l | tr -d ' ')

echo "Adding $total active MCPs to profile..."

# Read CSV and add each MCP (skip header line)
tail -n +2 "$CSV_FILE" | while IFS=',' read -r mcp_name package_name command category downloads description repo status; do
    # Clean up status field (remove quotes and whitespace)
    status=$(echo "$status" | tr -d ' ' | tr -d '"')

    # Skip if status is not active
    if [ "$status" != "active" ]; then
        continue
    fi

    count=$((count + 1))

    # Extract the command (remove quotes if present)
    command=$(echo "$command" | sed 's/"//g')

    # Parse command into executable and arguments
    # Example: "npx @modelcontextprotocol/server-filesystem" becomes:
    # executable: npx
    # args: @modelcontextprotocol/server-filesystem
    executable=$(echo "$command" | awk '{print $1}')
    args=$(echo "$command" | cut -d' ' -f2-)

    echo "[$count/$total] Adding $mcp_name: $executable $args"

    # Add to profile with name, command, and args
    npx ncp add "$mcp_name" "$executable" "$args" --profiles "$PROFILE" 2>/dev/null

    # Small delay to avoid overwhelming
    sleep 0.1
done

echo "✅ Created live-ecosystem profile with $total MCPs"
echo "To use: npx ncp --profile live-ecosystem"