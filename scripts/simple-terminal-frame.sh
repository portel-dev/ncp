#!/bin/bash

# Simple Terminal Window Frame Script
# Adds a simple but professional terminal window frame to screenshots
# Usage: ./simple-terminal-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds terminal window frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

# Check if input file exists
if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding simple terminal frame to $INPUT..."

# Terminal window styling
TITLE_BAR_COLOR="#2C2C2C"      # Dark title bar
BACKGROUND_COLOR="#1E1E1E"     # Very dark background
TITLE_BAR_HEIGHT=40            # Height of title bar
BORDER_WIDTH=2                 # Border thickness
PADDING=16                     # Internal padding
SHADOW_SIZE=8                  # Drop shadow

# Get input dimensions
DIMENSIONS=$(magick identify -format "%wx%h" "$INPUT")
WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
HEIGHT=$(echo $DIMENSIONS | cut -d'x' -f2)

# Calculate frame dimensions
CONTENT_WIDTH=$((WIDTH + PADDING * 2))
CONTENT_HEIGHT=$((HEIGHT + PADDING * 2))
FRAME_WIDTH=$((CONTENT_WIDTH + BORDER_WIDTH * 2))
FRAME_HEIGHT=$((CONTENT_HEIGHT + TITLE_BAR_HEIGHT + BORDER_WIDTH * 2))

echo "📏 Original: ${WIDTH}x${HEIGHT}"
echo "📏 Frame: ${FRAME_WIDTH}x${FRAME_HEIGHT}"

# Create the frame step by step
magick \
    -size "${FRAME_WIDTH}x${FRAME_HEIGHT}" xc:"$BACKGROUND_COLOR" \
    \( -size "${FRAME_WIDTH}x${TITLE_BAR_HEIGHT}" xc:"$TITLE_BAR_COLOR" \
       -fill "#FF5F57" -draw "circle 20,20 28,20" \
       -fill "#FEBC2E" -draw "circle 45,20 53,20" \
       -fill "#28C940" -draw "circle 70,20 78,20" \
    \) -gravity North -composite \
    \( "$INPUT" \) -gravity Center -geometry "+0+$((TITLE_BAR_HEIGHT/2))" -composite \
    \( +clone -alpha extract -blur 0x${SHADOW_SIZE} -shade 90x30 -alpha on -background black \) \
    \( -clone 0 -shadow ${SHADOW_SIZE}x4+4+4 \) \
    -delete 0 -background none -compose over -flatten \
    "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "✅ Successfully created framed screenshot: $OUTPUT"
    echo "📁 File size: $(du -h "$OUTPUT" | cut -f1)"
else
    echo "❌ Error creating framed screenshot"
    exit 1
fi