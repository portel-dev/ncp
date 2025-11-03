#!/bin/bash
# Script to rename SimpleMCP to MicroMCP throughout the codebase

set -e

echo "🔄 Renaming SimpleMCP → MicroMCP throughout codebase..."

# Find all TypeScript files in src/ and replace text
find src -name "*.ts" -type f -exec sed -i '' 's/SimpleMCP/MicroMCP/g' {} +
find src -name "*.ts" -type f -exec sed -i '' "s/simple-mcp-adapter/micro-adapter/g" {} +
find src -name "*.ts" -type f -exec sed -i '' "s/simple-mcp-loader/micro-loader/g" {} +
find src -name "*.ts" -type f -exec sed -i '' "s/base-mcp/base-micro/g" {} +
find src -name "*.ts" -type f -exec sed -i '' "s/\.mcp\.ts/.micro.ts/g" {} +
find src -name "*.ts" -type f -exec sed -i '' "s/\.mcp\.js/.micro.js/g" {} +
find src -name "*.ts" -type f -exec sed -i '' "s/\.mcp\.schema\.json/.micro.schema.json/g" {} +
find src -name "*.ts" -type f -exec sed -i '' "s/'\.mcp\.'/'\.micro\.'/g" {} +
find src -name "*.ts" -type f -exec sed -i '' 's/"\.mcp\."/"\.micro\."/g' {} +

# Update references to "Micro Base" back to proper comment
find src -name "*.ts" -type f -exec sed -i '' 's/\* Micro Base Class/\* MicroMCP Base Class/g' {} +

# Update script files
find scripts -name "*.ts" -type f -exec sed -i '' "s/\.mcp\.ts/.micro.ts/g" {} +
find scripts -name "*.ts" -type f -exec sed -i '' "s/\.mcp\.schema\.json/.micro.schema.json/g" {} +

# Update package.json
sed -i '' 's/\.mcp\.schema\.json/.micro.schema.json/g' package.json
sed -i '' 's/internal-mcps\/examples\/\*\.mcp\./internal-mcps\/examples\/\*\.micro\./g' package.json

echo "✅ Renaming complete!"
