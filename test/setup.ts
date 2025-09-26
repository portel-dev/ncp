/**
 * Test setup for NCP-OSS
 * Configures global test environment
 */

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Mock console methods for cleaner test output
const originalConsole = { ...console };

beforeEach(() => {
  // Suppress console.log in tests unless NODE_ENV=test-verbose
  if (process.env.NODE_ENV !== 'test-verbose') {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  }
});

afterEach(() => {
  // Restore console methods
  if (process.env.NODE_ENV !== 'test-verbose') {
    const logMock = console.log as jest.Mock;
    const infoMock = console.info as jest.Mock;
    if (logMock && typeof logMock.mockRestore === 'function') {
      logMock.mockRestore();
    }
    if (infoMock && typeof infoMock.mockRestore === 'function') {
      infoMock.mockRestore();
    }
  }
});

// Clean up after each test
afterEach(async () => {
  // Clear all timers
  jest.clearAllTimers();
  jest.clearAllMocks();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Global cleanup after all tests
afterAll(async () => {
  // Clear all timers
  jest.clearAllTimers();
  jest.clearAllMocks();

  // Force close any open handles
  if (process.stdout && typeof process.stdout.destroy === 'function') {
    // Don't actually destroy stdout, just ensure it's flushed
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Give a small delay for cleanup
  await new Promise(resolve => setTimeout(resolve, 50));
});