// Mock updater to prevent import.meta issues in tests
export const updater = {
  checkForUpdates: jest.fn(),
  getUpdateMessage: jest.fn(() => ''),
  shouldCheckForUpdates: jest.fn(() => false)
};

export default updater;