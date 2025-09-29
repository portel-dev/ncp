#!/usr/bin/env python3

import csv
import json
from datetime import datetime

csv_file = './src/testing/top-mcp-servers.csv'
output_file = './.ncp/profiles/top-mcp-servers.json'

# Create initial profile
profile = {
    "name": "top-mcp-servers",
    "description": "Profile: top-mcp-servers - Most popular production-ready MCP servers ranked by downloads and industry adoption",
    "mcpServers": {},
    "metadata": {
        "created": datetime.now().isoformat() + 'Z',
        "modified": datetime.now().isoformat() + 'Z'
    }
}

# Read MCPs from CSV
with open(csv_file, 'r') as f:
    reader = csv.DictReader(f)
    production_mcps = [row for row in reader if row['status'] == 'production']

print(f"Adding {len(production_mcps)} production-ready MCPs to profile...")

# Add each MCP to the profile
for mcp in production_mcps:
    mcp_name = mcp['mcp_name']
    command = mcp['command']

    # Skip Docker commands for now (more complex setup)
    if command.startswith('docker') or command.startswith('wrangler'):
        print(f"  Skipping {mcp_name} (requires special setup): {command}")
        continue

    # Parse command
    parts = command.split()
    executable = parts[0]
    args = parts[1:] if len(parts) > 1 else []

    profile['mcpServers'][mcp_name] = {
        "command": executable,
        "args": args
    }

# Write profile
with open(output_file, 'w') as f:
    json.dump(profile, f, indent=2)

print(f"✅ Created top-mcp-servers profile with {len(profile['mcpServers'])} production MCPs")
print(f"Servers included: {', '.join(profile['mcpServers'].keys())}")
print(f"To test: npx ncp find --profile top-mcp-servers")