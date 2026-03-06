#!/usr/bin/env python3

import csv
import subprocess
import time

csv_file = './src/testing/real-mcps.csv'
profile = 'live-ecosystem'

with open(csv_file, 'r') as f:
    reader = csv.DictReader(f)
    mcps = [row for row in reader if row['status'] == 'active']

print(f"Adding {len(mcps)} MCPs to {profile} profile...")

for i, mcp in enumerate(mcps, 1):
    mcp_name = mcp['mcp_name']
    command = mcp['command']

    # Parse command
    parts = command.split()
    executable = parts[0]
    args = ' '.join(parts[1:]) if len(parts) > 1 else ''

    print(f"[{i}/{len(mcps)}] Adding {mcp_name}: {command}")

    # Run the add command
    cmd = ['npx', 'ncp', 'add', mcp_name, executable, args, '--profiles', profile]

    try:
        subprocess.run(cmd, capture_output=True, text=True, check=False)
    except Exception as e:
        print(f"  Error: {e}")

    # Small delay
    time.sleep(0.1)

print(f"✅ Finished adding MCPs to {profile} profile")
print(f"To test: npx ncp find --profile {profile}")