#!/bin/bash

# Terminal Window Frame Script
# Adds macOS-style terminal window frame to screenshots
# Usage: ./add-terminal-frame.sh input.png output.png

if [ $# -ne 2 ]; then
    echo "Usage: $0 input.png output.png"
    echo "Adds macOS-style terminal window frame to screenshot"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

# Check if input file exists
if [ ! -f "$INPUT" ]; then
    echo "Error: Input file '$INPUT' not found"
    exit 1
fi

echo "🖼️  Adding terminal window frame to $INPUT..."

# Terminal window styling constants
BACKGROUND_COLOR="#2D2D2D"      # Dark terminal background
BORDER_COLOR="#1C1C1C"          # Darker border
TITLE_BAR_HEIGHT=40             # Height of title bar
CORNER_RADIUS=12                # Rounded corner radius
SHADOW_OFFSET=8                 # Drop shadow offset
SHADOW_BLUR=16                  # Drop shadow blur
PADDING=20                      # Internal padding

# Get input image dimensions
DIMENSIONS=$(magick identify -format "%wx%h" "$INPUT")
WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
HEIGHT=$(echo $DIMENSIONS | cut -d'x' -f2)

# Calculate final dimensions with frame
FRAME_WIDTH=$((WIDTH + PADDING * 2))
FRAME_HEIGHT=$((HEIGHT + PADDING * 2 + TITLE_BAR_HEIGHT))
FINAL_WIDTH=$((FRAME_WIDTH + SHADOW_OFFSET * 2))
FINAL_HEIGHT=$((FRAME_HEIGHT + SHADOW_OFFSET * 2))

# Create the terminal window frame
magick \
    -size "${FRAME_WIDTH}x${FRAME_HEIGHT}" \
    xc:"$BACKGROUND_COLOR" \
    \( +clone -alpha extract \
       -draw "fill black polygon 0,0 0,$CORNER_RADIUS $CORNER_RADIUS,0 \
              fill white circle $CORNER_RADIUS,$CORNER_RADIUS $CORNER_RADIUS,0" \
       \( +clone -flip \) -compose Multiply -composite \
       \( +clone -flop \) -compose Multiply -composite \
    \) -alpha off -compose CopyOpacity -composite \
    \( -size "${FRAME_WIDTH}x${TITLE_BAR_HEIGHT}" xc:"$BORDER_COLOR" \
       -draw "fill #FF5F56 circle 20,20 20,10 \
              fill #FFBD2E circle 40,20 40,10 \
              fill #27CA3F circle 60,20 60,10" \
    \) -gravity North -composite \
    \( "$INPUT" \) -gravity Center -geometry "+0+$((TITLE_BAR_HEIGHT/2))" -composite \
    \( +clone -background black -shadow "${SHADOW_BLUR}x${SHADOW_OFFSET}+${SHADOW_OFFSET}+${SHADOW_OFFSET}" \) \
    +swap -background none -layers merge +repage \
    "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "✅ Successfully created framed screenshot: $OUTPUT"
    echo "📏 Frame dimensions: ${FINAL_WIDTH}x${FINAL_HEIGHT}"
else
    echo "❌ Error creating framed screenshot"
    exit 1
fi