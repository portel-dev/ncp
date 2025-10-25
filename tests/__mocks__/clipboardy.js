// Mock clipboardy for Jest testing
// Provides basic clipboard read/write functions for testing

export const read = async () => 'mock-clipboard-content';
export const write = async (text) => {};
export const readSync = () => 'mock-clipboard-content';
export const writeSync = (text) => {};

const mockClipboardy = {
  read: async () => 'mock-clipboard-content',
  write: async (text) => {},
  readSync: () => 'mock-clipboard-content',
  writeSync: (text) => {}
};

export default mockClipboardy;
