// Mock clipboardy for Jest testing
// Provides basic clipboard read/write functions for testing

const mockClipboardy = {
  read: async () => 'mock-clipboard-content',
  write: async (text) => {},
  readSync: () => 'mock-clipboard-content',
  writeSync: (text) => {},

  default: {
    read: async () => 'mock-clipboard-content',
    write: async (text) => {},
    readSync: () => 'mock-clipboard-content',
    writeSync: (text) => {}
  }
};

module.exports = mockClipboardy;
module.exports.default = mockClipboardy;
