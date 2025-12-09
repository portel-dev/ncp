#!/usr/bin/env bash
# CLI Help Validation
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENTRYPOINT="${NCP_CLI_ENTRY:-dist/index.js}"
if [[ ! -f "$ENTRYPOINT" ]]; then
  echo "❌ $ENTRYPOINT not found. Run 'npm run build' first."
  exit 1
fi

echo "Testing CLI Help Output..."
echo ""

commands=(add find run list analytics config remove repair update)
missing=false

for cmd in "${commands[@]}"; do
  if node "$ENTRYPOINT" --help 2>&1 | grep -q "$cmd"; then
    echo "✓ $cmd command"
  else
    echo "✗ $cmd command"
    missing=true
  fi
  echo ""
done

if [[ "$missing" == false ]]; then
  echo "✅ All commands present in help"
else
  echo "⚠️  Missing commands detected"
  exit 1
fi
