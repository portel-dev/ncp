/**
 * Markdown-to-Terminal Renderer
 * Converts markdown content to beautiful colored terminal output
 */

// ANSI Color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m'
};

/**
 * Simple markdown-to-terminal renderer using ANSI codes
 */
export function renderMarkdown(content: string): string {
  let rendered = content;

  // Bold text: **text** or __text__
  rendered = rendered.replace(/\*\*(.*?)\*\*/g, `${colors.bold}$1${colors.reset}`);
  rendered = rendered.replace(/__(.*?)__/g, `${colors.bold}$1${colors.reset}`);

  // Italic text: *text* or _text_
  rendered = rendered.replace(/\*(.*?)\*/g, `${colors.italic}$1${colors.reset}`);
  rendered = rendered.replace(/_(.*?)_/g, `${colors.italic}$1${colors.reset}`);

  // Inline code: `code`
  rendered = rendered.replace(/`(.*?)`/g, `${colors.yellow}$1${colors.reset}`);

  // Headers: # ## ###
  rendered = rendered.replace(/^(#{1,6})\s+(.*)$/gm, (match, hashes, text) => {
    const level = hashes.length;
    const color = level <= 2 ? colors.brightCyan : colors.cyan;
    return `${color}${colors.bold}${text}${colors.reset}`;
  });

  return rendered;
}

/**
 * Enhanced output with emoji and color support
 */
export function enhancedOutput(content: string): string {
  // First apply markdown rendering
  let rendered = renderMarkdown(content);

  // Additional terminal enhancements
  rendered = rendered
    // Enhance search indicators
    .replace(/🔍/g, '\x1b[36m🔍\x1b[0m')  // Cyan search icon
    .replace(/📁/g, '\x1b[33m📁\x1b[0m')   // Yellow folder icon
    .replace(/📋/g, '\x1b[32m📋\x1b[0m')   // Green clipboard icon
    .replace(/💡/g, '\x1b[93m💡\x1b[0m')   // Bright yellow tip icon
    .replace(/📄/g, '\x1b[34m📄\x1b[0m')   // Blue navigation icon
    .replace(/✅/g, '\x1b[32m✅\x1b[0m')   // Green success
    .replace(/❌/g, '\x1b[31m❌\x1b[0m')   // Red error
    .replace(/🚀/g, '\x1b[35m🚀\x1b[0m'); // Magenta rocket

  return rendered;
}