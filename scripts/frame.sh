#!/bin/bash

# Smart Terminal Frame Script
# Usage: ./scripts/frame.sh <filename>
#
# Looks for <filename> in project root first, then treats as full path
# Always outputs to docs/images/<filename> with frame applied
#
# Examples:
#   ./scripts/frame.sh ncp-help.png        # Uses ./ncp-help.png → docs/images/ncp-help.png
#   ./scripts/frame.sh /path/to/shot.png   # Uses full path → docs/images/shot.png

if [ $# -ne 1 ]; then
    echo "Usage: $0 <filename>"
    echo ""
    echo "Smart frame application:"
    echo "  • Looks for file in project root first"
    echo "  • Falls back to treating as full path"
    echo "  • Always outputs to docs/images/<filename>"
    echo ""
    echo "Examples:"
    echo "  $0 ncp-help.png        # ./ncp-help.png → docs/images/ncp-help.png"
    echo "  $0 /path/to/shot.png   # /path/to/shot.png → docs/images/shot.png"
    exit 1
fi

INPUT_ARG="$1"

# Extract just the filename for output
FILENAME=$(basename "$INPUT_ARG")

# Determine input path: check project root first, then use as full path
PROJECT_ROOT=$(dirname "$0")/..
PROJECT_FILE="$PROJECT_ROOT/$FILENAME"

if [ -f "$PROJECT_FILE" ]; then
    INPUT="$PROJECT_FILE"
    echo "📁 Found in project root: $FILENAME"
elif [ -f "$INPUT_ARG" ]; then
    INPUT="$INPUT_ARG"
    echo "📁 Using full path: $INPUT_ARG"
else
    echo "❌ Error: File not found"
    echo "   Checked: $PROJECT_FILE"
    echo "   Checked: $INPUT_ARG"
    exit 1
fi

# Always output to docs/images/
OUTPUT_DIR="$PROJECT_ROOT/docs/images"
OUTPUT="$OUTPUT_DIR/$FILENAME"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo "🖼️  Adding terminal frame..."
echo "   Input:  $INPUT"
echo "   Output: $OUTPUT"

# Frame settings - adjusted for high DPI
TITLE_HEIGHT=44
PADDING=24
BORDER_WIDTH=2
BUTTON_RADIUS=16

# Step 1: Add padding around input image
magick "$INPUT" \
    -bordercolor "#1E1E1E" -border ${PADDING} \
    temp_padded.png

# Step 2: Get padded image dimensions
PADDED_DIMENSIONS=$(magick identify -format "%wx%h" temp_padded.png)
PADDED_WIDTH=$(echo $PADDED_DIMENSIONS | cut -d'x' -f1)

# Step 3: Add outer border first, then calculate title bar width
FINAL_WIDTH=$((PADDED_WIDTH + BORDER_WIDTH * 2))

# Step 4: Create title bar that matches the full width (including border)
magick \
    -size "${FINAL_WIDTH}x${TITLE_HEIGHT}" xc:"#2D2D2D" \
    -fill "#FF5F57" -draw "circle 22,22 $((22+BUTTON_RADIUS)),22" \
    -fill "#FFBD2E" -draw "circle 68,22 $((68+BUTTON_RADIUS)),22" \
    -fill "#27CA3F" -draw "circle 114,22 $((114+BUTTON_RADIUS)),22" \
    temp_titlebar.png

# Step 5: Add border to padded image
magick temp_padded.png \
    -bordercolor "#1A1A1A" -border ${BORDER_WIDTH} \
    temp_bordered.png

# Step 6: Combine title bar with bordered image
magick temp_titlebar.png temp_bordered.png -append temp_combined.png

# Step 7: Add drop shadow
magick temp_combined.png \
    \( +clone -background black -shadow 80x4+3+4 \) +swap \
    -background none -layers merge +repage \
    "$OUTPUT"

# Clean up temporary files
rm -f temp_*.png

if [ $? -eq 0 ]; then
    echo "✅ Created framed screenshot: docs/images/$FILENAME"
    echo "📁 Size: $(du -h "$OUTPUT" | cut -f1)"
else
    echo "❌ Error creating frame"
    exit 1
fi