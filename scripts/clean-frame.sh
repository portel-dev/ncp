#!/bin/bash

# Clean Terminal Frame Script
# Adds a minimal but professional frame to screenshots
# Usage: ./clean-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds clean terminal frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding clean frame to $INPUT..."

# Simple, clean styling
BACKGROUND="#2D2D2D"    # Dark background like terminal
BORDER="#444444"        # Subtle border
PADDING=24              # Generous padding
TITLE_HEIGHT=32         # Small title bar
BORDER_WIDTH=1          # Thin border

# Add frame with title bar and controls
magick "$INPUT" \
    -bordercolor "$BACKGROUND" -border ${PADDING} \
    \( +clone -crop x${TITLE_HEIGHT}+0+0 +repage -fill "$BORDER" -colorize 100% \
       -fill "#FF5F57" -draw "circle 16,16 20,16" \
       -fill "#FEBC2E" -draw "circle 36,16 40,16" \
       -fill "#28C940" -draw "circle 56,16 60,16" \
    \) -gravity North -composite \
    -bordercolor "$BORDER" -border ${BORDER_WIDTH} \
    \( +clone -background black -shadow 80x3+3+3 \) +swap \
    -background none -layers merge +repage \
    "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "✅ Created clean framed screenshot: $OUTPUT"
else
    echo "❌ Error creating frame"
    exit 1
fi