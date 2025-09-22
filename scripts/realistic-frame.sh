#!/bin/bash

# Realistic Terminal Frame Script
# Adds authentic macOS-style terminal window frame with proper window controls
# Usage: ./realistic-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds realistic macOS terminal frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding realistic macOS terminal frame to $INPUT..."

# Realistic macOS styling
TITLE_BAR_COLOR="#323232"      # macOS title bar color
BACKGROUND_COLOR="#1E1E1E"     # Dark terminal background
TITLE_BAR_HEIGHT=40            # Standard macOS title bar height
BORDER_WIDTH=1                 # Thin border
PADDING=16                     # Internal padding

# Get input dimensions
DIMENSIONS=$(magick identify -format "%wx%h" "$INPUT")
WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
HEIGHT=$(echo $DIMENSIONS | cut -d'x' -f2)

# Calculate frame dimensions
CONTENT_WIDTH=$((WIDTH + PADDING * 2))
CONTENT_HEIGHT=$((HEIGHT + PADDING * 2))
FRAME_WIDTH=$((CONTENT_WIDTH + BORDER_WIDTH * 2))
FRAME_HEIGHT=$((CONTENT_HEIGHT + TITLE_BAR_HEIGHT + BORDER_WIDTH * 2))

echo "📏 Creating frame: ${FRAME_WIDTH}x${FRAME_HEIGHT}"

# Create realistic macOS window controls with gradients and symbols
magick \
    -size "${FRAME_WIDTH}x${FRAME_HEIGHT}" xc:"$BACKGROUND_COLOR" \
    \( -size "${FRAME_WIDTH}x${TITLE_BAR_HEIGHT}" xc:"$TITLE_BAR_COLOR" \
       \( -size 12x12 radial-gradient:"#FF6057-#FF453A" \
          -gravity center -extent 20x20 \
       \) -geometry +16+10 -composite \
       \( -size 12x12 radial-gradient:"#FFBE2E-#FF9F0A" \
          -gravity center -extent 20x20 \
       \) -geometry +42+10 -composite \
       \( -size 12x12 radial-gradient:"#27C93F-#30B446" \
          -gravity center -extent 20x20 \
       \) -geometry +68+10 -composite \
       -fill black -font "Helvetica" -pointsize 10 \
       -gravity northwest -annotate +20+14 "×" \
       -gravity northwest -annotate +46+16 "−" \
       -gravity northwest -annotate +72+14 "⌃" \
    \) -gravity North -composite \
    \( "$INPUT" \) -gravity Center -geometry "+0+$((TITLE_BAR_HEIGHT/2))" -composite \
    \( +clone -alpha extract -blur 0x4 -alpha on -background "rgba(0,0,0,0.3)" \
       -gravity SouthEast -geometry +4+4 \
    \) -compose over -flatten \
    "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "✅ Created realistic framed screenshot: $OUTPUT"
    echo "📁 File size: $(du -h "$OUTPUT" | cut -f1)"
else
    echo "❌ Error creating frame"
    exit 1
fi