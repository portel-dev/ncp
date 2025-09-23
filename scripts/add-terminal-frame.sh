#!/bin/bash

# Auto Frame All Images Script
# Finds all images in project root and creates framed versions in docs/images/
# Usage: ./scripts/frame-all.sh

PROJECT_ROOT=$(dirname "$0")/..
OUTPUT_DIR="$PROJECT_ROOT/docs/images"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Find all image files in project root
IMAGE_FILES=$(find "$PROJECT_ROOT" -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.gif" \))

if [ -z "$IMAGE_FILES" ]; then
    echo "📁 No image files found in project root"
    exit 0
fi

echo "🖼️  Auto-framing all images in project root..."
echo "   Output: docs/images/"
echo ""

# Frame settings - optimized for high DPI
TITLE_HEIGHT=44
PADDING=24
BORDER_WIDTH=3
BUTTON_RADIUS=16

# Process each image file
PROCESSED=0
FAILED=0

for INPUT in $IMAGE_FILES; do
    FILENAME=$(basename "$INPUT")
    OUTPUT="$OUTPUT_DIR/$FILENAME"

    echo "🔄 Processing: $FILENAME"

    # Step 1: Add padding around input image
    if ! magick "$INPUT" \
        -bordercolor "#1E1E1E" -border ${PADDING} \
        temp_padded.png 2>/dev/null; then
        echo "   ❌ Failed to process $FILENAME"
        FAILED=$((FAILED + 1))
        continue
    fi

    # Step 2: Get padded image dimensions
    PADDED_DIMENSIONS=$(magick identify -format "%wx%h" temp_padded.png 2>/dev/null)
    if [ -z "$PADDED_DIMENSIONS" ]; then
        echo "   ❌ Failed to get dimensions for $FILENAME"
        FAILED=$((FAILED + 1))
        rm -f temp_padded.png
        continue
    fi

    PADDED_WIDTH=$(echo $PADDED_DIMENSIONS | cut -d'x' -f1)

    # Step 3: Create title bar that matches the padded width (before border)
    magick \
        -size "${PADDED_WIDTH}x${TITLE_HEIGHT}" xc:"#2D2D2D" \
        -fill "#FF5F57" -draw "circle 22,22 $((22+BUTTON_RADIUS)),22" \
        -fill "#FFBD2E" -draw "circle 68,22 $((68+BUTTON_RADIUS)),22" \
        -fill "#27CA3F" -draw "circle 114,22 $((114+BUTTON_RADIUS)),22" \
        temp_titlebar.png

    # Step 4: Add border to padded image
    magick temp_padded.png \
        -bordercolor "#404040" -border ${BORDER_WIDTH} \
        temp_bordered.png

    # Step 5: Add border to title bar to match
    magick temp_titlebar.png \
        -bordercolor "#404040" -border ${BORDER_WIDTH} \
        temp_titlebar_bordered.png

    # Step 6: Combine bordered title bar with bordered image
    magick temp_titlebar_bordered.png temp_bordered.png -append temp_combined.png

    # Step 7: Add drop shadow
    magick temp_combined.png \
        \( +clone -background black -shadow 80x4+3+4 \) +swap \
        -background none -layers merge +repage \
        "$OUTPUT"

    # Clean up temporary files
    rm -f temp_*.png

    if [ -f "$OUTPUT" ]; then
        SIZE=$(du -h "$OUTPUT" | cut -f1)
        echo "   ✅ Created: docs/images/$FILENAME ($SIZE)"
        PROCESSED=$((PROCESSED + 1))
    else
        echo "   ❌ Failed to create $FILENAME"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "📊 Summary:"
echo "   ✅ Processed: $PROCESSED files"
if [ $FAILED -gt 0 ]; then
    echo "   ❌ Failed: $FAILED files"
fi
echo "   📁 Output: docs/images/"

if [ $PROCESSED -gt 0 ]; then
    echo ""
    echo "🎉 All framed images are ready for documentation!"
else
    echo ""
    echo "⚠️  No images were processed successfully"
    exit 1
fi