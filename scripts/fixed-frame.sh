#!/bin/bash

# Fixed Terminal Frame Script
# Simple but effective macOS-style window frame with proper 3-button controls
# Usage: ./fixed-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds fixed macOS terminal frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding fixed terminal frame to $INPUT..."

# Frame settings
TITLE_HEIGHT=36
PADDING=20
BUTTON_SIZE=12

# Step 1: Add padding around input image
magick "$INPUT" \
    -bordercolor "#1E1E1E" -border ${PADDING} \
    temp_padded.png

# Step 2: Get padded image dimensions
PADDED_DIMENSIONS=$(magick identify -format "%wx%h" temp_padded.png)
PADDED_WIDTH=$(echo $PADDED_DIMENSIONS | cut -d'x' -f1)

# Step 3: Create title bar with proper window controls
magick \
    -size "${PADDED_WIDTH}x${TITLE_HEIGHT}" xc:"#2D2D2D" \
    -fill "#FF5F57" -draw "circle 18,18 24,18" \
    -fill "#FFBD2E" -draw "circle 38,18 44,18" \
    -fill "#27CA3F" -draw "circle 58,18 64,18" \
    temp_titlebar.png

# Step 4: Combine title bar with padded image
magick temp_titlebar.png temp_padded.png -append temp_combined.png

# Step 5: Add border and shadow
magick temp_combined.png \
    -bordercolor "#1A1A1A" -border 1 \
    \( +clone -background black -shadow 80x3+3+3 \) +swap \
    -background none -layers merge +repage \
    "$OUTPUT"

# Clean up temporary files
rm -f temp_*.png

if [ $? -eq 0 ]; then
    echo "✅ Created fixed framed screenshot: $OUTPUT"
else
    echo "❌ Error creating frame"
    exit 1
fi