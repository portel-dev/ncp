// Mock chalk for Jest testing
// Provides basic color functions that return the input string

const colorFn = (str) => str;

const colors = ['green', 'red', 'yellow', 'blue', 'cyan', 'magenta', 'white', 'gray', 'grey', 'black'];

// Create chainable object that supports all color methods
const createChainable = () => {
  const chainable = {
    bold: (str) => str,
    dim: (str) => str,
    italic: (str) => str,
    underline: (str) => str,
  };

  colors.forEach(color => {
    chainable[color] = (str) => str;
  });

  return chainable;
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
  bgGray: colorFn,
  level: 0,
};

// Add chainable methods to colors
const chainable = createChainable();
colors.forEach(color => {
  mockChalk[color] = Object.assign(colorFn, chainable);
});

// Add chainable methods to bold, dim, italic
mockChalk.bold = Object.assign(colorFn, chainable);
mockChalk.dim = Object.assign(colorFn, chainable);
mockChalk.italic = Object.assign(colorFn, chainable);
mockChalk.underline = Object.assign(colorFn, chainable);
mockChalk.bgGray = Object.assign(colorFn, { ...chainable, black: (str) => str });

module.exports = mockChalk;
module.exports.default = mockChalk;
