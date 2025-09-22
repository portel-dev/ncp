#!/bin/bash

# Improved Terminal Frame Script
# Better macOS-style window controls with proper gradients
# Usage: ./improved-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds improved macOS terminal frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding improved terminal frame to $INPUT..."

# Styling constants
TITLE_BAR_COLOR="#2C2C2C"
BACKGROUND_COLOR="#1E1E1E"
TITLE_BAR_HEIGHT=40
PADDING=16
BORDER_WIDTH=1

# Get dimensions
DIMENSIONS=$(magick identify -format "%wx%h" "$INPUT")
WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
HEIGHT=$(echo $DIMENSIONS | cut -d'x' -f2)

FRAME_WIDTH=$((WIDTH + PADDING * 2 + BORDER_WIDTH * 2))
FRAME_HEIGHT=$((HEIGHT + PADDING * 2 + TITLE_BAR_HEIGHT + BORDER_WIDTH * 2))

# Create frame with improved window controls
magick \
    -size "${FRAME_WIDTH}x${FRAME_HEIGHT}" xc:"$BACKGROUND_COLOR" \
    \( -size "${FRAME_WIDTH}x${TITLE_BAR_HEIGHT}" \
       gradient:"#383838-#2C2C2C" \
    \) -gravity North -composite \
    \( -size 12x12 xc:"#FF5F57" \
       \( +clone -blur 0x1 -level 0,50% \) -compose multiply -composite \
       -fill white -draw "circle 6,6 6,2" \
       -fill "#FF5F57" -draw "circle 6,6 6,4" \
    \) -gravity northwest -geometry +18+14 -composite \
    \( -size 12x12 xc:"#FFBD2E" \
       \( +clone -blur 0x1 -level 0,50% \) -compose multiply -composite \
       -fill white -draw "circle 6,6 6,2" \
       -fill "#FFBD2E" -draw "circle 6,6 6,4" \
    \) -gravity northwest -geometry +44+14 -composite \
    \( -size 12x12 xc:"#27CA3F" \
       \( +clone -blur 0x1 -level 0,50% \) -compose multiply -composite \
       -fill white -draw "circle 6,6 6,2" \
       -fill "#27CA3F" -draw "circle 6,6 6,4" \
    \) -gravity northwest -geometry +70+14 -composite \
    \( "$INPUT" \) -gravity Center -geometry "+0+$((TITLE_BAR_HEIGHT/2))" -composite \
    \( +clone -background black -shadow 80x3+3+3 \) +swap \
    -background none -layers merge +repage \
    "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "✅ Created improved framed screenshot: $OUTPUT"
else
    echo "❌ Error creating frame"
    exit 1
fi