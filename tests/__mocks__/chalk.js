// Mock chalk for Jest testing
// Provides basic color functions that return the input string

const colorFn = (str) => str;

const chainable = {
  bold: (str) => str,
  dim: (str) => str,
  italic: (str) => str,
  underline: (str) => str,
};

const mockChalk = {
  green: colorFn,
  red: colorFn,
  yellow: colorFn,
  blue: colorFn,
  cyan: colorFn,
  magenta: colorFn,
  white: colorFn,
  gray: colorFn,
  grey: colorFn,
  black: colorFn,
  bold: colorFn,
  italic: colorFn,
  underline: colorFn,
  dim: colorFn,
  inverse: colorFn,
  strikethrough: colorFn,
};

// Add chainable methods
mockChalk.green = Object.assign(colorFn, chainable);
mockChalk.red = Object.assign(colorFn, chainable);
mockChalk.yellow = Object.assign(colorFn, chainable);
mockChalk.blue = Object.assign(colorFn, chainable);

export default mockChalk;
export { mockChalk };