#!/usr/bin/env python3

import csv
import json
from datetime import datetime

csv_file = './src/testing/real-mcp-ecosystem.csv'
output_file = './.ncp/profiles/real-ecosystem.json'

# Read existing profile
with open(output_file, 'r') as f:
    profile = json.load(f)

# Read MCPs from CSV
with open(csv_file, 'r') as f:
    reader = csv.DictReader(f)
    active_mcps = [row for row in reader if row['status'] == 'active']

print(f"Adding {len(active_mcps)} MCPs to profile...")

# Add each MCP to the profile
for mcp in active_mcps:
    mcp_name = mcp['mcp_name']
    command = mcp['command']

    # Parse command
    parts = command.split()
    executable = parts[0]
    args = parts[1:] if len(parts) > 1 else []

    # Skip if already exists
    if mcp_name in profile['mcpServers']:
        continue

    profile['mcpServers'][mcp_name] = {
        "command": executable,
        "args": args
    }

# Update metadata
profile['metadata']['modified'] = datetime.now().isoformat() + 'Z'

# Write profile back
with open(output_file, 'w') as f:
    json.dump(profile, f, indent=2)

print(f"✅ Created live-ecosystem profile with {len(profile['mcpServers'])} MCPs")
print(f"To test: npx ncp find --profile live-ecosystem")