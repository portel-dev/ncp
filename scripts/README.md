# Terminal Window Frame Scripts

These scripts add professional macOS-style terminal window frames to screenshots.

## 📸 Perfect Workflow for NCP Documentation

### Step 1: Take Clean Screenshots
```bash
# In your terminal, run NCP commands:
ncp --help
ncp list --depth 1
ncp find "file operations"
ncp config import

# Take screenshots using:
# - Cmd+Shift+4 → Space → Click terminal window
# - Or use any screenshot tool to capture just the terminal content
```

### Step 2: Add Professional Frames
```bash
# Use the clean-frame.sh script (recommended):
./scripts/clean-frame.sh input-screenshot.png framed-output.png

# Example:
./scripts/clean-frame.sh ncp-help-raw.png ncp-help.png
```

## 🎨 Available Frame Styles

### 1. clean-frame.sh (Recommended)
- ✅ **Clean, minimal design**
- ✅ **macOS-style window controls** (red, yellow, green dots)
- ✅ **Proper dark terminal background**
- ✅ **Subtle drop shadow**
- ✅ **Professional appearance**

### 2. simple-terminal-frame.sh
- More complex styling
- Larger shadows
- More detailed frame

### 3. add-terminal-frame.sh
- Advanced rounded corners
- Complex ImageMagick operations
- May be slower

## 🔧 Script Features

All scripts provide:
- **Input validation**
- **Error handling**
- **Progress feedback**
- **Automatic dimension calculation**
- **Professional macOS styling**

## 📋 Example Usage

```bash
# Make scripts executable (one time)
chmod +x scripts/*.sh

# Add frame to a screenshot
./scripts/clean-frame.sh raw-screenshot.png docs/images/ncp-command.png

# Batch process multiple screenshots
for file in raw-screenshots/*.png; do
    filename=$(basename "$file" .png)
    ./scripts/clean-frame.sh "$file" "docs/images/${filename}-framed.png"
done
```

## 🎯 Result

Input: Clean terminal screenshot (no window borders)
Output: Professional documentation image with:
- macOS terminal window frame
- Window controls (traffic lights)
- Dark background matching terminal
- Drop shadow for depth
- Perfect for README and documentation

## 💡 Tips

- Take screenshots with **good contrast** in your terminal
- Use **dark terminal themes** for best results
- **Crop tightly** around terminal content before framing
- **Test with one image** before batch processing