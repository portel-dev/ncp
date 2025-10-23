#!/bin/bash
# Patch .dxt (ZIP) bundle to include missing human-signals build directory

set -e

DXT_FILE="ncp.dxt"

echo "📦 Patching $DXT_FILE to include human-signals build directory..."

# Backup original
cp "$DXT_FILE" "${DXT_FILE}.backup"

# Extract to temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
unzip -q "$OLDPWD/$DXT_FILE"

# Copy the human-signals build directory from our node_modules
if [ -d "$OLDPWD/node_modules/human-signals/build" ]; then
    echo "  Copying human-signals/build..."
    cp -r "$OLDPWD/node_modules/human-signals/build" node_modules/human-signals/
else
    echo "  ⚠️  ERROR: Source build directory not found!"
    cd "$OLDPWD"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Also copy to execa's nested human-signals
if [ -d "node_modules/execa/node_modules/human-signals" ]; then
    echo "  Copying to execa/node_modules/human-signals/build..."
    cp -r "$OLDPWD/node_modules/human-signals/build" node_modules/execa/node_modules/human-signals/
fi

# Re-zip the bundle (using same compression level as mcpb)
echo "  Re-zipping bundle..."
rm -f "$OLDPWD/$DXT_FILE"
zip -q -r "$OLDPWD/$DXT_FILE" . -x "*.DS_Store"

# Cleanup
cd "$OLDPWD"
rm -rf "$TEMP_DIR"
rm -f "${DXT_FILE}.backup"

echo "✅ Patch complete! $DXT_FILE now includes human-signals/build directory"

# Verify
echo "  Verifying patch..."
if unzip -l "$DXT_FILE" | grep -q "human-signals/build/src/main.js"; then
    echo "  ✅ Verification passed - main.js found in bundle"
else
    echo "  ⚠️  WARNING: Verification failed - main.js not found"
    exit 1
fi
