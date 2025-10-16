// Mock updater to prevent import.meta issues in tests
const updater = {
  checkForUpdates: jest.fn(),
  getUpdateMessage: jest.fn(() => ''),
  shouldCheckForUpdates: jest.fn(() => false)
};

module.exports = {
  updater,
  default: updater
};