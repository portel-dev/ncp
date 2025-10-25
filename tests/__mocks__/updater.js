// Mock updater to prevent import.meta issues in tests
const updater = {
  checkForUpdates: () => Promise.resolve(null),
  getUpdateTip: () => Promise.resolve(null)
};

export default updater;
export { updater };