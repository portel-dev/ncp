// Mock chalk for Jest testing
// Provides basic color functions that return the input string

const mockChalk = {
  green: (str) => str,
  red: (str) => str,
  yellow: (str) => str,
  blue: (str) => str,
  cyan: (str) => str,
  magenta: (str) => str,
  white: (str) => str,
  gray: (str) => str,
  grey: (str) => str,
  black: (str) => str,
  bold: (str) => str,
  italic: (str) => str,
  underline: (str) => str,
  dim: (str) => str,
  inverse: (str) => str,
  strikethrough: (str) => str,

  // Support for chaining
  green: {
    bold: (str) => str,
    dim: (str) => str,
    italic: (str) => str,
    underline: (str) => str,
  },

  red: {
    bold: (str) => str,
    dim: (str) => str,
    italic: (str) => str,
    underline: (str) => str,
  },

  yellow: {
    bold: (str) => str,
    dim: (str) => str,
    italic: (str) => str,
    underline: (str) => str,
  },

  blue: {
    bold: (str) => str,
    dim: (str) => str,
    italic: (str) => str,
    underline: (str) => str,
  },

  // Default export
  default: function(str) { return str; }
};

// Add all color functions to the default function
Object.keys(mockChalk).forEach(key => {
  if (key !== 'default') {
    mockChalk.default[key] = mockChalk[key];
  }
});

module.exports = mockChalk;
module.exports.default = mockChalk;