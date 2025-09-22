#!/bin/bash

# Perfect Terminal Frame Script
# Creates authentic macOS-style window controls with proper gradients and positioning
# Usage: ./perfect-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds perfect macOS terminal frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding perfect macOS terminal frame to $INPUT..."

# Authentic macOS styling
TITLE_BAR_COLOR="#323232"
BACKGROUND_COLOR="#1D1D1D"
TITLE_HEIGHT=40
PADDING=20
BORDER_WIDTH=1

# Get input dimensions
DIMENSIONS=$(magick identify -format "%wx%h" "$INPUT")
WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
HEIGHT=$(echo $DIMENSIONS | cut -d'x' -f2)

# Calculate frame dimensions
FRAME_WIDTH=$((WIDTH + PADDING * 2 + BORDER_WIDTH * 2))
FRAME_HEIGHT=$((HEIGHT + PADDING * 2 + TITLE_HEIGHT + BORDER_WIDTH * 2))

echo "📏 Frame size: ${FRAME_WIDTH}x${FRAME_HEIGHT}"

# Create perfect macOS window frame
magick \
    -size "${FRAME_WIDTH}x${FRAME_HEIGHT}" xc:"$BACKGROUND_COLOR" \
    \( -size "${FRAME_WIDTH}x${TITLE_HEIGHT}" xc:"$TITLE_BAR_COLOR" \) \
    -gravity North -composite \
    \( -size 12x12 xc:"#FF5F57" \
       \( +clone -blur 0x1 -level 10,90% \) -compose overlay -composite \
       -fill "rgba(255,255,255,0.3)" -draw "circle 6,6 9,6" \
       -fill "rgba(0,0,0,0.1)" -draw "circle 6,8 9,8" \
    \) -gravity northwest -geometry +20+14 -composite \
    \( -size 12x12 xc:"#FFBD2E" \
       \( +clone -blur 0x1 -level 10,90% \) -compose overlay -composite \
       -fill "rgba(255,255,255,0.3)" -draw "circle 6,6 9,6" \
       -fill "rgba(0,0,0,0.1)" -draw "circle 6,8 9,8" \
    \) -gravity northwest -geometry +42+14 -composite \
    \( -size 12x12 xc:"#27CA3F" \
       \( +clone -blur 0x1 -level 10,90% \) -compose overlay -composite \
       -fill "rgba(255,255,255,0.3)" -draw "circle 6,6 9,6" \
       -fill "rgba(0,0,0,0.1)" -draw "circle 6,8 9,8" \
    \) -gravity northwest -geometry +64+14 -composite \
    \( "$INPUT" \) -gravity Center -geometry "+0+$((TITLE_HEIGHT/2))" -composite \
    -bordercolor "#1A1A1A" -border ${BORDER_WIDTH} \
    \( +clone -background black -shadow 60x4+2+4 \) +swap \
    -background none -layers merge +repage \
    "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "✅ Created perfect framed screenshot: $OUTPUT"
    echo "📁 Size: $(du -h "$OUTPUT" | cut -f1)"
else
    echo "❌ Error creating frame"
    exit 1
fi