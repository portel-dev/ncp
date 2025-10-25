// Mock fs module for Jest testing
// Use CommonJS to ensure Jest.mock() works correctly with this mock

const mockFs = {
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ''),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFile: jest.fn((path, callback) => callback(null, '')),
  writeFile: jest.fn((path, data, callback) => callback(null)),
  mkdir: jest.fn((path, callback) => callback(null)),
  readdirSync: jest.fn(() => []),
  statSync: jest.fn(() => ({ isDirectory: () => false })),
  createWriteStream: jest.fn(() => ({
    write: jest.fn(),
    end: jest.fn((callback) => callback && callback()),
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn()
  })),
  createReadStream: jest.fn(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn()
  })),
  rmSync: jest.fn(),
  rm: jest.fn((path, opts, callback) => callback && callback(null))
};

module.exports = mockFs;
