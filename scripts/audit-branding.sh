#!/bin/bash

echo "🔍 Auditing NCP repository for branding issues..."
echo "=================================================="
echo ""

ERRORS=0

# Check for wrong package references
echo "📦 Checking for wrong package names..."
if grep -r "@anthropic-ai/ncp" . --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx" ! -path "*/node_modules/*" ! -path "*/dist/*" > /dev/null 2>&1; then
    echo "❌ Found @anthropic-ai/ncp references:"
    grep -rn "@anthropic-ai/ncp" . --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx" ! -path "*/node_modules/*" ! -path "*/dist/*"
    ERRORS=$((ERRORS+1))
else
    echo "✅ No wrong package references"
fi
echo ""

# Check for wrong GitHub org
echo "🔗 Checking for wrong GitHub org..."
if grep -r "anthropics/ncp\|github.com/anthropics" . --include="*.md" --include="*.json" --include="*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*" > /dev/null 2>&1; then
    echo "❌ Found wrong GitHub org:"
    grep -rn "anthropics/ncp\|github.com/anthropics" . --include="*.md" --include="*.json" --include="*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*"
    ERRORS=$((ERRORS+1))
else
    echo "✅ No wrong GitHub org references"
fi
echo ""

# Check for weak descriptions
echo "📝 Checking for weak descriptions..."
if grep -ri "required cli\|cli tool for managing" . --include="*.md" ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/REPO_AUDIT.md" > /dev/null 2>&1; then
    echo "❌ Found weak descriptions:"
    grep -rin "required cli\|cli tool for managing" . --include="*.md" ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/REPO_AUDIT.md"
    ERRORS=$((ERRORS+1))
else
    echo "✅ No weak descriptions"
fi
echo ""

# Verify package.json
echo "📋 Checking package.json..."
if [ -f package.json ]; then
    PKG_NAME=$(node -p "require('./package.json').name" 2>/dev/null)
    if [[ "$PKG_NAME" == "@portel/ncp" ]]; then
        echo "✅ Package name: $PKG_NAME"
    else
        echo "❌ Package name: $PKG_NAME (should be @portel/ncp)"
        ERRORS=$((ERRORS+1))
    fi

    REPO_URL=$(node -p "require('./package.json').repository.url" 2>/dev/null)
    if [[ "$REPO_URL" == *"portel-dev/ncp"* ]]; then
        echo "✅ Repository URL: $REPO_URL"
    else
        echo "❌ Repository URL: $REPO_URL (should contain portel-dev/ncp)"
        ERRORS=$((ERRORS+1))
    fi

    HOMEPAGE=$(node -p "require('./package.json').homepage" 2>/dev/null)
    if [[ "$HOMEPAGE" == *"portel-dev/ncp"* ]] || [[ "$HOMEPAGE" == "undefined" ]]; then
        echo "✅ Homepage: $HOMEPAGE"
    else
        echo "❌ Homepage: $HOMEPAGE (should contain portel-dev/ncp)"
        ERRORS=$((ERRORS+1))
    fi
fi
echo ""

# Check README for proper branding
echo "📖 Checking README.md branding..."
if [ -f README.md ]; then
    if grep -q "MCP Orchestration Platform\|1 MCP to rule them all" README.md; then
        echo "✅ README has strong NCP branding"
    else
        echo "⚠️  README might need stronger branding"
    fi
fi
echo ""

echo "=================================================="
if [ $ERRORS -eq 0 ]; then
    echo "✅ Audit passed! No branding issues found."
    exit 0
else
    echo "❌ Audit failed! Found $ERRORS issue(s)."
    exit 1
fi
